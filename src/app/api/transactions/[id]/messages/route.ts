import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { prisma } from "@/lib/prisma"
import { getDefaultUserId } from "@/features/transactions/services/get-default-user-id"
import { respondDateClosed } from "@/features/security/lib/http"
import { dayKeyOfStored } from "@/features/security/lib/date-closing"
import { assertWritable } from "@/features/security/services/date-closing.service"
import { getWriteContext } from "@/features/security/services/write-context"

const MAX_MESSAGE_LENGTH = 2000

// GET /api/transactions/[id]/messages
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations("api")
  const userId = await getDefaultUserId()
  if (!userId) {
    return NextResponse.json({ error: t("errors.userNotFound") }, { status: 401 })
  }

  const { id: transactionId } = await params

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
    select: { id: true },
  })

  if (!transaction) {
    return NextResponse.json({ error: t("errors.transactionNotFound") }, { status: 404 })
  }

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string
        content: string
        createdAt: Date
        userId: string
        userName: string
      }>
    >`
      SELECT
        tm.id,
        tm.content,
        tm.created_at AS "createdAt",
        u.id AS "userId",
        u.name AS "userName"
      FROM public.transaction_messages tm
      INNER JOIN public.users u ON u.id = tm.user_id
      WHERE tm.transaction_id = ${transactionId}
      ORDER BY tm.created_at ASC
    `

    const messages = rows.map((row) => ({
      id: row.id,
      content: row.content,
      createdAt: row.createdAt,
      user: {
        id: row.userId,
        name: row.userName,
      },
    }))

    return NextResponse.json({ messages })
  } catch (error) {
    console.error("Error loading transaction messages:", error)
    return NextResponse.json({ error: t("transactions.loadMessagesFailed") }, { status: 500 })
  }
}

// POST /api/transactions/[id]/messages
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations("api")
  // O contexto de escrita (ator + dono + token de PIN) substitui o userId solto.
  const ctx = await getWriteContext(request)
  if (!ctx) {
    return NextResponse.json({ error: t("errors.userNotFound") }, { status: 401 })
  }
  const userId = ctx.ownerId

  const { id: transactionId } = await params

  // A data entra na busca: é o dia que a trava confere antes de deixar a nota entrar.
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
    select: { id: true, date: true },
  })

  if (!transaction) {
    return NextResponse.json({ error: t("errors.transactionNotFound") }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: t("errors.invalidJson") }, { status: 400 })
  }

  const content = typeof body.content === "string" ? body.content.trim() : ""

  if (!content) {
    return NextResponse.json({ error: t("transactions.emptyMessage") }, { status: 400 })
  }

  if (content.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: t("transactions.messageTooLong", { max: MAX_MESSAGE_LENGTH }) },
      { status: 400 }
    )
  }

  try {
    const messageId = crypto.randomUUID()
    // A conferência corre DENTRO da transação que grava: fora dela, o fechamento poderia cair
    // entre a checagem e a escrita.
    const rows = await prisma.$transaction(async (tx) => {
      await assertWritable(tx, ctx, { days: [dayKeyOfStored(transaction.date)] })
      return tx.$queryRaw<
        Array<{
          id: string
          content: string
          createdAt: Date
          userId: string
          userName: string
        }>
      >`
        WITH inserted AS (
          INSERT INTO public.transaction_messages (
            id,
            transaction_id,
            user_id,
            content,
            created_at,
            updated_at
          )
          VALUES (
            ${messageId},
            ${transactionId},
            ${userId},
            ${content},
            NOW(),
            NOW()
          )
          RETURNING id, content, created_at, user_id
        )
        SELECT
          i.id,
          i.content,
          i.created_at AS "createdAt",
          u.id AS "userId",
          u.name AS "userName"
        FROM inserted i
        INNER JOIN public.users u ON u.id = i.user_id
      `
    })

    const row = rows[0]
    if (!row) {
      return NextResponse.json({ error: t("transactions.saveMessageFailed") }, { status: 500 })
    }

    const message = {
      id: row.id,
      content: row.content,
      createdAt: row.createdAt,
      user: {
        id: row.userId,
        name: row.userName,
      },
    }

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    // Este é o catch de fora (o outro só cerca a leitura do corpo): é aqui que a data fechada vira
    // 423 com o cabeçalho, em vez de virar 500.
    const locked = respondDateClosed(error, t)
    if (locked) return locked
    console.error("Error creating transaction message:", error)
    return NextResponse.json({ error: t("transactions.saveMessageFailed") }, { status: 500 })
  }
}
