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
      connectionString: process.env.DATABASE_URL, //hardcoded default (local)
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
  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL, //injected from CDK in runtime
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false} : false, //activate SSL
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: __dirname + '/migrations',
      tableName: 'knex_migrations',
    },
    // seeds: {
    //   directory: __dirname + '/seeds/production',
    // },
  },
}