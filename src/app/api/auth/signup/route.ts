import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma_new/client"
import { createSessionToken, COOKIE_NAME } from "@/lib/auth"
import {
  getInitialUserAccess,
  isActiveUser,
  normalizeEmail,
  PENDING_APPROVAL_PATH,
} from "@/lib/user-approval"
import { isPublicSignupEnabled } from "@/lib/public-signup"
import { isSetupComplete } from "@/lib/setup-check"
import { encodeSetupIdentity, setSetupIdentityCookie } from "@/lib/setup-identity"

export async function POST(request: Request) {
  const t = await getTranslations("api.auth")
  const firstAccess = !isSetupComplete()

  // Instância privada (já configurada): só o convite cria usuários.
  if (!firstAccess && !isPublicSignupEnabled()) {
    return NextResponse.json({ success: false, message: t("signupDisabled") }, { status: 403 })
  }

  try {
    const { name, email, password } = await request.json()
    const normalizedName = typeof name === "string" ? name.trim() : ""
    const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : ""

    if (!normalizedName || !normalizedEmail || !password) {
      return NextResponse.json(
        { success: false, message: t("allFieldsRequired") },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, message: t("passwordTooShort") },
        { status: 400 }
      )
    }

    // PRIMEIRO ACESSO (ainda sem banco): a conta criada aqui é a do administrador.
    // Guarda a identidade num cookie assinado e segue para o Setup Wizard, que a
    // usa para preencher o passo "Administrador" e criar o SUPERADMIN ao concluir.
    if (firstAccess) {
      const token = await encodeSetupIdentity({
        name: normalizedName,
        email: normalizedEmail,
        provider: "password",
        passwordHash: await bcrypt.hash(password, 10),
      })
      const response = NextResponse.json(
        { success: true, message: t("firstAccessContinue"), redirectTo: "/setup" },
        { status: 200 },
      )
      setSetupIdentityCookie(response, token)
      return response
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { status: true },
    })

    if (existingUser) {
      if (!isActiveUser(existingUser.status)) {
        return NextResponse.json(
          {
            success: true,
            message: t("pendingApprovalExisting"),
            redirectTo: PENDING_APPROVAL_PATH,
          },
          { status: 200 }
        )
      }

      return NextResponse.json(
        { success: false, message: t("emailAlreadyRegistered") },
        { status: 409 }
      )
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const initialAccess = getInitialUserAccess(normalizedEmail)

    const userCount = await prisma.user.count()
    const isFirstUser = userCount === 0

    const newUser = await prisma.user.create({
      data: {
        name: normalizedName,
        email: normalizedEmail,
        passwordHash: hashedPassword,
        role: isFirstUser ? "SUPERADMIN" : initialAccess.role,
        status: isFirstUser ? "ACTIVE" : initialAccess.status,
      },
    })

    const { initializeUserData } = await import("@/lib/user-init")
    await initializeUserData(prisma, newUser.id)

    if (!isActiveUser(newUser.status)) {
      return NextResponse.json(
        {
          success: true,
          message: t("signupReceived"),
          redirectTo: PENDING_APPROVAL_PATH,
        },
        { status: 201 }
      )
    }

    const token = await createSessionToken(newUser.id)

    const response = NextResponse.json(
      { success: true, message: t("signupSuccess") },
      { status: 201 }
    )

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    })

    return response
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { success: false, message: t("emailAlreadyRegistered") },
          { status: 409 }
        )
      }
    }

    console.error("[POST /api/auth/signup] error:", error)

    const tErrors = await getTranslations("api.errors")
    return NextResponse.json(
      { success: false, message: tErrors("internalError") },
      { status: 500 }
    )
  }
}
