"use client";

import { Info } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import { getEvolucao } from "@/lib/atleta-extra";
import type { MockAtleta } from "@/lib/mock-data";

// Dependency-free inline SVG line chart of the performance index per round.
export function EvolutionChart({ atleta }: { atleta: MockAtleta }) {
  const { t } = useT();
  const data = getEvolucao(atleta);
  const W = 340;
  const H = 130;
  const pad = 22;
  const n = data.length;
  const pts = data.map((d, i) => ({
    x: pad + (i * (W - 2 * pad)) / (n - 1),
    y: H - pad - (d.value / 100) * (H - 2 * pad),
    value: d.value,
    label: d.label,
  }));
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const first = pts[0];
  const last = pts[n - 1];
  const area =
    first && last
      ? `M${first.x.toFixed(1)},${(H - pad).toFixed(1)} L${line.split(" ").join(" L")} L${last.x.toFixed(1)},${(H - pad).toFixed(1)} Z`
      : "";

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t("dossie.evolution.title")}>
      {/* gridlines */}
      {[0, 25, 50, 75, 100].map((g) => {
        const y = H - pad - (g / 100) * (H - 2 * pad);
        return <line key={g} x1={pad} y1={y} x2={W - pad} y2={y} stroke="rgb(var(--border))" strokeWidth="1" />;
      })}
      {/* area + line */}
      <path d={area} fill="rgb(var(--brand) / 0.12)" />
      <polyline points={line} fill="none" stroke="rgb(var(--brand))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* dots + values */}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3.5" fill="rgb(var(--brand))" />
          <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="10" fill="rgb(var(--fg))" fontWeight="600">
            {p.value}
          </text>
          <text x={p.x} y={H - 6} textAnchor="middle" fontSize="9" fill="rgb(var(--muted))">
            {p.label}
          </text>
        </g>
      ))}
      </svg>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          <span className="mr-1 rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
            {t("dossie.evolution.preview")}
          </span>
          {t("dossie.evolution.info")}
        </span>
      </p>
    </div>
  );
}
