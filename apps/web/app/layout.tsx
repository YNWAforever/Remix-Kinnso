import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KINNSO",
  description: "Travel & lifestyle community platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fonts are provided via CSS design tokens (--font-sans / --font-mono) in
  // globals.css @theme, not next/font/google, so builds stay hermetic (no
  // network fetch at build time).
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
