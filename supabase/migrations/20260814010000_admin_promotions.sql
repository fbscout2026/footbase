-- ============================================================================
-- FOOTBASE — Promoção de usuário a admin (self-service, auditável)
-- ----------------------------------------------------------------------------
-- `guard_profile_update` já libera qualquer admin para UPDATE direto em
-- `profiles` (incluindo `role`) — então esta migração não abre um acesso novo,
-- ela ADICIONA disciplina sobre um acesso que já existe: uma trilha de
-- auditoria imutável (quem promoveu, quem, quando, por quê) e as regras de
-- negócio (só promove conta aprovada, nunca já-admin, nunca auto-promoção).
-- Continua deliberadamente SEM operação de rebaixar/remover admin — essa
-- permanece manual (Supabase direto), fora do alcance de qualquer assistente
-- de IA por design.
--
-- ADITIVA/expand-only: nova tabela + nova função. Não altera `profiles`.
-- ============================================================================

create table if not exists admin_promocoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  justificativa text not null check (char_length(justificativa) between 20 and 2000),
  promovido_por uuid not null references profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_promocoes_user on admin_promocoes (user_id);
create index if not exists idx_admin_promocoes_created on admin_promocoes (created_at desc);

alter table admin_promocoes enable row level security;

create policy admin_promocoes_select_admin on admin_promocoes
  for select using (private.is_admin());

-- The ONLY sanctioned way to promote a user to admin. Atomic: validates the
-- target, updates profiles.role, records history. No insert/update/delete RLS
-- policy exists for authenticated/anon — the table is append-only, written
-- exclusively by this SECURITY DEFINER function.
create or replace function admin_promover_para_admin(
  p_user_id uuid,
  p_justificativa text
) returns admin_promocoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_status text;
  v_result admin_promocoes;
begin
  if not (private.is_admin() or auth.role() = 'service_role') then
    raise exception 'only admins may promote a user to admin';
  end if;

  if p_justificativa is null or char_length(trim(p_justificativa)) < 20 or char_length(p_justificativa) > 2000 then
    raise exception 'justificativa must be 20..2000 characters';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'admins cannot promote themselves';
  end if;

  select role, account_status into v_role, v_status from profiles where id = p_user_id for update;
  if not found then raise exception 'user % not found', p_user_id; end if;
  if v_role = 'admin' then raise exception 'user % is already an admin', p_user_id; end if;
  if v_status <> 'approved' then raise exception 'user % must be approved before becoming admin', p_user_id; end if;

  update profiles set role = 'admin' where id = p_user_id;

  insert into admin_promocoes (user_id, justificativa, promovido_por)
  values (p_user_id, p_justificativa, auth.uid())
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function admin_promover_para_admin(uuid, text) from public, anon;
grant execute on function admin_promover_para_admin(uuid, text) to authenticated, service_role;
