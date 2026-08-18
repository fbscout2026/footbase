"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { completePasswordReset, isPasswordResetAvailable } from "@/lib/services/password-reset";
import { useT } from "@/lib/i18n/I18nProvider";

type Stage = "checking" | "invalidLink" | "alreadyUsed" | "form" | "success";

export function ResetPasswordForm() {
  const { t } = useT();
  const client = useMemo(() => createClient(), []);
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      // The Supabase browser client auto-exchanges the recovery token in the URL
      // (from the e-mail link) into a session on load; give it a tick before reading.
      const { data } = await client.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        setStage("invalidLink");
        return;
      }
      try {
        const available = await isPasswordResetAvailable(client);
        if (cancelled) return;
        setStage(available ? "form" : "alreadyUsed");
      } catch {
        if (!cancelled) setStage("invalidLink");
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [client]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t("auth.resetPassword.errTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.resetPassword.errMismatch"));
      return;
    }
    setLoading(true);
    try {
      await completePasswordReset(client, password);
      setStage("success");
    } catch {
      setError(t("auth.resetPassword.errGeneric"));
    } finally {
      setLoading(false);
    }
  }

  if (stage === "checking") {
    return <p className="text-sm text-muted">{t("auth.resetPassword.checking")}</p>;
  }

  if (stage === "invalidLink") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-danger">{t("auth.resetPassword.invalidLink")}</p>
        <a href="/recuperar-senha" className="block text-center text-sm text-brand hover:underline">
          {t("auth.resetPassword.requestNew")}
        </a>
      </div>
    );
  }

  if (stage === "alreadyUsed") {
    return <p className="text-sm text-warning">{t("auth.resetPassword.alreadyUsed")}</p>;
  }

  if (stage === "success") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground">{t("auth.resetPassword.success")}</p>
        <a href="/login" className="block text-center text-sm text-brand hover:underline">
          {t("auth.resetPassword.goToLogin")}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Input
        id="password"
        label={t("auth.resetPassword.newPassword")}
        type="password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
      />
      <Input
        id="confirmPassword"
        label={t("auth.resetPassword.confirmPassword")}
        type="password"
        required
        minLength={8}
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder="••••••••"
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={loading} className="mt-1 w-full">
        {loading ? t("auth.resetPassword.submitting") : t("auth.resetPassword.submit")}
      </Button>
    </form>
  );
}
