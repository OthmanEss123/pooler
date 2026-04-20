// prisma.config.ts
import { defineConfig } from 'prisma/config'
import './src/config/load-env'

const args = new Set(process.argv.slice(2))
const shouldUseDirectUrl =
  Boolean(process.env.DIRECT_URL) &&
  (args.has('migrate') || args.has('db'))

export default defineConfig({
  datasource: {
    url:
      (shouldUseDirectUrl
        ? process.env.DIRECT_URL
        : process.env.DATABASE_URL) ?? 'postgresql://placeholder',
    shadowDatabaseUrl: undefined,
  },
})
