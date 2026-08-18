"use client";

import { Languages } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useT } from "@/lib/i18n/I18nProvider";
import { locales, localeNames, localeShort } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/cn";

export function LanguageToggle() {
  const { locale, setLocale, t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t("lang.label")}
        className="header-control flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-sm font-semibold transition-colors"
      >
        <Languages size={16} />
        {localeShort[locale]}
      </button>

      {open && (
        <div className="header-menu absolute right-0 z-50 mt-1 w-40 overflow-hidden rounded-sm border py-1 shadow-xl">
          {locales.map((l) => (
            <button
              key={l}
              onClick={() => {
                setLocale(l);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-surface-hover",
                l === locale ? "text-brand" : "text-white"
              )}
            >
              {localeNames[l]}
              <span className="text-xs text-muted">{localeShort[l]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
