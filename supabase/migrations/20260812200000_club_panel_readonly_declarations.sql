-- FOOTBASE Phase 4.4 revision — club declarations become READ-ONLY in the panel.
--
-- Direction change: categories, tournaments and roster composition are captured
-- from official súmulas (CBF / state federations) by the ingestion service
-- (service_role) or curated by admin. The club account no longer declares them.
-- Institutional corrections (club_correction_requests) remain club-writable.
--
-- Expand/contract & scraping contract: this migration ONLY tightens write
-- policies. No table, column, trigger or function is dropped; the tables remain
-- the ingestion target. service_role bypasses RLS, so the future scraper is
-- unaffected. The prepare_* triggers are kept as defense-in-depth (their club
-- branch simply becomes unreachable now that clubs cannot insert).

-- Categories: only admin (UI) / service_role (ingestion) may write.
drop policy if exists club_categories_insert on public.club_categorias;
create policy club_categories_insert on public.club_categorias
  for insert to authenticated with check (private.is_admin());
drop policy if exists club_categories_update on public.club_categorias;
create policy club_categories_update on public.club_categorias
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

-- Tournaments: only admin / service_role may write.
drop policy if exists club_tournaments_insert on public.club_categoria_torneios;
create policy club_tournaments_insert on public.club_categoria_torneios
  for insert to authenticated with check (private.is_admin());
drop policy if exists club_tournaments_update on public.club_categoria_torneios;
create policy club_tournaments_update on public.club_categoria_torneios
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

-- Roster composition: clubs no longer file entry/exit/category requests here.
-- Only admin / service_role may write; the club still READS its squad via the
-- existing select policy (and the official squad comes from atletas ingestion).
drop policy if exists club_roster_requests_insert on public.club_elenco_solicitacoes;
create policy club_roster_requests_insert on public.club_elenco_solicitacoes
  for insert to authenticated with check (private.is_admin());

-- Crest is captured automatically (SEED/ingestion) and is read-only in the panel.
-- The club cannot upload, but MAY suggest a different version via the existing
-- institutional-correction flow. Allow 'crest' as a correction field and capture
-- the current crest reference as the "current value" for admin comparison.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.club_correction_requests'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%field_name%'
  loop
    execute format('alter table public.club_correction_requests drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.club_correction_requests add constraint club_correction_requests_field_name_check
  check (field_name in ('name','cnpj','state','federacao','source_key','crest'));

create or replace function public.prepare_club_correction_request()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_club public.clubes%rowtype;
begin
  if private.is_admin() or auth.role() = 'service_role' then return new; end if;
  select c.* into v_club from public.clubes c where c.reivindicado_por = auth.uid() and c.claim_status = 'claimed';
  if v_club.id is null or not private.owns_claimed_club(v_club.id) then raise exception 'claimed club required'; end if;
  new.club_id := v_club.id; new.requested_by := auth.uid(); new.status := 'pending';
  new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
  new.current_value := case new.field_name
    when 'name' then v_club.name
    when 'cnpj' then v_club.cnpj
    when 'state' then v_club.state::text
    when 'federacao' then v_club.federacao
    when 'source_key' then v_club.source_key
    when 'crest' then coalesce(v_club.webp_crest_url, v_club.crest_storage_path)
  end;
  return new;
end; $$;
