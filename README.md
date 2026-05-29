# CloudForms
geile cloudforms

## Documentation

The project documentation is built with [MkDocs](https://www.mkdocs.org/).

### Setup and Run Locally

1. Install Python dependencies:
    ```bash
    pip install -r requirements.txt
    ```
2. Start the documentation server:
    ```bash
    mkdocs serve
    ```
3. Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/) in your browser.

---
## Backend (Node.js + Fastify)
## Infrastructure Scripts
### Build & Start
To start or stop the local infrastructure (e.g., Postgres database), use the following scripts from the project root:

```bash
npm run infra:up    # Start infrastructure (docker-compose up -d)
npm run infra:down  # Stop infrastructure (docker-compose down)
```

---

## Backend (Node.js + Fastify)
1. Install dependencies:
	```bash
	cd backend
	npm install
	```
2. Build backend (TypeScript → JavaScript):
	```bash
	npm run build
	```
3. Start backend:
	```bash
	npm start
	```



### API Endpoints
Backend-specific scripts (build, start, dev, etc.) are documented in [backend/README.md](backend/README.md).

Quick start:
#### Health Check
```bash
cd backend
npm install
npm run build   # Build backend (TypeScript → JavaScript)
npm start       # Start backend
```
**GET** `/health`
For development mode, see backend/README.md for details on the dev script.

#### Ping
**GET** `/ping`

### Swagger UI

The backend exposes an interactive API documentation UI (Swagger) at:

- `http://127.0.0.1:8080/documentation`


backend endpoints:

- **GET** `/sheets` — List all sheets
- **POST** `/sheets` — Create a new sheet
- **DELETE** `/sheets/:id` - Delete a sheet
- **GET (WebSocket)** `/sheets/:id/sync` — WebSocket endpoint for real-time sheet sync (requires ownership or permission)
- **POST (Permissions)** `/sheets/:id/share` - Set other users view/edit permissions for sheet using their email address
---

## Clean Up AWS Resources

To remove all AWS resources created by the CDK stack (e.g., after testing):

```bash
cd infra/hello-cdk
cdk destroy
```
to destroy all stack:
```bash
cd infra/hello-cdk
cdk destroy --all
```

This will delete all resources, including S3 buckets (and their contents, if configured).

