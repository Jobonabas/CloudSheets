import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DatabaseInstance, DatabaseInstanceEngine, PostgresEngineVersion, StorageType } from 'aws-cdk-lib/aws-rds';
import { InstanceType, Vpc} from 'aws-cdk-lib/aws-ec2';
import { SecurityGroup, Peer, Port, InstanceClass, InstanceSize} from 'aws-cdk-lib/aws-ec2';


export interface BackendStackConfig {
  environment: 'dev' | 'prod';
}
 
 export class BackendStack extends Stack {
  
  public readonly vpc: Vpc;
  public readonly backendSG: SecurityGroup;
  public readonly postgresDB: DatabaseInstance;

  constructor(scope: Construct, id: string, config: BackendStackConfig, props?: StackProps) {
     super(scope, id, props);

     
      //Backend VPC
      this.vpc = new Vpc(this, 'BackendVpc', { maxAzs: 2 }); 
      //AWS doesn't allow RDS instances outside of VPCs due to access control

      // Security Groups for backend (allow Outbound)
      this.backendSG = new SecurityGroup(this, 'BackendSG', {
        vpc: this.vpc,
        allowAllOutbound: true,
      });
      // separate for RDS instance (deny Outbound)
      const dbSG = new SecurityGroup(this, 'DbSG', {
        vpc: this.vpc,
        allowAllOutbound: false,
      });
      
      // Allow backend to connect to db on PostgreSQL port (5432)
      dbSG.addIngressRule(this.backendSG, Port.tcp(5432), 'Allow backend to access DB');
      

      //RDS PostgreSQL Instance (db.t3.micro)
      const postgresDB = new DatabaseInstance(this, 'PostgresDB', { 
        engine: DatabaseInstanceEngine.postgres({version: PostgresEngineVersion.VER_18_2}),
        instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
        vpc: this.vpc,
        securityGroups: [dbSG],
        allocatedStorage: 20, //disable autoscaling to stay in free tier scope
       // storageType: StorageType.GP2,
        multiAz: false, //no multi Availability Zones
        backupRetention: Duration.days(0), //backups stored for 0 days
        removalPolicy: config.environment === 'dev' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN, //automatically delete db when stack is removed for dev
      });
      
   }
 }