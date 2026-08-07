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
CMD ["sh", "-c", "npx knex migrate:latest && npx tsx src/index.ts"]
