import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('allows mock mode without required JWT, DB, and Redis values', () => {
    expect(() => validateEnv({ MOCK_MODE: 'true' })).not.toThrow();
    expect(validateEnv({ MOCK_MODE: 'true' })).toMatchObject({
      MOCK_MODE: true,
      JWT_ACCESS_SECRET: 'change_me_access',
      JWT_REFRESH_SECRET: 'change_me_refresh',
    });
  });
});
