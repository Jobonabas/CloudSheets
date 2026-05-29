import 'ts-node/register';
//env File for Database Variable
import dotenv from 'dotenv';
dotenv.config();
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  development: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: __dirname + '/migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: __dirname + '/seeds/development',
    },
  },
  testing: {
    client: 'pg',
    connection: {
      connectionString: 'postgresql://cloudsheet:dev123@localhost:5432/cloudsheet',
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: __dirname + '/migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: __dirname + '/seeds/testing',
    },
  },
}