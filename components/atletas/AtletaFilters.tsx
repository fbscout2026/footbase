"use client";

import { useT } from "@/lib/i18n/I18nProvider";
import { Select, type SelectOption } from "@/components/ui/Select";
import { type AtletaFilterState, type Position, type Categoria, emptyFilters, CATEGORY_ORDER } from "@/lib/atletas-filters";
import { cn } from "@/lib/cn";

const POSITIONS: Position[] = ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"];

type Mode = "exact" | "between";

export function AtletaFilters({
  filters,
  onChange,
  nationalities,
}: {
  filters: AtletaFilterState;
  onChange: (next: AtletaFilterState) => void;
  nationalities: string[];
}) {
  const { t } = useT();
  const set = <K extends keyof AtletaFilterState>(key: K, value: AtletaFilterState[K]) =>
    onChange({ ...filters, [key]: value });

  const all: SelectOption = { value: "", label: t("common.all") };
  const triOptions: SelectOption[] = [all, { value: "yes", label: t("common.yes") }, { value: "no", label: t("common.no") }];
  const nationalityOptions: SelectOption[] = [all, ...nationalities.map((n) => ({ value: n, label: n }))];
  const positionOptions: SelectOption[] = [all, ...POSITIONS.map((p) => ({ value: p, label: p }))];
  const footOptions: SelectOption[] = [
    all,
    { value: "right", label: t("foot.right") },
    { value: "left", label: t("foot.left") },
    { value: "both", label: t("foot.both") },
  ];
  const categoryOptions: SelectOption[] = [all, ...CATEGORY_ORDER.map((c) => ({ value: c, label: c }))];

  return (
    <div className="matchday-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-extrabold uppercase italic tracking-wide">{t("atletas.filters.title")}</h2>
        <button onClick={() => onChange(emptyFilters)} className="text-xs text-brand hover:underline">
          {t("atletas.filters.clear")}
        </button>
      </div>

      <div className="space-y-5 p-4">
        {/* Identification */}
        <Group label={t("atletas.filters.identification")}>
          <Field label={t("atletas.filters.name")}>
            <TextInput value={filters.name} onChange={(v) => set("name", v)} />
          </Field>
          <Field label={t("atletas.filters.bid")}>
            <TextInput value={filters.bid} onChange={(v) => set("bid", v)} placeholder="FB-ID" />
          </Field>
        </Group>

        {/* Biographic */}
        <Group label={t("atletas.filters.biographic")}>
          <Field label={t("atletas.filters.category")}>
            <ModeToggle mode={filters.categoryMode} onChange={(m) => set("categoryMode", m)} exact={t("atletas.filters.exact")} between={t("atletas.filters.between")} />
            {filters.categoryMode === "exact" ? (
              <Select value={filters.categoryExact} onChange={(v) => set("categoryExact", v as Categoria | "")} options={categoryOptions} />
            ) : (
              <div className="flex gap-2">
                <Select value={filters.categoryFrom} onChange={(v) => set("categoryFrom", v as Categoria | "")} options={categoryOptions} />
                <Select value={filters.categoryTo} onChange={(v) => set("categoryTo", v as Categoria | "")} options={categoryOptions} />
              </div>
            )}
          </Field>
          <Field label={t("atletas.filters.age")}>
            <ModeNumber
              mode={filters.ageMode} onMode={(m) => set("ageMode", m)}
              exact={filters.ageExact} onExact={(v) => set("ageExact", v)}
              from={filters.ageFrom} onFrom={(v) => set("ageFrom", v)}
              to={filters.ageTo} onTo={(v) => set("ageTo", v)} t={t}
            />
          </Field>
          <Field label={t("atletas.filters.nationality")}>
            <Select value={filters.nationality} onChange={(v) => set("nationality", v)} options={nationalityOptions} />
          </Field>
          <Field label={t("atletas.filters.passport")}>
            <Select value={filters.passport} onChange={(v) => set("passport", v as AtletaFilterState["passport"])} options={triOptions} />
          </Field>
        </Group>

        {/* Position & physical */}
        <Group label={t("atletas.filters.physical")}>
          <Field label={t("atletas.filters.position")}>
            <Select value={filters.position} onChange={(v) => set("position", v as Position | "")} options={positionOptions} />
          </Field>
          <Field label={t("atletas.filters.secondaryPosition")}>
            <Select value={filters.secondaryPosition} onChange={(v) => set("secondaryPosition", v as Position | "")} options={positionOptions} />
          </Field>
          <Field label={t("atletas.filters.foot")}>
            <Select value={filters.foot} onChange={(v) => set("foot", v as AtletaFilterState["foot"])} options={footOptions} />
          </Field>
          <Field label={t("atletas.filters.height")}>
            <ModeNumber
              mode={filters.heightMode} onMode={(m) => set("heightMode", m)}
              exact={filters.heightExact} onExact={(v) => set("heightExact", v)}
              from={filters.heightFrom} onFrom={(v) => set("heightFrom", v)}
              to={filters.heightTo} onTo={(v) => set("heightTo", v)} t={t}
            />
          </Field>
          <Field label={t("atletas.filters.weight")}>
            <div className="flex gap-2">
              <NumInput placeholder={t("atletas.filters.from")} value={filters.weightFrom} onChange={(v) => set("weightFrom", v)} />
              <NumInput placeholder={t("atletas.filters.to")} value={filters.weightTo} onChange={(v) => set("weightTo", v)} />
            </div>
          </Field>
        </Group>

        {/* Performance */}
        <Group label={t("atletas.filters.sporting")}>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("atletas.filters.minMatches")}><NumInput value={filters.minMatches} onChange={(v) => set("minMatches", v)} /></Field>
            <Field label={t("atletas.filters.minMinutes")}><NumInput value={filters.minMinutes} onChange={(v) => set("minMinutes", v)} /></Field>
            <Field label={t("atletas.filters.minGoals")}><NumInput value={filters.minGoals} onChange={(v) => set("minGoals", v)} /></Field>
            <Field label={t("atletas.filters.minAssists")}><NumInput value={filters.minAssists} onChange={(v) => set("minAssists", v)} /></Field>
          </div>
          <Check label={t("atletas.filters.gema")} checked={filters.gema} onChange={(v) => set("gema", v)} />
          <Check label={t("atletas.filters.hasVideo")} checked={filters.hasVideo} onChange={(v) => set("hasVideo", v)} />
        </Group>

        {/* Market */}
        <Group label={t("atletas.filters.market")}>
          <Field label={t("atletas.filters.hasAgent")}>
            <Select value={filters.hasAgent} onChange={(v) => set("hasAgent", v as AtletaFilterState["hasAgent"])} options={triOptions} />
          </Field>
          <Check label={t("atletas.filters.expiring")} checked={filters.expiringContract} onChange={(v) => set("expiringContract", v)} />
          <Check label={t("atletas.filters.international")} checked={filters.international} onChange={(v) => set("international", v)} />
        </Group>
      </div>
    </div>
  );
}

// ---- primitives ------------------------------------------------------------
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-brand">{label}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </div>
  );
}

const fieldCls =
  "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-brand";

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={fieldCls} />;
}

function NumInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="number" inputMode="numeric" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={fieldCls} />;
}

function ModeToggle({ mode, onChange, exact, between }: { mode: Mode; onChange: (m: Mode) => void; exact: string; between: string }) {
  return (
    <div className="mb-1 flex gap-1">
      {(["exact", "between"] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
            mode === m ? "bg-brand text-black" : "bg-background text-muted hover:text-foreground"
          )}
        >
          {m === "exact" ? exact : between}
        </button>
      ))}
    </div>
  );
}

function ModeNumber({
  mode, onMode, exact, onExact, from, onFrom, to, onTo, t,
}: {
  mode: Mode; onMode: (m: Mode) => void;
  exact: string; onExact: (v: string) => void;
  from: string; onFrom: (v: string) => void;
  to: string; onTo: (v: string) => void;
  t: (k: "atletas.filters.exact" | "atletas.filters.between" | "atletas.filters.from" | "atletas.filters.to") => string;
}) {
  return (
    <>
      <ModeToggle mode={mode} onChange={onMode} exact={t("atletas.filters.exact")} between={t("atletas.filters.between")} />
      {mode === "exact" ? (
        <NumInput value={exact} onChange={onExact} />
      ) : (
        <div className="flex gap-2">
          <NumInput placeholder={t("atletas.filters.from")} value={from} onChange={onFrom} />
          <NumInput placeholder={t("atletas.filters.to")} value={to} onChange={onTo} />
        </div>
      )}
    </>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
      {label}
    </label>
  );
}
