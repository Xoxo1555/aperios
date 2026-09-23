import "./globals.css";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter, Playfair_Display, Inter_Tight } from "next/font/google";
import { db } from "db";
import { categories } from "db/schema";
import { getSessionUser } from "lib/auth";
import { categoryToDto } from "lib/dto";
import { Suspense } from "react";
import { SessionProvider } from "components/SessionProvider";
import { LanguageProvider } from "lib/i18n";
import { SUPPORTED_LANGS, type LangCode } from "lib/langs";
import { CurrencyProvider } from "lib/currency";
import { ThemeProvider } from "lib/theme";
import { themeInitScript } from "lib/themeInitScript";
import Navbar from "components/Navbar";
import Footer from "components/Footer";
import CartDrawer from "components/CartDrawer";
import { ToastProvider } from "components/ui/toast";
import Script from "next/script";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-sans" });
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});
const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-accent",
  display: "swap",
});

const baseUrl = process.env.NEXT_PUBLIC_URL || `http://localhost:${process.env.PORT ?? 3000}`;

export const metadata: Metadata = {
  title: {
    default: "Aperio · Free Stock Photos & Limited Edition Fine Art Prints",
    template: "%s · Aperio",
  },
  description:
    "Aperio, the hybrid photo marketplace: free high-resolution downloads and numbered, certified fine art prints · from Madagascar to the rest of the world.",
  metadataBase: new URL(baseUrl),
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, categoryRows, cookieStore] = await Promise.all([
    getSessionUser(),
    db.select().from(categories).orderBy(categories.sort),
    cookies(),
  ]);

  const langCookie = cookieStore.get("aperio-lang")?.value;
  const initialLang: LangCode =
    langCookie && (SUPPORTED_LANGS as readonly string[]).includes(langCookie)
      ? (langCookie as LangCode)
      : "en";

  return (
    <html lang={initialLang} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" />
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        <Script src="/suppress-errors.js" strategy="beforeInteractive" />
      </head>
      <body
        className={`${inter.variable} ${playfair.variable} ${interTight.variable} bg-background text-foreground`}
        style={{ fontFamily: inter.style.fontFamily }}
        suppressHydrationWarning
      >
        <div className="min-h-[100dvh] flex flex-col">
          <ThemeProvider>
            <SessionProvider user={user}>
              <LanguageProvider initialLang={initialLang}>
                <CurrencyProvider>
                  <ToastProvider>
                    <Suspense fallback={null}>
                      <Navbar categories={categoryRows.map(categoryToDto)} />
                    </Suspense>
                    <main className="grow">{children}</main>
                    <Footer />
                    <CartDrawer />
                  </ToastProvider>
                </CurrencyProvider>
              </LanguageProvider>
            </SessionProvider>
          </ThemeProvider>
        </div>
      </body>
    </html>
  );
}
