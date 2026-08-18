-- ============================================================================
-- FOOTBASE — Security hardening migration (Supabase Security Advisor fixes)
-- ============================================================================
-- Addresses all 15 warnings from Database > Advisors > Security Advisor:
--  * Function Search Path Mutable (categoria_rank, set_updated_at)
--  * Extension in Public (pg_trgm)
--  * Public/Signed-in can execute SECURITY DEFINER functions
--    (is_admin, is_approved, guard_agente_update, guard_atleta_update,
--     handle_new_user)
--
-- Not touched: rls_auto_enable() / the `ensure_rls` event trigger — this is
-- Supabase platform infrastructure (alongside pgrst_ddl_watch,
-- issue_pg_cron_access, etc., confirmed via pg_event_trigger), not part of
-- our schema. Leaving it alone.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) pg_trgm was installed into `public`; Supabase's convention (and where
--    pgcrypto/uuid-ossp already live on this project) is the `extensions`
--    schema, which is already on the default search_path.
-- ----------------------------------------------------------------------------
alter extension pg_trgm set schema extensions;

-- ----------------------------------------------------------------------------
-- 2) Functions with no explicit search_path are vulnerable to search_path
--    hijacking. Pin them.
-- ----------------------------------------------------------------------------
alter function public.categoria_rank(text) set search_path = public;
alter function public.set_updated_at() set search_path = public;

-- ----------------------------------------------------------------------------
-- 3) `private` schema: never added to PostgREST's exposed schema list, so
--    nothing inside it is reachable as /rest/v1/rpc/*. RLS policies can still
--    call it (Postgres checks grants, not PostgREST's exposed-schema config).
-- ----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- is_admin/is_approved are read by RLS policies evaluated as anon/authenticated,
-- so those two roles still need EXECUTE — but PUBLIC (i.e. unauthenticated
-- direct RPC callers) no longer can, and the functions are gone from the API
-- surface entirely once out of `public`.
alter function public.is_admin() set schema private;
alter function public.is_approved() set schema private;

revoke execute on function private.is_admin() from public;
revoke execute on function private.is_approved() from public;
grant execute on function private.is_admin() to anon, authenticated, service_role;
grant execute on function private.is_approved() to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4) guard_agente_update / guard_atleta_update / handle_new_user only ever
--    run as trigger bodies (Postgres invokes those without checking the
--    firing role's EXECUTE grant) — no one should be able to call them
--    directly via RPC. Re-point their internal is_admin() calls at the new
--    `private` location, then strip direct-call rights.
-- ----------------------------------------------------------------------------
create or replace function public.guard_agente_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.is_admin() then
    return new;
  end if;

  if new.verified_status is distinct from old.verified_status
    or new.user_id is distinct from old.user_id
  then
    raise exception 'only admins may change verified_status or user_id';
  end if;

  return new;
end;
$$;

create or replace function public.guard_atleta_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.is_admin() then
    return new;
  end if;

  if exists (
    select 1 from agentes a
    where a.id = old.agent_id
      and a.user_id = auth.uid()
      and a.verified_status = 'verified'
      and old.claim_status = 'claimed'
  ) then
    if new.bid is distinct from old.bid
      or new.fifa_id is distinct from old.fifa_id
      or new.name is distinct from old.name
      or new.birth_date is distinct from old.birth_date
      or new.main_position is distinct from old.main_position
      or new.contract_end_date is distinct from old.contract_end_date
      or new.current_club_id is distinct from old.current_club_id
      or new.current_category is distinct from old.current_category
      or new.agent_id is distinct from old.agent_id
      or new.claim_status is distinct from old.claim_status
    then
      raise exception 'agents may only edit dominant_foot, height_cm, weight_kg, youtube_highlights_url';
    end if;
    return new;
  end if;

  raise exception 'not authorized to update this athlete';
end;
$$;

revoke execute on function public.guard_agente_update() from public, anon, authenticated;
revoke execute on function public.guard_atleta_update() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5) Re-point every RLS policy that referenced the old public.is_admin() /
--    public.is_approved() at private.is_admin() / private.is_approved().
-- ----------------------------------------------------------------------------
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles
  for select using (id = auth.uid() or private.is_admin());

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (id = auth.uid() or private.is_admin());

drop policy if exists clubes_select_approved on clubes;
create policy clubes_select_approved on clubes
  for select using (private.is_approved() or private.is_admin());

drop policy if exists clubes_write_admin on clubes;
create policy clubes_write_admin on clubes
  for all using (private.is_admin()) with check (private.is_admin());

drop policy if exists torneios_select_approved on torneios;
create policy torneios_select_approved on torneios
  for select using (private.is_approved() or private.is_admin());

drop policy if exists torneios_write_admin on torneios;
create policy torneios_write_admin on torneios
  for all using (private.is_admin()) with check (private.is_admin());

drop policy if exists agentes_select on agentes;
create policy agentes_select on agentes
  for select using (user_id = auth.uid() or private.is_approved() or private.is_admin());

drop policy if exists agentes_update_own_or_admin on agentes;
create policy agentes_update_own_or_admin on agentes
  for update using (user_id = auth.uid() or private.is_admin())
  with check (user_id = auth.uid() or private.is_admin());

drop policy if exists atletas_select_approved on atletas;
create policy atletas_select_approved on atletas
  for select using (private.is_approved() or private.is_admin());

drop policy if exists atletas_insert_admin on atletas;
create policy atletas_insert_admin on atletas
  for insert with check (private.is_admin());

drop policy if exists atletas_update_admin_or_claiming_agent on atletas;
create policy atletas_update_admin_or_claiming_agent on atletas
  for update using (
    private.is_admin()
    or exists (
      select 1 from agentes a
      where a.id = atletas.agent_id
        and a.user_id = auth.uid()
        and a.verified_status = 'verified'
        and atletas.claim_status = 'claimed'
    )
  );

drop policy if exists atletas_delete_admin on atletas;
create policy atletas_delete_admin on atletas
  for delete using (private.is_admin());

drop policy if exists atuacoes_select_approved on atuacoes_sumula;
create policy atuacoes_select_approved on atuacoes_sumula
  for select using (private.is_approved() or private.is_admin());

drop policy if exists atuacoes_write_admin on atuacoes_sumula;
create policy atuacoes_write_admin on atuacoes_sumula
  for all using (private.is_admin()) with check (private.is_admin());

commit;
