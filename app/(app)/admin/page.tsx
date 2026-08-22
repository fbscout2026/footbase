import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { getSessionProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadUsers, loadUserEmails, type AdminUser } from "@/lib/services/admin-users";
import { loadClaims, type AdminClaim } from "@/lib/services/admin-claims";
import { loadCorrections, type AdminCorrection } from "@/lib/services/admin-corrections";
import { loadScrapingLogs, type ScrapingLog } from "@/lib/services/admin-ingestion";
import {
  loadRepresentedAthletes, loadEligibleAgents, loadTransferHistory, loadAgentNames,
  type RepresentedAthlete, type EligibleAgent, type TransferRecord,
} from "@/lib/services/admin-representation";
import { loadFederationHierarchy, type FederationHierarchy } from "@/lib/services/admin-federations";
import { loadPromotionHistory, type PromotionRecord } from "@/lib/services/admin-promotions";
import { loadDuplicateCandidates, type AdminDuplicateCandidate } from "@/lib/services/admin-athlete-duplicates";

// Phase 5.1 guard + layout; 5.2–5.6 load users/claims/corrections/ingestion (admin
// reads all via RLS). Phase 5.7 adds the representation-transfer module.
//
// Perf note (Session 34): every module's data fetch runs in ONE Promise.allSettled
// round — not one `try{await Promise.all([...])}catch` block per module. Sequential
// isolation blocks were correct (a missing migration in one module never nulled the
// others) but each block was its own network round-trip, so 4 modules meant 4
// sequential round-trips. Isolation is preserved here by checking each settled
// promise's own status when composing each module's props — a failure in
// `federations` still can't null out `users`.
export default async function AdminPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  const client = await createClient();

  const [
    profilesR, emailsR, claimsR, correctionsR, logsR,
    athletesR, agentsR, transferR, agentNamesR,
    federationsR, promotionsR, duplicatesR,
  ] = await Promise.allSettled([
    loadUsers(client),
    loadUserEmails(createAdminClient()),
    loadClaims(client),
    loadCorrections(client),
    loadScrapingLogs(client),
    loadRepresentedAthletes(client),
    loadEligibleAgents(client),
    loadTransferHistory(client),
    loadAgentNames(client),
    loadFederationHierarchy(client),
    loadPromotionHistory(client),
    loadDuplicateCandidates(client),
  ]);

  let users: AdminUser[] | null = null;
  let byId = new Map<string, AdminUser>();
  if (profilesR.status === "fulfilled" && emailsR.status === "fulfilled") {
    users = profilesR.value.map((u) => ({ ...u, email: emailsR.value[u.userId] ?? null }));
    byId = new Map(users.map((u) => [u.userId, u]));
  }

  const claims: AdminClaim[] | null =
    claimsR.status === "fulfilled" && users
      ? claimsR.value.map((c) => {
          const r = byId.get(c.requestedBy);
          return { ...c, requesterName: r?.fullName ?? null, requesterOrg: r?.organization ?? null, requesterEmail: r?.email ?? null };
        })
      : null;

  const corrections: AdminCorrection[] | null = correctionsR.status === "fulfilled" ? correctionsR.value : null;
  const logs: ScrapingLog[] | null = logsR.status === "fulfilled" ? logsR.value : null;

  const representedAthletes: RepresentedAthlete[] | null = athletesR.status === "fulfilled" ? athletesR.value : null;
  const eligibleAgents: EligibleAgent[] | null = agentsR.status === "fulfilled" ? agentsR.value : null;

  let transferHistory: TransferRecord[] | null = null;
  if (transferR.status === "fulfilled" && agentNamesR.status === "fulfilled" && athletesR.status === "fulfilled") {
    const athleteNameByBid = new Map(athletesR.value.map((a) => [a.fbId, a.name]));
    const agentNames = agentNamesR.value;
    transferHistory = transferR.value.map((h) => ({
      ...h,
      athleteName: athleteNameByBid.get(h.fbIdAtleta) ?? null,
      agenteAnteriorName: h.agenteAnteriorId ? (agentNames[h.agenteAnteriorId] ?? null) : null,
      agenteNovoName: agentNames[h.agenteNovoId] ?? null,
      adminName: byId.get(h.adminId)?.fullName ?? null,
    }));
  }

  const federations: FederationHierarchy | null = federationsR.status === "fulfilled" ? federationsR.value : null;

  const promotionHistory: PromotionRecord[] | null =
    promotionsR.status === "fulfilled"
      ? promotionsR.value.map((p) => ({
          ...p,
          userName: byId.get(p.userId)?.fullName ?? null,
          promovidoPorName: byId.get(p.promovidoPor)?.fullName ?? null,
        }))
      : null;

  const duplicateCandidates: AdminDuplicateCandidate[] | null = duplicatesR.status === "fulfilled" ? duplicatesR.value : null;

  return <AdminPanel users={users} claims={claims} corrections={corrections} logs={logs} representedAthletes={representedAthletes} eligibleAgents={eligibleAgents} transferHistory={transferHistory} federations={federations} promotionHistory={promotionHistory} duplicateCandidates={duplicateCandidates} />;
}
