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


## Stacks Defined in This Project

- `HelloCdkStack`: Example backend resources (e.g., SQS queue)
- `FrontendDevStack`: Frontend S3 bucket for the development environment
- `FrontendStack`: Frontend S3 bucket for the production environment
- `BackendDevStack`: Backend resources for the development environment (includes RDS PostgreSQL database)
- `BackendStack`: Backend resources for the production environment (includes RDS PostgreSQL database)


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


### Notes

- Make sure your AWS credentials are configured (e.g., via `aws configure`/ `aws login`).
- The `FrontendDevStack` and `FrontendStack` deploy S3 buckets with different names for dev and prod. The deployment uploads the frontend build from `frontend/dist` to the respective S3 bucket.
- The `BackendDevStack` and `BackendStack` deploy an RDS PostgreSQL database (`db.t3.micro` instance) in a VPC. Security groups are configured so only backend resources can access the database. dev stack uses removal policy DESTROY (database is deleted with the stack). prod stack uses removal policy RETAIN (database is preserved if the stack is deleted).
- Database connection details (endpoint, credentials) should be securely passed to backend services (e.g., via AWS SSM Parameter Store or Secrets Manager).

