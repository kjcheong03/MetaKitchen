import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dr Aara — Your Health Companion",
  description: "An AI-powered health companion with real-time avatar and Indian language support",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
