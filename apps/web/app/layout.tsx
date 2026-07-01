import { Bricolage_Grotesque, DM_Sans, JetBrains_Mono, Fraunces, Inter } from 'next/font/google'

// Brand fonts wired via next/font so the @theme font tokens in globals.css resolve
// to real font files. The `<html>` element lives in app/[locale]/layout.tsx, so these
// variable classes are applied there.
//
// R1A adds the editorial pair (Fraunces display serif + Inter body) as NEW variables;
// Bricolage / DM Sans / JetBrains Mono stay until the R1C sweep retires the legacy
// kinnso-* system.
export const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-bricolage',
})

export const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  variable: '--font-dm-sans',
})

export const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains-mono',
})

// Fraunces and Inter are variable fonts — no `weight` list needed; next/font
// serves the variable axis. Fraunces only covers Latin: CJK/Thai fall through
// to the system serif stacks declared in the --font-k2-display token.
export const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
})

export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const fontVariables = `${bricolage.variable} ${dmSans.variable} ${jetBrainsMono.variable} ${fraunces.variable} ${inter.variable}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children
}
