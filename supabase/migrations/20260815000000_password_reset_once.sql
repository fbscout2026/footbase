-- Self-service "forgot password" limited to exactly one successful use per account.
-- Request-side (auth.resetPasswordForEmail) already exists in Supabase Auth and needs
-- no schema change. This migration only adds the one-time gate that the completion page
-- checks/claims *after* the user actually sets a new password (never at request time,
-- so a bad/expired email attempt never burns the one use).
--
-- `password_reset_used` is otherwise governed by the same allowlist trigger
-- (guard_profile_update) that already restricts non-admin users to
-- full_name/whatsapp/organization; this migration extends it with a narrow,
-- one-directional exception (false -> true only) instead of a new RPC, so a user can
-- never revert their own flag back to false client-side.

alter table profiles add column if not exists password_reset_used boolean not null default false;

create or replace function guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;

  if old.password_reset_used is distinct from new.password_reset_used then
    if old.password_reset_used = true or new.password_reset_used <> true then
      raise exception 'password_reset_used can only move from false to true';
    end if;
  end if;

  if (to_jsonb(new) - array['full_name', 'whatsapp', 'organization', 'password_reset_used']::text[])
    is distinct from
    (to_jsonb(old) - array['full_name', 'whatsapp', 'organization', 'password_reset_used']::text[])
  then
    raise exception 'users may only edit full_name, whatsapp and organization';
  end if;

  return new;
end;
$$;
