-- FOOTBASE Session 57 (WS7 second hotfix) — real bug found live via
-- supabase/tests/solicitar_revisao_security.sql, step 3: `set_config(..., true)`
-- (is_local=true) only resets the GUC at COMMIT/ROLLBACK, not after the single
-- statement that needed it — so `footbase.bypass_guard` stayed 'true' for the rest
-- of the *whole transaction* after solicitar_revisao_conta() ran, meaning any other
-- UPDATE issued in the same transaction (however that could happen) would also
-- bypass guard_profile_update()'s allowlist. Fix: reset the flag to 'false'
-- immediately after the one UPDATE that needed it, instead of relying on the
-- transaction boundary to clear it.

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

  perform set_config('footbase.bypass_guard', 'true', true);

  update profiles
    set account_status = 'pending', rejection_reason = null
    where id = auth.uid()
    returning * into v_result;

  perform set_config('footbase.bypass_guard', 'false', true);

  return v_result;
end;
$$;

-- end of migration
