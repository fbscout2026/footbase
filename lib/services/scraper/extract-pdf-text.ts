
// FOOTBASE Phase 6.2 — PDF → text (free, no OCR).
//
// The official CBF súmula is a STATIC PDF with a real text layer served from the
// CDN (`conteudo.cbf.com.br/sumulas/{ano}/{código}se.pdf`), so plain `fetch` +
// `pdf-parse` extract its text with no paid service and no OCR. The extracted text
// feeds `parseCbfSumula` (pure). The PDF bytes are discarded after extraction —
// only `partidas_sumula.source_url` is persisted, so disk never grows.
//
// Server-only + dynamic import: `pdf-parse` is CommonJS and must never reach the
// client bundle.

/** Extract the plain-text layer from PDF bytes. */
export async function extractPdfText(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const { default: pdfParse } = await import("pdf-parse");
  const buffer = Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);
  const parsed = await pdfParse(buffer);
  return parsed.text;
}

/** Fetch a súmula PDF by URL and return its text layer. Bytes are not persisted. */
export async function fetchSumulaText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": "FOOTBASE-ingestion/6.2 (+https://footbase.dev)" },
  });
  if (!res.ok) throw new Error(`súmula fetch failed: ${res.status} ${res.statusText} for ${url}`);
  const bytes = await res.arrayBuffer();
  return extractPdfText(bytes);
}
