-- FOOTBASE Session 57 — country field on signup (WS6). Nullable/additive column,
-- zero scraper impact (profiles is never touched by ingestion). `create or replace`
-- is safe for both functions below — no parameter renamed, only the allowlist array
-- literal / insert column list changes (the FB-ID migration's DROP FUNCTION lesson
-- only applies when a parameter itself is renamed).

alter table profiles add column if not exists country text;

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

  if (to_jsonb(new) - array['full_name', 'whatsapp', 'organization', 'password_reset_used', 'active_session_id', 'country']::text[])
    is distinct from
    (to_jsonb(old) - array['full_name', 'whatsapp', 'organization', 'password_reset_used', 'active_session_id', 'country']::text[])
  then
    raise exception 'users may only edit full_name, whatsapp and organization';
  end if;

  return new;
end;
$$;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  signup_role text := case when meta->>'role' = 'club' then 'club' else 'agent' end;
begin
  insert into profiles (id, role, account_status, full_name, whatsapp, organization, country)
  values (
    new.id, signup_role, 'pending',
    meta->>'full_name', meta->>'whatsapp', meta->>'organization', meta->>'country'
  );
  if signup_role = 'agent' then
    insert into agentes (user_id, full_name, agency_name)
    values (new.id, coalesce(meta->>'full_name', ''), coalesce(meta->>'agency_name', meta->>'organization'));
  end if;
  return new;
end;
$$;

revoke execute on function handle_new_user() from public, anon, authenticated;

-- end of migration
