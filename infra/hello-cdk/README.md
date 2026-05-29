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
- Database connection details (endpoint, credentials) should be securely passed to backend services (e.g., via AWS SSM Parameter Store or Secrets Manager).
- ECR repositories are private by default. Only IAM principals with the correct permissions can push or pull.
- `EcrDevStack` auto-deletes the repository and all images on `cdk destroy`. `EcrStack` (prod) retains the repository.
- A lifecycle policy keeps the last 10 tagged images and removes untagged images after 7 days.
