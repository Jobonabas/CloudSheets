// backend/src/db.ts
import knex from 'knex';
import knexConfig from '../knexfile.ts';

type Environment = 'development' | 'testing' | 'production';
const environment = (process.env.NODE_ENV as Environment) || 'development'; //default to dev if nothing set in .env

const db = knex(knexConfig[environment as keyof typeof knexConfig]); // Type assertion to ensure TypeScript knows the key exists

export default db; // export knex database client

