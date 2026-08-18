export type SessionRole = "agent" | "club" | "admin";

// Same evidence contract used by club claims; kept dependency-free so the
// rules can run directly in Node and in the browser bundle.
export function normalizeClaimDocumentUrl(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("document-required");
  if (normalized.length > 1000) throw new Error("document-too-long");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("invalid-document-url");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid-document-url");
  return parsed.toString();
}

export function normalizeClaimMessage(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 20) throw new Error("message-too-short");
  if (normalized.length > 2000) throw new Error("message-too-long");
  return normalized;
}

export type AthleteClaimStatus = "unclaimed" | "pending" | "claimed";
export type AthleteClaimViewState =
  | "eligible"
  | "own-pending"
  | "other-pending"
  | "own-claimed"
  | "other-claimed"
  | "rejected"
  | "unverified-agent"
  | "club-view"
  | "admin-view";

export function resolveAthleteClaimViewState(input: {
  role: SessionRole;
  claimStatus: AthleteClaimStatus;
  athleteAgentId: string | null;
  ownAgentId: string | null;
  ownAgentVerified: boolean;
  ownLatestRequestStatus: "pending" | "approved" | "rejected" | null;
}): AthleteClaimViewState {
  if (input.role === "admin") return "admin-view";
  if (input.role === "club") return "club-view";
  if (input.claimStatus === "claimed") {
    return input.athleteAgentId !== null && input.athleteAgentId === input.ownAgentId
      ? "own-claimed"
      : "other-claimed";
  }
  if (input.claimStatus === "pending") {
    return input.ownLatestRequestStatus === "pending" ? "own-pending" : "other-pending";
  }
  if (!input.ownAgentVerified) return "unverified-agent";
  if (input.ownLatestRequestStatus === "rejected") return "rejected";
  return "eligible";
}
