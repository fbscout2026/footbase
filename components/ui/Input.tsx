"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ComponentPropsWithoutRef } from "react";

export function Input({
  label,
  id,
  className,
  type,
  ...props
}: { label: string } & ComponentPropsWithoutRef<"input">) {
  // A show/hide toggle on every password field (login, cadastro, redefinir senha —
  // any form built on this shared Input) so the user can confirm what they typed
  // before submitting, instead of trusting the masked dots.
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && revealed ? "text" : type}
          className={cn(
            "w-full rounded-sm border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted/60 hover:border-muted/60 focus:border-brand focus:ring-1 focus:ring-brand/30",
            isPassword && "pr-10",
            className
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-foreground"
            aria-label={revealed ? "Ocultar senha" : "Mostrar senha"}
            tabIndex={-1}
          >
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}
