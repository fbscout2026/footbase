"use client";

import { AuthCard } from "@/components/auth/AuthCard";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { useT } from "@/lib/i18n/I18nProvider";

export default function ForgotPasswordPage() {
  const { t } = useT();
  return (
    <AuthCard title={t("auth.forgotPassword.title")} subtitle={t("auth.forgotPassword.subtitle")}>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
