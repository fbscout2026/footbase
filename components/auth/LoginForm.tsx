"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/I18nProvider";

export function LoginForm() {
  const { t } = useT();
  const router = useRouter();
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

      // Route by account status (RLS lets a user read their own profile row).
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_status, role")
        .eq("id", data.user.id)
        .single();

      const status = profile?.account_status;
      if (status === "rejected") {
        await supabase.auth.signOut();
        setError(t("auth.login.rejected"));
        return;
      }

      if (status === "approved") {
        router.push("/dashboard");
      } else {
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
