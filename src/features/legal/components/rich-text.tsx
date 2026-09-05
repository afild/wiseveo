import { Fragment } from "react"
import { parseRichText, type InlineNode } from "@/features/legal/lib/rich-text"

/**
 * Desenha na tela os blocos que `rich-text.ts` produz. Nada aqui vira HTML cru:
 * cada pedaço de texto entra como filho de um elemento React, então uma marca
 * estranha no arquivo de tradução aparece como texto, nunca como marcação.
 */
function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.kind === "strong") {
          return (
            <strong key={index} className="font-semibold text-foreground">
              {node.text}
            </strong>
          )
        }
        if (node.kind === "link") {
          return (
            <a
              key={index}
              href={node.href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline underline-offset-4 hover:no-underline"
            >
              {node.text}
            </a>
          )
        }
        return <Fragment key={index}>{node.text}</Fragment>
      })}
    </>
  )
}

export function RichText({ body }: { body: string }) {
  const blocks = parseRichText(body)

  return (
    <div className="space-y-4">
      {blocks.map((block, index) =>
        block.kind === "list" ? (
          <ul key={index} className="ml-5 list-disc space-y-2">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Inline nodes={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={index}>
            <Inline nodes={block.content} />
          </p>
        ),
      )}
    </div>
  )
}
