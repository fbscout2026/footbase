"use client";

import { ShieldAlert } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";

export function BoardActivationNotice() {
  const { t } = useT();
  return (
    <div className="border border-warning/30 bg-warning/10 p-8 text-center">
      <ShieldAlert size={32} className="mx-auto text-warning" />
      <h1 className="mt-4 text-xl font-extrabold uppercase italic">{t("board.activationTitle")}</h1>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted">{t("board.activationDescription")}</p>
    </div>
  );
}
