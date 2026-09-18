import * as Joi from 'joi';

const frontendOriginPattern = /^https?:\/\/[^,\s]+(,\s*https?:\/\/[^,\s]+)*$/;

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  MOCK_MODE: Joi.boolean().truthy('true').falsy('false').default(false),
  PORT: Joi.number().port().default(4000),
  APP_NAME: Joi.string().default('template-saas-backend'),
  API_PREFIX: Joi.string().default('api'),
  SWAGGER_PATH: Joi.string().default('docs'),
  TRUST_PROXY: Joi.number().integer().min(0).default(0),
  FRONTEND_ORIGIN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().pattern(frontendOriginPattern).required(),
    otherwise: Joi.string().pattern(frontendOriginPattern).optional().allow(''),
  }),  JWT_ACCESS_SECRET: Joi.when('MOCK_MODE', {
    is: true,
    then: Joi.string().default('change_me_access'),
    otherwise: Joi.string().required(),
  }),
  JWT_REFRESH_SECRET: Joi.when('MOCK_MODE', {
    is: true,
    then: Joi.string().default('change_me_refresh'),
    otherwise: Joi.string().required(),
  }),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  DATABASE_STARTUP_MODE: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('fail-fast', 'warn').default('fail-fast'),
    otherwise: Joi.string().valid('fail-fast', 'warn').default('warn'),
  }),
  DATABASE_URL: Joi.when('MOCK_MODE', {
    is: true,
    then: Joi.string().optional(),
    otherwise: Joi.string()
      .uri({ scheme: ['postgresql'] })
      .required(),  }),
  REDIS_HOST: Joi.when('MOCK_MODE', {
    is: true,
    then: Joi.string().optional(),
    otherwise: Joi.string().required(),
  }),
  REDIS_PORT: Joi.when('MOCK_MODE', {
    is: true,
    then: Joi.number().port().optional(),
    otherwise: Joi.number().port().required(),
  }),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  CACHE_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  CACHE_KEY_PREFIX: Joi.string().default('template-saas'),
  CACHE_CONNECT_TIMEOUT_MS: Joi.number().integer().min(100).default(2000),
  CACHE_CATEGORY_TREE_TTL_MS: Joi.number().integer().min(1000).default(3600000),
  CACHE_TEMPLATE_LIST_TTL_MS: Joi.number().integer().min(1000).default(300000),
  THROTTLE_DEFAULT_LIMIT: Joi.number().integer().min(1).default(120),
  THROTTLE_DEFAULT_TTL_MS: Joi.number().integer().min(1000).default(60000),
  THROTTLE_DEFAULT_BLOCK_DURATION_MS: Joi.number().integer().min(0).default(120000),
  THROTTLE_AUTH_LOGIN_LIMIT: Joi.number().integer().min(1).default(10),
  THROTTLE_AUTH_LOGIN_TTL_MS: Joi.number().integer().min(1000).default(60000),
  THROTTLE_AUTH_LOGIN_BLOCK_DURATION_MS: Joi.number().integer().min(0).default(300000),
  THROTTLE_AUTH_REGISTER_LIMIT: Joi.number().integer().min(1).default(5),
  THROTTLE_AUTH_REGISTER_TTL_MS: Joi.number().integer().min(1000).default(60000),
  THROTTLE_AUTH_REGISTER_BLOCK_DURATION_MS: Joi.number().integer().min(0).default(600000),
  THROTTLE_AUTH_REFRESH_LIMIT: Joi.number().integer().min(1).default(20),
  THROTTLE_AUTH_REFRESH_TTL_MS: Joi.number().integer().min(1000).default(60000),
  THROTTLE_AUTH_REFRESH_BLOCK_DURATION_MS: Joi.number().integer().min(0).default(300000),
  BCRYPT_SALT_ROUNDS: Joi.number().integer().min(10).max(15).default(12),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('warn'),
  ENABLE_REQUEST_LOGS: Joi.boolean().truthy('true').falsy('false').default(false),
});

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const { error, value } = envSchema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
    stripUnknown: true,
  });

  if (error) {
    throw new Error(`Environment validation error: ${error.message}`);
  }

  return value;
}
