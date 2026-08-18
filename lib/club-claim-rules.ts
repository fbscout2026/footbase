export type ClaimStatus = "unclaimed" | "pending" | "claimed";
export type SessionRole = "agent" | "club" | "admin";

export interface ClubDirectoryFilterState {
  query: string;
  state: string;
  federation: string;
  claimStatus: "" | ClaimStatus;
}

export interface ClubDirectoryItem {
  name: string;
  state: string | null;
  federation: string | null;
  claimStatus: ClaimStatus;
}

export type ClubClaimViewState =
  | "eligible"
  | "agent-view"
  | "admin-view"
  | "own-pending"
  | "other-pending"
  | "own-claimed"
  | "other-claimed"
  | "account-busy";

export function normalizeClaimDocumentUrl(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("document-required");
  if (normalized.length > 1000) throw new Error("document-too-long");
  const parsed = new URL(normalized);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("invalid-document-url");
  return parsed.toString();
}

export function normalizeClaimMessage(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 20) throw new Error("message-too-short");
  if (normalized.length > 2000) throw new Error("message-too-long");
  return normalized;
}

export function resolveClubClaimViewState(input: {
  role: SessionRole;
  userId: string;
  claimStatus: ClaimStatus;
  claimedBy: string | null;
  ownPendingRequest: boolean;
  accountHasPendingOrClaimedClub: boolean;
}): ClubClaimViewState {
  if (input.role === "admin") return "admin-view";
  if (input.claimStatus === "claimed") {
    return input.claimedBy === input.userId ? "own-claimed" : "other-claimed";
  }
  if (input.claimStatus === "pending") {
    return input.ownPendingRequest ? "own-pending" : "other-pending";
  }
  if (input.role === "agent") return "agent-view";
  if (input.accountHasPendingOrClaimedClub) return "account-busy";
  return "eligible";
}

export function filterClubs<T extends ClubDirectoryItem>(clubs: T[], filters: ClubDirectoryFilterState): T[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return clubs.filter((club) => {
    if (query && !club.name.toLocaleLowerCase().includes(query)) return false;
    if (filters.state && club.state !== filters.state) return false;
    if (filters.federation && club.federation !== filters.federation) return false;
    if (filters.claimStatus && club.claimStatus !== filters.claimStatus) return false;
    return true;
  });
}
