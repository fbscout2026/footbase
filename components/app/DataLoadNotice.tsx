"use client";

import { RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/I18nProvider";

export function DataLoadNotice() {
  const { t } = useT();
  return (
    <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 border border-warning/30 bg-warning/10 px-4 py-3 text-sm sm:mx-6">
      <span className="flex items-center gap-2 text-yellow-200">
        <ShieldAlert size={17} /> {t("board.loadError")}
      </span>
      <Button variant="secondary" onClick={() => window.location.reload()}>
        <RefreshCw size={15} /> {t("common.retry")}
      </Button>
    </div>
  );
}
