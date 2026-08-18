import { cn } from "@/lib/cn";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "border border-brand bg-brand text-black hover:border-brand-dim hover:bg-brand-dim hover:text-black shadow-glow",
  secondary:
    "bg-surface text-foreground border border-border hover:border-brand/60 hover:bg-surface-hover",
  ghost: "border border-transparent text-foreground hover:border-border hover:bg-surface",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-sm px-5 py-2.5 text-sm font-extrabold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-60";

export function Button({
  variant = "primary",
  href,
  className,
  children,
  ...props
}: {
  variant?: Variant;
  href?: string;
  className?: string;
  children: React.ReactNode;
} & ComponentPropsWithoutRef<"button">) {
  const classes = cn(base, variants[variant], className);

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
