"use client"

import { useTranslations } from "next-intl"

import { resolveAccountLabel } from "@/i18n/chart-labels"
import { AccountCard } from "./account-card"
import { AddAccountCard } from "./add-account-card"
import { SectionCardsGrid } from "@/components/section-cards-grid"
import type { AccountWithBalance } from "../types"

interface AccountsClientProps {
    initialAccounts: AccountWithBalance[]
}

export function AccountsClient({ initialAccounts }: AccountsClientProps) {
    // Raiz do next-intl: os helpers de rotulo do plano de contas usam a chave completa.
    const tRoot = useTranslations()

    return (
        <SectionCardsGrid className="lg:grid-cols-3 xl:grid-cols-3">
            {initialAccounts.map((account) => (
                <AccountCard
                    key={account.id}
                    name={resolveAccountLabel(tRoot, account)}
                    type={account.type}
                    currentBalance={account.currentBalance}
                    initialBalance={account.initialBalance}
                    legacyDate={account.legacyDate}
                />
            ))}
            <AddAccountCard />
        </SectionCardsGrid>
    )
}
