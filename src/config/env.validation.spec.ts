import { validate } from './env.validation';

describe('validate (environment variables)', () => {
  const requiredConfig = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_SECRET: 'super-secret',
    JWT_EXPIRES_IN: '15m',
    REFRESH_TOKEN_EXPIRES_IN: '7d',
  };

  it('passes with only the required vars set', () => {
    expect(() => validate({ ...requiredConfig })).not.toThrow();
  });

  it('throws when a required var is missing', () => {
    const { JWT_SECRET: _JWT_SECRET, ...rest } = requiredConfig;

    expect(() => validate({ ...rest })).toThrow(/Environment validation failed/);
  });

  it('throws when NODE_ENV is set to an invalid value', () => {
    expect(() =>
      validate({ ...requiredConfig, NODE_ENV: 'staging' }),
    ).toThrow(/Environment validation failed/);
  });

  it('accepts a valid NODE_ENV and numeric PORT', () => {
    expect(() =>
      validate({ ...requiredConfig, NODE_ENV: 'production', PORT: '4000' }),
    ).not.toThrow();
  });

  // Regression guard: these must stay optional. MediaService reads them lazily
  // specifically so the app can boot without real AWS credentials — making
  // them required here would silently reintroduce that whole-app boot crash.
  it('does not require AWS_* or PUBLIC_SITE_URL vars', () => {
    expect(() => validate({ ...requiredConfig })).not.toThrow();

    const result = validate({ ...requiredConfig });
    expect(result.AWS_REGION).toBeUndefined();
    expect(result.PUBLIC_SITE_URL).toBeUndefined();
  });

  it('does not require CORS_ORIGINS or THROTTLE_* vars', () => {
    expect(() => validate({ ...requiredConfig })).not.toThrow();
  });
});
