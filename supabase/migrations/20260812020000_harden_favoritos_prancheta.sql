-- Fase 3.6 follow-up: integrity and explicit first-lineup state.
begin;

alter table public.prancheta_tatica
  add column if not exists lineup_initialized boolean not null default false;

create or replace function public.cleanup_slots_before_favorite_delete()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from public.prancheta_slots ps
  using public.prancheta_tatica pt
  where ps.prancheta_id = pt.id
    and pt.user_id = old.user_id
    and ps.bid_atleta = old.bid_atleta;
  return old;
end;
$$;

revoke all on function public.cleanup_slots_before_favorite_delete() from public, anon, authenticated;
drop trigger if exists trg_favorito_cleanup_slots on public.favoritos;
create trigger trg_favorito_cleanup_slots
  before delete on public.favoritos
  for each row execute function public.cleanup_slots_before_favorite_delete();

create or replace function public.replace_prancheta_slots(
  p_board_id uuid,
  p_formation text,
  p_slots jsonb
)
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
    select 1 from public.prancheta_tatica
    where id = p_board_id and user_id = v_user_id
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
      as x(bid_atleta bigint, position_code text, slot_order smallint)
    where x.bid_atleta is null
      or x.position_code not in ('GK','CB','LB','RB','DM','CM','AM','LW','RW','ST')
      or x.slot_order not between 0 and 10
  ) then
    raise exception 'invalid tactical-board slot';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_slots)
      as x(bid_atleta bigint, position_code text, slot_order smallint)
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
    select count(distinct x.bid_atleta) from jsonb_to_recordset(p_slots)
      as x(bid_atleta bigint, position_code text, slot_order smallint)
  ) <> v_count then
    raise exception 'an athlete cannot occupy multiple slots';
  end if;
  if (
    select count(distinct x.slot_order) from jsonb_to_recordset(p_slots)
      as x(bid_atleta bigint, position_code text, slot_order smallint)
  ) <> v_count then
    raise exception 'slot_order must be unique';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_slots)
      as x(bid_atleta bigint, position_code text, slot_order smallint)
    where not exists (
      select 1 from public.favoritos f
      where f.user_id = v_user_id and f.bid_atleta = x.bid_atleta
    )
  ) then
    raise exception 'only favorited athletes may be selected';
  end if;
  delete from public.prancheta_slots where prancheta_id = p_board_id;
  update public.prancheta_tatica
  set formation = p_formation, lineup_initialized = true
  where id = p_board_id and user_id = v_user_id;
  insert into public.prancheta_slots (
    prancheta_id, bid_atleta, slot_type, position_code, slot_order
  )
  select p_board_id, x.bid_atleta, 'starter', x.position_code, x.slot_order
  from jsonb_to_recordset(p_slots)
    as x(bid_atleta bigint, position_code text, slot_order smallint);
end;
$$;

revoke all on function public.replace_prancheta_slots(uuid, text, jsonb) from public, anon;
grant execute on function public.replace_prancheta_slots(uuid, text, jsonb) to authenticated, service_role;

commit;
