import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createDriveClient } from "../src/features/backup/services/google-drive.client"

/**
 * Cliente mínimo do Drive com `fetch` puro (o app não tem googleapis). O escopo é
 * drive.file: só enxerga o que o app criou. Quatro promessas: pasta criada uma vez só,
 * upload multipart bem formado, listagem por pasta, e o token NUNCA aparece em erro.
 */
const TOKEN = "ya29.token-do-drive"
let calls: Array<{ url: string; init: RequestInit }>

function stub(responder: (url: string, init: RequestInit) => Response) {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      calls.push({ url: String(url), init })
      return responder(String(url), init)
    }),
  )
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

beforeEach(() => stub(() => json({})))
afterEach(() => vi.unstubAllGlobals())

describe("ensureFolder", () => {
  it("reusa a pasta que já existe", async () => {
    stub((url) => (url.includes("/drive/v3/files?") ? json({ files: [{ id: "pasta-1" }] }) : json({})))
    const id = await createDriveClient(TOKEN).ensureFolder("WISEVEO Backups")
    expect(id).toBe("pasta-1")
    expect(calls).toHaveLength(1)
    expect(decodeURIComponent(calls[0].url)).toContain("name='WISEVEO Backups'")
    expect(decodeURIComponent(calls[0].url)).toContain("mimeType='application/vnd.google-apps.folder'")
  })

  it("cria quando não existe", async () => {
    stub((url, init) => (init.method === "POST" ? json({ id: "pasta-nova" }) : json({ files: [] })))
    expect(await createDriveClient(TOKEN).ensureFolder("WISEVEO Backups")).toBe("pasta-nova")
    const create = calls[1]
    expect(create.init.method).toBe("POST")
    expect(JSON.parse(String(create.init.body))).toEqual({ name: "WISEVEO Backups", mimeType: "application/vnd.google-apps.folder" })
  })
})

describe("uploadFile", () => {
  it("manda multipart/related com metadados e o arquivo, e devolve id e tamanho", async () => {
    stub(() => json({ id: "f1", name: "x.dump", size: "3", createdTime: "2026-09-05T07:00:00.000Z" }))
    const out = await createDriveClient(TOKEN).uploadFile({
      folderId: "pasta-1",
      name: "x.dump",
      description: "5.005 lançamentos",
      content: Buffer.from("abc"),
    })
    expect(out).toEqual({ id: "f1", name: "x.dump", sizeBytes: 3, createdAt: "2026-09-05T07:00:00.000Z" })
    const { url, init } = calls[0]
    expect(url).toContain("/upload/drive/v3/files?uploadType=multipart")
    expect(String((init.headers as Record<string, string>)["Content-Type"])).toMatch(/^multipart\/related; boundary=/)
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    const body = Buffer.from(init.body as Uint8Array).toString("utf8")
    expect(body).toContain('"parents":["pasta-1"]')
    expect(body).toContain("abc")
  })
})

describe("listFiles / deleteFile", () => {
  it("lista só o que está na pasta, sem lixeira, e converte size para número", async () => {
    stub(() => json({ files: [{ id: "a", name: "a.dump", size: "10", createdTime: "2026-09-01T00:00:00Z" }] }))
    const files = await createDriveClient(TOKEN).listFiles("pasta-1")
    expect(files).toEqual([{ id: "a", name: "a.dump", sizeBytes: 10, createdAt: "2026-09-01T00:00:00Z" }])
    expect(decodeURIComponent(calls[0].url)).toContain("'pasta-1' in parents and trashed = false")
  })

  it("apaga por id", async () => {
    stub(() => new Response(null, { status: 204 }))
    await createDriveClient(TOKEN).deleteFile("a")
    expect(calls[0].init.method).toBe("DELETE")
    expect(calls[0].url).toMatch(/\/drive\/v3\/files\/a$/)
  })
})

describe("erros", () => {
  it("falha do Google vira BackupError driveFailed com o status, e sem o token", async () => {
    stub(() => new Response("boom", { status: 403 }))
    await expect(createDriveClient(TOKEN).listFiles("pasta-1")).rejects.toMatchObject({ code: "driveFailed" })
    await expect(createDriveClient(TOKEN).listFiles("pasta-1")).rejects.not.toThrow(TOKEN)
    try {
      await createDriveClient(TOKEN).listFiles("pasta-1")
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(TOKEN)
      expect(String((error as Error).message)).toContain("403")
    }
  })
})
