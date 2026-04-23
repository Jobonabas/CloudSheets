
## Tech-Stack

### Frontend
| Technology        | Purpose         | Reasoning |
|-------------------|-----------------|-----------|
| **React + Vite**  | SPA Framework   | Standard for performant UIs; fast HMR (Hot Module Replacement). |
| **AG Grid CE**    | Spreadsheet UI  | High feature density (editing, filtering) with minimal custom work. Premade (saves effort). |
| **Yjs**           | CRDT Engine     | Enables real-time collaborative editing. |
| **y-websocket**   | Provider        | WebSocket connection for Yjs. |

### Backend
| Technology            | Purpose      | Reasoning |
|-----------------------|-------------|-----------|
| **Node.js + Fastify** | API Server  | High throughput for WebSockets, TypeScript-native, validated schemas. |
| **y-websocket Server**| Sync Engine | Lightweight backend module for Yjs (single-instance). |
| **PostgreSQL**        | Persistence | Stores user data and Yjs doc snapshots. |
| **AWS Cognito**       | Auth Service| Part of AWS, handles authentication. |

### Cloud (AWS)
| Service           | Purpose           | Reasoning |
|-------------------|-------------------|-----------|
| **App Runner**    | Container Hosting | Core application, automates SSL and deployment directly from ECR. |
| **RDS PostgreSQL**| Managed DB        | Core service, data storage; Free Tier (db.t3.micro). |
| **S3**            | SPA Hosting       | Hosts static assets (frontend). |
| **SSM Parameter Store** | Config & Secrets | Free, simple management of DB credentials and API keys (instead of Secrets Manager). |
| **ECR**           | Image Registry    | Required for container deployments on App Runner. |

### DevOps / IaC
| Technology         | Purpose                | Reasoning |
|--------------------|------------------------|-----------|
| **AWS CDK (TS)**   | Infrastructure as Code | Entire infrastructure as code, reproducible and type-safe (TypeScript). |
| **GitHub Actions** | CI/CD                  | Automates build process and push to ECR/App Runner. |
| **Docker**         | Containerization       | Test containers locally (backend, database, etc). |
