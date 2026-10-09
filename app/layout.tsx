import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter, Lilita_One } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import "./globals.css";

// Chunky game type for headings, buttons and the logo.
const game = Lilita_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

// In-game canvas HUD (needs real bold weights).
const hud = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-hud",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Naija Childhood — the games you grew up playing",
    template: "%s · Naija Childhood",
  },
  description:
    "Ten-Ten, Police & Thief and Suwe — the Nigerian childhood games you grew up playing, now on your phone. Play solo, challenge friends and climb the leaderboards.",
  applicationName: "Naija Childhood",
  appleWebApp: { capable: true, title: "Naija Childhood", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    title: "Naija Childhood",
    description: "The childhood games you grew up playing — now on your phone.",
    images: ["/images/school-friends-1600.webp"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0c1a12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG" className={`${game.variable} ${hud.variable} ${body.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
