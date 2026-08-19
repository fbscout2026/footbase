"use client";

import { Mail, Phone, MessageCircle, Instagram, Youtube } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import type { AgenteContactRecord } from "@/lib/services/atletas";

export function AgentContact({
  agent,
  youtubeUrl,
}: {
  agent: AgenteContactRecord | null;
  youtubeUrl: string | null;
}) {
  const { t } = useT();

  if (!agent) {
    return <p className="text-sm text-muted">{t("dossie.agent.none")}</p>;
  }

  const waDigits = agent.phone?.replace(/\D/g, "");
  const igHandle = agent.instagram?.replace(/^@/, "");

  return (
    <div className="space-y-4">
      <div>
        <p className="font-semibold">{agent.fullName}</p>
        {agent.agencyName && <p className="text-sm text-muted">{agent.agencyName}</p>}
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {agent.licenseLevel && (
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-muted">
              {t("dossie.agent.license")}: {agent.licenseLevel}
            </span>
          )}
          {agent.markets.length > 0 && (
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-muted">
              {t("dossie.agent.markets")}: {agent.markets.join(", ")}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {agent.contactEmail && (
          <ContactRow icon={Mail} href={`mailto:${agent.contactEmail}`} label={t("dossie.agent.email")} value={agent.contactEmail} />
        )}
        {waDigits && (
          <ContactRow icon={MessageCircle} href={`https://wa.me/${waDigits}`} external label={t("dossie.agent.whatsapp")} value={agent.phone!} tone="brand" />
        )}
        {agent.phone && (
          <ContactRow icon={Phone} href={`tel:${agent.phone}`} label={t("dossie.agent.phone")} value={agent.phone} />
        )}
        {igHandle && (
          <ContactRow icon={Instagram} href={`https://instagram.com/${igHandle}`} external label={t("dossie.agent.instagram")} value={agent.instagram!} />
        )}
        {youtubeUrl && (
          <ContactRow icon={Youtube} href={youtubeUrl} external label="YouTube" value={t("dossie.video.watch")} tone="red" />
        )}
      </div>
    </div>
  );
}

function ContactRow({
  icon: Icon,
  href,
  label,
  value,
  external,
  tone,
}: {
  icon: typeof Mail;
  href: string;
  label: string;
  value: string;
  external?: boolean;
  tone?: "brand" | "red";
}) {
  const iconTone =
    tone === "brand" ? "bg-brand/15 text-brand" : tone === "red" ? "bg-danger/15 text-danger" : "bg-surface-hover text-muted";
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:border-brand/50"
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
        <Icon size={15} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wide text-muted">{label}</span>
        <span className="block truncate text-sm font-medium">{value}</span>
      </span>
    </a>
  );
}
