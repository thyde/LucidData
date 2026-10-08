import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { PrivacyAnalytics } from "@/components/common/privacy-analytics";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LucidData",
  description: "An encrypted vault for your health and personal records. You decide who sees them.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LucidData",
  },
  formatDetection: {
    telephone: false,
  },
};

// WCAG 1.4.4: people must be able to zoom, so no maximum scale is set.
export const viewport: Viewport = {
  themeColor: "#1a1a2e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <PrivacyAnalytics />
      </body>
    </html>
  );
}
