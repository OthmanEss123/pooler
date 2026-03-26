import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  FRONTEND_URL: Joi.string().default('http://localhost:3001'),

  DATABASE_URL: Joi.string().required(),
  DIRECT_URL: Joi.string().required(),

  CLICKHOUSE_URL: Joi.string().required(),
  CLICKHOUSE_USER: Joi.string().default('default'),
  CLICKHOUSE_PASSWORD: Joi.string().allow('').default(''),
  CLICKHOUSE_DB: Joi.string().default('pilot'),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),

  REDIS_URL: Joi.string().default('redis://localhost:6379'),
  ENCRYPTION_KEY: Joi.string().length(64).optional(),
  GRPC_PORT: Joi.number().port().default(50051),

  // AWS SES
  AWS_REGION: Joi.string().default('eu-west-1'),
  AWS_ACCESS_KEY_ID: Joi.string().optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional(),
  SES_CONFIG_SET: Joi.string().default('pilot-events'),
  SES_FROM_DEFAULT: Joi.string().default('noreply@pilot.local'),

  // SNS webhook
  SNS_TOPIC_ARN: Joi.string().optional(),

  APP_VERSION: Joi.string().default('1.0.0'),
});

export const envValidation = envValidationSchema;
