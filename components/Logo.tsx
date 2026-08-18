import { cn } from "@/lib/cn";

// Theme-aware Footbase logo: white wordmark on dark surfaces, black on light.
// Pass a height utility via className (e.g. "h-7"); width stays auto.
export function Logo({ className = "h-7" }: { className?: string }) {
  return (
    <span className="inline-flex items-center">
      {/* eslint-disable @next/next/no-img-element */}
      <img src="/footbase-logo.svg" alt="Footbase" width="1890" height="277" className={cn("logo-on-dark w-auto", className)} />
      <img src="/footbase-logo-black.svg" alt="Footbase" width="1890" height="277" className={cn("logo-on-light w-auto", className)} />
      {/* eslint-enable @next/next/no-img-element */}
    </span>
  );
}
