import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function WidgetCard({
  title,
  subtitle,
  icon: Icon,
  children,
  scrollable = false,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  children: React.ReactNode;
  /** Session 57 — caps the body height and scrolls internally instead of growing the
   * page, so list cards can show up to 20 rows without pushing everything below them
   * down the page. */
  scrollable?: boolean;
}) {
  return (
    <section className="matchday-surface">
      <header className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-brand/30 bg-brand/10 text-brand">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-extrabold uppercase italic tracking-wide">
            {title}
          </h2>
          {subtitle && <p className="truncate text-xs normal-case text-muted">{subtitle}</p>}
        </div>
      </header>
      <div className={cn("p-5", scrollable && "scroll-brand max-h-[420px] overflow-y-auto")}>
        {children}
      </div>
    </section>
  );
}
