export type ClubPanelAccess = "owner" | "admin-readonly" | "unclaimed" | "forbidden" | "unavailable";
export type ClubPanelRole = "agent" | "club" | "admin";
export type RosterRequestAction = "add" | "remove" | "change_category" | "register_missing_bid";
export type TournamentStatus = "registered" | "in_progress" | "finished" | "withdrawn";

export function resolveClubPanelAccess(input: {
  role: ClubPanelRole;
  accountStatus: "pending" | "approved" | "rejected";
  claimedClubId: string | null;
  targetClubId?: string | null;
  targetExists?: boolean;
}): ClubPanelAccess {
  if (input.accountStatus !== "approved") return "unavailable";
  if (input.role === "agent") return "forbidden";
  if (input.role === "admin") return input.targetClubId && input.targetExists !== false ? "admin-readonly" : "unavailable";
  return input.claimedClubId ? "owner" : "unclaimed";
}

export function normalizeOptionalText(value: string, maxLength: number): string | null {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new Error("too-long");
  return normalized;
}

export function normalizeRequiredText(value: string, minLength: number, maxLength: number): string {
  const normalized = normalizeOptionalText(value, maxLength);
  if (!normalized || normalized.length < minLength) throw new Error("invalid-length");
  return normalized;
}

export function normalizeHttpUrl(value: string, maxLength = 500): string | null {
  const normalized = normalizeOptionalText(value, maxLength);
  if (!normalized) return null;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("invalid-url");
  }
  if (!(["http:", "https:"] as string[]).includes(parsed.protocol)) throw new Error("invalid-url");
  return parsed.toString();
}

export function normalizeEmail(value: string): string | null {
  const normalized = normalizeOptionalText(value, 254)?.toLowerCase() ?? null;
  if (!normalized) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("invalid-email");
  return normalized;
}

export function normalizeState(value: string): string | null {
  const normalized = normalizeOptionalText(value, 2)?.toUpperCase() ?? null;
  if (normalized && !/^[A-Z]{2}$/.test(normalized)) throw new Error("invalid-state");
  return normalized;
}

export function normalizePhone(value: string): string | null {
  const normalized = normalizeOptionalText(value, 40);
  if (!normalized) return null;
  if (!/^[+()\-\s.\d]{8,40}$/.test(normalized)) throw new Error("invalid-phone");
  return normalized;
}

export function validateTournamentDates(startDate: string | null, endDate: string | null): void {
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error("invalid-date");
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error("invalid-date");
  if (startDate && endDate && endDate < startDate) throw new Error("invalid-date-range");
}

export function normalizeRosterRequest(input: {
  action: RosterRequestAction;
  bid?: string | number | null;
  informedBid?: string | null;
  informedName?: string | null;
  proposedCategory?: string | null;
  justification: string;
  evidenceUrl?: string | null;
}) {
  const bid = input.bid === null || input.bid === undefined || input.bid === "" ? null : Number(input.bid);
  if (bid !== null && (!Number.isSafeInteger(bid) || bid <= 0)) throw new Error("invalid-bid");
  const informedBid = normalizeOptionalText(input.informedBid ?? "", 40);
  const informedName = normalizeOptionalText(input.informedName ?? "", 160);
  const proposedCategory = normalizeOptionalText(input.proposedCategory ?? "", 80);
  const justification = normalizeRequiredText(input.justification, 20, 2000);
  const evidenceUrl = normalizeHttpUrl(input.evidenceUrl ?? "", 1000);

  if (input.action === "register_missing_bid") {
    if (bid !== null || !informedBid || !informedName || !proposedCategory) throw new Error("invalid-missing-bid-request");
  } else if (bid === null) {
    throw new Error("bid-required");
  }
  if ((input.action === "add" || input.action === "change_category") && !proposedCategory) throw new Error("category-required");
  if (input.action === "remove" && proposedCategory) throw new Error("unexpected-category");

  return { action: input.action, bid, informedBid, informedName, proposedCategory, justification, evidenceUrl };
}

export const CLUB_CREST_RULES = {
  acceptedMimeTypes: ["image/png", "image/jpeg", "image/webp"] as const,
  maxInputBytes: 5 * 1024 * 1024,
  maxOutputBytes: 50 * 1024,
  maxDimension: 120,
};

export function validateCrestInput(input: { mimeType: string; size: number }): void {
  if (!(CLUB_CREST_RULES.acceptedMimeTypes as readonly string[]).includes(input.mimeType)) throw new Error("invalid-image-type");
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > CLUB_CREST_RULES.maxInputBytes) throw new Error("invalid-image-size");
}
