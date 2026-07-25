"use client"
import { useTranslations } from "next-intl";
import { useTelegramConnection } from "../hooks/useTelegramConnection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Send } from "lucide-react";

export function TelegramConnect() {
  const t = useTranslations("telegram.connect");
  const { status, loading, connect, disconnect } = useTelegramConnection();

  if (loading) return null;

  const isConfigured = status?.configured !== false;

  return (
    <Card className="border-0 shadow-none border-b rounded-none mb-6">
      <CardHeader className="px-0">
        <div className="flex items-center gap-2">
          <Send className="h-5 w-5 text-info" />
          <CardTitle>{t("title")}</CardTitle>
        </div>
        <CardDescription>
          {t("description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {!isConfigured ? (
          <div className="rounded-md bg-warning/10 p-3 text-sm text-warning">
            {t.rich("notConfigured", { code: (chunks) => <code className="font-mono text-xs">{chunks}</code> })}
          </div>
        ) : status?.connected ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md border inline-block">
              {t("connectedAs")} <span className="font-semibold text-foreground">@{status.username || t("defaultUsername")}</span>
            </p>
            <div>
                <Button type="button" variant="destructive" onClick={disconnect} size="sm">{t("disconnect")}</Button>
            </div>
          </div>
        ) : (
          <Button type="button" onClick={connect} className="bg-[#2AABEE] text-white hover:bg-[#229ED9]">
            {t("connectCta")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
