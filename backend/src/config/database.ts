// Database connection configuration.
//
// Two shapes are supported, in this order:
//
//   1. DATABASE_URL  -- local development (docker-compose, .env) and CI, where a
//      single connection string is the most convenient thing to set.
//   2. Discrete DB_* variables -- production on ECS, where DB_USERNAME and
//      DB_PASSWORD are injected by the ECS agent from SSM Parameter Store and the
//      rest arrive as ordinary environment variables.
//
// Discrete properties are deliberately NOT reassembled into a URL: RDS generates
// passwords containing characters like '@', '/' and ':' which silently corrupt a
// postgresql://user:pass@host/db string unless every component is percent-encoded.
// node-postgres accepts the parts directly, so there is nothing to encode.

export interface ConnectionStringConfig {
  connectionString: string;
  ssl: SslConfig;
}

export interface DiscreteConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: SslConfig;
}

type SslConfig = { rejectUnauthorized: boolean } | false;

export type DatabaseConnection = ConnectionStringConfig | DiscreteConnectionConfig;

function sslConfig(): SslConfig {
  return process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Name the variable but never the value -- this message reaches the logs.
    throw new Error(
      `Database configuration is incomplete: ${name} is not set. ` +
        'Set DATABASE_URL, or the full set DB_HOST, DB_PORT, DB_NAME, DB_USERNAME, DB_PASSWORD.',
    );
  }
  return value;
}

export function buildConnection(): DatabaseConnection {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig(),
    };
  }

  return {
    host: requireEnv('DB_HOST'),
    port: Number(requireEnv('DB_PORT')),
    database: requireEnv('DB_NAME'),
    user: requireEnv('DB_USERNAME'),
    password: requireEnv('DB_PASSWORD'),
    ssl: sslConfig(),
  };
}
