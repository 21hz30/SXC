import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SXC — Hyrox Coach",
  description: "AI-powered training dashboard for Hyrox coaches.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="antialiased">
      <body className="min-h-screen bg-background text-foreground">{children}</body>
    </html>
  );
}
