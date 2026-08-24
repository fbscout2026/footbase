-- FOOTBASE Session 57 — rejection reason + self-service "Solicitar Revisão" (WS7).
-- `rejection_reason` is admin-authored only (never in guard_profile_update()'s
-- self-service allowlist) — same 20-2000-char convention already used by
-- admin_promocoes.justificativa / club_correction_requests.reason. The only door
-- back to 'pending' from 'rejected' is the narrow RPC below, mirroring
-- admin_promover_para_admin's shape — guard_profile_update() never lets a
-- self-service user touch account_status directly at all.

alter table profiles add column if not exists rejection_reason text
  check (rejection_reason is null or char_length(btrim(rejection_reason)) between 20 and 2000);

create or replace function solicitar_revisao_conta()
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_result profiles;
begin
  select account_status into v_status from profiles where id = auth.uid() for update;
  if not found then
    raise exception 'profile not found';
  end if;
  if v_status <> 'rejected' then
    raise exception 'only a rejected account may request review';
  end if;

  update profiles
    set account_status = 'pending', rejection_reason = null
    where id = auth.uid()
    returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function solicitar_revisao_conta() from public, anon;
grant execute on function solicitar_revisao_conta() to authenticated;

-- end of migration
