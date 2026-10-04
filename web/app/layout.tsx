import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import { fontVariables } from "@/lib/fonts";
import { LOCALE_INIT_SCRIPT } from "@/lib/i18n/locale";

export const metadata: Metadata = {
  title: "health-tracker",
  applicationName: "health-tracker",
  appleWebApp: { capable: true, title: "health-tracker" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1412" },
  ],
};

// Voor de eerste verf, zodat een opgeslagen themakeuze nooit het andere thema laat flitsen. Ook <html lang> volgt
// meteen de taal van dit apparaat (lib/i18n/locale.ts); de Nederlandse statische export is de standaard.
const themeInit = `
try {
  var t = localStorage.getItem("theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={fontVariables} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit + LOCALE_INIT_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
