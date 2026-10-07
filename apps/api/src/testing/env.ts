/**
 * Environment shared by every test. Test-only values: the local S3 gateway (compose `storage`) with
 * a separate bucket, and a fixed document key so encrypted fixtures are reproducible.
 */
export const TEST_ENV = {
  NODE_ENV: 'test',
  AUTH_OTP_SECRET: 'test-secret-test-secret-test-secret-00',
  STORAGE_ENDPOINT: 'http://localhost:9000',
  STORAGE_REGION: 'us-east-1',
  STORAGE_BUCKET_PRIVATE: 'sabeq-test',
  STORAGE_ACCESS_KEY_ID: 'sabeq-local',
  STORAGE_SECRET_ACCESS_KEY: 'sabeq-local-secret',
  STORAGE_FORCE_PATH_STYLE: 'true',
  DOCUMENTS_ENCRYPTION_KEYS: `test-1:${Buffer.alloc(32, 7).toString('base64')}`,
  DOCUMENTS_ENCRYPTION_ACTIVE_KEY: 'test-1',
} as const satisfies NodeJS.ProcessEnv;
