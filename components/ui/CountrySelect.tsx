"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { COUNTRIES, COUNTRIES_BY_CONTINENT, CONTINENT_ORDER, findCountry } from "@/lib/countries";

// FOOTBASE Session 57 — searchable, continent-grouped country picker (WS6). Sibling
// to Select.tsx rather than a modification of it (other call-sites depend on its
// exact current behavior) — same visual language and outside-click-close pattern,
// plus a search box since 90+ countries in one flat list isn't browsable otherwise.
export function CountrySelect({
  value,
  onChange,
  placeholder,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const current = findCountry(value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES_BY_CONTINENT;
    const matches = COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dialCode.includes(q) || c.code.toLowerCase().includes(q)
    );
    return matches.reduce((acc, c) => {
      (acc[c.continent] ??= []).push(c);
      return acc;
    }, {} as Record<string, typeof COUNTRIES>);
  }, [query]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-sm border border-border bg-background px-2.5 py-1.5 text-left text-sm outline-none transition-colors hover:border-brand focus:border-brand"
      >
        <span className={cn("truncate", current ? "text-foreground" : "text-muted")}>
          {current ? `${current.name} (${current.dialCode})` : (placeholder ?? "")}
        </span>
        <ChevronDown size={14} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 border border-border bg-surface shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search size={14} className="shrink-0 text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar país..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
          <div className="scroll-brand max-h-72 overflow-y-auto py-1">
            {CONTINENT_ORDER.filter((continent) => filtered[continent]?.length).map((continent) => (
              <div key={continent}>
                <p className="px-3 pt-2 text-xs font-bold uppercase tracking-wide text-muted">{continent}</p>
                {filtered[continent]!.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => {
                      onChange(c.code);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover",
                      c.code === value ? "font-medium text-brand" : "text-foreground"
                    )}
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="shrink-0 text-xs text-muted">{c.dialCode}</span>
                  </button>
                ))}
              </div>
            ))}
            {Object.keys(filtered).length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-muted">Nenhum país encontrado.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
