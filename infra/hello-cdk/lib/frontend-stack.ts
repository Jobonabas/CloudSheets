import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as path from 'path';

interface FrontendStackConfig {
  bucketName: string;
  environment: 'dev' | 'prod';
}
 
 export class FrontendStack extends Stack {
   constructor(scope: Construct, id: string, config: FrontendStackConfig, props?: StackProps) {
     super(scope, id, props);

      //S3 Bucket
      const bucket = new Bucket(
      this, //stack in which Bucket will be deployed
      "S3Bucket", //logical ressource name
      {
        bucketName: "cloudsheets-frontend-bucket",
        websiteIndexDocument: "index.html", //enable static website hosting
        //websiteErrorDocument: "index.html", //optional error Document
        publicReadAccess: true, //S3 static hosting only public possible
        versioned: true,
        //blockPublicAccess: BlockPublicAccess.BLOCK_ALL, //only give bucket access to people with permissions
        removalPolicy: RemovalPolicy.DESTROY //automatically delete bucket when stack is removed
      }
     ) 

     new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../../frontend/dist'))], //Path to frontend deployment files
      destinationBucket: bucket, 
     })
   }
 }