import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

export const metadata: Metadata = {
  title: "FOOTBASE | Scouting Data Platform",
  description:
    "Scouting and performance data for Brazilian youth football academies, Sub-11 to Sub-20.",
};

const THEME_INIT = `
(function () {
  var stored = localStorage.getItem("footbase-theme");
  var theme = stored || "dark";
  document.documentElement.classList.toggle("light", theme === "light");
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="font-sans antialiased">
        <a href="#main-content" className="skip-link">Pular para o conteúdo</a>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
