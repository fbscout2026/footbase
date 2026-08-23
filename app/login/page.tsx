"use client";

import { Suspense } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";
import { useT } from "@/lib/i18n/I18nProvider";

export default function LoginPage() {
  const { t } = useT();
  return (
    <AuthCard title={t("auth.login.title")} subtitle={t("auth.login.subtitle")}>
      {/* LoginForm reads `?reason=` via useSearchParams(), which requires a Suspense
          boundary during prerendering (Session 57 — single-device-session notice). */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
