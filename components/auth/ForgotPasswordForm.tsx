"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { requestPasswordReset } from "@/lib/services/password-reset";
import { useT } from "@/lib/i18n/I18nProvider";

export function ForgotPasswordForm() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      await requestPasswordReset(supabase, email, `${window.location.origin}/redefinir-senha`);
      // Generic outcome regardless of whether the e-mail exists — never confirm/deny
      // account existence to an unauthenticated visitor.
      setSent(true);
    } catch {
      setError(t("auth.forgotPassword.errGeneric"));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-5">
        <p className="text-sm text-foreground">{t("auth.forgotPassword.success")}</p>
        <a href="/login" className="block text-center text-sm text-brand hover:underline">
          {t("auth.forgotPassword.backToLogin")}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Input
        id="email"
        label={t("auth.forgotPassword.email")}
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="voce@exemplo.com"
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={loading} className="mt-1 w-full">
        {loading ? t("auth.forgotPassword.submitting") : t("auth.forgotPassword.submit")}
      </Button>

      <a href="/login" className="text-center text-sm text-brand hover:underline">
        {t("auth.forgotPassword.backToLogin")}
      </a>
    </form>
  );
}
