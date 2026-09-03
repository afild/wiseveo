import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Fuso FIXO, e não é enfeite: as regras de data do fechamento existem para não escorregar um
    // dia a oeste de Greenwich, e em UTC (que é onde CI e Vercel rodam) o jeito errado e o certo
    // dão o mesmo resultado — o teste passaria sem provar nada. America/New_York é o fuso de quem
    // usa o sistema, com horário de verão, então cobre UTC-4 e UTC-5.
    env: { TZ: "America/New_York" },
  },
})
