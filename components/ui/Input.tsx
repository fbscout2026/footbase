import { cn } from "@/lib/cn";
import type { ComponentPropsWithoutRef } from "react";

export function Input({
  label,
  id,
  className,
  ...props
}: { label: string } & ComponentPropsWithoutRef<"input">) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        className={cn(
          "rounded-sm border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted/60 hover:border-muted/60 focus:border-brand focus:ring-1 focus:ring-brand/30",
          className
        )}
        {...props}
      />
    </div>
  );
}
