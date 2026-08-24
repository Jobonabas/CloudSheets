FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json knexfile.ts ./
COPY src ./src
COPY migrations ./migrations
COPY seeds ./seeds

# Type check only -- tsconfig.json sets "noEmit": true, so this emits no output.
# The app is started via tsx below, which is why devDependencies stay installed.
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Migrations are serialized across tasks by knex's knex_migrations_lock table.
# The knex CLI is invoked through tsx rather than directly: package.json sets
# "type": "module", so Node's ESM loader cannot read knexfile.ts and the CLI dies
# with 'Unknown file extension ".ts"'. The `import "ts-node/register"` inside the
# knexfile cannot help -- it is a CommonJS hook living in the very file that fails
# to load. tsx hooks the loader from outside, before the knexfile is reached.
CMD ["sh", "-c", "npx tsx node_modules/knex/bin/cli.js migrate:latest && npx tsx src/index.ts"]
