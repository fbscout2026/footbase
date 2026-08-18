import type { LucideIcon } from "lucide-react";

export function WidgetCard({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  children: React.ReactNode;
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
      <div className="p-5">{children}</div>
    </section>
  );
}
