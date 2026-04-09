# Architecture

## Overview

CollabSheet is a real-time collaborative spreadsheet tool built on AWS. Users connect via CloudFront to the React frontend, authenticate through Clerk/Auth0, and collaborate in real-time via WebSocket connections to the backend.

## Diagram

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'primaryColor': '#E8EAF6',
  'primaryBorderColor': '#3F51B5',
  'primaryTextColor': '#1A237E',
  'secondaryColor': '#E0F2F1',
  'secondaryBorderColor': '#009688',
  'secondaryTextColor': '#00695C',
  'tertiaryColor': '#F5F5F5',
  'lineColor': '#3F51B5',
  'textColor': '#1A237E',
  'fontSize': '14px'
}}}%%
graph TB
    subgraph Client
        Browser["🌐 Browser<br/>React · TypeScript · Vite · Yjs"]
    end

    subgraph External ["External (Managed)"]
        Auth["🔐 Clerk / Auth0<br/>Auth + MFA"]
    end

    subgraph AWS ["☁️ AWS"]
        subgraph Frontend_Hosting ["Frontend Hosting"]
            CF["CloudFront<br/>CDN"]
            S3["S3 Bucket<br/>Static SPA Files"]
        end

        subgraph Compute
            AR["App Runner<br/>Auto-Scaling"]
            subgraph Backend ["Backend Container"]
                API["Fastify API<br/>REST Endpoints"]
                WS["y-websocket Server<br/>CRDT Sync"]
            end
        end

        subgraph Data
            RDS["RDS PostgreSQL<br/>Users, Sheets, Permissions,<br/>Yjs Doc Snapshots"]
            Redis["ElastiCache Redis<br/>Pub/Sub for Multi-Instance<br/>(Phase 4)"]
        end

        subgraph Operations
            CW["CloudWatch<br/>Monitoring + Logging"]
            SM["Secrets Manager<br/>DB Credentials, API Keys"]
        end
    end

    subgraph DevOps ["DevOps / CI/CD"]
        GH["GitHub Actions"]
        CDK["AWS CDK<br/>(TypeScript)"]
        ECR["ECR<br/>Container Registry"]
    end

    Browser -->|"HTTPS"| CF
    CF --> S3
    Browser -->|"WebSocket"| AR
    Browser -->|"OAuth / JWT"| Auth
    AR --> Backend
    API -->|"SQL"| RDS
    WS -->|"Snapshots"| RDS
    WS -->|"Pub/Sub<br/>(multi-instance)"| Redis
    API -->|"Read Secrets"| SM
    AR -->|"Logs + Metrics"| CW
    GH -->|"cdk deploy"| CDK
    GH -->|"docker push"| ECR
    ECR -->|"Pull Image"| AR
    GH -->|"s3 sync"| S3

    classDef indigo fill:#E8EAF6,stroke:#3F51B5,color:#1A237E
    classDef teal fill:#E0F2F1,stroke:#009688,color:#00695C
    classDef indigoDark fill:#C5CAE9,stroke:#1A237E,color:#1A237E
    classDef tealDark fill:#B2DFDB,stroke:#00695C,color:#00695C

    class Browser,Auth indigo
    class CF,S3,AR,API,WS indigoDark
    class RDS,Redis tealDark
    class CW,SM teal
    class GH,CDK,ECR indigo
```

## Data Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'actorBkg': '#E8EAF6',
  'actorBorder': '#3F51B5',
  'actorTextColor': '#1A237E',
  'activationBkgColor': '#E0F2F1',
  'activationBorderColor': '#009688',
  'signalColor': '#3F51B5',
  'signalTextColor': '#1A237E',
  'noteBkgColor': '#E0F2F1',
  'noteBorderColor': '#009688',
  'noteTextColor': '#00695C',
  'sequenceNumberColor': '#FFFFFF',
  'labelBoxBkgColor': '#E8EAF6',
  'labelBoxBorderColor': '#3F51B5',
  'labelTextColor': '#1A237E',
  'loopTextColor': '#1A237E',
  'fontSize': '14px'
}}}%%
sequenceDiagram
    participant U as User (Browser)
    participant CF as CloudFront + S3
    participant A as Auth (Clerk/Auth0)
    participant B as App Runner (Backend)
    participant DB as RDS PostgreSQL
    participant R as ElastiCache Redis

    U->>CF: Open app
    CF-->>U: Serve React SPA

    U->>A: Login (Email + MFA)
    A-->>U: JWT Token

    U->>B: Open sheet (WebSocket + JWT)
    B->>DB: Load Yjs doc snapshot
    DB-->>B: Doc state
    B-->>U: Initial sync

    U->>B: Edit cell (CRDT delta)
    B->>R: Publish delta (Pub/Sub)
    R-->>B: Broadcast to other instances
    B-->>U: Delta to all connected clients

    Note over B,DB: Periodically save Yjs doc snapshot
    B->>DB: Persist Yjs doc state
```

## Deployment Pipeline

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'primaryColor': '#E8EAF6',
  'primaryBorderColor': '#3F51B5',
  'primaryTextColor': '#1A237E',
  'secondaryColor': '#E0F2F1',
  'secondaryBorderColor': '#009688',
  'lineColor': '#3F51B5',
  'textColor': '#1A237E',
  'fontSize': '14px'
}}}%%
graph TB
    subgraph Feature ["1 · Feature Development"]
        direction LR
        A["👨‍💻 Push to<br/>feature branch"] --> B["GitHub Actions<br/>CI"]
        B --> C["Build + Lint + Test"]
    end

    subgraph Integration ["2 · Integration"]
        direction LR
        D["PR → develop"] --> E["GitHub Actions<br/>CI + Preview"]
        E --> F{"Parallel Jobs"}
        F --> G["Build Frontend"]
        F --> H["Build Backend"]
        F --> I["CDK Synth<br/>Validate IaC"]
    end

    subgraph Production ["3 · Production"]
        direction LR
        J["PR → main<br/>(from develop)"] --> K["GitHub Actions<br/>CD"]
        K --> L{"Parallel Deploy"}
        L --> M["S3 Sync +<br/>CloudFront Invalidation"]
        L --> N["Push to ECR"]
        L --> O["CDK Deploy"]
        N --> P["App Runner<br/>Auto-Deploy"]
    end

    Feature -->|"PR Review"| Integration
    Integration -->|"Merge + Release"| Production

    classDef indigo fill:#E8EAF6,stroke:#3F51B5,color:#1A237E
    classDef teal fill:#E0F2F1,stroke:#009688,color:#00695C
    classDef indigoDark fill:#C5CAE9,stroke:#1A237E,color:#1A237E
    classDef decision fill:#B2DFDB,stroke:#00695C,color:#00695C

    class A,D,J indigo
    class B,E,K indigoDark
    class C,G,H,I,M,N,O,P teal
    class F,L decision
```