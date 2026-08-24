# 
## ADR 1: Documentation with MkDocs
- **Status:** Accepted
- **Context:** Need for clear, accessible, and versioned project documentation.
- **Decision:** Use MkDocs for documentation, hosted via GitHub Pages and automated with GitHub Actions.
- **Consequences:** Easy to maintain, supports Markdown, integrates with CI/CD.

## ADR 2: Language and Stack Choices
- **Status:** Accepted
- **Context:** Selection of core technologies for frontend, backend, and database.
- **Decision:**
  - **Programming Language:** TypeScript (frontend & backend), SQL (database)
  - **Database System:** PostgreSQL
  - **Frameworks:** React (frontend), Vite (build tool)
- **Consequences:** Modern, type-safe stack; strong ecosystem; scalable and maintainable.

## ADR 3: Naming Conventions
- **Status:** Accepted
- **Context:** Need for consistent naming in code and version control.
- **Decision:**
  - Use clear, descriptive names in code and Git.
  - Commit/merge messages should include an issue tag.
- **Consequences:** Improved clarity, traceability, and collaboration.

## ADR 4: Git Workflow
- **Status:** Accepted
- **Context:** Define branching and merging strategy for team collaboration.
- **Decision:**
  - Use Git Flow: main and develop branches, with feature branches for new work.
  - Branch and Commit Naming

### Naming Conventions

**Branches** folgen dem Schema `type/issue-beschreibung`:

| Type | Wann | Beispiel |
|---|---|---|
| `feature` | Neue Funktionalität | `feature/7-sheet-crud-api` |
| `fix` | Bugfix | `fix/14-websocket-reconnect` |
| `chore` | Infra, Tooling, Deps, Config | `chore/3-cdk-vpc-setup` |
| `docs` | Doku, Blogs | `docs/18-blog-phase-1` |
| `refactor` | Code-Umbau ohne Funktionsänderung | `refactor/21-auth-middleware` |
| `ci` | Pipeline-Änderungen | `ci/9-deploy-workflow` |

Regeln: Kleinbuchstaben, Bindestrich als Trennzeichen, keine Umlaute, Issue-Nummer voranstellen.

**Commits** folgen dem Conventional Commits Standard:

```
type(scope): beschreibung im imperativ
```

Typen: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `ci`
Scopes: `api`, `frontend`, `ws`, `cdk`, `auth`, `db`

Beispiele:
```
feat(api): add sheet CRUD endpoints #7
fix(ws): handle reconnection after timeout #14
chore(cdk): add ElastiCache Redis stack #5
docs(blog): write phase 1 infrastructure post #18
ci(github): add deploy workflow for main branch #9
```
- **Consequences:** Structured development process, easier release management.

## ADR 5: Comments and Code Quality
- **Status:** Accepted
- **Context:** Ensure code is understandable and maintainable.
- **Decision:**
  - Write meaningful comments where necessary.
  - Follow best practices for code quality and reviews.
- **Consequences:** Easier onboarding, fewer bugs, better maintainability.

## ADR 6: Tech Stack Documentation
- **Status:** Accepted
- **Context:** Need to document and communicate the chosen tech stack.
- **Decision:**
  - Maintain a clear tech stack section in the documentation.
- **Consequences:** Transparency for contributors and stakeholders.

## ADR 7: Database Credentials via SSM Parameter Store
- **Status:** Accepted (Issue #20)
- **Context:** `ecs-express-stack.ts` built a `DATABASE_URL` by calling `unsafeUnwrap()` on the
  RDS-generated Secrets Manager secret. The synthesized template only held a
  `{{resolve:secretsmanager:...}}` reference, but CloudFormation resolved it at deploy time into an
  **ordinary ECS container environment variable**, where the password is readable by anyone with
  `ecs:DescribeServices`. The pipeline worked around this by refusing to upload `cdk.out`.
- **Decision:**
  - Store the DB username and password in SSM Parameter Store under
    `/cloudsheets/{env}/db/username` (`String`) and `/cloudsheets/{env}/db/password` (`SecureString`).
  - Write them with a Lambda-backed **custom resource**, because CloudFormation cannot create
    `SecureString` parameters — `AWS::SSM::Parameter` supports only `String` and `StringList`. CDK
    documents this on `ParameterType.SECURE_STRING` but does not enforce it, so passing that type
    synthesizes cleanly and then fails at deploy time. The Lambda receives only the secret **ARN**
    and reads the value itself, so no plaintext ever enters the template.
  - Deliver them to the container with **ECS-native secret injection**
    (`primaryContainer.secrets` → `valueFrom` the parameter ARN), resolved once by the ECS agent at
    task start. The AWS SDK was deliberately *not* added to the backend: `src/db.ts` builds the knex
    pool eagerly at import, so a runtime fetch would need a start wrapper plus the same treatment for
    the `knex migrate` process, and would need mocking in tests.
  - Keep `DB_HOST` / `DB_PORT` / `DB_NAME` as plain environment variables. They are not secret, and
    routing them through SSM would add resources, IAM scope and per-task SSM calls for nothing.
  - Pass discrete connection properties to knex rather than rebuilding a URL — RDS passwords contain
    `@`, `/` and `:`, which would silently corrupt a `postgresql://` string.
- **Consequences:**
  - Credentials are no longer readable from the ECS service configuration.
  - **Secrets Manager remains RDS's source of truth.** Parameter Store is the delivery mechanism, not
    the sole store, so the credentials exist in two places. Making SSM authoritative would require
    `Credentials.fromPassword(..., SecretValue.ssmSecure(...))`, which changes `MasterUsername` and
    **replaces the RDS instance**, plus an out-of-band bootstrap step. Declined for this issue.
  - **Rotation is not synchronised.** The custom resource only re-runs when its properties change, so
    an out-of-band password rotation leaves the SSM copy stale and tasks will fail to connect. Deploy
    with `-c dbSyncVersion=<n+1>` to force a re-sync. Nothing configures rotation today.
  - The parameters are created outside CloudFormation, so the custom resource deletes them on stack
    deletion in `dev` only. In `prod` they are retained, matching the RDS `RemovalPolicy.RETAIN` —
    deleting them would leave a retained database with no stored credentials.