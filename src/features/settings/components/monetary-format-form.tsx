"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
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
import {
  createMonetaryFormatter,
  defaultMonetarySettings,
  resolveMonetarySettings,
  type MonetarySettings,
} from "@/lib/monetary"
import { useMonetaryPreferences } from "@/contexts/monetary-preferences-context"
import { useTranslations } from "next-intl"

const monetaryFormatSchema = z.object({
  currency: z.enum(["BRL", "USD", "EUR"]),
  displayMode: z.enum(["symbol", "code", "number"]),
  negativeFormat: z.enum(["parentheses", "minus"]),
})

type MonetaryFormatValues = z.infer<typeof monetaryFormatSchema>

const previewValues = {
  positive: 1234.56,
  negative: -1234.56,
}

interface MonetaryFormatFormProps {
  initialValues?: MonetarySettings
}

export function MonetaryFormatForm({
  initialValues = defaultMonetarySettings,
}: MonetaryFormatFormProps) {
  const { preferences, loaded, savePreferences } = useMonetaryPreferences()
  const resolvedInitialValues = React.useMemo(
    () => resolveMonetarySettings(initialValues),
    [initialValues],
  )

  if (!loaded) {
    return (
      <LoadedMonetaryFormatForm
        key={`initial-${resolvedInitialValues.currency}-${resolvedInitialValues.displayMode}-${resolvedInitialValues.negativeFormat}`}
        initialValues={resolvedInitialValues}
        savePreferences={savePreferences}
      />
    )
  }

  return (
    <LoadedMonetaryFormatForm
      key={`${preferences.currency}-${preferences.displayMode}-${preferences.negativeFormat}`}
      initialValues={preferences}
      savePreferences={savePreferences}
    />
  )
}

interface LoadedMonetaryFormatFormProps {
  initialValues: MonetaryFormatValues
  savePreferences: (
    partial: Partial<MonetaryFormatValues>,
  ) => Promise<{ success: boolean; data: MonetaryFormatValues }>
}

function LoadedMonetaryFormatForm({
  initialValues,
  savePreferences,
}: LoadedMonetaryFormatFormProps) {
  const t = useTranslations("settings.monetary")

  const form = useForm<MonetaryFormatValues>({
    resolver: zodResolver(monetaryFormatSchema),
    defaultValues: initialValues,
  })

  const watched = useWatch({
    control: form.control,
  })
  const previewFormatter = React.useMemo(
    () => createMonetaryFormatter(watched ?? defaultMonetarySettings),
    [watched],
  )

  async function onSubmit(data: MonetaryFormatValues) {
    const result = await savePreferences(data)

    form.reset(result.data)

    if (result.success) {
      toast.success(t("success"))
      return
    }

    toast.error(t("error"))
  }

  function handleCancel() {
    form.reset(initialValues)
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
              <CardTitle className="text-lg">{t("globalPrefs")}</CardTitle>
              <CardDescription>
                {t("globalPrefsDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("currency")}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={form.formState.isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="cursor-pointer">
                          <SelectValue placeholder={t("selectCurrency")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="BRL">{t("brl")}</SelectItem>
                        <SelectItem value="USD">{t("usd")}</SelectItem>
                        <SelectItem value="EUR">{t("eur")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t("currencyDesc")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="displayMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("displayMode")}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={form.formState.isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="cursor-pointer">
                          <SelectValue placeholder={t("selectFormat")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="symbol">{t("symbol")}</SelectItem>
                        <SelectItem value="code">{t("code")}</SelectItem>
                        <SelectItem value="number">{t("number")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t("displayModeDesc")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="negativeFormat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("negativeFormat")}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={form.formState.isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="cursor-pointer">
                          <SelectValue placeholder={t("selectFormat")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="parentheses">{t("parentheses")}</SelectItem>
                        <SelectItem value="minus">{t("minus")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t("negativeFormatDesc")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("previewTitle")}</CardTitle>
              <CardDescription>
                {t("previewDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="text-sm text-muted-foreground">{t("posValue")}</div>
                <div className="mt-2 font-display text-2xl font-semibold text-positive">
                  {previewFormatter.formatMonetaryValue(previewValues.positive)}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="text-sm text-muted-foreground">{t("negValue")}</div>
                <div className="mt-2 font-display text-2xl font-semibold text-destructive">
                  {previewFormatter.formatMonetaryValue(previewValues.negative)}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              className="cursor-pointer"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? t("saving") : t("save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={handleCancel}
              disabled={form.formState.isSubmitting}
            >
              {t("cancel")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
