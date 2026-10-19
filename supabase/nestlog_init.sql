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
