import { DM_Sans, JetBrains_Mono } from 'next/font/google'

// Brand fonts wired via next/font so the `--font-sans`/`--font-mono` @theme
// tokens in globals.css resolve to real font files. The `<html>` element lives
// in app/[locale]/layout.tsx, so these variable classes are applied there.
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

export const fontVariables = `${dmSans.variable} ${jetBrainsMono.variable}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children
}
