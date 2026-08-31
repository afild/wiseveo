"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import * as React from "react"
import { TelegramConnect } from "@/features/telegram/components/TelegramConnect"
import { useTranslations } from "next-intl"
import { withDemoDisplayIdentity } from "@/lib/demo-identity"

export function AccountForm() {
  const t = useTranslations("settings.account")

  const accountFormSchema = z.object({
    firstName: z.string().min(1, t("firstNameReq")),
    lastName: z.string().min(1, t("lastNameReq")),
    email: z.string().email(t("emailReq")),
    username: z.string().min(3, t("usernameReq")),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
  })

  type AccountFormValues = z.infer<typeof accountFormSchema>
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      username: "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  })

  React.useEffect(() => {
    async function loadAccount() {
      try {
        const res = await fetch("/api/user/profile") // Reutiliza a rota de perfil para carregar nome e email
        const data = await res.json()
        if (data.success && data.data) {
          const user = data.data

          // D6: mesmo tratamento do profile-form — nome pré-preenchido com a marca na demo
          // (não tem constraint de unicidade), e-mail/username seguem os reais (editável +
          // `email` é @unique: pré-preencher com demo@wiseveo.com faria um Save sem edição
          // colidir com a vitrine).
          const displayName = withDemoDisplayIdentity({ name: user.name }).name
          const nameParts = (displayName || "").split(" ")
          const firstName = nameParts[0] || ""
          const lastName = nameParts.slice(1).join(" ")

          form.reset({
            firstName,
            lastName,
            email: user.email || "",
            username: user.email.split("@")[0], // Fallback username
            currentPassword: "",
            newPassword: "",
            confirmPassword: "",
          })
        }
      } catch (error) {
        console.error("Erro ao carregar dados da conta:", error)
      }
    }
    loadAccount()
  }, [form])

  async function onSubmit(data: AccountFormValues) {
    if (data.newPassword && data.newPassword !== data.confirmPassword) {
      toast.error(t("passwordMismatch"))
      return
    }

    try {
      const res = await fetch("/api/user/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      const responseData = await res.json()

      if (res.ok) {
        toast.success(t("success"))
        form.setValue("currentPassword", "")
        form.setValue("newPassword", "")
        form.setValue("confirmPassword", "")
      } else {
        toast.error(responseData.message || t("error"))
      }
    } catch (error) {
      toast.error(t("connError"))
    }
  }

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">
            {t("description")}
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card className="border-0 shadow-none border-b rounded-none mb-6">
              <CardHeader className="px-0">
                <CardTitle>{t("accessDataTitle")}</CardTitle>
                <CardDescription>
                  {t("accessDataDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-0">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("firstName")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("firstNamePl")} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("lastName")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("lastNamePl")} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("email")}</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder={t("emailPl")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("username")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("usernamePl")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none border-b rounded-none mb-6">
              <CardHeader className="px-0">
                <CardTitle>{t("changePassword")}</CardTitle>
                <CardDescription>
                  {t("changePasswordDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-0">
                <FormField
                  control={form.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("currentPassword")}</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder={t("currentPasswordPl")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("newPassword")}</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder={t("newPasswordPl")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("confirmPassword")}</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder={t("confirmPasswordPl")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <TelegramConnect />

            <Card className="border-0 shadow-none mb-6 bg-destructive/5 rounded-xl border-destructive/20 border p-2">
              <CardHeader className="px-4">
                <CardTitle className="text-destructive">{t("dangerZone")}</CardTitle>
                <CardDescription>
                  {t("dangerZoneDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-4 pb-4">
                <Separator className="bg-destructive/10" />
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-destructive">{t("deleteAccount")}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t("deleteAccountDesc")}
                    </p>
                  </div>
                  <Button variant="destructive" type="button" className="cursor-pointer font-semibold shadow-sm">
                    {t("deleteAccount")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="flex space-x-2 pt-4">
              <Button type="submit" className="cursor-pointer">{t("save")}</Button>
              <Button variant="outline" type="reset" className="cursor-pointer">{t("cancel")}</Button>
            </div>
          </form>
        </Form>
      </div>
  )
}
