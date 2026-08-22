-- Security fix (Supabase Security Advisor, live finding): recompute_atleta_stats(bigint)
-- was the only SECURITY DEFINER function in the schema with no explicit revoke, so
-- Postgres' default grant left it executable by PUBLIC — including the anon key,
-- unauthenticated. It bypasses RLS on `atletas` (SECURITY DEFINER) to write
-- precomputed stat columns for any fb_id.
--
-- Impact was limited (it only recomputes deterministically from existing
-- atuacoes_sumula/partidas_sumula rows, no arbitrary value injection), but it's an
-- unauthenticated RLS-bypassing write path that should never have been open. Every
-- other SECURITY DEFINER function in the schema already revokes from
-- public/anon/authenticated; this brings this one in line.
--
-- Confirmed the only real callers are lib/services/scraper/ingest.ts and
-- lib/services/scraper/merge-atleta-core.ts, both called with the service_role
-- client from the ingestion pipeline — never from browser/anon code (grepped
-- app/ and components/, zero references). Restricting to service_role only is
-- safe and changes no legitimate behavior.

revoke execute on function recompute_atleta_stats(bigint) from public, anon, authenticated;
grant execute on function recompute_atleta_stats(bigint) to service_role;
