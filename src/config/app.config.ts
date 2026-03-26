export default () => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001',
    version: process.env.APP_VERSION ?? '1.0.0',
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
  },

  grpc: {
    port: Number(process.env.GRPC_PORT ?? 50051),
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY ?? '',
  },
});
