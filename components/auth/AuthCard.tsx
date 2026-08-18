import Link from "next/link";
import { Logo } from "@/components/Logo";

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main id="main-content" className="matchday-hero flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-md">
        <Link href="/" className="flex justify-center">
          <Logo className="h-8" />
        </Link>

        <div className="matchday-surface mt-8 p-8 shadow-premium">
          <h1 className="matchday-heading text-xl">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>

          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
