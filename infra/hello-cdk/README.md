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

### Notes

- Make sure your AWS credentials are configured (e.g., via `aws configure`).
- The `FrontendDevStack` and `FrontendStack` deploy S3 buckets with different names for dev and prod.
- The deployment uploads the frontend build from `frontend/dist` to the respective S3 bucket.

