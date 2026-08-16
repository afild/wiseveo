import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_LOCALE, LOCALES, LOCALE_META } from "../src/i18n/config"
import {
  INSTALL_LOCALE_ENV,
  getInstallDefaultLocale,
  resolveLocaleOrInstallDefault,
} from "../src/i18n/install-locale"

/**
 * Padrão de idioma da plataforma:
 *   cookie NEXT_LOCALE → env WISEVEO_DEFAULT_LOCALE (escolha do Setup Wizard) → en-US
 * e ordem única de exibição dos idiomas (alfabética pelo nome nativo).
 */
describe("idioma padrão global", () => {
  it("é en-US", () => {
    expect(DEFAULT_LOCALE).toBe("en-US")
  })

  it("LOCALES está em ordem alfabética pelo rótulo nativo (English → Español → Português)", () => {
    const labels = LOCALES.map((code) => LOCALE_META[code].label)
    const sorted = [...labels].sort((a, b) => a.localeCompare(b, "en"))
    expect(labels).toEqual(sorted)
    expect(LOCALES[0]).toBe("en-US")
  })
})

describe("idioma da instalação (env WISEVEO_DEFAULT_LOCALE)", () => {
  const original = process.env[INSTALL_LOCALE_ENV]

  beforeEach(() => {
    delete process.env[INSTALL_LOCALE_ENV]
  })

  afterEach(() => {
    if (original === undefined) delete process.env[INSTALL_LOCALE_ENV]
    else process.env[INSTALL_LOCALE_ENV] = original
  })

  it("sem env → padrão global en-US", () => {
    expect(getInstallDefaultLocale()).toBe("en-US")
  })

  it("env válida → idioma escolhido no setup", () => {
    process.env[INSTALL_LOCALE_ENV] = "es-419"
    expect(getInstallDefaultLocale()).toBe("es-419")
  })

  it("env inválida → padrão global en-US", () => {
    process.env[INSTALL_LOCALE_ENV] = "xx"
    expect(getInstallDefaultLocale()).toBe("en-US")
  })

  it("resolveLocaleOrInstallDefault: valor válido vence a env", () => {
    process.env[INSTALL_LOCALE_ENV] = "es-419"
    expect(resolveLocaleOrInstallDefault("pt-BR")).toBe("pt-BR")
  })

  it("resolveLocaleOrInstallDefault: valor ausente/inválido cai na env", () => {
    process.env[INSTALL_LOCALE_ENV] = "pt-BR"
    expect(resolveLocaleOrInstallDefault(undefined)).toBe("pt-BR")
    expect(resolveLocaleOrInstallDefault("fr-FR")).toBe("pt-BR")
  })
})
