import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(process.cwd(), '../..')
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8')
const verificationWorkflow = readFileSync(resolve(repoRoot, '.github/workflows/verify.yml'), 'utf8')
const previewSpec = readFileSync(resolve(repoRoot, 'apps/e2e/specs/r7-10-preview-smoke.spec.ts'), 'utf8')
const accessibilitySource = readFileSync(resolve(repoRoot, 'apps/e2e/r7-10-accessibility.ts'), 'utf8')
const webDeploymentPrefix =
  "startsWith(github.event.deployment_status.environment_url, 'https://remix-kinnso-')"
const syncDeploymentExclusion =
  "!startsWith(github.event.deployment_status.environment_url, 'https://remix-kinnso-sync-')"
const startupStep = workflow.match(
  /- name: Start scan worker \(fixture mode\)[\s\S]*?(?=\n\s{6}- name:)/,
)?.[0]

function replaceOnce(source: string, before: string, after: string): string {
  expect(source).toContain(before)
  return source.replace(before, after)
}

interface SourceBlock {
  source: string
  startLine: number
}

function sourceBlocks(source: string, header: string, indent: number): SourceBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const marker = `${' '.repeat(indent)}${header}`
  const blocks: SourceBlock[] = []

  for (let startLine = 0; startLine < lines.length; startLine += 1) {
    if (lines[startLine] !== marker) continue

    let endLine = startLine + 1
    for (; endLine < lines.length; endLine += 1) {
      const line = lines[endLine]
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('#')) continue
      const lineIndent = line.length - line.trimStart().length
      if (lineIndent <= indent) break
    }
    blocks.push({ source: lines.slice(startLine, endLine).join('\n'), startLine })
  }

  return blocks
}

function uniqueSourceBlock(source: string, header: string, indent: number): SourceBlock | undefined {
  const blocks = sourceBlocks(source, header, indent)
  return blocks.length === 1 ? blocks[0] : undefined
}

function parseScalarMapping(source: string, header: string, indent: number): Record<string, string> | undefined {
  const block = uniqueSourceBlock(source, `${header}:`, indent)
  if (!block) return undefined

  const entries: Record<string, string> = {}
  const entryPattern = new RegExp(`^ {${indent + 2}}([A-Z][A-Z0-9_]*):\\s*(.+)$`)
  for (const line of block.source.split('\n').slice(1)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const match = entryPattern.exec(line)
    if (!match || Object.hasOwn(entries, match[1])) return undefined
    entries[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2')
  }

  return entries
}

function hasExactEntries(actual: Record<string, string> | undefined, expected: Record<string, string>): boolean {
  if (!actual) return false
  const actualKeys = Object.keys(actual)
  const expectedKeys = Object.keys(expected)
  return actualKeys.length === expectedKeys.length
    && expectedKeys.every((key) => actual[key] === expected[key])
}

function scalarRunCommand(source: string, indent: number): string | undefined {
  const prefix = `${' '.repeat(indent)}run:`
  const runs = source.split('\n').filter((line) => line.startsWith(prefix))
  if (runs.length !== 1) return undefined
  return runs[0].slice(prefix.length).trim()
}

const r710Command = 'pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts'

function hasCiProductStateContract(source: string): boolean {
  const jobs = uniqueSourceBlock(source, 'jobs:', 0)
  const e2eJob = jobs && uniqueSourceBlock(jobs.source, 'e2e:', 2)
  if (!e2eJob) return false

  const offHeader = '- name: R7.10 accessibility - Booking OFF'
  const onHeader = '- name: R7.10 accessibility - Booking ON'
  if (sourceBlocks(source, offHeader, 6).length !== 1 || sourceBlocks(source, onHeader, 6).length !== 1) {
    return false
  }

  const offStep = uniqueSourceBlock(e2eJob.source, offHeader, 6)
  const onStep = uniqueSourceBlock(e2eJob.source, onHeader, 6)
  if (!offStep || !onStep || offStep.startLine >= onStep.startLine) return false

  return hasExactEntries(parseScalarMapping(offStep.source, 'env', 8), {
    AGENT_LIVE: 'true',
    BOOKING_LIVE: 'false',
    R7_10_BOOKING_STATE: 'off',
  })
    && hasExactEntries(parseScalarMapping(onStep.source, 'env', 8), {
      R7_10_BOOKING_STATE: 'on',
      STRIPE_SECRET_KEY: '${{ secrets.STRIPE_SECRET_KEY }}',
      STRIPE_WEBHOOK_SECRET: '${{ secrets.STRIPE_WEBHOOK_SECRET }}',
    })
    && scalarRunCommand(offStep.source, 8) === r710Command
    && scalarRunCommand(onStep.source, 8) === r710Command
}

function extractFunction(source: string, name: string): string | undefined {
  const signatureStart = source.indexOf(`export async function ${name}`)
  if (signatureStart < 0) return undefined
  const bodyStart = source.indexOf('{', signatureStart)
  if (bodyStart < 0) return undefined

  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(signatureStart, index + 1)
    }
  }
  return undefined
}

function usesOnlyAllowedCalls(source: string, allowed: ReadonlySet<string>): boolean {
  const calls = [...source.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map((match) => match[1])
  return calls.every((call) => allowed.has(call))
}

function hasReadOnlyPreviewContract(
  verificationSource: string,
  specSource: string,
  helperSource: string,
): boolean {
  const jobs = uniqueSourceBlock(verificationSource, 'jobs:', 0)
  const previewJob = jobs && uniqueSourceBlock(jobs.source, 'preview-smoke:', 2)
  if (!previewJob || sourceBlocks(verificationSource, 'preview-smoke:', 2).length !== 1) return false

  const previewStep = uniqueSourceBlock(
    previewJob.source,
    '- name: R7.10 preview manifest smoke (read-only)',
    6,
  )
  const waitForRouteSource = extractFunction(helperSource, 'waitForRoute')
  if (!previewStep || !waitForRouteSource) return false

  const previewCalls = new Set([
    'async', 'expect', 'first', 'for', 'locator', 'status', 'test', 'toBe', 'toBeVisible', 'waitForRoute',
  ])
  const routeHelperCalls = new Set([
    'Error', 'first', 'getByRole', 'goto', 'if', 'import', 'status', 'waitFor', 'waitForRoute',
  ])

  return hasExactEntries(parseScalarMapping(previewJob.source, 'env', 4), {
    E2E_BASE_URL: '${{ github.event.deployment_status.environment_url }}',
  })
    && !/(?:SUPABASE|STRIPE|secrets\.)/i.test(previewJob.source)
    && previewJob.source.includes("github.event.deployment_status.environment == 'Preview'")
    && previewJob.source.includes("github.event.deployment_status.state == 'success'")
    && previewJob.source.includes(webDeploymentPrefix)
    && previewJob.source.includes(syncDeploymentExclusion)
    && scalarRunCommand(previewStep.source, 8) === 'pnpm --filter @kinnso/e2e e2e r7-10-preview-smoke'
    && specSource.includes('for (const route of R7_10_ROUTES)')
    && specSource.includes('const response = await waitForRoute(page, route)')
    && specSource.includes("page.locator('main:visible').first()")
    && specSource.includes('toBeVisible()')
    && waitForRouteSource.includes('page.goto(route.path)')
    && waitForRouteSource.includes('status !== 200')
    && waitForRouteSource.includes("waitFor({ state: 'visible' })")
    && usesOnlyAllowedCalls(specSource, previewCalls)
    && usesOnlyAllowedCalls(waitForRouteSource, routeHelperCalls)
}

describe('CI product-state startup contract', () => {
  it('keeps the fixture scan worker separate from the Playwright-owned web server', () => {
    expect(startupStep).toContain('SCAN_FIXTURE_MODE=1 pnpm --filter @kinnso/scan-app start &')
    expect(startupStep).not.toContain('pnpm --filter web dev &')
    expect(startupStep).toContain('http://localhost:8788/health')
    expect(startupStep).not.toContain('http://localhost:3000')
  })

  it('bounds the readiness wait so a failed background server cannot hang CI', () => {
    expect(startupStep).toContain('wait-on --timeout 120000')
  })

  it('runs Booking OFF before Booking ON with the exact dedicated configuration', () => {
    expect(hasCiProductStateContract(workflow)).toBe(true)
  })

  it('rejects product-state strings moved outside the named Booking OFF step', () => {
    const mutated = replaceOnce(
      workflow,
      `      - name: R7.10 accessibility - Booking OFF
        env:
          AGENT_LIVE: 'true'
          BOOKING_LIVE: 'false'
          R7_10_BOOKING_STATE: 'off'
        run: pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts`,
      `      # AGENT_LIVE: 'true'; BOOKING_LIVE: 'false'; R7_10_BOOKING_STATE: 'off'
      # pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts
      - name: R7.10 accessibility - Booking OFF
        run: echo "contract text moved outside this step"`,
    )

    expect(hasCiProductStateContract(mutated)).toBe(false)
  })

  it('rejects Booking ON moved into a separate parallel job', () => {
    const mutated = replaceOnce(
      workflow,
      '      - name: R7.10 accessibility - Booking ON',
      `  booking-on:
    runs-on: ubuntu-latest
    steps:
      - name: R7.10 accessibility - Booking ON`,
    )

    expect(hasCiProductStateContract(mutated)).toBe(false)
  })

  it('rejects Booking ON ordered before Booking OFF', () => {
    const off = `      - name: R7.10 accessibility - Booking OFF
        env:
          AGENT_LIVE: 'true'
          BOOKING_LIVE: 'false'
          R7_10_BOOKING_STATE: 'off'
        run: pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts`
    const on = `      - name: R7.10 accessibility - Booking ON
        env:
          R7_10_BOOKING_STATE: 'on'
          STRIPE_SECRET_KEY: \${{ secrets.STRIPE_SECRET_KEY }}
          STRIPE_WEBHOOK_SECRET: \${{ secrets.STRIPE_WEBHOOK_SECRET }}
        run: pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts`
    const mutated = replaceOnce(workflow, `${off}\n\n${on}`, `${on}\n\n${off}`)

    expect(hasCiProductStateContract(mutated)).toBe(false)
  })

  it('rejects a parallelized or extended Booking command', () => {
    const mutated = replaceOnce(
      workflow,
      'run: pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts',
      'run: pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts &',
    )

    expect(hasCiProductStateContract(mutated)).toBe(false)
  })

  it('retains Playwright failure evidence', () => {
    expect(workflow).toContain('apps/e2e/test-results/')
    expect(workflow).toContain('apps/e2e/playwright-report/')
  })
})

describe('Preview smoke isolation and read-only contract', () => {
  it('allows only E2E_BASE_URL in the preview job and follows the manifest read-only', () => {
    expect(hasReadOnlyPreviewContract(verificationWorkflow, previewSpec, accessibilitySource)).toBe(true)
  })

  it('accepts generated Vercel web URLs and excludes sync deployments in every auto-triggered job', () => {
    const jobs = uniqueSourceBlock(verificationWorkflow, 'jobs:', 0)
    expect(jobs).not.toBeNull()

    for (const name of ['parity:', 'e2e:', 'preview-smoke:']) {
      const job = jobs && uniqueSourceBlock(jobs.source, name, 2)
      expect(job?.source).toContain(webDeploymentPrefix)
      expect(job?.source).toContain(syncDeploymentExclusion)
    }

    expect(verificationWorkflow).not.toContain(
      "contains(github.event.deployment_status.environment_url, 'remix-kinnso-web')",
    )
  })

  it('rejects an additional Stripe or secret-backed preview job variable', () => {
    const mutated = replaceOnce(
      verificationWorkflow,
      '      E2E_BASE_URL: ${{ github.event.deployment_status.environment_url }}',
      `      E2E_BASE_URL: \${{ github.event.deployment_status.environment_url }}
      STRIPE_SECRET_KEY: \${{ secrets.STRIPE_SECRET_KEY }}`,
    )

    expect(hasReadOnlyPreviewContract(mutated, previewSpec, accessibilitySource)).toBe(false)
  })

  it('rejects replacing the visible main readiness assertion', () => {
    const mutatedSpec = replaceOnce(previewSpec, "page.locator('main:visible')", "page.locator('aside:visible')")
    expect(hasReadOnlyPreviewContract(verificationWorkflow, mutatedSpec, accessibilitySource)).toBe(false)
  })

  it.each([
    ['click interaction', "await page.locator('button').click()"],
    ['fill interaction', "await page.locator('input').fill('mutation')"],
    ['type interaction', "await page.locator('input').type('mutation')"],
    ['keyboard interaction', "await page.locator('form').press('Enter')"],
    ['form submission', "await page.locator('form').evaluate((form: HTMLFormElement) => form.submit())"],
    ['POST request mutation', "await page.request.post('/api/revalidate')"],
    ['PUT request mutation', "await page.request.put('/api/revalidate')"],
    ['PATCH request mutation', "await page.request.patch('/api/revalidate')"],
    ['DELETE request mutation', "await page.request.delete('/api/revalidate')"],
  ])('rejects %s in the preview smoke spec', (_name, mutation) => {
    const mutatedSpec = `${previewSpec}\n${mutation}\n`
    expect(hasReadOnlyPreviewContract(verificationWorkflow, mutatedSpec, accessibilitySource)).toBe(false)
  })

  it('rejects a mutation helper added to the route readiness helper', () => {
    const mutatedHelper = replaceOnce(
      accessibilitySource,
      '  const response = await page.goto(route.path)',
      '  await submitBooking(page)\n  const response = await page.goto(route.path)',
    )

    expect(hasReadOnlyPreviewContract(verificationWorkflow, previewSpec, mutatedHelper)).toBe(false)
  })
})
