// src/db.ts
import knex from 'knex';
import knexConfig from '../knexfile.ts';

type Environment = 'development' | 'production';

// normalize common test value 'test' to 'development' (use same db for tests and dev)
const envRaw = process.env.NODE_ENV ?? 'development';
const environment = (envRaw === 'test' ? 'development' : envRaw) as Environment;

const db = knex(knexConfig[environment as keyof typeof knexConfig]); // Type assertion to ensure TypeScript knows the key exists

export default db; // export knex database client