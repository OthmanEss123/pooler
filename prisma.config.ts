// prisma.config.ts
import { defineConfig } from 'prisma/config'

const args = new Set(process.argv.slice(2))
const shouldUseDirectUrl =
  process.env.DIRECT_URL &&
  (args.has('migrate') || args.has('db'))

export default defineConfig({
  datasource: {
    url:
      (shouldUseDirectUrl
        ? process.env.DIRECT_URL
        : process.env.DATABASE_URL) ?? 'postgresql://placeholder',
  },
})