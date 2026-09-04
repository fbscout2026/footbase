-- FOOTBASE — system announcements (Session 57): admin-authored news/updates
-- surfaced to every approved account (agent/club) via a clickable dashboard
-- notification. Read-only for everyone but admin, same shape as `clubes`/
-- `torneios` (select_approved + write_admin).

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  link_url text,
  published_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_announcements_published on announcements (published_at desc);

alter table announcements enable row level security;

create policy announcements_select_approved on announcements
  for select using ((select private.is_approved()) or (select private.is_admin()));
create policy announcements_write_admin on announcements
  for all using (private.is_admin()) with check (private.is_admin());
