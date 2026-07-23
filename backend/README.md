# CloudSheets Backend

This directory contains the backend service for CloudSheets, built with Node.js, TypeScript, and Fastify.

## Setup

1. Install dependencies:
    ```bash
    npm install
    ```

2. Copy and configure environment variables if needed (see .env.example if present).


## Available Scripts

- **Build:**
    ```bash
    npm run build
    ```
    Compiles TypeScript source files to JavaScript (output in `dist/`).

- **Start (production):**
    ```bash
    npm start
    ```
    Runs the compiled JavaScript from `dist/index.js`.

- **Development mode:**
    ```bash
    npm run dev
    ```
    Starts the server in watch mode using `tsx`, automatically restarting on code changes.

- **Test:**
    ```bash
    # Run server + tests together (single command)
    npm run test:all`

    # Alternatively, run tests against an already running server
    npm test
    ```
    `npm run test:all` starts the local server with test environment overrides (`.env.local`) to bypass Cognito Auth, waits for port `8080` to be ready, and runs Vitest in watch mode.

- **Migrations:**
    - `npm run migrate:make` — Create a new migration file.
    - `npm run migrate:latest` — Run all migrations that have not yet been applied to the database.
    - `npm run migrate:rollback` — Roll back the last set of migrations performed.
    - `npm run migrate:up` — Run the next migration that has not yet been run.
    - `npm run migrate:down` — Roll back the last migration that was run.
    - `npm run migrate:list` — List all the completed and pending migrations.

- **Seeds:**
    - `npx knex seed:run --env development` - seed demo user for local usage

## Project Structure

- `src/` — TypeScript source files
- `dist/` — Compiled JavaScript output (after build)
- `package.json` — Project scripts and dependencies

## API Endpoints
### Swagger UI

Access the interactive API documentation (Swagger UI) at:

- `http://127.0.0.1:8080/documentation`

### API Endpoints

- **GET** `/health` — Health check
- **GET** `/ping` — Ping endpoint
- **GET** `/sheets` — List all sheets (returns an object with `message`, `success`, `data`)
- **POST** `/sheets` — Create a new sheet
- **DELETE** `/sheets/:id` — Delete a sheet
- **GET (WebSocket)** `/sheets/:id/sync` — WebSocket endpoint for real-time sheet sync (requires ownership or permission)
- **POST (Permissions)** `/sheets/:id/share` - Set other users view/edit permissions for sheet using their email address

## Notes
- Make sure the required infrastructure (e.g., Postgres) is running. See the main project README for instructions on starting infrastructure services.
- For production, always build before starting: `npm run build && npm start`.
