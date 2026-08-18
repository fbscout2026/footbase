import { redirect } from "next/navigation";
import { ClubManagementPanel, ClubPanelUnavailable } from "@/components/clube/ClubManagementPanel";
import { getSessionProfile } from "@/lib/auth/session";
import { resolveClubPanelAccess } from "@/lib/club-panel-rules";
import { createClient } from "@/lib/supabase/server";
import { findClaimedClubId, listManagedClubs, loadClubPanel } from "@/lib/services/club-panel";

export default async function ClubManagementPage({ searchParams }: { searchParams: Promise<{ club?: string }> }) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.role === "agent") redirect("/dashboard");

  const client = await createClient();
  const query = await searchParams;
  const managedClubs = session.role === "admin" ? await listManagedClubs(client) : [];
  const claimedClubId = session.role === "club" ? await findClaimedClubId(client, session.userId) : null;
  const targetClubId = session.role === "admin" ? query.club ?? managedClubs[0]?.id ?? null : claimedClubId;
  const access = resolveClubPanelAccess({ role: session.role, accountStatus: session.accountStatus, claimedClubId, targetClubId, targetExists: targetClubId ? (session.role !== "admin" || managedClubs.some((club) => club.id === targetClubId)) : false });

  if (!targetClubId || access === "unclaimed" || access === "unavailable") {
    return <ClubPanelUnavailable access={access} clubs={managedClubs} />;
  }

  try {
    const data = await loadClubPanel(client, targetClubId, access);
    return <ClubManagementPanel key={targetClubId} initialData={data} managedClubs={managedClubs} readOnly={access === "admin-readonly"} />;
  } catch {
    return <ClubPanelUnavailable access="unavailable" clubs={managedClubs} loadFailed />;
  }
}
