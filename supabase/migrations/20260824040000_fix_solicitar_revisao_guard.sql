-- FOOTBASE Session 57 (WS7 hotfix) — real bug found live via
-- supabase/tests/solicitar_revisao_security.sql, before this fix ever shipped to a
-- real user: solicitar_revisao_conta() runs as the caller's own JWT identity (a
-- 'rejected' agent/club, never admin), so its internal
-- `update profiles set account_status='pending', rejection_reason=null` was always
-- blocked by guard_profile_update()'s allowlist (is_admin()/service_role only) —
-- the RPC could never actually succeed for any real user. Fix: a transaction-local
-- bypass flag (`footbase.bypass_guard`), set only inside this RPC right before its
-- own already-validated UPDATE (caller's row already confirmed 'rejected' above).
-- Not reachable from the client: set_config()/current_setting() live in pg_catalog,
-- outside the schema PostgREST exposes as callable RPCs, so only a trusted
-- SECURITY DEFINER function on the server side can set it.

create or replace function guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.is_admin() or auth.role() = 'service_role' or current_setting('footbase.bypass_guard', true) = 'true' then
    return new;
  end if;

  if old.password_reset_used is distinct from new.password_reset_used then
    if old.password_reset_used = true or new.password_reset_used <> true then
      raise exception 'password_reset_used can only move from false to true';
    end if;
  end if;

  if (to_jsonb(new) - array['full_name', 'whatsapp', 'organization', 'password_reset_used', 'active_session_id', 'country']::text[])
    is distinct from
    (to_jsonb(old) - array['full_name', 'whatsapp', 'organization', 'password_reset_used', 'active_session_id', 'country']::text[])
  then
    raise exception 'users may only edit full_name, whatsapp and organization';
  end if;

  return new;
end;
$$;

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

  return v_result;
end;
$$;

-- end of migration
