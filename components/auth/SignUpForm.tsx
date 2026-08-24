"use client";

import { useState } from "react";
import { Building2, UserRound } from "lucide-react";
import { AsYouType, type CountryCode } from "libphonenumber-js";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/I18nProvider";
import { findCountry } from "@/lib/countries";

type Role = "club" | "agent";

export function SignUpForm() {
  const { t } = useT();
  const [role, setRole] = useState<Role>("club");
  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [country, setCountry] = useState("BR");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError(t("auth.signup.errLength"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.signup.errMatch"));
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role,
            full_name: fullName,
            whatsapp: whatsapp || null,
            organization: organization || null,
            country,
            // agents also get an agency_name from the same field
            agency_name: role === "agent" ? organization || null : null,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      setSubmitted(true);
    } catch {
      setError(t("auth.signup.errConnection"));
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="text-center">
        <p className="font-semibold text-foreground">{t("auth.signup.successTitle")}</p>
        <p className="mt-2 text-sm text-muted">{t("auth.signup.successBody")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-background p-1">
        <RoleButton
          active={role === "club"}
          onClick={() => setRole("club")}
          icon={Building2}
          label={t("auth.signup.roleClub")}
        />
        <RoleButton
          active={role === "agent"}
          onClick={() => setRole("agent")}
          icon={UserRound}
          label={t("auth.signup.roleAgent")}
        />
      </div>

      <Input
        id="full_name"
        label={t("auth.signup.fullName")}
        required
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder={t("auth.signup.fullNamePlaceholder")}
      />

      <Input
        id="organization"
        label={role === "agent" ? t("auth.signup.orgAgent") : t("auth.signup.orgClub")}
        value={organization}
        onChange={(e) => setOrganization(e.target.value)}
        placeholder={t("auth.signup.orgPlaceholder")}
      />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">{t("auth.signup.country")}</span>
        <CountrySelect value={country} onChange={setCountry} ariaLabel={t("auth.signup.country")} />
      </label>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="whatsapp" className="text-sm font-medium text-muted">
          {t("auth.signup.whatsapp")}
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-muted">
            {findCountry(country)?.dialCode ?? "+55"}
          </span>
          <input
            id="whatsapp"
            type="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(new AsYouType(country as CountryCode).input(e.target.value))}
            placeholder={t("auth.signup.whatsappPlaceholder")}
            className="w-full rounded-sm border border-border bg-background py-2.5 pr-3.5 pl-16 text-sm text-foreground outline-none transition-colors placeholder:text-muted/60 hover:border-muted/60 focus:border-brand focus:ring-1 focus:ring-brand/30"
          />
        </div>
      </div>

      <Input
        id="email"
        label={t("auth.signup.email")}
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("auth.signup.emailPlaceholder")}
      />

      <Input
        id="password"
        label={t("auth.signup.password")}
        type="password"
        required
        minLength={6}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
      />

      <Input
        id="confirm_password"
        label={t("auth.signup.confirm")}
        type="password"
        required
        minLength={6}
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder="••••••••"
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={loading} className="mt-1 w-full">
        {loading ? t("auth.signup.submitting") : t("auth.signup.submit")}
      </Button>

      <p className="text-center text-sm text-muted">
        {t("auth.signup.haveAccount")}{" "}
        <a href="/login" className="text-brand hover:underline">
          {t("auth.signup.loginLink")}
        </a>
      </p>
    </form>
  );
}

function RoleButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Building2;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors",
        active ? "bg-brand text-black" : "text-muted hover:text-foreground"
      )}
    >
      <Icon size={15} />
      {label}
    </button>
  );
}
