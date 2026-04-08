import * as Joi from 'joi';

export const envValidation = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production', 'staging')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  FRONTEND_URL: Joi.string().default('http://localhost:3001'),

  DATABASE_URL: Joi.string().required(),
  DIRECT_URL: Joi.string().required(),

  CLICKHOUSE_URL: Joi.string().required(),
  CLICKHOUSE_USER: Joi.string().default('default'),
  CLICKHOUSE_PASSWORD: Joi.string().allow('').default(''),
  CLICKHOUSE_DB: Joi.string().default('pilot'),

  JWT_SECRET: Joi.string().min(64).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),

  REDIS_URL: Joi.string().required(),
  ENCRYPTION_KEY: Joi.string()
    .pattern(/^[a-fA-F0-9]{64}$/)
    .required(),
  QUEUE_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),

  GRPC_HOST: Joi.string().default('127.0.0.1'),
  GRPC_PORT: Joi.number().port().default(50051),
  GRPC_SHARED_SECRET: Joi.string().allow('').optional(),

  METRICS_TOKEN: Joi.string().allow('').optional(),
  APP_VERSION: Joi.string().default('2.0.0'),

  AWS_REGION: Joi.string().default('eu-west-1'),
  AWS_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
  SES_CONFIG_SET: Joi.string().allow('').optional(),
  SES_FROM_DEFAULT: Joi.string().default('noreply@pilot.local'),
  SNS_TOPIC_ARN: Joi.string().allow('').optional(),

  STRIPE_SECRET_KEY: Joi.string().required(),
  STRIPE_WEBHOOK_SECRET: Joi.string().required(),
  STRIPE_STARTER_PRICE_ID: Joi.string().required(),
  STRIPE_GROWTH_PRICE_ID: Joi.string().required(),
  STRIPE_SCALE_PRICE_ID: Joi.string().required(),

  SHOPIFY_API_KEY: Joi.string().allow('').optional(),
  SHOPIFY_API_SECRET: Joi.string().allow('').optional(),
  SHOPIFY_WEBHOOK_SECRET: Joi.string().allow('').optional(),
  SHOPIFY_REDIRECT_URI: Joi.string().allow('').optional(),

  WOOCOMMERCE_WEBHOOK_SECRET: Joi.string().allow('').optional(),

  GOOGLE_CLIENT_ID: Joi.string().allow('').optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').optional(),
  GOOGLE_ADS_DEVELOPER_TOKEN: Joi.string().allow('').optional(),
  GOOGLE_ADS_REDIRECT_URI: Joi.string().allow('').optional(),
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: Joi.string().allow('').optional(),
  GOOGLE_ADS_API_VERSION: Joi.string().default('v22'),

  FACEBOOK_APP_ID: Joi.string().allow('').optional(),
  FACEBOOK_APP_SECRET: Joi.string().allow('').optional(),
  FACEBOOK_REDIRECT_URI: Joi.string().allow('').optional(),

  ANTHROPIC_API_KEY: Joi.string().allow('').optional(),
  NARRATIVE_AGENT_URL: Joi.string().allow('').optional(),
  FORECAST_AGENT_URL: Joi.string().allow('').optional(),

  OPENAI_API_KEY: Joi.string().allow('').optional(),
});

export const envValidationSchema = envValidation;
