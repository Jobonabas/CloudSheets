# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## CDK Deployment Usage

All CDK commands must be run from `infra/hello-cdk` folder. Make sure you have installed dependencies with `npm install` before running CDK commands.

### Build and Synthesize

1. **Build the project:**
   ```sh
   npm run build
   ```
2. **Synthesize the CloudFormation template:**
   ```sh
   npx cdk synth
   ```

### Stacks Defined in This Project

- `HelloCdkStack`: Example backend resources (e.g., SQS queue)
- `FrontendDevStack`: Frontend S3 bucket for the development environment
- `FrontendStack`: Frontend S3 bucket for the production environment
- `BackendDevStack`: Backend resources for the development environment (includes RDS PostgreSQL database)
- `BackendStack`: Backend resources for the production environment (includes RDS PostgreSQL database)
- `EcrDevStack`: Private ECR container registry for the development environment
- `EcrStack`: Private ECR container registry for the production environment
- `AppRunnerStack`: App Runner Hello World service (HTTPS, publicly accessible)

### Deploying Stacks

#### Deploy All Stacks

```sh
npx cdk deploy --all
```

#### Deploy Only the Dev Frontend Stack

```sh
npx cdk deploy FrontendDevStack
```

#### Deploy Only the Prod Frontend Stack

```sh
npx cdk deploy FrontendStack
```

#### Deploy Only the Dev Backend Stack

```sh
npx cdk deploy BackendDevStack
```

#### Deploy Only the Prod Backend Stack

```sh
npx cdk deploy BackendStack
```

#### Deploy Only the Example Backend Stack

```sh
npx cdk deploy HelloCdkStack
```

#### Deploy Only the ECR Dev Stack

```sh
npx cdk deploy EcrDevStack
```

#### Deploy Only the ECR Prod Stack

```sh
npx cdk deploy EcrStack
```

#### Deploy Only the App Runner Stack

```sh
npx cdk deploy AppRunnerStack
```

After deploy, the HTTPS URL is printed as output:

```text
AppRunnerStack.AppRunnerUrl = https://xxxx.eu-central-1.awsapprunner.com
```

### Other Useful Commands

- **Diff:**
  ```sh
  npx cdk diff [STACK_NAME]
  ```
  Compares the deployed stack with your local changes.
- **Destroy:**
  ```sh
  npx cdk destroy [STACK_NAME]
  ```
  Destroys the specified stack.

---

## ECR - Pushing and Pulling Docker Images

The ECR stacks create a private container registry. Repository names:

| Stack       | Repository name           |
|-------------|---------------------------|
| EcrDevStack | `cloudsheets-backend-dev` |
| EcrStack    | `cloudsheets-backend`     |

### Authenticate Docker with ECR

Replace `<account-id>` with `691537867581` and `<region>` with `eu-central-1`:

```sh
aws ecr get-login-password --region <region> | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com
```

### Push an Image

```sh
# Build your image
docker build -t cloudsheets-backend .

# Tag it for the registry (example: prod)
docker tag cloudsheets-backend:latest \
  691537867581.dkr.ecr.eu-central-1.amazonaws.com/cloudsheets-backend:latest

# Push
docker push 691537867581.dkr.ecr.eu-central-1.amazonaws.com/cloudsheets-backend:latest
```

For dev, replace `cloudsheets-backend` with `cloudsheets-backend-dev`.

### Pull an Image

```sh
docker pull 691537867581.dkr.ecr.eu-central-1.amazonaws.com/cloudsheets-backend:latest
```

---

### Notes

- Make sure your AWS credentials are configured (e.g., via `aws configure` / `aws login`).
- The `FrontendDevStack` and `FrontendStack` deploy S3 buckets with different names for dev and prod. The deployment uploads the frontend build from `frontend/dist` to the respective S3 bucket.
- The `BackendDevStack` and `BackendStack` deploy an RDS PostgreSQL database (`db.t3.micro` instance) in a VPC. Security groups are configured so only backend resources can access the database. dev stack uses removal policy DESTROY (database is deleted with the stack). prod stack uses removal policy RETAIN (database is preserved if the stack is deleted).
- Database connection details reach the backend two different ways. The non-secret parts (`DB_HOST`, `DB_PORT`, `DB_NAME`) are ordinary container environment variables. The credentials are **not**: see *Database credentials* below.

---

### Database credentials

`BackendStack` copies the RDS-generated credentials into SSM Parameter Store, and `EcsExpressStack`
injects them into the container with ECS-native secret injection, resolved by the ECS agent once at
task start.

| Parameter | Type | Injected as |
| --- | --- | --- |
| `/cloudsheets/{dev\|prod}/db/username` | `String` | `DB_USERNAME` |
| `/cloudsheets/{dev\|prod}/db/password` | `SecureString` | `DB_PASSWORD` |

- **Why a custom resource?** CloudFormation cannot create `SecureString` parameters —
  `AWS::SSM::Parameter` supports only `String` and `StringList`. A Lambda-backed custom resource
  (`lib/db-credentials-parameter.ts`) receives only the secret **ARN**, reads the value itself and
  calls `ssm:PutParameter`, so no plaintext credential ever enters the CloudFormation template.
- **IAM:** the ECS *execution* role (not the task or infrastructure role) is granted
  `ssm:GetParameter` / `ssm:GetParameters` on exactly those two ARNs. The ECS agent fetches secrets
  before the container starts. No `kms:Decrypt` grant is needed — the parameters use the AWS-managed
  `alias/aws/ssm` key.
- **Secrets Manager is still RDS's source of truth.** Parameter Store is the delivery mechanism to
  the backend, not a replacement store, so the credentials exist in both.
- **Rotation is not synchronised.** The custom resource only re-runs when its properties change. If
  the password is rotated out-of-band, the SSM copy goes stale and tasks will fail to connect. Force
  a re-sync with:
  ```sh
  npx cdk deploy BackendStack --context environment=dev --context dbSyncVersion=2
  ```
- **Deletion:** in `dev` the parameters are deleted with the stack. In `prod` they are retained,
  matching the RDS `RemovalPolicy.RETAIN` — deleting them would leave a retained database with no
  stored credentials.
- **Local development is unaffected.** `backend/src/config/database.ts` prefers `DATABASE_URL` when
  it is set (docker-compose, `.env`, CI) and only falls back to the discrete `DB_*` variables, which
  is the path taken on ECS.

Verify after a deploy:
```sh
aws ssm get-parameters-by-path --path /cloudsheets/dev/db --recursive
```
The password is returned masked unless `--with-decryption` is passed.
- ECR repositories are private by default. Only IAM principals with the correct permissions can push or pull.
- `EcrDevStack` auto-deletes the repository and all images on `cdk destroy`. `EcrStack` (prod) retains the repository.
- A lifecycle policy keeps the last 10 tagged images and removes untagged images after 7 days.