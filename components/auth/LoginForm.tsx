"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/I18nProvider";

/** Writes the device-session cookie `middleware.ts` compares against `profiles.active_session_id`. */
function claimDeviceSession(id: string): void {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `fb_session_id=${id}; path=/; max-age=31536000; samesite=lax${secure}`;
}

export function LoginForm() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const otherDeviceNotice = searchParams.get("reason") === "other_device";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError || !data.user) {
        setError(t("auth.login.errInvalid"));
        return;
      }

      // Claims this device's session slot (Session 57 — single active device) in the
      // same round trip as the existing account-status read (RLS lets a user read/
      // update their own profile row).
      const deviceSessionId = crypto.randomUUID();
      const { data: profile } = await supabase
        .from("profiles")
        .update({ active_session_id: deviceSessionId })
        .eq("id", data.user.id)
        .select("account_status, role")
        .single();
      claimDeviceSession(deviceSessionId);

      const status = profile?.account_status;
      if (status === "approved") {
        router.push("/dashboard");
      } else {
        // pending AND rejected both land here — the rejected screen shows the reason
        // and a "Solicitar Revisão" button (WS7), so a rejected account must stay
        // signed in to reach it instead of being bounced with a generic error.
        router.push("/aguardando-aprovacao");
      }
    } catch {
      setError(t("auth.login.errGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {otherDeviceNotice && <p className="text-sm text-muted">{t("auth.login.otherDeviceNotice")}</p>}

      <Input
        id="email"
        label={t("auth.login.email")}
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="voce@exemplo.com"
      />

      <Input
        id="password"
        label={t("auth.login.password")}
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
      />

      <a href="/recuperar-senha" className="-mt-2 text-right text-sm text-brand hover:underline">
        {t("auth.login.forgotPassword")}
      </a>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={loading} className="mt-1 w-full">
        {loading ? t("auth.login.submitting") : t("auth.login.submit")}
      </Button>

      <p className="text-center text-sm text-muted">
        {t("auth.login.noAccount")}{" "}
        <a href="/cadastro" className="text-brand hover:underline">
          {t("auth.login.signupLink")}
        </a>
      </p>
    </form>
  );
}
