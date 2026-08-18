begin;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='reivindicacao_atleta_documento_required' and conrelid='public.solicitacoes_reivindicacao'::regclass) then
    alter table public.solicitacoes_reivindicacao add constraint reivindicacao_atleta_documento_required
      check (tipo <> 'atleta' or (documento_url is not null and char_length(documento_url) <= 1000 and documento_url ~* '^https?://[^[:space:]]+$')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='reivindicacao_atleta_mensagem_required' and conrelid='public.solicitacoes_reivindicacao'::regclass) then
    alter table public.solicitacoes_reivindicacao add constraint reivindicacao_atleta_mensagem_required
      check (tipo <> 'atleta' or char_length(btrim(coalesce(mensagem,''))) between 20 and 2000) not valid;
  end if;
end $$;

create unique index if not exists idx_reivindicacao_atleta_pending_target
  on public.solicitacoes_reivindicacao (bid_atleta)
  where tipo='atleta' and status='pending';

create or replace function public.prepare_athlete_claim_insert()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_agent_id uuid; v_status text; v_current_agent uuid;
begin
  if new.tipo <> 'atleta' then return new; end if;
  if (select auth.uid()) is not null and new.requested_by is distinct from (select auth.uid()) then
    raise exception 'claim requester must match authenticated user';
  end if;
  new.status := 'pending'; new.reviewed_by := null; new.reviewed_at := null;
  select a.id into v_agent_id from public.agentes a join public.profiles p on p.id=a.user_id
    where a.user_id=new.requested_by and a.verified_status='verified' and p.role='agent' and p.account_status='approved';
  if v_agent_id is null then raise exception 'only approved verified agents may claim athletes'; end if;
  select at.claim_status,at.agent_id into v_status,v_current_agent from public.atletas at where at.bid=new.bid_atleta for update;
  if not found then raise exception 'athlete not found'; end if;
  if v_status is distinct from 'unclaimed' or v_current_agent is not null then raise exception 'athlete is not available for claim'; end if;
  return new;
end; $$;

create or replace function public.mark_athlete_claim_pending()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.tipo='atleta' then
    update public.atletas set claim_status='pending'
      where bid=new.bid_atleta and claim_status='unclaimed' and agent_id is null;
    if not found then raise exception 'athlete claim is no longer available'; end if;
  end if;
  return new;
end; $$;

create or replace function public.sync_athlete_claim_state()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_agent_id uuid;
begin
  if tg_op='UPDATE' and new.tipo='atleta' and new.status is distinct from old.status then
    if new.status='approved' then
      select a.id into v_agent_id from public.agentes a join public.profiles p on p.id=a.user_id
        where a.user_id=new.requested_by and a.verified_status='verified' and p.role='agent' and p.account_status='approved';
      if v_agent_id is null then raise exception 'claiming agent is no longer eligible'; end if;
      update public.atletas set agent_id=v_agent_id,claim_status='claimed'
        where bid=new.bid_atleta and claim_status='pending' and agent_id is null;
      if not found then raise exception 'athlete claim is no longer pending'; end if;
    elsif new.status='rejected' then
      update public.atletas set agent_id=null,claim_status='unclaimed'
        where bid=new.bid_atleta and claim_status='pending' and agent_id is null;
      if not found then raise exception 'athlete claim is no longer pending'; end if;
    end if;
    return new;
  end if;
  if tg_op='DELETE' and old.tipo='atleta' and old.status='pending' then
    update public.atletas set agent_id=null,claim_status='unclaimed'
      where bid=old.bid_atleta and claim_status='pending' and agent_id is null;
    return old;
  end if;
  return coalesce(new,old);
end; $$;

-- Preserve the exact six-field agent allowlist while permitting only the
-- internal request trigger to perform unclaimed -> pending.
create or replace function public.guard_atleta_update()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if private.is_admin() or auth.role()='service_role' then return new; end if;
  if pg_trigger_depth()>1
    and old.claim_status='unclaimed' and old.agent_id is null
    and new.claim_status='pending' and new.agent_id is null
    and (to_jsonb(new)-array['claim_status','updated_at']::text[]) is not distinct from (to_jsonb(old)-array['claim_status','updated_at']::text[])
    and exists (select 1 from public.solicitacoes_reivindicacao r where r.tipo='atleta' and r.bid_atleta=old.bid and r.requested_by=(select auth.uid()) and r.status='pending')
  then return new; end if;
  if exists (select 1 from public.agentes a where a.id=old.agent_id and a.user_id=(select auth.uid()) and a.verified_status='verified' and old.claim_status='claimed') then
    if (to_jsonb(new)-array['apelido','dominant_foot','height_cm','weight_kg','posicao_secundaria','youtube_video_url','updated_at']::text[])
      is distinct from (to_jsonb(old)-array['apelido','dominant_foot','height_cm','weight_kg','posicao_secundaria','youtube_video_url','updated_at']::text[])
    then raise exception 'agents may only edit apelido, dominant_foot, height_cm, weight_kg, posicao_secundaria and youtube_video_url'; end if;
    return new;
  end if;
  raise exception 'not authorized to update this athlete';
end; $$;

drop trigger if exists trg_prepare_athlete_claim_insert on public.solicitacoes_reivindicacao;
create trigger trg_prepare_athlete_claim_insert before insert on public.solicitacoes_reivindicacao for each row execute function public.prepare_athlete_claim_insert();
drop trigger if exists trg_mark_athlete_claim_pending on public.solicitacoes_reivindicacao;
create trigger trg_mark_athlete_claim_pending after insert on public.solicitacoes_reivindicacao for each row execute function public.mark_athlete_claim_pending();
drop trigger if exists trg_sync_athlete_claim_state on public.solicitacoes_reivindicacao;
create trigger trg_sync_athlete_claim_state after update or delete on public.solicitacoes_reivindicacao for each row execute function public.sync_athlete_claim_state();
revoke execute on function public.prepare_athlete_claim_insert() from public,anon,authenticated;
revoke execute on function public.mark_athlete_claim_pending() from public,anon,authenticated;
revoke execute on function public.sync_athlete_claim_state() from public,anon,authenticated;
revoke execute on function public.guard_atleta_update() from public,anon,authenticated;

drop policy if exists reivindicacao_insert_own on public.solicitacoes_reivindicacao;
create policy reivindicacao_insert_own on public.solicitacoes_reivindicacao for insert to authenticated with check (
  requested_by=(select auth.uid()) and status='pending' and reviewed_by is null and reviewed_at is null and (
    (tipo='clube' and bid_atleta is null and clube_id is not null
      and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='club' and p.account_status='approved')
      and exists (select 1 from public.clubes c where c.id=solicitacoes_reivindicacao.clube_id and c.claim_status in ('unclaimed','pending'))
      and not exists (select 1 from public.clubes c where c.reivindicado_por=(select auth.uid())))
    or
    (tipo='atleta' and bid_atleta is not null and clube_id is null
      and exists (select 1 from public.agentes a join public.profiles p on p.id=a.user_id where a.user_id=(select auth.uid()) and a.verified_status='verified' and p.role='agent' and p.account_status='approved')
      and exists (select 1 from public.atletas at where at.bid=solicitacoes_reivindicacao.bid_atleta and at.agent_id is null and at.claim_status in ('unclaimed','pending')))
  )
);

commit;
