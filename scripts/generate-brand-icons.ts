/**
 * Gera os fallbacks raster do favicon a partir de src/app/icon.svg.
 * - favicon.ico (32px): Safari desktop não suporta favicon SVG.
 * - apple-icon.png (180px): iOS; com fundo papel da marca, pois transparência
 *   vira preto no iOS e media queries não se aplicam na rasterização.
 * Uso: npx tsx scripts/generate-brand-icons.ts
 */
import { Resvg } from "@resvg/resvg-js"
import pngToIco from "png-to-ico"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const svg = readFileSync(join(ROOT, "src/app/icon.svg"), "utf8")

function renderPng(source: string, size: number): Buffer {
  const resvg = new Resvg(source, { fitTo: { mode: "width", value: size } })
  return Buffer.from(resvg.render().asPng())
}

async function main() {
  const svgWithPaperBg = svg.replace(
    /<svg([^>]*)>/,
    '<svg$1><rect width="48" height="48" fill="#F7FAF9"/>',
  )

  writeFileSync(join(ROOT, "src/app/apple-icon.png"), renderPng(svgWithPaperBg, 180))

  const ico = await pngToIco([renderPng(svg, 32)])
  writeFileSync(join(ROOT, "src/app/favicon.ico"), ico)

  console.log("OK: src/app/apple-icon.png e src/app/favicon.ico gerados")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
