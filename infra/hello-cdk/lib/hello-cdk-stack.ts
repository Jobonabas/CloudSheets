import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';

export class HelloCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    //const domainName = 'cloudsheets.de'
    //const siteDomain = 'www' + '.' + domainName

    // example resource
     const queue = new sqs.Queue(this, 'HelloCdkQueue', {
        visibilityTimeout: cdk.Duration.seconds(300)
     });
  }
}
