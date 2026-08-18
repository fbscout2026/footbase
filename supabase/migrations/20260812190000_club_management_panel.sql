-- FOOTBASE Phase 4.4: claimed-club management panel.
-- Additive only: club declarations and requests never mutate official athlete data.

alter table public.clubes
  add column if not exists cnpj text,
  add column if not exists display_name text,
  add column if not exists description text,
  add column if not exists headquarters_address text,
  add column if not exists headquarters_city text,
  add column if not exists headquarters_state char(2),
  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists contact_email text,
  add column if not exists website_url text,
  add column if not exists instagram_url text,
  add column if not exists crest_storage_path text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.clubes drop constraint if exists clubes_display_name_length;
alter table public.clubes add constraint clubes_display_name_length check (display_name is null or char_length(display_name) <= 160);
alter table public.clubes drop constraint if exists clubes_description_length;
alter table public.clubes add constraint clubes_description_length check (description is null or char_length(description) <= 1200);
alter table public.clubes drop constraint if exists clubes_operational_fields_length;
alter table public.clubes add constraint clubes_operational_fields_length check (
  (headquarters_address is null or char_length(headquarters_address) <= 300)
  and (headquarters_city is null or char_length(headquarters_city) <= 120)
  and (phone is null or char_length(phone) <= 40)
  and (whatsapp is null or char_length(whatsapp) <= 40)
  and (contact_email is null or char_length(contact_email) <= 254)
  and (website_url is null or char_length(website_url) <= 500)
  and (instagram_url is null or char_length(instagram_url) <= 500)
  and (crest_storage_path is null or char_length(crest_storage_path) <= 500)
);
alter table public.clubes drop constraint if exists clubes_headquarters_state_format;
alter table public.clubes add constraint clubes_headquarters_state_format check (headquarters_state is null or headquarters_state ~ '^[A-Z]{2}$');

create or replace function private.owns_claimed_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.clubes c
    join public.profiles p on p.id = c.reivindicado_por
    where c.id = p_club_id
      and c.reivindicado_por = (select auth.uid())
      and c.claim_status = 'claimed'
      and p.role = 'club'
      and p.account_status = 'approved'
  );
$$;
revoke execute on function private.owns_claimed_club(uuid) from public, anon;
grant execute on function private.owns_claimed_club(uuid) to authenticated, service_role;

create or replace function public.guard_clube_operational_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if private.is_admin() or auth.role() = 'service_role' then return new; end if;
  -- Updates issued from WITHIN another trigger (e.g. the Phase 4.2 club-claim
  -- triggers that transition claim_status/reivindicado_por) run nested, at trigger
  -- depth > 1. Only a direct client update (depth 1) is held to the operational
  -- allowlist below. (current_user cannot be used here: this guard is itself
  -- SECURITY DEFINER, so current_user is always the function owner.)
  if pg_trigger_depth() > 1 then return new; end if;
  if not private.owns_claimed_club(old.id) then raise exception 'not authorized to update this club'; end if;
  if (to_jsonb(new) - array[
      'display_name','description','headquarters_address','headquarters_city',
      'headquarters_state','phone','whatsapp','contact_email','website_url',
      'instagram_url','updated_at'
    ]::text[]) is distinct from
    (to_jsonb(old) - array[
      'display_name','description','headquarters_address','headquarters_city',
      'headquarters_state','phone','whatsapp','contact_email','website_url',
      'instagram_url','updated_at'
    ]::text[])
  then raise exception 'club may only edit operational profile fields'; end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_guard_clube_operational_update on public.clubes;
create trigger trg_guard_clube_operational_update before update on public.clubes
for each row execute function public.guard_clube_operational_update();
revoke execute on function public.guard_clube_operational_update() from public, anon, authenticated;

drop policy if exists clubes_update_claimed_owner on public.clubes;
create policy clubes_update_claimed_owner on public.clubes
for update to authenticated
using (private.owns_claimed_club(id))
with check (private.owns_claimed_club(id));

create table if not exists public.club_categorias (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubes(id) on delete cascade,
  category text not null references public.categoria_ordem(categoria),
  status text not null default 'active' check (status in ('active','archived')),
  display_order smallint not null default 0 check (display_order between 0 and 100),
  source_status text not null default 'club_declared' check (source_status in ('club_declared','admin_confirmed','official_confirmed')),
  declared_by uuid not null references auth.users(id) on delete restrict,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, category)
);
create index if not exists idx_club_categorias_club on public.club_categorias(club_id, status, display_order);

create table if not exists public.club_categoria_torneios (
  id uuid primary key default gen_random_uuid(),
  club_category_id uuid not null references public.club_categorias(id) on delete cascade,
  tournament_id uuid references public.torneios(id) on delete set null,
  declared_name text,
  season text not null check (char_length(btrim(season)) between 1 and 30),
  start_date date,
  end_date date,
  status text not null default 'registered' check (status in ('registered','in_progress','finished','withdrawn')),
  source_status text not null default 'club_declared' check (source_status in ('club_declared','admin_confirmed','official_confirmed')),
  declared_by uuid not null references auth.users(id) on delete restrict,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_tournament_name_present check (tournament_id is not null or char_length(btrim(coalesce(declared_name,''))) between 2 and 180),
  constraint club_tournament_dates_ordered check (start_date is null or end_date is null or end_date >= start_date)
);
create index if not exists idx_club_torneios_category on public.club_categoria_torneios(club_category_id, status);

create table if not exists public.club_elenco_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubes(id) on delete restrict,
  bid_atleta bigint references public.atletas(bid) on delete restrict,
  informed_bid text,
  informed_name text,
  action text not null check (action in ('add','remove','change_category','register_missing_bid')),
  current_club_id_snapshot uuid references public.clubes(id) on delete set null,
  current_category_snapshot text,
  proposed_category text references public.categoria_ordem(categoria),
  justification text not null check (char_length(btrim(justification)) between 20 and 2000),
  evidence_url text check (evidence_url is null or (char_length(evidence_url) <= 1000 and evidence_url ~* '^https?://[^[:space:]]+$')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','conflict')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_roster_target_valid check (
    (action = 'register_missing_bid' and bid_atleta is null and informed_bid is not null and informed_name is not null and proposed_category is not null)
    or (action <> 'register_missing_bid' and bid_atleta is not null)
  ),
  constraint club_roster_category_valid check (
    (action in ('add','change_category','register_missing_bid') and proposed_category is not null)
    or (action = 'remove' and proposed_category is null)
  )
);
create index if not exists idx_club_roster_requests_club on public.club_elenco_solicitacoes(club_id, status, created_at desc);
create unique index if not exists idx_club_roster_pending_existing on public.club_elenco_solicitacoes(club_id, bid_atleta, action)
where status = 'pending' and bid_atleta is not null;
create unique index if not exists idx_club_roster_pending_missing on public.club_elenco_solicitacoes(club_id, informed_bid)
where status = 'pending' and action = 'register_missing_bid';

create table if not exists public.club_correction_requests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubes(id) on delete restrict,
  field_name text not null check (field_name in ('name','cnpj','state','federacao','source_key')),
  current_value text,
  suggested_value text not null check (char_length(btrim(suggested_value)) between 1 and 500),
  reason text not null check (char_length(btrim(reason)) between 20 and 2000),
  evidence_url text check (evidence_url is null or (char_length(evidence_url) <= 1000 and evidence_url ~* '^https?://[^[:space:]]+$')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','conflict')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_club_corrections_club on public.club_correction_requests(club_id, status, created_at desc);
create unique index if not exists idx_club_correction_pending on public.club_correction_requests(club_id, field_name) where status = 'pending';

create table if not exists public.club_divergencias (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubes(id) on delete restrict,
  domain text not null check (domain in ('profile','roster','category','tournament')),
  entity_key text,
  field_name text,
  declared_value jsonb,
  official_value jsonb,
  official_source text not null,
  status text not null default 'open' check (status in ('open','resolved_club','resolved_official','dismissed')),
  resolution_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_club_divergencias_club on public.club_divergencias(club_id, status, created_at desc);

create or replace function public.prepare_club_category_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if private.is_admin() or auth.role() = 'service_role' then return new; end if;
  if not private.owns_claimed_club(coalesce(old.club_id, new.club_id)) then raise exception 'not authorized for this club'; end if;
  if tg_op = 'INSERT' then
    new.declared_by := auth.uid(); new.source_status := 'club_declared'; new.confirmed_by := null; new.confirmed_at := null;
  elsif (to_jsonb(new) - array['status','display_order','updated_at']::text[]) is distinct from (to_jsonb(old) - array['status','display_order','updated_at']::text[]) then
    raise exception 'club may only edit category status and order';
  end if;
  new.updated_at := now(); return new;
end; $$;
create or replace function public.prepare_club_tournament_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_club_id uuid;
begin
  select club_id into v_club_id from public.club_categorias where id = new.club_category_id;
  if private.is_admin() or auth.role() = 'service_role' then return new; end if;
  if not private.owns_claimed_club(v_club_id) then raise exception 'not authorized for this club'; end if;
  if tg_op = 'INSERT' then
    new.tournament_id := null; new.declared_by := auth.uid(); new.source_status := 'club_declared'; new.confirmed_by := null; new.confirmed_at := null;
  elsif (to_jsonb(new) - array['declared_name','season','start_date','end_date','status','updated_at']::text[]) is distinct from (to_jsonb(old) - array['declared_name','season','start_date','end_date','status','updated_at']::text[]) then
    raise exception 'club may only edit declared tournament fields';
  end if;
  new.updated_at := now(); return new;
end; $$;
create or replace function public.prepare_club_roster_request()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_club_id uuid; v_profile_role text; v_profile_status text;
begin
  if private.is_admin() or auth.role() = 'service_role' then return new; end if;
  select c.id, p.role, p.account_status into v_club_id, v_profile_role, v_profile_status
  from public.clubes c join public.profiles p on p.id = c.reivindicado_por
  where c.reivindicado_por = auth.uid() and c.claim_status = 'claimed';
  if v_club_id is null or v_profile_role <> 'club' or v_profile_status <> 'approved' then raise exception 'claimed club required'; end if;
  new.club_id := v_club_id; new.requested_by := auth.uid(); new.status := 'pending';
  new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
  if new.bid_atleta is not null then
    select current_club_id, current_category into new.current_club_id_snapshot, new.current_category_snapshot from public.atletas where bid = new.bid_atleta;
    if not found then raise exception 'athlete not found'; end if;
  else
    new.current_club_id_snapshot := null; new.current_category_snapshot := null;
  end if;
  return new;
end; $$;
create or replace function public.prepare_club_correction_request()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_club public.clubes%rowtype;
begin
  if private.is_admin() or auth.role() = 'service_role' then return new; end if;
  select c.* into v_club from public.clubes c where c.reivindicado_por = auth.uid() and c.claim_status = 'claimed';
  if v_club.id is null or not private.owns_claimed_club(v_club.id) then raise exception 'claimed club required'; end if;
  new.club_id := v_club.id; new.requested_by := auth.uid(); new.status := 'pending';
  new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
  new.current_value := case new.field_name when 'name' then v_club.name when 'cnpj' then v_club.cnpj when 'state' then v_club.state::text when 'federacao' then v_club.federacao when 'source_key' then v_club.source_key end;
  return new;
end; $$;
create or replace function public.guard_club_request_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if private.is_admin() or auth.role() = 'service_role' then return new; end if;
  raise exception 'club requests are immutable';
end; $$;

drop trigger if exists trg_club_category_write on public.club_categorias;
create trigger trg_club_category_write before insert or update on public.club_categorias for each row execute function public.prepare_club_category_write();
drop trigger if exists trg_club_tournament_write on public.club_categoria_torneios;
create trigger trg_club_tournament_write before insert or update on public.club_categoria_torneios for each row execute function public.prepare_club_tournament_write();
drop trigger if exists trg_club_roster_request_insert on public.club_elenco_solicitacoes;
create trigger trg_club_roster_request_insert before insert on public.club_elenco_solicitacoes for each row execute function public.prepare_club_roster_request();
drop trigger if exists trg_club_roster_request_update on public.club_elenco_solicitacoes;
create trigger trg_club_roster_request_update before update on public.club_elenco_solicitacoes for each row execute function public.guard_club_request_update();
drop trigger if exists trg_club_correction_insert on public.club_correction_requests;
create trigger trg_club_correction_insert before insert on public.club_correction_requests for each row execute function public.prepare_club_correction_request();
drop trigger if exists trg_club_correction_update on public.club_correction_requests;
create trigger trg_club_correction_update before update on public.club_correction_requests for each row execute function public.guard_club_request_update();

revoke execute on function public.prepare_club_category_write() from public, anon, authenticated;
revoke execute on function public.prepare_club_tournament_write() from public, anon, authenticated;
revoke execute on function public.prepare_club_roster_request() from public, anon, authenticated;
revoke execute on function public.prepare_club_correction_request() from public, anon, authenticated;
revoke execute on function public.guard_club_request_update() from public, anon, authenticated;

alter table public.club_categorias enable row level security;
alter table public.club_categoria_torneios enable row level security;
alter table public.club_elenco_solicitacoes enable row level security;
alter table public.club_correction_requests enable row level security;
alter table public.club_divergencias enable row level security;

create policy club_categories_select on public.club_categorias for select to authenticated using (private.owns_claimed_club(club_id) or private.is_admin());
create policy club_categories_insert on public.club_categorias for insert to authenticated with check (private.owns_claimed_club(club_id) or private.is_admin());
create policy club_categories_update on public.club_categorias for update to authenticated using (private.owns_claimed_club(club_id) or private.is_admin()) with check (private.owns_claimed_club(club_id) or private.is_admin());
create policy club_tournaments_select on public.club_categoria_torneios for select to authenticated using (private.is_admin() or exists (select 1 from public.club_categorias cc where cc.id = club_category_id and private.owns_claimed_club(cc.club_id)));
create policy club_tournaments_insert on public.club_categoria_torneios for insert to authenticated with check (private.is_admin() or exists (select 1 from public.club_categorias cc where cc.id = club_category_id and private.owns_claimed_club(cc.club_id)));
create policy club_tournaments_update on public.club_categoria_torneios for update to authenticated using (private.is_admin() or exists (select 1 from public.club_categorias cc where cc.id = club_category_id and private.owns_claimed_club(cc.club_id))) with check (private.is_admin() or exists (select 1 from public.club_categorias cc where cc.id = club_category_id and private.owns_claimed_club(cc.club_id)));
create policy club_roster_requests_select on public.club_elenco_solicitacoes for select to authenticated using (private.owns_claimed_club(club_id) or private.is_admin());
create policy club_roster_requests_insert on public.club_elenco_solicitacoes for insert to authenticated with check (private.owns_claimed_club(club_id) or private.is_admin());
create policy club_roster_requests_admin_update on public.club_elenco_solicitacoes for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy club_corrections_select on public.club_correction_requests for select to authenticated using (private.owns_claimed_club(club_id) or private.is_admin());
create policy club_corrections_insert on public.club_correction_requests for insert to authenticated with check (private.owns_claimed_club(club_id) or private.is_admin());
create policy club_corrections_admin_update on public.club_correction_requests for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy club_divergences_select on public.club_divergencias for select to authenticated using (private.owns_claimed_club(club_id) or private.is_admin());
create policy club_divergences_admin_write on public.club_divergencias for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Private bucket: only the authenticated server route writes through service_role
-- after validating ownership, file signature, dimensions and final WebP size.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('club-crests', 'club-crests', false, 51200, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 51200, allowed_mime_types = array['image/webp'];

drop policy if exists club_crests_admin_read on storage.objects;
create policy club_crests_admin_read on storage.objects for select to authenticated
using (bucket_id = 'club-crests' and private.is_admin());

comment on table public.club_elenco_solicitacoes is 'Club-declared roster requests. Only a later administrative approval may mutate atletas.';
comment on table public.club_divergencias is 'Conflict layer for club declarations versus official/admin/scraper observations; ingestion must not overwrite declarations.';
