"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, MessageCircle, LogOut } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/I18nProvider";

type Screen = "checking" | "pending" | "rejected";

const CURATION_WHATSAPP = process.env.NEXT_PUBLIC_CURATION_WHATSAPP ?? "";
const WHATSAPP_MESSAGE =
  "Olá! Gostaria de acelerar a aprovação da minha conta Footbase.";

export default function AguardandoAprovacaoPage() {
  const { t } = useT();
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("checking");

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("account_status")
        .eq("id", user.id)
        .single();

      const status = profile?.account_status;
      if (status === "approved") {
        router.replace("/dashboard");
      } else if (status === "rejected") {
        setScreen("rejected");
      } else {
        setScreen("pending");
      }
    })();
  }, [router]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (screen === "checking") {
    return (
      <AuthCard title={t("pending.checking")} subtitle="">
        <div className="flex justify-center py-4">
          <Clock className="animate-pulse text-brand" size={28} />
        </div>
      </AuthCard>
    );
  }

  const isRejected = screen === "rejected";
  const waHref = CURATION_WHATSAPP
    ? `https://wa.me/${CURATION_WHATSAPP}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`
    : null;

  return (
    <AuthCard
      title={isRejected ? t("pending.rejectedTitle") : t("pending.title")}
      subtitle={isRejected ? t("pending.rejectedBody") : t("pending.body")}
    >
      <div className="flex flex-col gap-4">
        {!isRejected && (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-4 py-3 text-brand">
            <Clock size={18} />
            <span className="text-sm font-medium">{t("pending.title")}</span>
          </div>
        )}

        <p className="text-center text-sm text-muted">{t("pending.whatsappHint")}</p>

        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-black shadow-glow transition-colors hover:bg-brand-dim hover:text-white"
          >
            <MessageCircle size={16} />
            {t("pending.whatsappCta")}
          </a>
        )}

        <button
          onClick={handleLogout}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-muted transition-colors hover:text-foreground"
        >
          <LogOut size={16} />
          {t("pending.logout")}
        </button>
      </div>
    </AuthCard>
  );
}
