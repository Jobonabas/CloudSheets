# Architecture

## Overview

CollabSheet is a real-time collaborative spreadsheet tool built on AWS. Users access the React frontend (hosted on S3), authenticate via AWS Cognito, and collaborate in real-time via WebSocket connections to the backend (App Runner).

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
        Browser["🌐 Browser\nReact · TypeScript · Vite · AG Grid · Yjs"]
    end

    subgraph AWS ["☁️ AWS"]
        S3["S3 Bucket\nStatic SPA Files"]
        AR["App Runner\nBackend (Fastify + hocuspocus)"]
        RDS["RDS PostgreSQL\nUsers, Sheets, Yjs Snapshots"]
        Cognito["AWS Cognito\nAuth Service"]
        SSM["SSM Parameter Store\nConfig & Secrets"]
        ECR["ECR\nContainer Registry"]
    end

    subgraph DevOps ["DevOps / CI/CD"]
        GH["GitHub Actions"]
        CDK["AWS CDK (TypeScript)"]
        Docker["Docker"]
    end

    Browser -->|"HTTPS"| S3
    Browser -->|"WebSocket"| AR
    Browser -->|"JWT"| Cognito
    AR -->|"SQL"| RDS
    AR -->|"Read Secrets"| SSM
    GH -->|"cdk deploy"| CDK
    GH -->|"docker push"| ECR
    ECR -->|"Pull Image"| AR
    GH -->|"s3 sync"| S3
    CDK -->|"Infra Mgmt"| AWS
    Docker -->|"Build Images"| ECR

    classDef indigo fill:#E8EAF6,stroke:#3F51B5,color:#1A237E
    classDef teal fill:#E0F2F1,stroke:#009688,color:#00695C
    classDef indigoDark fill:#C5CAE9,stroke:#1A237E,color:#1A237E
    classDef tealDark fill:#B2DFDB,stroke:#00695C,color:#00695C
    class Browser indigo
    class S3,AR,RDS,Cognito,SSM,ECR indigoDark
    class GH,CDK,Docker indigo
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
    participant S3 as S3 (Frontend)
    participant C as Cognito (Auth)
    participant AR as App Runner (Backend)
    participant DB as RDS PostgreSQL
    participant SSM as SSM Parameter Store

    U->>S3: Open app
    S3-->>U: Serve React SPA

    U->>C: Login (Email + MFA)
    C-->>U: JWT Token

    U->>AR: Open sheet (WebSocket + JWT)
    AR->>DB: Load Yjs doc snapshot
    DB-->>AR: Doc state
    AR-->>U: Initial sync

    U->>AR: Edit cell (CRDT delta)
    AR-->>U: Delta to all connected clients

    Note over AR,DB: Periodically save Yjs doc snapshot
    AR->>DB: Persist Yjs doc state
    AR->>SSM: Read config/secrets
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
        A["👨‍💻 Push to\nfeature branch"] --> B["GitHub Actions\nCI"]
        B --> C["Build + Lint + Test"]
    end

    subgraph Integration ["2 · Integration"]
        direction LR
        D["PR → develop"] --> E["GitHub Actions\nCI + Preview"]
        E --> F{"Parallel Jobs"}
        F --> G["Build Frontend"]
        F --> H["Build Backend"]
        F --> I["CDK Synth\nValidate IaC"]
    end

    subgraph Production ["3 · Production"]
        direction LR
        J["PR → main\n(from develop)"] --> K["GitHub Actions\nCD"]
        K --> L{"Parallel Deploy"}
        L --> M["S3 Sync"]
        L --> N["Push to ECR"]
        L --> O["CDK Deploy"]
        N --> P["App Runner\nAuto-Deploy"]
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