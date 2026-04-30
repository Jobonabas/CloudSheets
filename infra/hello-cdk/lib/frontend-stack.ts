import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
 
 export class FrontendStack extends Stack {
   constructor(scope: Construct, id: string, props?: StackProps) {
     super(scope, id, props);

      //S3 Bucket
      const bucket = new Bucket(
      this, //stack in which Bucket will be deployed
      "S3Bucket", //logical ressource name
      {
        bucketName: "cloudsheets-frontend-bucket",
        versioned: true,
        blockPublicAccess: BlockPublicAccess.BLOCK_ALL, //only give bucket access to people with permissions
        removalPolicy: RemovalPolicy.DESTROY //automatically delete bucket when stack is removed
      }
     ) 
   }
 }