import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";

// Windowed page numbers: first, last, and a small range around the current
// page, with "…" filling any gap — keeps the control usable even with
// hundreds of pages (e.g. ~410 pages at 20 athletes/page over 8k+ athletes).
function pageWindow(page: number, pageCount: number): (number | "ellipsis")[] {
  const window = 1;
  const pages = new Set<number>([1, pageCount, page]);
  for (let i = page - window; i <= page + window; i++) {
    if (i >= 1 && i <= pageCount) pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | "ellipsis")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) result.push("ellipsis");
    result.push(sorted[i]!);
  }
  return result;
}

export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  const { t } = useT();
  if (pageCount <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-border px-3 py-3 text-sm">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="inline-flex min-h-11 min-w-11 items-center justify-center border border-border text-muted transition-colors hover:border-brand/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={t("pagination.previous")}
      >
        <ChevronLeft size={16} />
      </button>

      {pageWindow(page, pageCount).map((entry, i) =>
        entry === "ellipsis" ? (
          <span key={`ellipsis-${i}`} className="px-1.5 text-muted">
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            onClick={() => onChange(entry)}
            aria-current={entry === page ? "page" : undefined}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center border px-2 font-semibold transition-colors ${
              entry === page
                ? "border-brand bg-brand text-black"
                : "border-border text-muted hover:border-brand/60 hover:text-foreground"
            }`}
          >
            {entry}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
        className="inline-flex min-h-11 min-w-11 items-center justify-center border border-border text-muted transition-colors hover:border-brand/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={t("pagination.next")}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
