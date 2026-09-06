"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import {
  formatNumberValue,
  parseMonetaryInput,
  type MonetarySettings,
} from "@/lib/monetary"

interface MonetaryAmountInputProps {
  value: number | null
  onChange: (value: number | null) => void
  /** Define o formato: pt-BR para BRL, en-US para USD, de-DE para EUR. */
  settings: MonetarySettings
  id?: string
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
}

/**
 * Campo de valor no formato da MOEDA escolhida, não do idioma da interface. É proposital e está
 * na regra 4 do CLAUDE.md: quem usa BRL digita "10.000,00" mesmo com a interface em espanhol.
 *
 * Enquanto está em foco, o texto não é reformatado, senão o cursor pula a cada tecla.
 */
export function MonetaryAmountInput({
  value,
  onChange,
  settings,
  id,
  placeholder,
  disabled,
  ariaLabel,
}: MonetaryAmountInputProps) {
  const format = React.useCallback(
    (amount: number | null) =>
      amount === null ? "" : formatNumberValue(amount, undefined, settings),
    [settings],
  )

  const [text, setText] = React.useState(() => format(value))
  const [focused, setFocused] = React.useState(false)
  // Espelham o que já foi refletido em `text`, para reformatar em render (sem useEffect,
  // que dispararia um segundo render em cascata) quando `value` ou `settings` mudam por
  // fora enquanto o campo está sem foco. Ver "Adjusting state when a prop changes" nos
  // docs do React.
  const [syncedValue, setSyncedValue] = React.useState(value)
  const [syncedSettings, setSyncedSettings] = React.useState(settings)

  if (!focused && (value !== syncedValue || settings !== syncedSettings)) {
    setSyncedValue(value)
    setSyncedSettings(settings)
    setText(format(value))
  }

  return (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(event) => {
        setText(event.target.value)
        onChange(parseMonetaryInput(event.target.value, settings))
      }}
      onBlur={(event) => {
        setFocused(false)
        const parsed = parseMonetaryInput(event.target.value, settings)
        setText(format(parsed))
        onChange(parsed)
      }}
    />
  )
}
