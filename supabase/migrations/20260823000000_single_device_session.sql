-- FOOTBASE Session 57 — single active device per account. `profiles.active_session_id`
-- is a random UUID claimed on every real login (LoginForm) or password-reset completion;
-- `middleware.ts` compares it against a first-party cookie on every request and forces a
-- sign-out when they diverge (a newer device claimed the slot). Nullable/additive column,
-- zero scraper impact — `profiles` is never touched by ingestion, and this isn't
-- `role`/`account_status`, the only two columns the scraper is explicitly barred from.
-- No backfill: existing rows stay NULL until their next real login, so this never mass
-- logs-out the current userbase at deploy time (middleware only enforces when the DB
-- value is non-null).

alter table profiles add column if not exists active_session_id uuid;

-- `create or replace` is safe here — no parameter renamed, only the allowlist array
-- literal inside the body changes (the FB-ID migration's `DROP FUNCTION` lesson only
-- applies when a parameter itself is renamed).
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

  if (to_jsonb(new) - array['full_name', 'whatsapp', 'organization', 'password_reset_used', 'active_session_id']::text[])
    is distinct from
    (to_jsonb(old) - array['full_name', 'whatsapp', 'organization', 'password_reset_used', 'active_session_id']::text[])
  then
    raise exception 'users may only edit full_name, whatsapp and organization';
  end if;

  return new;
end;
$$;

-- end of migration
