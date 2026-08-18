"use client";

import { AuthCard } from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { useT } from "@/lib/i18n/I18nProvider";

export default function ResetPasswordPage() {
  const { t } = useT();
  return (
    <AuthCard title={t("auth.resetPassword.title")} subtitle={t("auth.resetPassword.subtitle")}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
