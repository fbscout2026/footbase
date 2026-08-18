"use client";

import { AuthCard } from "@/components/auth/AuthCard";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { useT } from "@/lib/i18n/I18nProvider";

export default function CadastroPage() {
  const { t } = useT();
  return (
    <AuthCard title={t("auth.signup.title")} subtitle={t("auth.signup.subtitle")}>
      <SignUpForm />
    </AuthCard>
  );
}
