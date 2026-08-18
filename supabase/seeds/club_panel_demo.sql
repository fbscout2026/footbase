-- ============================================================================
-- FOOTBASE Phase 4.4 — demo club for the `clube.teste@footbase.dev` preview
-- account (auth uid 17b0a608-bed3-4ae1-b712-b4191286b941).
--
-- Contract guarantees:
--   * Creates ONLY a fictional demo club — never links one of the five real
--     clubs, and never reassigns a real athlete (squad stays empty by design).
--   * Idempotent: fixed UUIDs + ON CONFLICT, safe to re-run.
--   * Runs under a service_role JWT context so the club-panel BEFORE triggers
--     accept the rows without a browser auth session (same lane the scraper/
--     ingestion service uses). RLS is bypassed because the SQL editor runs as a
--     superuser; the triggers are what we satisfy here.
--   * No password or secret is stored. Depends on the .dev auth user already
--     existing (created previously via the Admin API).
--
-- Prerequisite: migration 20260812190000_club_management_panel.sql applied.
-- ============================================================================
begin;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

-- 1) The demo club, claimed by the .dev club account.
insert into public.clubes (
  id, name, source_key, state, federacao, reivindicado_por, claim_status,
  display_name, description, headquarters_city, headquarters_state, contact_email
) values (
  'de300000-0000-4000-8000-000000000001',
  'FOOTBASE Demo FC',
  'demo:club-panel-dev',
  'SP', 'FPF',
  '17b0a608-bed3-4ae1-b712-b4191286b941',
  'claimed',
  'FOOTBASE Demo FC',
  'Clube fictício de demonstração do Painel de Gestão do Clube. Não representa uma entidade real.',
  'São Paulo', 'SP',
  'contato@demo.footbase.dev'
)
on conflict (id) do update set
  reivindicado_por  = excluded.reivindicado_por,
  claim_status      = 'claimed',
  display_name      = excluded.display_name,
  description       = excluded.description,
  headquarters_city = excluded.headquarters_city,
  headquarters_state = excluded.headquarters_state,
  contact_email     = excluded.contact_email;

-- 2) Two declared categories (unique on (club_id, category)).
insert into public.club_categorias (
  id, club_id, category, status, display_order, source_status, declared_by
) values
  ('de300000-0000-4000-8000-000000000011', 'de300000-0000-4000-8000-000000000001', 'SUB-17', 'active', 1, 'club_declared', '17b0a608-bed3-4ae1-b712-b4191286b941'),
  ('de300000-0000-4000-8000-000000000012', 'de300000-0000-4000-8000-000000000001', 'SUB-20', 'active', 2, 'club_declared', '17b0a608-bed3-4ae1-b712-b4191286b941')
on conflict (club_id, category) do nothing;

-- 3) One declared tournament under the SUB-17 category.
insert into public.club_categoria_torneios (
  id, club_category_id, declared_name, season, status, source_status, declared_by
) values (
  'de300000-0000-4000-8000-000000000021',
  'de300000-0000-4000-8000-000000000011',
  'Copa Demonstração Sub-17', '2026', 'in_progress', 'club_declared',
  '17b0a608-bed3-4ae1-b712-b4191286b941'
)
on conflict (id) do nothing;

-- Sanity: the demo club must be claimed by exactly the .dev account.
do $$ begin
  if not exists (
    select 1 from public.clubes
    where id = 'de300000-0000-4000-8000-000000000001'
      and reivindicado_por = '17b0a608-bed3-4ae1-b712-b4191286b941'
      and claim_status = 'claimed'
  ) then
    raise exception 'DEMO SEED FAILED: demo club not claimed by the .dev account';
  end if;
end $$;

select 'club_panel_demo_seeded' as result;
commit;
