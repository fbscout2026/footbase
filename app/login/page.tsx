"use client";

import { AuthCard } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";
import { useT } from "@/lib/i18n/I18nProvider";

export default function LoginPage() {
  const { t } = useT();
  return (
    <AuthCard title={t("auth.login.title")} subtitle={t("auth.login.subtitle")}>
      <LoginForm />
    </AuthCard>
  );
}
