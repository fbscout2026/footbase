-- ============================================================================
-- FOOTBASE — Fase 5.7: transferência administrativa de representação
-- ----------------------------------------------------------------------------
-- Troca do agente de um atleta já representado é uma operação administrativa
-- DEDICADA e AUDITÁVEL: agente anterior/novo, justificativa, comprovante,
-- administrador e data ficam num histórico IMUTÁVEL. Nunca um UPDATE solto de
-- `agent_id`, nunca apaga o pedido de reivindicação anterior.
--
-- ADITIVA/expand-only: nova tabela + nova função. Não altera `atletas` nem
-- `solicitacoes_reivindicacao`. Consumidores atuais (dossiê, painel do agente,
-- claim flow) não são afetados — apenas ganham este novo caminho administrativo.
-- ============================================================================

create table if not exists representacao_transferencias (
  id uuid primary key default gen_random_uuid(),
  bid_atleta bigint not null references atletas (bid) on delete cascade,
  agente_anterior_id uuid references agentes (id) on delete set null,
  agente_novo_id uuid not null references agentes (id) on delete restrict,
  justificativa text not null check (char_length(justificativa) between 20 and 2000),
  comprovante_url text not null check (comprovante_url ~ '^https?://'),
  admin_id uuid not null references profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_representacao_transferencias_bid on representacao_transferencias (bid_atleta);
create index if not exists idx_representacao_transferencias_created on representacao_transferencias (created_at desc);

-- RLS: admin-only read. NO insert/update/delete policy for authenticated/anon —
-- the table is append-only, written exclusively by the SECURITY DEFINER RPC below
-- (which runs as the migration owner and so is not subject to these policies,
-- the same mechanism already used by prepare_athlete_claim_insert/guard_atleta_update).
alter table representacao_transferencias enable row level security;

create policy representacao_transferencias_select_admin on representacao_transferencias
  for select using (private.is_admin());

-- ----------------------------------------------------------------------------
-- admin_transferir_representacao — the ONLY sanctioned way to change agent_id
-- on an already-represented athlete. Atomic: validates the new agent, updates
-- atletas, and records history in the same transaction.
-- ----------------------------------------------------------------------------
create or replace function admin_transferir_representacao(
  p_bid bigint,
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
  from atletas where bid = p_bid for update;
  if not found then raise exception 'athlete % not found', p_bid; end if;
  if v_status <> 'claimed' or v_anterior is null then
    raise exception 'athlete % has no current agent to transfer representation from', p_bid;
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

  update atletas set agent_id = p_novo_agente_id, claim_status = 'claimed' where bid = p_bid;

  insert into representacao_transferencias
    (bid_atleta, agente_anterior_id, agente_novo_id, justificativa, comprovante_url, admin_id)
  values
    (p_bid, v_anterior, p_novo_agente_id, p_justificativa, p_comprovante_url, auth.uid())
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function admin_transferir_representacao(bigint, uuid, text, text) from public, anon;
grant execute on function admin_transferir_representacao(bigint, uuid, text, text) to authenticated, service_role;
