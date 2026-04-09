## Functional Requirements

#### **Create and manage sheets**
   - The system shall display an overview of the users sheets.
   - Each user shall be able to manage their sheets (deletion, creation, naming).

#### **User Accounts**
   - Users shall be able to register with a valid email address and password.
   - Users shall be able to log in and out of the system with their credentials.
   - Users can enable Multi-Factor-Authentification for their account.
   - Sheets shall only be visible to the respective user.

#### **Collaborative and realtime working**
   - Users can invite other users to collaborate and manage/edit a sheet together in realtime.

---

## Technical Requirements

### Frontend
| Technologie | Zweck | Begründung |
|---|---|---|
| **React + Vite** | SPA Framework | Schnelles Dev-Setup, kein SSR nötig, großes Ökosystem |
| **Handsontable CE** oder **AG Grid CE** | Spreadsheet-UI | Fertige Grid-Komponente mit Cell-Editing, spart Wochen Eigenentwicklung |
| **Yjs** | CRDT-Bibliothek (Client) | Conflict-free Realtime Sync, JS-nativ, bewährt |
| **y-websocket** | WebSocket-Provider | Verbindet Yjs mit dem Backend, handled Reconnects automatisch |
| **Clerk** oder **Auth0 Free** | Auth SDK (Frontend) | Login/Signup/MFA UI-Komponenten out of the box |

### Backend
| Technologie | Zweck | Begründung |
|---|---|---|
| **Node.js + Fastify** | API-Server | Performanter als Express, TypeScript-nativ, JSON Schema Validation |
| **y-websocket Server** | Realtime Sync Server | Empfängt CRDT-Deltas, broadcasted an alle Clients eines Sheets |
| **PostgreSQL** | Persistente Daten | User-Metadaten, Sheet-Metadaten, Access Rights, Yjs-Doc-Snapshots |
| **Redis** | Pub/Sub + Caching | Horizontales Scaling der WebSocket-Server, Session-Cache |
| **Clerk/Auth0** | Auth Backend | JWT-Validierung, User Management, MFA — kein Eigenbau nötig |

### Cloud (AWS)
| Service | Zweck | Begründung |
|---|---|---|
| **App Runner** | Backend-Container Hosting | Simpler als ECS/Fargate, Auto-Scaling, HTTPS out of the box |
| **S3 + CloudFront** | Frontend Hosting | Statische React-SPA, global gecacht, billig |
| **RDS PostgreSQL** | Managed Datenbank | Backups, Patching, Monitoring automatisch (Free Tier: db.t3.micro) |
| **ElastiCache Redis** | Managed Redis | Pub/Sub Layer für WebSocket-Scaling (Free Tier: cache.t3.micro) |
| **ECR** | Container Registry | Docker Images für App Runner |
| **CloudWatch** | Monitoring + Logging | Dashboards, Alerts, Log Aggregation |
| **Secrets Manager** | Credentials | DB-Passwörter, API-Keys — kein Plaintext in Environment Variables |

### DevOps / IaC
| Technologie | Zweck | Begründung |
|---|---|---|
| **AWS CDK (TypeScript)** | Infrastructure as Code | Gleiche Sprache wie App-Code, Type Safety, Auto-IAM |
| **GitHub Actions** | CI/CD Pipeline | Build → Test → Deploy automatisiert bei Push auf main |
| **Docker** | Containerisierung | Backend als Container, reproduzierbare Builds |
| **GitHub** | Source Control | Code, Issues, Project Board, Actions — alles an einem Ort |


