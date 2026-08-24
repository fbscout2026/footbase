-- FOOTBASE Session 57 — favoriting clubs and tournaments (WS5). Same shape as the
-- existing athlete `favoritos` table, minus the rating/notes payload — favoriting a
-- club/tournament is a plain toggle (insert to favorite, delete to unfavorite), so
-- there's nothing to update after creation. RLS mirrors `favoritos_owner_*` exactly
-- (schema.sql:1213-1225). Purely additive, zero scraper impact — the scraper never
-- reads or writes these tables, and neither `clubes` nor `torneios` gain any column.

create table if not exists favoritos_clube (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  club_id uuid not null references clubes (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, club_id)
);
create index if not exists idx_favoritos_clube_user on favoritos_clube (user_id);

create table if not exists favoritos_torneio (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  torneio_id uuid not null references torneios (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, torneio_id)
);
create index if not exists idx_favoritos_torneio_user on favoritos_torneio (user_id);

alter table favoritos_clube enable row level security;
alter table favoritos_torneio enable row level security;

create policy favoritos_clube_owner_select on favoritos_clube
  for select to authenticated
  using (((select auth.uid()) = user_id and private.is_approved()) or private.is_admin());
create policy favoritos_clube_owner_insert on favoritos_clube
  for insert to authenticated
  with check (((select auth.uid()) = user_id and private.is_approved()) or private.is_admin());
create policy favoritos_clube_owner_delete on favoritos_clube
  for delete to authenticated
  using (((select auth.uid()) = user_id and private.is_approved()) or private.is_admin());

create policy favoritos_torneio_owner_select on favoritos_torneio
  for select to authenticated
  using (((select auth.uid()) = user_id and private.is_approved()) or private.is_admin());
create policy favoritos_torneio_owner_insert on favoritos_torneio
  for insert to authenticated
  with check (((select auth.uid()) = user_id and private.is_approved()) or private.is_admin());
create policy favoritos_torneio_owner_delete on favoritos_torneio
  for delete to authenticated
  using (((select auth.uid()) = user_id and private.is_approved()) or private.is_admin());

-- end of migration
