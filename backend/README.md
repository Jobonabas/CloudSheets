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
    npm test
    ```
    (No tests defined yet.)

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
- **DELETE** `/sheet/:id` - Delete a sheet

## Notes
- Make sure the required infrastructure (e.g., Postgres) is running. See the main project README for instructions on starting infrastructure services.
- For production, always build before starting: `npm run build && npm start`.
