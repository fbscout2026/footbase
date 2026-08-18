"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string; // optional right-aligned short label (e.g. "PT")
}

// Custom dropdown matching the language selector look (dark green surface,
// brand-green active item) — replaces native <select> for consistent styling.
export function Select({
  value,
  onChange,
  options,
  placeholder,
  className,
  ariaLabel,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-sm border border-border bg-background px-2.5 py-1.5 text-left text-sm outline-none transition-colors hover:border-brand focus:border-brand disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={cn("truncate", current ? "text-foreground" : "text-muted")}>
          {current?.label ?? placeholder ?? ""}
        </span>
        <ChevronDown
          size={14}
          className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="scroll-brand absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-sm border border-border bg-surface py-1 shadow-xl">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover",
                o.value === value ? "font-medium text-brand" : "text-foreground"
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.hint && <span className="shrink-0 text-xs text-muted">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
