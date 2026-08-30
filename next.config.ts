import type { NextConfig } from "next";
// @ts-ignore
import withBundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  typescript: {
    // Prisma 7.x generated client has exports map without "types" condition,
    // which breaks Turbopack's bundler-mode TS resolution on Vercel.
    // Types are validated locally by IDE and tsc.
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ['@resvg/resvg-js', 'node-telegram-bot-api'],
  // O Setup Wizard aplica as migrações lendo prisma/migrations/*/migration.sql
  // em runtime (sem o CLI do Prisma). Sem isto a pasta não vai no bundle da
  // função na Vercel e o wizard não teria o que aplicar.
  outputFileTracingIncludes: {
    "/api/setup/configure": ["./prisma/migrations/**/*"],
    // As fontes do card são lidas do disco em runtime (satori não aceita
    // import de binário). Sem estas linhas os arquivos não vão no pacote da
    // função na Vercel e o card sairia sem negrito — ou nem sairia.
    "/api/telegram/webhook": ["./src/assets/card-fonts/**/*"],
    "/api/cron/tick": ["./src/assets/card-fonts/**/*"],
    "/api/advisor/chat": ["./src/assets/card-fonts/**/*"],
  },
};

const analyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default analyzer(withNextIntl(nextConfig));
