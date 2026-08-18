import { cn } from "@/lib/cn";

type Tone = "brand" | "warning" | "danger" | "neutral";

const tones: Record<Tone, string> = {
  brand: "bg-brand/15 text-brand border-brand/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  danger: "bg-danger/15 text-danger border-danger/30",
  neutral: "bg-surface-hover text-muted border-border",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
