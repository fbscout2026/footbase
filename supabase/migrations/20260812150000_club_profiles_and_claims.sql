begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reivindicacao_clube_documento_required'
      and conrelid = 'public.solicitacoes_reivindicacao'::regclass
  ) then
    alter table public.solicitacoes_reivindicacao
      add constraint reivindicacao_clube_documento_required
      check (
        tipo <> 'clube'
        or (
          documento_url is not null
          and char_length(documento_url) <= 1000
          and documento_url ~* '^https?://[^[:space:]]+$'
        )
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reivindicacao_clube_mensagem_required'
      and conrelid = 'public.solicitacoes_reivindicacao'::regclass
  ) then
    alter table public.solicitacoes_reivindicacao
      add constraint reivindicacao_clube_mensagem_required
      check (
        tipo <> 'clube'
        or char_length(btrim(coalesce(mensagem, ''))) between 20 and 2000
      ) not valid;
  end if;
end $$;

create unique index if not exists idx_reivindicacao_clube_pending_requester
  on public.solicitacoes_reivindicacao (requested_by)
  where tipo = 'clube' and status = 'pending';

create unique index if not exists idx_reivindicacao_clube_pending_target
  on public.solicitacoes_reivindicacao (clube_id)
  where tipo = 'clube' and status = 'pending';

create unique index if not exists idx_clubes_claimed_user
  on public.clubes (reivindicado_por)
  where reivindicado_por is not null;

create or replace function public.prepare_club_claim_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_role text;
  v_account_status text;
  v_club_status text;
begin
  if new.tipo <> 'clube' then
    return new;
  end if;

  if (select auth.uid()) is not null
    and new.requested_by is distinct from (select auth.uid())
    and not private.is_admin()
  then
    raise exception 'claim requester must match authenticated user';
  end if;

  new.status := 'pending';
  new.reviewed_by := null;
  new.reviewed_at := null;

  select p.role, p.account_status
    into v_profile_role, v_account_status
  from public.profiles p
  where p.id = new.requested_by;

  if v_profile_role is distinct from 'club' or v_account_status is distinct from 'approved' then
    raise exception 'only approved club accounts may claim clubs';
  end if;

  if exists (
    select 1 from public.clubes c where c.reivindicado_por = new.requested_by
  ) then
    raise exception 'account already represents a club';
  end if;

  select c.claim_status into v_club_status
  from public.clubes c
  where c.id = new.clube_id
  for update;

  if not found then
    raise exception 'club not found';
  end if;
  if v_club_status is distinct from 'unclaimed' then
    raise exception 'club is not available for claim';
  end if;

  update public.clubes
  set claim_status = 'pending'
  where id = new.clube_id;

  return new;
end;
$$;

create or replace function public.guard_claim_request_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (to_jsonb(new) - array['status', 'reviewed_by', 'reviewed_at']::text[])
    is distinct from
    (to_jsonb(old) - array['status', 'reviewed_by', 'reviewed_at']::text[])
  then
    raise exception 'claim request identity and evidence are immutable';
  end if;

  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'reviewed claim requests cannot change status';
  end if;

  if new.status is distinct from old.status then
    if new.status not in ('approved', 'rejected') then
      raise exception 'invalid claim review transition';
    end if;
    if (select auth.uid()) is not null then
      new.reviewed_by := (select auth.uid());
    end if;
    new.reviewed_at := now();
  end if;

  return new;
end;
$$;

create or replace function public.sync_club_claim_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.tipo = 'clube' and new.status is distinct from old.status then
    if new.status = 'approved' then
      update public.clubes
      set reivindicado_por = new.requested_by, claim_status = 'claimed'
      where id = new.clube_id and claim_status = 'pending';
      if not found then raise exception 'club claim is no longer pending'; end if;
    elsif new.status = 'rejected' then
      update public.clubes
      set reivindicado_por = null, claim_status = 'unclaimed'
      where id = new.clube_id and claim_status = 'pending';
      if not found then raise exception 'club claim is no longer pending'; end if;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' and old.tipo = 'clube' and old.status = 'pending' then
    update public.clubes
    set reivindicado_por = null, claim_status = 'unclaimed'
    where id = old.clube_id and claim_status = 'pending';
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_prepare_club_claim_insert on public.solicitacoes_reivindicacao;
create trigger trg_prepare_club_claim_insert
  before insert on public.solicitacoes_reivindicacao
  for each row execute function public.prepare_club_claim_insert();

drop trigger if exists trg_guard_claim_request_update on public.solicitacoes_reivindicacao;
create trigger trg_guard_claim_request_update
  before update on public.solicitacoes_reivindicacao
  for each row execute function public.guard_claim_request_update();

drop trigger if exists trg_sync_club_claim_state on public.solicitacoes_reivindicacao;
create trigger trg_sync_club_claim_state
  after update or delete on public.solicitacoes_reivindicacao
  for each row execute function public.sync_club_claim_state();

revoke execute on function public.prepare_club_claim_insert() from public, anon, authenticated;
revoke execute on function public.guard_claim_request_update() from public, anon, authenticated;
revoke execute on function public.sync_club_claim_state() from public, anon, authenticated;

drop policy if exists reivindicacao_insert_own on public.solicitacoes_reivindicacao;
create policy reivindicacao_insert_own on public.solicitacoes_reivindicacao
  for insert
  to authenticated
  with check (
    requested_by = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and (
      (
        tipo = 'clube'
        and bid_atleta is null
        and clube_id is not null
        and exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'club'
            and p.account_status = 'approved'
        )
        and exists (
          select 1 from public.clubes c
          where c.id = solicitacoes_reivindicacao.clube_id
            and c.claim_status in ('unclaimed', 'pending')
        )
        and not exists (
          select 1 from public.clubes c
          where c.reivindicado_por = (select auth.uid())
        )
      )
      or (
        tipo = 'atleta'
        and bid_atleta is not null
        and clube_id is null
        and exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'agent'
            and p.account_status = 'approved'
        )
      )
    )
  );

commit;
