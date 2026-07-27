"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useTranslations } from "next-intl"
import { resolveAccountLabel } from "@/i18n/chart-labels"
import type {
  QuickPaymentOptions,
  QuickPaymentSettings,
} from "../services/user-settings-service"

type GeneralSettingsValues = {
  defaultAccountId: string
  defaultStatusCode: string
}

interface GeneralFormProps {
  initialQuickPaymentSettings: QuickPaymentSettings
  quickPaymentOptions: QuickPaymentOptions
}

function buildFormValues(
  initialQuickPaymentSettings: QuickPaymentSettings,
  quickPaymentOptions: QuickPaymentOptions,
): GeneralSettingsValues {
  const hasSavedAccount = quickPaymentOptions.accounts.some(
    (account) => account.id === initialQuickPaymentSettings.defaultAccountId,
  )
  const hasSavedStatus = quickPaymentOptions.statuses.some(
    (status) => status.code === initialQuickPaymentSettings.defaultStatusCode,
  )

  return {
    defaultAccountId:
      initialQuickPaymentSettings.defaultAccountId !== null && hasSavedAccount
        ? String(initialQuickPaymentSettings.defaultAccountId)
        : "",
    defaultStatusCode:
      initialQuickPaymentSettings.defaultStatusCode !== null && hasSavedStatus
        ? String(initialQuickPaymentSettings.defaultStatusCode)
        : "",
  }
}

function hasUnavailableQuickPaymentConfig(
  initialQuickPaymentSettings: QuickPaymentSettings,
  quickPaymentOptions: QuickPaymentOptions,
) {
  const missingAccount =
    initialQuickPaymentSettings.defaultAccountId !== null &&
    !quickPaymentOptions.accounts.some(
      (account) => account.id === initialQuickPaymentSettings.defaultAccountId,
    )
  const missingStatus =
    initialQuickPaymentSettings.defaultStatusCode !== null &&
    !quickPaymentOptions.statuses.some(
      (status) => status.code === initialQuickPaymentSettings.defaultStatusCode,
    )

  return missingAccount || missingStatus
}

export function GeneralForm({
  initialQuickPaymentSettings,
  quickPaymentOptions,
}: GeneralFormProps) {
  const t = useTranslations("settings.general")
  // Raiz do next-intl: os helpers de rotulo do plano de contas usam a chave completa.
  const tRoot = useTranslations()

  const generalSettingsSchema = z.object({
    defaultAccountId: z.string().min(1, t("defaultAccountReq")),
    defaultStatusCode: z.string().min(1, t("defaultStatusReq")),
  })

  const initialValues = React.useMemo(
    () =>
      buildFormValues(initialQuickPaymentSettings, quickPaymentOptions),
    [initialQuickPaymentSettings, quickPaymentOptions],
  )
  const [persistedValues, setPersistedValues] =
    React.useState<GeneralSettingsValues>(initialValues)
  const [hasUnavailableConfig, setHasUnavailableConfig] = React.useState(
    hasUnavailableQuickPaymentConfig(
      initialQuickPaymentSettings,
      quickPaymentOptions,
    ),
  )

  const form = useForm<GeneralSettingsValues>({
    resolver: zodResolver(generalSettingsSchema),
    defaultValues: initialValues,
  })

  React.useEffect(() => {
    setPersistedValues(initialValues)
    setHasUnavailableConfig(
      hasUnavailableQuickPaymentConfig(
        initialQuickPaymentSettings,
        quickPaymentOptions,
      ),
    )
    form.reset(initialValues)
  }, [
    form,
    initialQuickPaymentSettings,
    initialValues,
    quickPaymentOptions,
  ])

  const hasAvailableAccounts = quickPaymentOptions.accounts.length > 0
  const hasAvailableStatuses = quickPaymentOptions.statuses.length > 0
  const canSave = hasAvailableAccounts && hasAvailableStatuses

  async function onSubmit(values: GeneralSettingsValues) {
    try {
      const response = await fetch("/api/user/general-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultAccountId: Number(values.defaultAccountId),
          defaultStatusCode: Number(values.defaultStatusCode),
        }),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.success) {
        throw new Error(
          payload?.message ?? t("error")
        )
      }

      const nextValues = buildFormValues(payload.data, quickPaymentOptions)
      setPersistedValues(nextValues)
      setHasUnavailableConfig(false)
      form.reset(nextValues)
      toast.success(t("success"))
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("error")

      toast.error(message)
    }
  }

  function handleCancel() {
    form.reset(persistedValues)
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
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("defaultQuickPayment")}</CardTitle>
              <CardDescription>
                {t("defaultQuickPaymentDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!canSave && (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  {t("unavailableFeatures")}
                </div>
              )}

              {hasUnavailableConfig && (
                <div className="rounded-lg border border-dashed border-destructive/30 bg-destructive/5 p-4 text-sm text-muted-foreground">
                  {t("invalidConfig")}
                </div>
              )}

              <FormField
                control={form.control}
                name="defaultAccountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("defaultAccount")}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!hasAvailableAccounts || form.formState.isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="cursor-pointer">
                          <SelectValue placeholder={t("selectDefaultAccount")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {quickPaymentOptions.accounts.map((account) => (
                          <SelectItem
                            key={account.id}
                            value={String(account.id)}
                          >
                            {resolveAccountLabel(tRoot, account)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t("defaultAccountDesc")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="defaultStatusCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("defaultStatus")}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!hasAvailableStatuses || form.formState.isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="cursor-pointer">
                          <SelectValue placeholder={t("selectDefaultStatus")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {quickPaymentOptions.statuses.map((status) => (
                          <SelectItem
                            key={status.code}
                            value={String(status.code)}
                          >
                            {status.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t("defaultStatusDesc")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={form.formState.isSubmitting}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!canSave || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
