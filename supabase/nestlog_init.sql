-- Nestlog cloud: one shared log for a family allowlist.
-- The Supabase project's migrations (nestlog_init and follow-ups) combined into one file. Run it in the
-- SQL editor of a fresh project to set up the same thing, then add your email to family_members.

-- Who may sign in and use the log. Edit in the dashboard (Table editor → family_members).
create table public.family_members (
  email text primary key check (email = lower(email)),
  name text not null default ''
);

-- True when the signed-in user's email is on the list. Lives in a schema the API doesn't expose;
-- security definer so the policies can read the list.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create function private.is_family() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.family_members where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function private.is_family() from public, anon;
grant execute on function private.is_family() to authenticated;

-- One row per entry; data is the entry object exactly as the app stores it.
create table public.logs (
  id text primary key check (id ~ '^[A-Za-z0-9_.~:@+-]{1,120}$'),
  t bigint not null,
  data jsonb not null check (data ->> 'type' in ('nurse', 'bottle', 'solids', 'sleep', 'diaper', 'pump', 'growth', 'medicine', 'vaccine', 'temp', 'milestone')),
  updated_at timestamptz not null default now()
);
create index logs_t_idx on public.logs (t desc);

-- Running timers, shared so every phone sees them.
create table public.active (
  kind text primary key check (kind in ('nurse', 'sleep')),
  data jsonb not null
);

-- Baby name, birth date and units.
create table public.settings (
  id text primary key check (id = 'baby'),
  data jsonb not null
);

alter table public.family_members enable row level security;
alter table public.logs enable row level security;
alter table public.active enable row level security;
alter table public.settings enable row level security;

create policy "family reads the list" on public.family_members for select to authenticated using ((select private.is_family()));
create policy "family uses logs" on public.logs for all to authenticated using ((select private.is_family())) with check ((select private.is_family()));
create policy "family uses timers" on public.active for all to authenticated using ((select private.is_family())) with check ((select private.is_family()));
create policy "family uses settings" on public.settings for all to authenticated using ((select private.is_family())) with check ((select private.is_family()));

-- Anyone on the list can add, rename or remove people (Baby → Family in the app)...
create policy "family adds people" on public.family_members for insert to authenticated with check ((select private.is_family()));
create policy "family renames people" on public.family_members for update to authenticated using ((select private.is_family())) with check ((select private.is_family()));
create policy "family removes people" on public.family_members for delete to authenticated using ((select private.is_family()));
-- ...but the list never goes empty, so the family can't lock itself out.
create function private.keep_one_member() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from public.family_members) then
    raise exception 'The family list needs at least one person.' using errcode = 'P0001';
  end if;
  return null;
end;
$$;
create constraint trigger family_keep_one after delete on public.family_members
  deferrable initially immediate for each row execute function private.keep_one_member();

revoke all on public.family_members, public.logs, public.active, public.settings from anon;

-- Live updates to every phone.
alter publication supabase_realtime add table public.logs, public.active, public.settings;

-- Before User Created hook: only emails on the list can get an account (and a sign-in email).
-- Turn it on in the dashboard: Authentication → Hooks → Before User Created → Postgres → public.hook_family_only.
create function public.hook_family_only(event jsonb) returns jsonb
language plpgsql stable set search_path = ''
as $$
begin
  if exists (select 1 from public.family_members where email = lower(coalesce(event -> 'user' ->> 'email', ''))) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('message', 'This email isn''t on the family list.', 'http_code', 403));
end;
$$;
revoke all on function public.hook_family_only(jsonb) from public, anon, authenticated;
grant execute on function public.hook_family_only(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select on public.family_members to supabase_auth_admin;
create policy "auth hook reads the list" on public.family_members for select to supabase_auth_admin using (true);

-- Milestone photos: a private bucket, one JPEG per entry (<entry id>.jpg), family only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];
create policy "photos: family can read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (select private.is_family()));
create policy "photos: family can add" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (select private.is_family()));
create policy "photos: family can replace" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (select private.is_family()))
  with check (bucket_id = 'photos' and (select private.is_family()));
create policy "photos: family can delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (select private.is_family()));

-- Reminders while the app is closed (Web Push). Each phone that allows notifications adds itself to
-- push_subs; the nestlog-remind Edge Function (supabase/functions/nestlog-remind) sends one push per
-- overdue feed or diaper and records it in push_sent.
create table public.push_subs (
  endpoint text primary key check (endpoint ~ '^https://' and length(endpoint) < 1000),
  email text not null,
  p256dh text not null check (length(p256dh) < 200),
  auth text not null check (length(auth) < 100),
  created timestamptz not null default now()
);
alter table public.push_subs enable row level security;
create policy "push: family manage their own phones" on public.push_subs for all to authenticated
  using ((select private.is_family()) and email = lower(coalesce((select auth.jwt() ->> 'email'), '')))
  with check ((select private.is_family()) and email = lower(coalesce((select auth.jwt() ->> 'email'), '')));
revoke all on public.push_subs from anon;
-- server only: row-level security on and no policies, so only the service role (the function) uses it
create table public.push_sent (
  endpoint text not null references public.push_subs (endpoint) on delete cascade,
  kind text not null check (kind in ('feed', 'diaper')),
  entry_id text not null,
  sent timestamptz not null default now(),
  primary key (endpoint, kind, entry_id)
);
alter table public.push_sent enable row level security;
revoke all on public.push_sent from anon, authenticated;

-- Keys live in Vault and never leave the server, apart from the VAPID public key (public by design).
-- The cron secret is made here at random; the function makes the VAPID key pair on its first run.
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'nestlog_cron_secret', 'Shared by pg_cron and the nestlog-remind function');
create function public.push_config() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_object_agg(name, decrypted_secret) from vault.decrypted_secrets
  where name in ('nestlog_cron_secret', 'nestlog_vapid_public', 'nestlog_vapid_private');
$$;
create function public.push_set_vapid(pub text, priv text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from vault.secrets where name = 'nestlog_vapid_public') then
    perform vault.create_secret(pub, 'nestlog_vapid_public', 'Nestlog Web Push public key');
    perform vault.create_secret(priv, 'nestlog_vapid_private', 'Nestlog Web Push private key');
  end if;
end;
$$;
-- the public key a phone subscribes with; null for anyone not on the family list
create function public.push_public_key() returns text
language sql stable security definer set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'nestlog_vapid_public' and (select private.is_family());
$$;
revoke all on function public.push_config(), public.push_set_vapid(text, text), public.push_public_key() from public, anon, authenticated;
grant execute on function public.push_config(), public.push_set_vapid(text, text) to service_role;
grant execute on function public.push_public_key() to authenticated;

-- Every 5 minutes, call the function with the cron secret. Deploy it first with verify_jwt off
-- (it checks the secret itself): supabase functions deploy nestlog-remind --no-verify-jwt
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('nestlog-remind', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://fcthxmkmkqthhkyeymjc.supabase.co/functions/v1/nestlog-remind',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'nestlog_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 20000)
$$);
