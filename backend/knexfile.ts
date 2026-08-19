import 'ts-node/register';
//env File for Database Variable
import dotenv from 'dotenv';
dotenv.config();
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { buildConnection } from './src/config/database.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  development: {
    client: 'pg',
    connection: buildConnection(), //DATABASE_URL locally, discrete DB_* vars otherwise
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
    //On ECS: DB_HOST/PORT/NAME are plain env vars, DB_USERNAME/DB_PASSWORD are injected
    //by the ECS agent from SSM Parameter Store. SSL is enabled via DB_SSL=true.
    connection: buildConnection(),
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