import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SXC — Hyrox Coach",
  description: "AI-powered training dashboard for Hyrox coaches.",
  appleWebApp: { title: "SRC", statusBarStyle: "default" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // Let content extend under the iOS notch/home-indicator so the bottom tab bar
  // can pad itself with env(safe-area-inset-*).
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="antialiased">
      <body className="min-h-screen bg-background text-foreground">{children}</body>
    </html>
  );
}
