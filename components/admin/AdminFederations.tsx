"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe2, MapPinned, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { useT } from "@/lib/i18n/I18nProvider";
import { createClient } from "@/lib/supabase/client";
import { addFederacao, addPais, removeFederacao, removePais, type FederationHierarchy } from "@/lib/services/admin-federations";

type RemoveTarget = { kind: "pais"; id: string; label: string } | { kind: "federacao"; id: string; label: string };

export function AdminFederations({ data }: { data: FederationHierarchy | null }) {
  const { t } = useT();
  const router = useRouter();
  const client = useMemo(() => createClient(), []);

  const [countryConfId, setCountryConfId] = useState("");
  const [countryName, setCountryName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [savingCountry, setSavingCountry] = useState(false);
  const [countryError, setCountryError] = useState("");
  const [countrySuccess, setCountrySuccess] = useState(false);

  const [fedPaisId, setFedPaisId] = useState("");
  const [fedName, setFedName] = useState("");
  const [fedSigla, setFedSigla] = useState("");
  const [fedTipo, setFedTipo] = useState<"estadual" | "nacional">("estadual");
  const [savingFed, setSavingFed] = useState(false);
  const [fedError, setFedError] = useState("");
  const [fedSuccess, setFedSuccess] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");

  if (data === null) {
    return <section className="matchday-surface p-10 text-center"><p className="text-sm text-danger">{t("admin.federations.loadError")}</p></section>;
  }

  async function submitCountry(event: React.FormEvent) {
    event.preventDefault();
    setSavingCountry(true); setCountryError(""); setCountrySuccess(false);
    try {
      await addPais(client, { confederacaoId: countryConfId, nome: countryName, codigo: countryCode || undefined });
      setCountrySuccess(true);
      setCountryConfId(""); setCountryName(""); setCountryCode("");
      router.refresh();
    } catch {
      setCountryError(t("admin.federations.error"));
    } finally {
      setSavingCountry(false);
    }
  }

  async function submitFederation(event: React.FormEvent) {
    event.preventDefault();
    setSavingFed(true); setFedError(""); setFedSuccess(false);
    try {
      await addFederacao(client, { paisId: fedPaisId, nome: fedName, sigla: fedSigla, tipo: fedTipo });
      setFedSuccess(true);
      setFedPaisId(""); setFedName(""); setFedSigla(""); setFedTipo("estadual");
      router.refresh();
    } catch {
      setFedError(t("admin.federations.error"));
    } finally {
      setSavingFed(false);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true); setRemoveError("");
    try {
      if (removeTarget.kind === "pais") await removePais(client, removeTarget.id);
      else await removeFederacao(client, removeTarget.id);
      setRemoveTarget(null);
      router.refresh();
    } catch (reason) {
      const code = typeof reason === "object" && reason && "code" in reason ? String(reason.code) : "";
      setRemoveError(code === "23503" ? t("admin.federations.removeBlocked") : t("admin.federations.removeError"));
    } finally {
      setRemoving(false);
    }
  }

  const canSubmitCountry = countryConfId && countryName.trim().length >= 2;
  const canSubmitFed = fedPaisId && fedName.trim().length >= 2 && fedSigla.trim().length >= 2;

  return <div className="space-y-5">
    <section className="matchday-surface p-5">
      <h2 className="matchday-heading flex items-center gap-2 text-xl"><Globe2 size={19} className="text-brand" />{t("admin.federations.title")}</h2>
      <p className="mt-1 text-sm text-muted">{t("admin.federations.desc")}</p>
    </section>

    <div className="grid gap-5 lg:grid-cols-2">
      <section className="matchday-surface p-5">
        <h3 className="matchday-heading text-lg">{t("admin.federations.addCountry")}</h3>
        <form className="mt-4 space-y-3" onSubmit={submitCountry}>
          <Field label={t("admin.federations.confederation")}>
            <Select ariaLabel={t("admin.federations.confederation")} value={countryConfId} onChange={setCountryConfId}
              placeholder={t("admin.federations.confederationPlaceholder")}
              options={data.confederacoes.map((c) => ({ value: c.id, label: `${c.continente} · ${c.codigo}` }))} />
          </Field>
          <Field label={t("admin.federations.countryName")}>
            <input value={countryName} onChange={(e) => setCountryName(e.target.value)} required minLength={2} maxLength={100}
              className="min-h-11 border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand" />
          </Field>
          <Field label={t("admin.federations.countryCode")}>
            <input value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} maxLength={3} placeholder="BR"
              className="min-h-11 border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand" />
          </Field>
          <Button type="submit" disabled={!canSubmitCountry || savingCountry}>{savingCountry ? t("common.loading") : t("admin.federations.addCountrySubmit")}</Button>
          {countrySuccess && <span className="ml-3 text-sm text-brand">{t("admin.federations.success")}</span>}
          {countryError && <p role="alert" className="mt-2 text-sm text-danger">{countryError}</p>}
        </form>
      </section>

      <section className="matchday-surface p-5">
        <h3 className="matchday-heading text-lg">{t("admin.federations.addFederation")}</h3>
        <form className="mt-4 space-y-3" onSubmit={submitFederation}>
          <Field label={t("admin.federations.country")}>
            <Select ariaLabel={t("admin.federations.country")} value={fedPaisId} onChange={setFedPaisId}
              placeholder={t("admin.federations.countryPlaceholder")}
              options={data.paises.map((p) => ({ value: p.id, label: p.nome }))} />
          </Field>
          <Field label={t("admin.federations.federationName")}>
            <input value={fedName} onChange={(e) => setFedName(e.target.value)} required minLength={2} maxLength={150}
              className="min-h-11 border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand" />
          </Field>
          <Field label={t("admin.federations.federationSigla")}>
            <input value={fedSigla} onChange={(e) => setFedSigla(e.target.value.toUpperCase())} required minLength={2} maxLength={12}
              className="min-h-11 border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand" />
          </Field>
          <Field label={t("admin.federations.federationType")}>
            <Select ariaLabel={t("admin.federations.federationType")} value={fedTipo} onChange={(v) => setFedTipo(v as "estadual" | "nacional")}
              options={[{ value: "estadual", label: t("admin.federations.type.estadual") }, { value: "nacional", label: t("admin.federations.type.nacional") }]} />
          </Field>
          <Button type="submit" disabled={!canSubmitFed || savingFed}>{savingFed ? t("common.loading") : t("admin.federations.addFederationSubmit")}</Button>
          {fedSuccess && <span className="ml-3 text-sm text-brand">{t("admin.federations.success")}</span>}
          {fedError && <p role="alert" className="mt-2 text-sm text-danger">{fedError}</p>}
        </form>
      </section>
    </div>

    {removeTarget && (
      <section className="matchday-surface border-2 border-danger p-5">
        <h3 className="matchday-heading text-lg">{t("admin.federations.removeTitle")}</h3>
        <p className="mt-1 text-sm text-muted">{t("admin.federations.removeConfirm")} <strong className="text-foreground">{removeTarget.label}</strong>?</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={removing} onClick={confirmRemove} className="min-h-11 border border-danger bg-danger/10 px-4 text-xs font-extrabold uppercase text-danger hover:bg-danger/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">{removing ? t("common.loading") : t("admin.federations.removeSubmit")}</button>
          <Button type="button" variant="secondary" disabled={removing} onClick={() => { setRemoveTarget(null); setRemoveError(""); }}>{t("common.cancel")}</Button>
        </div>
        {removeError && <p role="alert" className="mt-2 text-sm text-danger">{removeError}</p>}
      </section>
    )}

    <section className="matchday-surface p-5">
      <h3 className="matchday-heading flex items-center gap-2 text-lg"><MapPinned size={17} className="text-brand" />{t("admin.federations.hierarchy")}</h3>
      {data.confederacoes.length === 0 ? <p className="mt-3 text-sm text-muted">{t("admin.federations.empty")}</p> : (
        <div className="mt-3 space-y-4">
          {data.confederacoes.map((conf) => {
            const paisesDaConf = data.paises.filter((p) => p.confederacaoId === conf.id);
            return <div key={conf.id}>
              <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{conf.continente} · {conf.codigo}</p>
              {paisesDaConf.length === 0 ? <p className="mt-1 text-sm text-muted/60">—</p> : (
                <div className="mt-2 space-y-2">
                  {paisesDaConf.map((pais) => {
                    const feds = data.federacoes.filter((f) => f.paisId === pais.id);
                    return <div key={pais.id} className="border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{pais.nome}</p>
                        <button type="button" onClick={() => { setRemoveTarget({ kind: "pais", id: pais.id, label: pais.nome }); setRemoveError(""); }}
                          aria-label={`${t("admin.federations.removeCountry")} ${pais.nome}`}
                          className="flex h-7 w-7 items-center justify-center text-muted hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"><X size={15} /></button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {feds.length === 0 ? <span className="text-xs text-muted">—</span> : feds.map((f) => (
                          <span key={f.id} className="inline-flex items-center gap-1">
                            <Badge tone={f.tipo === "nacional" ? "brand" : "neutral"}>{f.sigla}{f.tipo === "nacional" ? ` (${t("admin.federations.type.nacional")})` : ""}</Badge>
                            <button type="button" onClick={() => { setRemoveTarget({ kind: "federacao", id: f.id, label: f.sigla }); setRemoveError(""); }}
                              aria-label={`${t("admin.federations.removeFederation")} ${f.sigla}`}
                              className="flex h-6 w-6 items-center justify-center text-muted hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"><X size={12} /></button>
                          </span>
                        ))}
                      </div>
                    </div>;
                  })}
                </div>
              )}
            </div>;
          })}
        </div>
      )}
    </section>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-xs font-bold uppercase tracking-wide text-muted">{label}</span>{children}</label>;
}
