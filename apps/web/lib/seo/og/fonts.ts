import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface OgFont { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }

/**
 * Load bundled brand fonts as ArrayBuffers for `ImageResponse`. Returns [] if the
 * files are missing so the OG route still renders with the default font.
 * NOTE: `process.cwd()` is the app root (`apps/web`) at runtime — verify against the
 * Next 16 docs/build output; adjust the base path if the monorepo cwd differs.
 */
export async function loadOgFonts(): Promise<OgFont[]> {
  const base = join(process.cwd(), 'public', 'fonts')
  try {
    const [bold, regular] = await Promise.all([
      readFile(join(base, 'Bricolage-Bold.ttf')),
      readFile(join(base, 'Bricolage-Regular.ttf')),
    ])
    return [
      { name: 'Bricolage', data: bold.buffer.slice(bold.byteOffset, bold.byteOffset + bold.byteLength) as ArrayBuffer, weight: 700, style: 'normal' },
      { name: 'Bricolage', data: regular.buffer.slice(regular.byteOffset, regular.byteOffset + regular.byteLength) as ArrayBuffer, weight: 400, style: 'normal' },
    ]
  } catch {
    return []
  }
}
