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