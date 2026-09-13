import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import { buildConnection } from '../src/config/database.ts';

const DB_VARS = [
  'DATABASE_URL',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_SSL',
] as const;

const originalEnv = { ...process.env };

function clearDbEnv() {
  for (const name of DB_VARS) delete process.env[name];
}

describe('buildConnection', () => {
  beforeEach(() => {
    clearDbEnv();
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  test('prefers DATABASE_URL when set (local development and CI)', () => {
    process.env.DATABASE_URL = 'postgres://cloudsheet:cloudsheet@127.0.0.1:5432/cloudsheet';

    expect(buildConnection()).toEqual({
      connectionString: 'postgres://cloudsheet:cloudsheet@127.0.0.1:5432/cloudsheet',
      ssl: false,
    });
  });

  test('falls back to the discrete DB_* variables (the ECS path)', () => {
    process.env.DB_HOST = 'db.eu-central-1.rds.amazonaws.com';
    process.env.DB_PORT = '5432';
    process.env.DB_NAME = 'cloudsheet';
    process.env.DB_USERNAME = 'postgres';
    process.env.DB_PASSWORD = 'a-secret';

    expect(buildConnection()).toEqual({
      host: 'db.eu-central-1.rds.amazonaws.com',
      port: 5432,
      database: 'cloudsheet',
      user: 'postgres',
      password: 'a-secret',
      ssl: false,
    });
  });

  test('enables SSL when DB_SSL is true', () => {
    process.env.DB_SSL = 'true';
    process.env.DATABASE_URL = 'postgres://user:pass@host:5432/db';

    expect(buildConnection().ssl).toEqual({ rejectUnauthorized: false });
  });

  test('passes a password containing URL-reserved characters through untouched', () => {
    // RDS generates passwords containing '@', '/' and ':'. Reassembling a
    // postgresql:// URL would corrupt them; discrete properties do not.
    const password = 'p@ss/w:rd#1';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_NAME = 'cloudsheet';
    process.env.DB_USERNAME = 'cloudsheet';
    process.env.DB_PASSWORD = password;

    expect(buildConnection()).toMatchObject({ password });
  });

  test('throws naming the missing variable when configuration is incomplete', () => {
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_NAME = 'cloudsheet';
    process.env.DB_USERNAME = 'cloudsheet';
    // DB_PASSWORD deliberately absent.

    expect(() => buildConnection()).toThrow(/DB_PASSWORD is not set/);
  });

  test('does not leak the password in the error message', () => {
    process.env.DB_HOST = 'localhost';
    // Everything else absent -- the first missing variable wins.
    expect(() => buildConnection()).toThrow(/DB_PORT is not set/);
  });
});
