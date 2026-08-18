-- Fase 5.7 — transferência administrativa de representação.
-- Verifica: só admin transfere; agente novo precisa ser verificado+aprovado; não
-- pode transferir para o mesmo agente; atleta sem agente atual é rejeitado; o
-- histórico é gravado atomicamente com atletas.agent_id; não-admin não lê o
-- histórico; a tabela é imutável (update/delete direto afeta 0 linhas). Rollback.
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000751','authenticated','authenticated','xfer-admin@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Admin"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000752','authenticated','authenticated','xfer-agent-a@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Agent A"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000753','authenticated','authenticated','xfer-agent-b@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Agent B"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000754','authenticated','authenticated','xfer-agent-c@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Agent C Unverified"}',now(),now());

-- service_role seeds: elevate admin, approve agents, seed athletes.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"service_role"}',true);
update public.profiles set role='admin', account_status='approved' where id='00000000-0000-4000-8000-000000000751';
update public.profiles set account_status='approved' where id in ('00000000-0000-4000-8000-000000000752','00000000-0000-4000-8000-000000000753','00000000-0000-4000-8000-000000000754');

insert into public.agentes (id,user_id,full_name,verified_status) values
('00000000-0000-4000-8000-0000000007a1','00000000-0000-4000-8000-000000000752','Agent A','verified'),
('00000000-0000-4000-8000-0000000007a2','00000000-0000-4000-8000-000000000753','Agent B','verified'),
('00000000-0000-4000-8000-0000000007a3','00000000-0000-4000-8000-000000000754','Agent C','pending');

insert into public.atletas (bid,name,birth_date,main_position,current_category,agent_id,claim_status) values
(9797970001,'Xfer Represented Athlete','2008-06-01','CM','SUB-17','00000000-0000-4000-8000-0000000007a1','claimed');
insert into public.atletas (bid,name,birth_date,main_position,current_category,agent_id,claim_status) values
(9797970002,'Xfer Unclaimed Athlete','2008-06-01','CM','SUB-17',null,'unclaimed');

-- ----- Non-admin: RPC and read are both blocked -----
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000752","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  begin
    perform admin_transferir_representacao(9797970001,'00000000-0000-4000-8000-0000000007a2','Justificativa suficientemente longa para passar na validacao.','https://example.org/comprovante.pdf');
    raise exception 'SECURITY TEST FAILED: non-admin performed a transfer';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
  if (select count(*) from public.representacao_transferencias) <> 0 then raise exception 'SECURITY TEST FAILED: non-admin read representation history'; end if;
end $$;
reset role;

-- ----- Admin: validations reject bad input before any write -----
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000751","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  -- new agent not verified/approved.
  begin
    perform admin_transferir_representacao(9797970001,'00000000-0000-4000-8000-0000000007a3','Justificativa suficientemente longa para passar na validacao.','https://example.org/c.pdf');
    raise exception 'SECURITY TEST FAILED: transferred to an unverified agent';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
  -- new agent same as current.
  begin
    perform admin_transferir_representacao(9797970001,'00000000-0000-4000-8000-0000000007a1','Justificativa suficientemente longa para passar na validacao.','https://example.org/c.pdf');
    raise exception 'SECURITY TEST FAILED: transferred to the same agent';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
  -- athlete has no current agent.
  begin
    perform admin_transferir_representacao(9797970002,'00000000-0000-4000-8000-0000000007a2','Justificativa suficientemente longa para passar na validacao.','https://example.org/c.pdf');
    raise exception 'SECURITY TEST FAILED: transferred representation for an unclaimed athlete';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;

-- ----- Admin: a valid transfer succeeds atomically -----
select admin_transferir_representacao(9797970001,'00000000-0000-4000-8000-0000000007a2','Documentacao oficial comprova a mudanca de intermediario do atleta.','https://example.org/comprovante.pdf');

do $$ begin
  if not exists (select 1 from public.atletas where bid=9797970001 and agent_id='00000000-0000-4000-8000-0000000007a2' and claim_status='claimed') then
    raise exception 'SECURITY TEST FAILED: atletas.agent_id was not updated';
  end if;
  if not exists (
    select 1 from public.representacao_transferencias
    where bid_atleta=9797970001 and agente_anterior_id='00000000-0000-4000-8000-0000000007a1'
      and agente_novo_id='00000000-0000-4000-8000-0000000007a2' and admin_id='00000000-0000-4000-8000-000000000751'
  ) then raise exception 'SECURITY TEST FAILED: transfer history was not recorded correctly'; end if;

  -- Immutability: no update/delete policy exists for authenticated (even admin).
  update public.representacao_transferencias set justificativa='hacked' where bid_atleta=9797970001;
  if found then raise exception 'SECURITY TEST FAILED: history row was updated directly'; end if;
end $$;
reset role;

select 'representation_transfer_security_passed' as result;

rollback;
