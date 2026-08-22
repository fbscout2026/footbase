-- FOOTBASE — FB-ID: rename atletas.bid (and every FK) to fb_id.
--
-- Context (see plan "FB-ID: chave suprema de identidade do atleta"): `bid`
-- doubled as both the internal PK and, for CBF-sourced athletes, the literal
-- CBF registration number. That coupling is the root cause of identity
-- fragmentation risk across federations (FMF/FGF write a source number
-- straight into the PK with no `atleta_fontes` bookkeeping, unlike FERJ's
-- live path). This migration only renames the column — a metadata-only
-- operation in Postgres, it does not rewrite table data, does not reindex,
-- and does not drop/recreate any FK constraint (the constraint follows the
-- column through the rename automatically). Views, RLS policies, CHECK
-- constraints and indexes that reference these columns are tracked by
-- Postgres internally by attribute number, so they update automatically too
-- — only PL/pgSQL FUNCTION bodies (plain embedded SQL text, not re-analyzed
-- until next call) need to be explicitly recreated below.
--
-- Deliberately OUT of scope here (reverted in schema.sql to avoid mixing a
-- column rename with a stored-value rename): `club_elenco_solicitacoes
-- .informed_bid` and the `'register_missing_bid'` action value — those are a
-- separate club-roster-request feature, not part of the athlete identity
-- chain, and renaming the stored action VALUE would need its own data
-- migration + TypeScript enum update. Not touched here.
--
-- Consumer impact (CLAUDE.md pre-change analysis):
--  * Every `lib/services/*.ts` query (`.eq("bid", ...)`, `.select("bid,...")`)
--    and every component prop/type reading `athlete.bid` breaks the moment
--    this is applied — this migration must not be applied to a live database
--    until the matching application-code rename (plan step 2) is deployed
--    together with it. Applying schema-only against a running old build IS
--    a production outage. Do not run this against Supabase until explicitly
--    authorized alongside the paired code deploy.
--  * Rollback: `ALTER TABLE ... RENAME COLUMN fb_id TO bid` (and the inverse
--    for every FK below) is the exact mechanical reverse — safe, no data loss,
--    since nothing here is a data mutation.

begin;

-- Primary identity column.
alter table atletas rename column bid to fb_id;
alter table atleta_fontes rename column bid to fb_id;

-- Every FK into atletas(fb_id).
alter table conquistas rename column bid_atleta to fb_id_atleta;
alter table historico_clubes rename column bid_atleta to fb_id_atleta;
alter table atuacoes_sumula rename column bid_atleta to fb_id_atleta;
alter table favoritos rename column bid_atleta to fb_id_atleta;
alter table prancheta_slots rename column bid_atleta to fb_id_atleta;
alter table solicitacoes_reivindicacao rename column bid_atleta to fb_id_atleta;
alter table solicitacoes_correcao rename column bid_atleta to fb_id_atleta;
alter table club_elenco_solicitacoes rename column bid_atleta to fb_id_atleta;
alter table representacao_transferencias rename column bid_atleta to fb_id_atleta;
alter table atleta_duplicate_candidates rename column bid_a to fb_id_a;
alter table atleta_duplicate_candidates rename column bid_b to fb_id_b;

-- solicitacoes_correcao's field-name allowlist stores 'bid' as a literal
-- string value (which correction field an agent is suggesting a change to),
-- not a column reference — renaming the column above does not touch this
-- CHECK constraint's value list, so it must be updated explicitly.
alter table solicitacoes_correcao drop constraint if exists solicitacoes_field_allowed;
-- 'fb_id' deliberately excluded (explicit user confirmation, Session 56): it's an
-- internal permanent identity now, not "a fact about the athlete" an agent could
-- know/correct — a wrong source-side number is an atleta_fontes/admin curation
-- concern, never an agent correction request.
alter table solicitacoes_correcao add constraint solicitacoes_field_allowed check (field_name in (
  'fifa_id', 'name', 'birth_date', 'nacionalidade', 'tem_passaporte',
  'passaporte', 'main_position', 'inicio_carreira', 'contract_end_date',
  'current_club_id', 'current_category', 'experiencia_internacional',
  'jogos_suspenso', 'performance_data'
));

-- Index names (cosmetic — never surfaced to any user, but renamed for
-- consistency; harmless to skip if any of these fail on a database where an
-- index was already renamed by hand).
alter index if exists idx_conquistas_bid rename to idx_conquistas_fb_id;
alter index if exists idx_historico_bid rename to idx_historico_fb_id;
alter index if exists idx_atleta_fontes_bid rename to idx_atleta_fontes_fb_id;
alter index if exists idx_atuacoes_bid rename to idx_atuacoes_fb_id;
alter index if exists idx_favoritos_bid rename to idx_favoritos_fb_id;
alter index if exists idx_solicitacoes_bid rename to idx_solicitacoes_fb_id;
alter index if exists idx_representacao_transferencias_bid rename to idx_representacao_transferencias_fb_id;

-- Functions with embedded SQL text referencing the old column names — these
-- are NOT auto-updated by the column rename (unlike views/RLS/indexes/CHECKs,
-- which Postgres tracks by attribute number). Bodies below are copied
-- verbatim from the now-updated supabase/schema.sql.
--
-- `create or replace function` cannot rename an existing parameter (only
-- swap the body/types) — every function below whose parameter name changed
-- (p_bid -> p_fb_id) needs an explicit `drop function` first.

drop function if exists recompute_atleta_stats(bigint);

create or replace function recompute_atleta_stats(p_fb_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_category text;
begin
  select current_category into v_current_category from atletas where fb_id = p_fb_id;

  update atletas a set
    total_matches = coalesce(stats.total_matches, 0),
    total_minutes = coalesce(stats.total_minutes, 0),
    total_goals = coalesce(stats.total_goals, 0),
    total_assists = coalesce(stats.total_assists, 0),
    total_yellow_cards = coalesce(stats.total_yellow_cards, 0),
    total_red_cards = coalesce(stats.total_red_cards, 0),
    total_clean_sheets = coalesce(stats.total_clean_sheets, 0),
    times_played_above_category = coalesce(stats.times_played_above_category, 0),
    games_above_current_category = coalesce(stats.games_above_current_category, 0),
    last_match_date = stats.last_match_date,
    goals_last5 = coalesce(recent.goals_last5, 0)
  from (
    select
      count(*)::int as total_matches,
      coalesce(sum(s.minutes_played), 0)::int as total_minutes,
      coalesce(sum(s.goals), 0)::int as total_goals,
      coalesce(sum(s.assists), 0)::int as total_assists,
      coalesce(sum(s.yellow_cards), 0)::int as total_yellow_cards,
      coalesce(sum(s.red_cards), 0)::int as total_red_cards,
      coalesce(sum(s.clean_sheet::int), 0)::int as total_clean_sheets,
      coalesce(sum((categoria_rank(p.match_category) > categoria_rank(s.player_category))::int), 0)::int as times_played_above_category,
      coalesce(sum((v_current_category is not null and categoria_rank(p.match_category) > categoria_rank(v_current_category))::int), 0)::int as games_above_current_category,
      max(p.match_date) as last_match_date
    from atuacoes_sumula s
    join partidas_sumula p on p.id = s.partida_id
    where s.fb_id_atleta = p_fb_id
  ) stats,
  lateral (
    select coalesce(sum(recent5.goals), 0)::int as goals_last5
    from (
      select s.goals
      from atuacoes_sumula s
      join partidas_sumula p on p.id = s.partida_id
      where s.fb_id_atleta = p_fb_id
      order by p.match_date desc
      limit 5
    ) recent5
  ) recent
  where a.fb_id = p_fb_id;
end;
$$;

create or replace function prepare_athlete_claim_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_agent_id uuid; v_status text; v_current_agent uuid;
begin
  if new.tipo <> 'atleta' then return new; end if;
  if (select auth.uid()) is not null and new.requested_by is distinct from (select auth.uid()) then raise exception 'claim requester must match authenticated user'; end if;
  new.status := 'pending'; new.reviewed_by := null; new.reviewed_at := null;
  select a.id into v_agent_id from agentes a join profiles p on p.id=a.user_id where a.user_id=new.requested_by and a.verified_status='verified' and p.role='agent' and p.account_status='approved';
  if v_agent_id is null then raise exception 'only approved verified agents may claim athletes'; end if;
  select at.claim_status,at.agent_id into v_status,v_current_agent from atletas at where at.fb_id=new.fb_id_atleta for update;
  if not found then raise exception 'athlete not found'; end if;
  if v_status is distinct from 'unclaimed' or v_current_agent is not null then raise exception 'athlete is not available for claim'; end if;
  return new;
end; $$;

create or replace function mark_athlete_claim_pending()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo='atleta' then
    update atletas set claim_status='pending' where fb_id=new.fb_id_atleta and claim_status='unclaimed' and agent_id is null;
    if not found then raise exception 'athlete claim is no longer available'; end if;
  end if;
  return new;
end; $$;

create or replace function sync_athlete_claim_state()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_agent_id uuid;
begin
  if tg_op='UPDATE' and new.tipo='atleta' and new.status is distinct from old.status then
    if new.status='approved' then
      select a.id into v_agent_id from agentes a join profiles p on p.id=a.user_id where a.user_id=new.requested_by and a.verified_status='verified' and p.role='agent' and p.account_status='approved';
      if v_agent_id is null then raise exception 'claiming agent is no longer eligible'; end if;
      update atletas set agent_id=v_agent_id,claim_status='claimed' where fb_id=new.fb_id_atleta and claim_status='pending' and agent_id is null;
      if not found then raise exception 'athlete claim is no longer pending'; end if;
    elsif new.status='rejected' then
      update atletas set agent_id=null,claim_status='unclaimed' where fb_id=new.fb_id_atleta and claim_status='pending' and agent_id is null;
      if not found then raise exception 'athlete claim is no longer pending'; end if;
    end if;
    return new;
  end if;
  if tg_op='DELETE' and old.tipo='atleta' and old.status='pending' then update atletas set agent_id=null,claim_status='unclaimed' where fb_id=old.fb_id_atleta and claim_status='pending' and agent_id is null; return old; end if;
  return coalesce(new,old);
end; $$;

create or replace function guard_atleta_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if private.is_admin() or auth.role()='service_role' then return new; end if;
  if pg_trigger_depth()>1 and old.claim_status='unclaimed' and old.agent_id is null and new.claim_status='pending' and new.agent_id is null
    and (to_jsonb(new)-array['claim_status','updated_at']::text[]) is not distinct from (to_jsonb(old)-array['claim_status','updated_at']::text[])
    and exists (select 1 from solicitacoes_reivindicacao r where r.tipo='atleta' and r.fb_id_atleta=old.fb_id and r.requested_by=(select auth.uid()) and r.status='pending') then return new; end if;
  if exists (select 1 from agentes a where a.id=old.agent_id and a.user_id=(select auth.uid()) and a.verified_status='verified' and old.claim_status='claimed') then
    if (to_jsonb(new)-array['apelido','dominant_foot','height_cm','weight_kg','posicao_secundaria','youtube_video_url','updated_at']::text[]) is distinct from (to_jsonb(old)-array['apelido','dominant_foot','height_cm','weight_kg','posicao_secundaria','youtube_video_url','updated_at']::text[]) then raise exception 'agents may only edit apelido, dominant_foot, height_cm, weight_kg, posicao_secundaria and youtube_video_url'; end if;
    return new;
  end if;
  raise exception 'not authorized to update this athlete';
end; $$;

create or replace function capture_correction_current_value()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atleta public.atletas%rowtype;
begin
  select * into v_atleta from public.atletas where fb_id = new.fb_id_atleta;
  if not found then raise exception 'athlete not found'; end if;
  new.current_value := case
    when new.field_name = 'performance_data' then null
    else to_jsonb(v_atleta) ->> new.field_name
  end;
  return new;
end;
$$;

create or replace function cleanup_slots_before_favorite_delete()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from prancheta_slots ps
  using prancheta_tatica pt
  where ps.prancheta_id = pt.id
    and pt.user_id = old.user_id
    and ps.fb_id_atleta = old.fb_id_atleta;
  return old;
end;
$$;

drop function if exists replace_prancheta_slots(uuid, text, jsonb);

create or replace function replace_prancheta_slots(p_board_id uuid, p_formation text, p_slots jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_count integer;
begin
  if v_user_id is null or not private.is_approved() then
    raise exception 'approved authentication required';
  end if;
  if not exists (
    select 1 from prancheta_tatica where id = p_board_id and user_id = v_user_id
  ) then
    raise exception 'tactical board not found';
  end if;
  if p_formation not in ('4-3-3', '4-4-2', '3-5-2', '4-2-3-1') then
    raise exception 'unsupported formation';
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be a JSON array';
  end if;
  v_count := jsonb_array_length(p_slots);
  if v_count > 11 then
    raise exception 'a tactical board supports at most 11 starters';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_slots)
      as x(fb_id_atleta bigint, position_code text, slot_order smallint)
    where x.fb_id_atleta is null
      or x.position_code not in ('GK','CB','LB','RB','DM','CM','AM','LW','RW','ST')
      or x.slot_order not between 0 and 10
  ) then
    raise exception 'invalid tactical-board slot';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_slots)
      as x(fb_id_atleta bigint, position_code text, slot_order smallint)
    where x.position_code <> case p_formation
      when '4-3-3' then (array['GK','RB','CB','CB','LB','DM','CM','CM','RW','ST','LW'])[x.slot_order + 1]
      when '4-4-2' then (array['GK','RB','CB','CB','LB','RW','CM','CM','LW','ST','ST'])[x.slot_order + 1]
      when '3-5-2' then (array['GK','CB','CB','CB','RW','DM','CM','AM','LW','ST','ST'])[x.slot_order + 1]
      when '4-2-3-1' then (array['GK','RB','CB','CB','LB','DM','DM','RW','AM','LW','ST'])[x.slot_order + 1]
    end
  ) then
    raise exception 'slot position does not match formation';
  end if;
  if (
    select count(distinct x.fb_id_atleta) from jsonb_to_recordset(p_slots)
      as x(fb_id_atleta bigint, position_code text, slot_order smallint)
  ) <> v_count then
    raise exception 'an athlete cannot occupy multiple slots';
  end if;
  if (
    select count(distinct x.slot_order) from jsonb_to_recordset(p_slots)
      as x(fb_id_atleta bigint, position_code text, slot_order smallint)
  ) <> v_count then
    raise exception 'slot_order must be unique';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_slots)
      as x(fb_id_atleta bigint, position_code text, slot_order smallint)
    where not exists (
      select 1 from favoritos f where f.user_id = v_user_id and f.fb_id_atleta = x.fb_id_atleta
    )
  ) then
    raise exception 'only favorited athletes may be selected';
  end if;
  delete from prancheta_slots where prancheta_id = p_board_id;
  update prancheta_tatica set formation = p_formation, lineup_initialized = true
  where id = p_board_id and user_id = v_user_id;
  insert into prancheta_slots (prancheta_id, fb_id_atleta, slot_type, position_code, slot_order)
  select p_board_id, x.fb_id_atleta, 'starter', x.position_code, x.slot_order
  from jsonb_to_recordset(p_slots)
    as x(fb_id_atleta bigint, position_code text, slot_order smallint);
end;
$$;
revoke all on function replace_prancheta_slots(uuid, text, jsonb) from public, anon;
grant execute on function replace_prancheta_slots(uuid, text, jsonb) to authenticated, service_role;

drop function if exists remove_favorite_and_slot(bigint);

create or replace function remove_favorite_and_slot(p_fb_id bigint)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not private.is_approved() then
    raise exception 'approved authentication required';
  end if;
  delete from prancheta_slots ps
  using prancheta_tatica pt
  where ps.prancheta_id = pt.id and pt.user_id = v_user_id and ps.fb_id_atleta = p_fb_id;
  delete from favoritos where user_id = v_user_id and fb_id_atleta = p_fb_id;
end;
$$;
revoke all on function remove_favorite_and_slot(bigint) from public, anon;
grant execute on function remove_favorite_and_slot(bigint) to authenticated, service_role;

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
  if new.fb_id_atleta is not null then
    select current_club_id, current_category into new.current_club_id_snapshot, new.current_category_snapshot from public.atletas where fb_id = new.fb_id_atleta;
    if not found then raise exception 'athlete not found'; end if;
  else
    new.current_club_id_snapshot := null; new.current_category_snapshot := null;
  end if;
  return new;
end; $$;

drop function if exists admin_transferir_representacao(bigint, uuid, text, text);

create or replace function admin_transferir_representacao(
  p_fb_id bigint,
  p_novo_agente_id uuid,
  p_justificativa text,
  p_comprovante_url text
) returns representacao_transferencias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior uuid;
  v_status text;
  v_novo_ok boolean;
  v_result representacao_transferencias;
begin
  if not (private.is_admin() or auth.role() = 'service_role') then
    raise exception 'only admins may transfer athlete representation';
  end if;

  if p_justificativa is null or char_length(trim(p_justificativa)) < 20 or char_length(p_justificativa) > 2000 then
    raise exception 'justificativa must be 20..2000 characters';
  end if;
  if p_comprovante_url is null or p_comprovante_url !~ '^https?://' then
    raise exception 'comprovante_url must be an http(s) URL';
  end if;

  select agent_id, claim_status into v_anterior, v_status
  from atletas where fb_id = p_fb_id for update;
  if not found then raise exception 'athlete % not found', p_fb_id; end if;
  if v_status <> 'claimed' or v_anterior is null then
    raise exception 'athlete % has no current agent to transfer representation from', p_fb_id;
  end if;
  if v_anterior = p_novo_agente_id then
    raise exception 'the new agent must differ from the current agent';
  end if;

  select exists (
    select 1 from agentes a
    join profiles p on p.id = a.user_id
    where a.id = p_novo_agente_id
      and a.verified_status = 'verified'
      and p.role = 'agent'
      and p.account_status = 'approved'
  ) into v_novo_ok;
  if not v_novo_ok then
    raise exception 'new agent must be an approved, verified agent';
  end if;

  update atletas set agent_id = p_novo_agente_id, claim_status = 'claimed' where fb_id = p_fb_id;

  insert into representacao_transferencias
    (fb_id_atleta, agente_anterior_id, agente_novo_id, justificativa, comprovante_url, admin_id)
  values
    (p_fb_id, v_anterior, p_novo_agente_id, p_justificativa, p_comprovante_url, auth.uid())
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function admin_transferir_representacao(bigint, uuid, text, text) from public, anon;
grant execute on function admin_transferir_representacao(bigint, uuid, text, text) to authenticated, service_role;

commit;
