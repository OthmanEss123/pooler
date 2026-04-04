import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
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

  QUEUE_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  REDIS_URL: Joi.string().default('redis://localhost:6379'),
  ENCRYPTION_KEY: Joi.alternatives().conditional('NODE_ENV', {
    is: 'test',
    then: Joi.string()
      .pattern(/^[a-fA-F0-9]{64}$/)
      .optional(),
    otherwise: Joi.string()
      .pattern(/^[a-fA-F0-9]{64}$/)
      .required(),
  }),
  METRICS_TOKEN: Joi.string().min(16).optional(),
  GRPC_HOST: Joi.string().default('127.0.0.1'),
  GRPC_PORT: Joi.number().port().default(50051),
  GRPC_SHARED_SECRET: Joi.string().allow('').optional(),

  AWS_REGION: Joi.string().default('eu-west-1'),
  AWS_ACCESS_KEY_ID: Joi.string().optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional(),
  SES_CONFIG_SET: Joi.string().default('pilot-events'),
  SES_FROM_DEFAULT: Joi.string().default('noreply@pilot.local'),
  NARRATIVE_AGENT_URL: Joi.string().default('http://localhost:8001'),

  SNS_TOPIC_ARN: Joi.string().optional(),
  WOOCOMMERCE_WEBHOOK_SECRET: Joi.string().allow('').optional(),
  OPENAI_API_KEY: Joi.string().allow('').optional(),

  APP_VERSION: Joi.string().default('1.0.0'),
});

export const envValidation = envValidationSchema;
