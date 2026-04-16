import * as Joi from 'joi';

export const envValidation = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production', 'staging')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  FRONTEND_URL: Joi.string().default('http://localhost:3001'),

  DATABASE_URL: Joi.string().required(),
  DIRECT_URL: Joi.string().required(),

  CLICKHOUSE_URL: Joi.string().allow('').optional(),
  CLICKHOUSE_USER: Joi.string().default('default'),
  CLICKHOUSE_PASSWORD: Joi.string().allow('').default(''),
  CLICKHOUSE_DB: Joi.string().default('pilot'),
  CLICKHOUSE_REQUEST_TIMEOUT_MS: Joi.number().integer().min(1000).default(5000),

  JWT_SECRET: Joi.string().min(64).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),

  REDIS_URL: Joi.string().required(),
  ENCRYPTION_KEY: Joi.string()
    .pattern(/^[a-fA-F0-9]{64}$/)
    .required(),
  QUEUE_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),

  METRICS_TOKEN: Joi.string().allow('').optional(),
  APP_VERSION: Joi.string().default('2.0.0'),

  STRIPE_SECRET_KEY: Joi.string().required(),
  STRIPE_WEBHOOK_SECRET: Joi.string().required(),
  STRIPE_STARTER_PRICE_ID: Joi.string().required(),
  STRIPE_GROWTH_PRICE_ID: Joi.string().required(),
  STRIPE_SCALE_PRICE_ID: Joi.string().required(),

  WOOCOMMERCE_WEBHOOK_SECRET: Joi.string().allow('').optional(),
  WORDPRESS_WEBHOOK_SECRET: Joi.string().allow('').optional(),

  GOOGLE_CLIENT_ID: Joi.string().allow('').optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').optional(),
  GOOGLE_ADS_DEVELOPER_TOKEN: Joi.string().allow('').optional(),
  GOOGLE_ADS_REDIRECT_URI: Joi.string().allow('').optional(),
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: Joi.string().allow('').optional(),
  GOOGLE_ADS_API_VERSION: Joi.string().default('v22'),

  ANTHROPIC_API_KEY: Joi.string().allow('').optional(),
});

export const envValidationSchema = envValidation;
