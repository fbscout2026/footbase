begin;

-- Fase 4.1 — Agent panel profile, controlled athlete edits and corrections.
alter table public.agentes add column if not exists bio text;

-- Account identity and approval fields are never self-service. Comparing the
-- complete row minus the explicit allowlist also protects columns added later.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;

  if (to_jsonb(new) - array['full_name', 'whatsapp', 'organization']::text[])
    is distinct from
    (to_jsonb(old) - array['full_name', 'whatsapp', 'organization']::text[])
  then
    raise exception 'users may only edit full_name, whatsapp and organization';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_update on public.profiles;
create trigger trg_guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

revoke execute on function public.guard_profile_update() from public, anon, authenticated;

-- Signup metadata is untrusted: public signups may create only agent or club
-- accounts, always pending. Administrative accounts are provisioned by admins.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  signup_role text := case when meta->>'role' = 'club' then 'club' else 'agent' end;
begin
  insert into public.profiles (id, role, account_status, full_name, whatsapp, organization)
  values (
    new.id,
    signup_role,
    'pending',
    meta->>'full_name',
    meta->>'whatsapp',
    meta->>'organization'
  );

  if signup_role = 'agent' then
    insert into public.agentes (user_id, full_name, agency_name)
    values (
      new.id,
      coalesce(meta->>'full_name', ''),
      coalesce(meta->>'agency_name', meta->>'organization')
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Rows are provisioned by the auth trigger. Direct client inserts are admin-only.
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (private.is_admin());

drop policy if exists agentes_insert_own on public.agentes;
drop policy if exists agentes_insert_admin on public.agentes;
create policy agentes_insert_admin on public.agentes
  for insert to authenticated
  with check (private.is_admin());

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agentes_bio_length'
      and conrelid = 'public.agentes'::regclass
  ) then
    alter table public.agentes
      add constraint agentes_bio_length
      check (bio is null or char_length(bio) <= 800) not valid;
  end if;
end $$;

create or replace function public.guard_agente_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;

  if (to_jsonb(new) - array[
      'full_name', 'agency_name', 'markets', 'instagram',
      'phone', 'contact_email', 'bio'
    ]::text[])
    is distinct from
    (to_jsonb(old) - array[
      'full_name', 'agency_name', 'markets', 'instagram',
      'phone', 'contact_email', 'bio'
    ]::text[])
  then
    raise exception 'agents may only edit their seven profile fields';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_agente_update() from public, anon, authenticated;

create or replace function public.guard_atleta_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;

  if exists (
    select 1 from public.agentes a
    where a.id = old.agent_id
      and a.user_id = (select auth.uid())
      and a.verified_status = 'verified'
      and old.claim_status = 'claimed'
  ) then
    if (to_jsonb(new) - array[
        'apelido', 'dominant_foot', 'height_cm', 'weight_kg',
        'posicao_secundaria', 'youtube_video_url', 'updated_at'
      ]::text[])
      is distinct from
      (to_jsonb(old) - array[
        'apelido', 'dominant_foot', 'height_cm', 'weight_kg',
        'posicao_secundaria', 'youtube_video_url', 'updated_at'
      ]::text[])
    then
      raise exception 'agents may only edit apelido, dominant_foot, height_cm, weight_kg, posicao_secundaria and youtube_video_url';
    end if;
    return new;
  end if;

  raise exception 'not authorized to update this athlete';
end;
$$;

revoke execute on function public.guard_atleta_update() from public, anon, authenticated;

drop policy if exists atletas_update_admin_or_claiming_agent on public.atletas;
create policy atletas_update_admin_or_claiming_agent on public.atletas
  for update
  to authenticated
  using (
    private.is_admin()
    or exists (
      select 1 from public.agentes a
      where a.id = atletas.agent_id
        and a.user_id = (select auth.uid())
        and a.verified_status = 'verified'
        and atletas.claim_status = 'claimed'
    )
  )
  with check (
    private.is_admin()
    or exists (
      select 1 from public.agentes a
      where a.id = atletas.agent_id
        and a.user_id = (select auth.uid())
        and a.verified_status = 'verified'
        and atletas.claim_status = 'claimed'
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'solicitacoes_reason_required'
      and conrelid = 'public.solicitacoes_correcao'::regclass
  ) then
    alter table public.solicitacoes_correcao
      add constraint solicitacoes_reason_required
      check (reason is not null and btrim(reason) <> '') not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'solicitacoes_field_allowed'
      and conrelid = 'public.solicitacoes_correcao'::regclass
  ) then
    alter table public.solicitacoes_correcao
      add constraint solicitacoes_field_allowed
      check (field_name in (
        'bid', 'fifa_id', 'name', 'birth_date', 'nacionalidade',
        'tem_passaporte', 'passaporte', 'main_position', 'inicio_carreira',
        'contract_end_date', 'current_club_id', 'current_category',
        'experiencia_internacional', 'jogos_suspenso', 'performance_data'
      )) not valid;
  end if;
end $$;

create or replace function public.capture_correction_current_value()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atleta public.atletas%rowtype;
begin
  select * into v_atleta from public.atletas where bid = new.bid_atleta;
  if not found then
    raise exception 'athlete not found';
  end if;
  new.current_value := case
    when new.field_name = 'performance_data' then null
    else to_jsonb(v_atleta) ->> new.field_name
  end;
  return new;
end;
$$;

drop trigger if exists trg_capture_correction_current_value on public.solicitacoes_correcao;
create trigger trg_capture_correction_current_value
  before insert on public.solicitacoes_correcao
  for each row execute function public.capture_correction_current_value();

revoke execute on function public.capture_correction_current_value() from public, anon, authenticated;

drop policy if exists solicitacoes_insert_own on public.solicitacoes_correcao;
create policy solicitacoes_insert_own on public.solicitacoes_correcao
  for insert
  to authenticated
  with check (
    requested_by = (select auth.uid())
    and exists (
      select 1
      from public.agentes a
      join public.atletas at on at.agent_id = a.id
      join public.profiles p on p.id = a.user_id
      where a.user_id = (select auth.uid())
        and a.verified_status = 'verified'
        and at.bid = solicitacoes_correcao.bid_atleta
        and at.claim_status = 'claimed'
        and p.role = 'agent'
        and p.account_status = 'approved'
    )
  );

-- Existing indexes cover every ownership/RLS lookup used above:
-- agentes(user_id), atletas(agent_id), profiles(id), solicitacoes(requested_by/bid).

commit;
