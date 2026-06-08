import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";

import { BrieflyBootSplash } from "@/components/briefly-boot-splash";
import "./globals.css";

const sans = Manrope({
  variable: "--font-sans-var",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono-var",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Briefly",
  description:
    "En digital hverdagsplatform, der samler det vigtigste i en rolig, intelligent briefing.",
  applicationName: "Briefly",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Briefly",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#101313",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="da"
      className={`${sans.variable} ${mono.variable} h-full scroll-smooth`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      style={{ backgroundColor: "#101313", color: "#ffffff" }}
    >
      <body
        className="min-h-full bg-background text-foreground antialiased"
        style={{ backgroundColor: "#101313", color: "#ffffff" }}
      >
        <BrieflyBootSplash />
        {children}
      </body>
    </html>
  );
}
