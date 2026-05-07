import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DatabaseInstance, DatabaseInstanceEngine, PostgresEngineVersion } from 'aws-cdk-lib/aws-rds';
import { InstanceType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { SecurityGroup, Peer, Port} from 'aws-cdk-lib/aws-ec2';

interface BackendStackConfig {
  environment: 'dev' | 'prod';
}
 
 export class BackendStack extends Stack {
   constructor(scope: Construct, id: string, config: BackendStackConfig, props?: StackProps) {
     super(scope, id, props);

      //Backend VPC
      const vpc = new Vpc(this, 'BackendVpc', { maxAzs: config.environment === 'dev' ? 1 : 2 }); 
      //AWS doesn't allow RDS instances outside of VPCs due to access control
      //1 Availability Zone is cheaper = enough for development, for production stacks 2

      // Security Groups for backend (allow Outbound)
      const backendSG = new SecurityGroup(this, 'BackendSG', {
        vpc,
        allowAllOutbound: true,
      });
      // separate for RDS instance (deny Outbound)
      const dbSG = new SecurityGroup(this, 'DbSG', {
        vpc,
        allowAllOutbound: false,
      });
      
      // Allow backend to connect to db on PostgreSQL port (5432)
      dbSG.addIngressRule(backendSG, Port.tcp(5432), 'Allow backend to access DB');
      

      //RDS PostgreSQL Instance (db.t3.micro)
      new DatabaseInstance(this, 'PostgresDB', { 
        engine: DatabaseInstanceEngine.postgres({version: PostgresEngineVersion.VER_18_2}),
        instanceType: new InstanceType('db.t3.micro'),
        vpc,
        securityGroups: [dbSG],
        removalPolicy: config.environment === 'dev' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN, //automatically delete db when stack is removed for dev
      });
   }
 }