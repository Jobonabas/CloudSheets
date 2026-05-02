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

### Build & Start

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

#### Health Check
**GET** `/health`

#### Ping
**GET** `/ping`

---

## Clean Up AWS Resources

To remove all AWS resources created by the CDK stack (e.g., after testing):

```bash
cd infra/hello-cdk
cdk destroy
```

This will delete all resources, including S3 buckets (and their contents, if configured).

