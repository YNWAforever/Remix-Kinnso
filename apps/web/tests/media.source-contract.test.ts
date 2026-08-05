import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const webRoot = fileURLToPath(new URL('..', import.meta.url))
const sourceRoots = ['app', 'components'].map((directory) => join(webRoot, directory))

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

function attribute(
  node: ts.JsxAttributes,
  name: string,
): ts.JsxAttribute | undefined {
  return node.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name,
  )
}

function isEmptyStringAttribute(attribute: ts.JsxAttribute | undefined) {
  const initializer = attribute?.initializer
  if (!initializer) return true
  if (ts.isStringLiteral(initializer)) return initializer.text.length === 0
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return true
  return (
    (ts.isStringLiteral(initializer.expression) && initializer.expression.text.length === 0) ||
    (ts.isNoSubstitutionTemplateLiteral(initializer.expression) && initializer.expression.text.length === 0)
  )
}

function isAriaHidden(attributes: ts.JsxAttributes) {
  const hidden = attribute(attributes, 'aria-hidden')
  if (!hidden?.initializer) return false
  if (ts.isStringLiteral(hidden.initializer)) return hidden.initializer.text === 'true'
  return (
    ts.isJsxExpression(hidden.initializer) &&
    hidden.initializer.expression?.kind === ts.SyntaxKind.TrueKeyword
  )
}

function findViolations(fileName: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const nextImageIdentifiers = new Set<string>()
  const violations: string[] = []
  const line = (node: ts.Node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  const report = (node: ts.Node, message: string) => {
    violations.push(`${fileName}:${line(node)} ${message}`)
  }

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === 'next/image') {
      const clause = node.importClause
      if (clause?.name) nextImageIdentifiers.add(clause.name.text)
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) nextImageIdentifiers.add(element.name.text)
      }
    }

    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tagName = ts.isIdentifier(node.tagName) ? node.tagName.text : undefined
      const attributes = node.attributes
      const sizes = attribute(attributes, 'sizes')

      if (tagName === 'EntityMedia') {
        if (!attribute(attributes, 'title')) report(node, 'EntityMedia requires title')
        if (!sizes) report(node, 'EntityMedia requires sizes')
        else if (isEmptyStringAttribute(sizes)) report(node, 'EntityMedia sizes must be non-empty')
        if (attribute(attributes, 'alt')) report(node, 'EntityMedia must not receive alt')
      }

      if (tagName && nextImageIdentifiers.has(tagName)) {
        if (!sizes) report(node, 'next/image requires sizes')
        else if (isEmptyStringAttribute(sizes)) report(node, 'next/image sizes must be non-empty')
      }

      if (tagName === 'img') {
        const alt = attribute(attributes, 'alt')
        if (alt && isEmptyStringAttribute(alt) && !isAriaHidden(attributes)) {
          report(node, 'native img with empty alt requires aria-hidden="true"')
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

describe('media source contract', () => {
  it('requires title and non-empty sizes for EntityMedia without alt', () => {
    const violations = findViolations(
      'fixture.tsx',
      '<EntityMedia alt="name" sizes={""} />',
    )

    expect(violations).toEqual([
      'fixture.tsx:1 EntityMedia requires title',
      'fixture.tsx:1 EntityMedia sizes must be non-empty',
      'fixture.tsx:1 EntityMedia must not receive alt',
    ])
  })

  it('reports missing sizes without an empty-value duplicate', () => {
    expect(findViolations('fixture.tsx', '<EntityMedia title="name" />')).toEqual([
      'fixture.tsx:1 EntityMedia requires sizes',
    ])
    expect(findViolations('fixture.tsx', "import Image from 'next/image'\n<Image />")).toEqual([
      'fixture.tsx:2 next/image requires sizes',
    ])
  })
  it('requires non-empty sizes for identifiers imported from next/image', () => {
    const violations = findViolations(
      'fixture.tsx',
      "import Image from 'next/image'\n<Image sizes=\"\" />",
    )

    expect(violations).toEqual(['fixture.tsx:2 next/image sizes must be non-empty'])
  })

  it('permits empty native image alt only when the image is hidden', () => {
    expect(findViolations('fixture.tsx', '<img alt="" />')).toEqual([
      'fixture.tsx:1 native img with empty alt requires aria-hidden="true"',
    ])
    expect(findViolations('fixture.tsx', '<img alt="" aria-hidden="true" />')).toEqual([])
  })

  it('keeps application media JSX within the contract', () => {
    const violations = sourceRoots.flatMap((directory) =>
      sourceFiles(directory).flatMap((path) =>
        findViolations(relative(webRoot, path), readFileSync(path, 'utf8')),
      ),
    )

    expect(violations).toEqual([])
  })
})