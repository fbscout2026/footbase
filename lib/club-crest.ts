import { CLUB_CREST_RULES } from "./club-panel-rules.ts";

export type CrestSourceType = "png" | "jpeg" | "webp";

export function detectCrestSourceType(bytes: Uint8Array): CrestSourceType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  return null;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

export function matchesDeclaredCrestType(bytes: Uint8Array, mimeType: string): boolean {
  const sourceType = detectCrestSourceType(bytes);
  return sourceType === "png" && mimeType === "image/png"
    || sourceType === "jpeg" && mimeType === "image/jpeg"
    || sourceType === "webp" && mimeType === "image/webp";
}

export function crestWebpQualityCandidates(): readonly number[] {
  return [82, 74, 66, 58, 50, 42];
}

export function isValidProcessedCrest(input: { width?: number; height?: number; size: number; format?: string }): boolean {
  return input.format === "webp"
    && Boolean(input.width && input.height)
    && input.width! <= CLUB_CREST_RULES.maxDimension
    && input.height! <= CLUB_CREST_RULES.maxDimension
    && input.size > 0
    && input.size <= CLUB_CREST_RULES.maxOutputBytes;
}
