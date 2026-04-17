export default () => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001',
    version: process.env.APP_VERSION ?? '2.0.0',
  },

  database: {
    url: process.env.DATABASE_URL ?? '',
    directUrl: process.env.DIRECT_URL ?? '',
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  },

  redis: {
    url: process.env.REDIS_URL ?? '',
  },

  clickhouse: {
    url: process.env.CLICKHOUSE_URL ?? '',
    user: process.env.CLICKHOUSE_USER ?? '',
    password: process.env.CLICKHOUSE_PASSWORD ?? '',
    database: process.env.CLICKHOUSE_DB ?? '',
    requestTimeoutMs: Number(process.env.CLICKHOUSE_REQUEST_TIMEOUT_MS ?? 5000),
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY ?? '',
  },

  monitoring: {
    metricsToken: process.env.METRICS_TOKEN ?? '',
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    starterPriceId: process.env.STRIPE_STARTER_PRICE_ID ?? '',
    growthPriceId: process.env.STRIPE_GROWTH_PRICE_ID ?? '',
    scalePriceId: process.env.STRIPE_SCALE_PRICE_ID ?? '',
  },

  agents: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    groqApiKey: process.env.GROQ_API_KEY ?? '',
    groqModel: process.env.GROQ_MODEL ?? 'llama3-70b-8192',
  },
});
