# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.


The `cdk.json` file tells the CDK Toolkit how to execute your app.

## CDK Deployment Usage

All CDK commands must be run from  `infra/hello-cdk` folder. Make sure you have installed dependencies with `npm install` before running CDK commands.

### Build and Synthesize

1. **Build the project:**
	 ```sh
	 npm run build
	 ```
2. **Synthesize the CloudFormation template:**
	 ```sh
	 npx cdk synth
	 ```

### Deploying Stacks

As of now there are three main stacks defined in this project:

- `HelloCdkStack`: Example backend resources (e.g., SQS queue)
- `FrontendDevStack`: Frontend S3 bucket for the development environment
- `FrontendStack`: Frontend S3 bucket for the production environment

#### Deploy All Stacks

To deploy all stacks at once:
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

#### Deploy Only the Backend Stack

```sh
npx cdk deploy HelloCdkStack
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

#### Deploy Only the ECR Dev Stack

```sh
npx cdk deploy EcrDevStack
```

#### Deploy Only the ECR Prod Stack

```sh
npx cdk deploy EcrStack
```

---

## ECR — Pushing and Pulling Docker Images

The ECR stacks create a private container registry. Repository names:

| Stack       | Repository name          |
|-------------|--------------------------|
| EcrDevStack | `cloudsheets-backend-dev` |
| EcrStack    | `cloudsheets-backend`     |

### Authenticate Docker with ECR

Replace `<account-id>` with `691537867581` and `<region>` with `eu-central-1`:

```sh
aws ecr get-login-password --region <region> | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com
```

### Push an image

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

### Pull an image

```sh
docker pull 691537867581.dkr.ecr.eu-central-1.amazonaws.com/cloudsheets-backend:latest
```

---

### Notes

- Make sure your AWS credentials are configured (e.g., via `aws configure`).
- The `FrontendDevStack` and `FrontendStack` deploy S3 buckets with different names for dev and prod.
- The deployment uploads the frontend build from `frontend/dist` to the respective S3 bucket.
- ECR repositories are private by default. Only IAM principals with the correct permissions can push or pull.
- `EcrDevStack` auto-deletes the repository and all images on `cdk destroy`. `EcrStack` (prod) retains the repository.
- A lifecycle policy keeps the last 10 tagged images and removes untagged images after 7 days.

