"use client";

import { RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/I18nProvider";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useT();
  return (
    <div className="border border-danger/30 bg-danger/10 p-8 text-center">
      <ShieldAlert size={32} className="mx-auto text-danger" />
      <p className="mx-auto mt-3 max-w-xl text-sm text-muted">{t("board.loadError")}</p>
      <Button onClick={reset} className="mt-5">
        <RefreshCw size={15} /> {t("common.retry")}
      </Button>
    </div>
  );
}
