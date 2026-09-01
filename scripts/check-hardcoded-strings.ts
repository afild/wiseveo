import fs from "fs"
import path from "path"
import ts from "typescript"

const SRC_DIR = path.join(process.cwd(), "src")
const MESSAGES_FILE = path.join(process.cwd(), "src/i18n/messages/pt-BR.json")

// Path fragments that are always skipped entirely (both checks).
const IGNORE = [
  "src/i18n/messages",
  "src/generated",
  ".d.ts",
  // guia de estilo interno (dev-only), deliberadamente não localizado
  "src/features/component-library",
  // dataset vendorizado: nomes de presets de tema e font-stacks CSS
  // ("Inter, sans-serif") são dados, não copy de produto.
  "src/utils/extra-theme-presets.ts",
  // dados mock do bloco "mail" (herdados do template original): remetentes/
  // assuntos/corpos de e-mail fictícios só para popular a demo — não é copy de UI.
  "src/labs/mail/data.tsx",
]

// Prefix-matched paths where Check A (hardcoded UI strings) is skipped.
// Check B (t() key existence) still runs — the allowlist never exempts it.
const ALLOWLIST: string[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "scripts/i18n-allowlist.json"), "utf-8")
)

const ACCENTED_RE = /[áéíóúâêôãõàçÁÉÍÓÚÂÊÔÃÕÀÇñÑ¿¡]/
const LETTER_RE = /\p{L}/u
const IGNORE_MARKER = "i18n-ignore"

// --- Check A (ASCII heuristic) ------------------------------------------
// Accented text is unambiguous (pt-BR/es-419 leaking into code). Plain English
// UI text has no such tell, so we detect it structurally: capitalized-first-word
// multi-word "sentences" (placeholders, zod messages, aria-labels, toasts) or
// any multi-word phrase trailing off in "...".
const SENTENCE_RE = /^[A-Z¿¡][a-zA-Z,'’]*(\s+[a-zA-Z][a-zA-Z,'’.]*){1,}/
const ELLIPSIS_TAIL_RE = /[a-zA-Z]{2,}\s+[a-zA-Z].*\.\.\.\s*$/
// All-lowercase, alnum + Tailwind/utility punctuation → almost certainly a
// className/utility string, never real UI copy (which always has an
// uppercase word or proper punctuation).
const CSS_UTILITY_RE = /^[a-z0-9\s\-:\[\]\/.%()]+$/

// JSX attributes whose string values are never user-facing copy. aria-* is
// intentionally NOT here — aria-label/aria-description etc. are real UI text.
const NON_UI_JSX_ATTRS = new Set([
  "className",
  "id",
  "key",
  "variant",
  "size",
  "side",
  "align",
  "mode",
  "type",
  "name",
  "href",
  "src",
  "rel",
  "target",
  "style",
  "width",
  "height",
  "viewBox",
  "fill",
  "stroke",
  "strokeWidth",
  "strokeLinecap",
  "strokeLinejoin",
  "xmlns",
  "rows",
  "cols",
  "colSpan",
  "rowSpan",
  "htmlFor",
  "method",
  "action",
  "encType",
  "accept",
  "autoComplete",
  "inputMode",
  "pattern",
  "role",
  "as",
  "orientation",
  "placement",
  "position",
  "min",
  "max",
  "step",
  "sizes",
  "loading",
  "decoding",
  "fetchPriority",
])

function isCandidateUIText(text: string): boolean {
  if (!/\s/.test(text)) return false // pure identifier/path — no spaces
  if (CSS_UTILITY_RE.test(text)) return false // looks like a className/utility list
  return SENTENCE_RE.test(text) || ELLIPSIS_TAIL_RE.test(text)
}

function calleeName(call: ts.CallExpression): string | undefined {
  if (ts.isIdentifier(call.expression)) return call.expression.text
  if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text
  return undefined
}

// Walks up through "transparent" glue nodes (ternaries, &&/||, parens, arrays,
// template pieces, {..} JSX expression containers) to find the nearest
// meaningful parent, then checks whether that parent context makes this
// literal non-UI: a JSX attribute we don't localize, an object property KEY,
// an import/require specifier, or an argument to console.*/cn(...)/clsx(...).
function isExcludedUIContext(node: ts.Node): boolean {
  let current: ts.Node = node
  let depth = 0
  while (depth < 10) {
    const p: ts.Node | undefined = current.parent
    if (!p) return false

    if (ts.isJsxAttribute(p) && p.initializer === current) {
      const attrName = p.name.getText()
      return NON_UI_JSX_ATTRS.has(attrName) || attrName.startsWith("data-")
    }

    if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === current) {
      return true
    }

    if (
      (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) &&
      p.moduleSpecifier === current
    ) {
      return true
    }

    if (ts.isCallExpression(p) && p.arguments[0] === current) {
      if (ts.isIdentifier(p.expression) && p.expression.text === "require") return true
      if (p.expression.kind === ts.SyntaxKind.ImportKeyword) return true
    }

    if (ts.isCallExpression(p) && p.arguments.includes(current as ts.Expression)) {
      const name = calleeName(p)
      if (name === "cn" || name === "clsx" || name === "classNames") return true
      // date-fns `format`/`formatAppDate`/`createDateFormatter`-style calls take a
      // pattern-token string ("MMM d", "EEEE, MMMM d") as an argument — that's a
      // formatting instruction, not UI copy, even though it can look like a
      // multi-word "sentence" to the heuristic above.
      if (name && /^format/i.test(name)) return true
      if (
        ts.isPropertyAccessExpression(p.expression) &&
        ts.isIdentifier(p.expression.expression) &&
        p.expression.expression.text === "console"
      ) {
        return true
      }
      return false // argument of some other, unrelated call — not excluded
    }

    if (
      ts.isConditionalExpression(p) ||
      ts.isBinaryExpression(p) ||
      ts.isParenthesizedExpression(p) ||
      ts.isArrayLiteralExpression(p) ||
      ts.isTemplateExpression(p) ||
      ts.isTemplateSpan(p) ||
      ts.isJsxExpression(p)
    ) {
      current = p
      depth++
      continue
    }

    return false
  }
  return false
}

interface Violation {
  file: string
  line: number
  message: string
}

const violations: Violation[] = []

function toRelPosix(absPath: string): string {
  return path.relative(process.cwd(), absPath).split(path.sep).join("/")
}

function isIgnored(relPath: string): boolean {
  return IGNORE.some((frag) => relPath.includes(frag))
}

function isAllowlisted(relPath: string): boolean {
  return ALLOWLIST.some((prefix) => relPath.startsWith(prefix))
}

function walkDir(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDir(full, out)
    } else if (entry.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) {
      out.push(full)
    }
  }
  return out
}

// --- pt-BR.json indexing -----------------------------------------------

function indexMessages(obj: unknown): { keys: Set<string>; namespaces: Set<string> } {
  const keys = new Set<string>()
  const namespaces = new Set<string>()

  function walk(node: unknown, prefix: string) {
    if (node !== null && typeof node === "object" && !Array.isArray(node)) {
      if (prefix) namespaces.add(prefix)
      for (const key of Object.keys(node as Record<string, unknown>)) {
        walk((node as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key)
      }
    } else {
      keys.add(prefix)
    }
  }

  walk(obj, "")
  return { keys, namespaces }
}

// --- suppression ---------------------------------------------------------

function isSuppressed(sourceLines: string[], line0: number): boolean {
  const own = sourceLines[line0] ?? ""
  const above = line0 > 0 ? sourceLines[line0 - 1] ?? "" : ""
  return own.includes(IGNORE_MARKER) || above.includes(IGNORE_MARKER)
}

function truncate(text: string): string {
  return text.trim().slice(0, 60)
}

// --- namespace extraction -------------------------------------------------

function extractNamespace(call: ts.CallExpression): string | undefined {
  const arg = call.arguments[0]
  if (!arg) return "" // useTranslations() / getTranslations() -> root namespace

  if (ts.isStringLiteral(arg)) return arg.text

  if (ts.isObjectLiteralExpression(arg)) {
    for (const prop of arg.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ((ts.isIdentifier(prop.name) && prop.name.text === "namespace") ||
          (ts.isStringLiteral(prop.name) && prop.name.text === "namespace")) &&
        ts.isStringLiteral(prop.initializer)
      ) {
        return prop.initializer.text
      }
    }
    return undefined
  }

  return undefined
}

function unwrapAwait(expr: ts.Expression): ts.Expression {
  return ts.isAwaitExpression(expr) ? expr.expression : expr
}

// --- main scan per file ---------------------------------------------------

function scanFile(
  absPath: string,
  relPath: string,
  checkAEnabled: boolean,
  keySet: Set<string>,
  namespaceSet: Set<string>
) {
  const content = fs.readFileSync(absPath, "utf-8")
  const sourceLines = content.split(/\r?\n/)
  const scriptKind = absPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(absPath, content, ts.ScriptTarget.Latest, true, scriptKind)

  function lineOf(node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line
  }

  function report(node: ts.Node, buildMessage: (line: number) => string) {
    const line0 = lineOf(node)
    if (isSuppressed(sourceLines, line0)) return
    const line = line0 + 1
    violations.push({ file: relPath, line, message: buildMessage(line) })
  }

  // Single traversal, in source order: bindings are recorded and consulted as
  // we go, so a later `const t = useTranslations(...)` in a sibling function
  // does not retroactively affect calls validated earlier in the same file.
  // This is still just a flat file-level map (no real block/function scoping) —
  // shadowing edge cases beyond sequential sibling declarations are not handled.
  const bindings = new Map<string, string>()

  function visit(node: ts.Node) {
    // --- t()-binding collection ---
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const init = unwrapAwait(node.initializer)
      if (
        ts.isCallExpression(init) &&
        ts.isIdentifier(init.expression) &&
        (init.expression.text === "useTranslations" || init.expression.text === "getTranslations")
      ) {
        const ns = extractNamespace(init)
        if (ns !== undefined) {
          bindings.set(node.name.text, ns)
          if (ns !== "" && !namespaceSet.has(ns)) {
            report(
              init,
              (line) => `❌ ${relPath}:${line} → namespace inexistente em pt-BR.json: "${ns}"`
            )
          }
        }
      }
    }

    // --- Check A ---
    if (checkAEnabled) {
      if (ts.isJsxText(node)) {
        const text = node.getText(sourceFile)
        if (LETTER_RE.test(text)) {
          report(node, (line) => `❌ ${relPath}:${line} → "${truncate(text)}"`)
        }
      } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (ACCENTED_RE.test(node.text)) {
          report(node, (line) => `❌ ${relPath}:${line} → "${truncate(node.text)}"`)
        } else if (isCandidateUIText(node.text) && !isExcludedUIContext(node)) {
          report(node, (line) => `❌ ${relPath}:${line} → (ASCII) "${truncate(node.text)}"`)
        }
      } else if (ts.isTemplateExpression(node)) {
        // Reconstruct the literal text pieces only (head + each span's literal),
        // skipping ${...} substitutions, so a sentence like `Last seen ${x}`
        // is evaluated as "Last seen" rather than failing to match because the
        // raw source text starts with a backtick or a "${".
        const full = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" ")
        const raw = node.getText(sourceFile)
        if (ACCENTED_RE.test(raw)) {
          report(node, (line) => `❌ ${relPath}:${line} → "${truncate(raw)}"`)
        } else if (isCandidateUIText(full) && !isExcludedUIContext(node)) {
          report(node, (line) => `❌ ${relPath}:${line} → (ASCII) "${truncate(raw)}"`)
        }
      }
    }

    // --- Check B ---
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      bindings.has(node.expression.text)
    ) {
      const ns = bindings.get(node.expression.text)!
      const arg = node.arguments[0]
      if (arg && ts.isStringLiteral(arg)) {
        const fullKey = ns ? `${ns}.${arg.text}` : arg.text
        if (!keySet.has(fullKey)) {
          report(
            node,
            (line) => `❌ ${relPath}:${line} → chave inexistente em pt-BR.json: "${fullKey}"`
          )
        }
      }
    }

    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

function main() {
  console.log("Verificando strings hardcoded e chaves t() no código (src/**/*.{ts,tsx})...")

  if (!fs.existsSync(MESSAGES_FILE)) {
    console.error(`❌ Arquivo não encontrado: ${MESSAGES_FILE}`)
    process.exit(1)
  }

  let messages: unknown
  try {
    messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf-8"))
  } catch (err) {
    console.error(`❌ JSON inválido em pt-BR.json: ${(err as Error).message}`)
    process.exit(1)
  }

  const { keys: keySet, namespaces: namespaceSet } = indexMessages(messages)

  const allFiles = walkDir(SRC_DIR)

  for (const absPath of allFiles) {
    const relPath = toRelPosix(absPath)
    if (isIgnored(relPath)) continue
    const checkAEnabled = !isAllowlisted(relPath)
    scanFile(absPath, relPath, checkAEnabled, keySet, namespaceSet)
  }

  for (const v of violations) {
    console.error(v.message)
  }

  if (violations.length > 0) {
    console.error(
      `\n❌ ${violations.length} problema(s) de i18n no código. Textos de UI devem usar useTranslations/getTranslations com chaves em src/i18n/messages/ (allowlist: scripts/i18n-allowlist.json — ela só pode encolher).`
    )
    process.exit(1)
  } else {
    console.log("✅ Nenhuma string hardcoded fora da allowlist e todas as chaves t() existem.")
  }
}

main()
