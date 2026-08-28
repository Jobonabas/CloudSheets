import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DatabaseInstance, DatabaseInstanceEngine, PostgresEngineVersion, StorageType } from 'aws-cdk-lib/aws-rds';
import { InstanceType, Vpc} from 'aws-cdk-lib/aws-ec2';
import { SecurityGroup, Peer, Port, InstanceClass, InstanceSize} from 'aws-cdk-lib/aws-ec2';
import { DbCredentialsToSsm } from './db-credentials-parameter';
import { EnvironmentName } from './environment';


/**
 * Name of the application database inside the RDS instance.
 *
 * Single source of truth on purpose: it has to be handed to RDS as `databaseName`
 * (otherwise the engine only ever has its default `postgres` database) *and* to the
 * container as DB_NAME. When those two drifted apart, `knex migrate:latest` failed
 * with 'database "cloudsheet" does not exist' and the container never started.
 */
export const DATABASE_NAME = 'cloudsheet';


export interface BackendStackConfig {
  environment: EnvironmentName;
  /** Bump to force a re-sync of the credentials into Parameter Store. */
  dbSyncVersion?: string;
}

 export class BackendStack extends Stack {

  public readonly vpc: Vpc;
  public readonly backendSG: SecurityGroup;
  public readonly postgresDB: DatabaseInstance;
  public readonly dbCredentials: DbCredentialsToSsm;

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
      this.postgresDB = new DatabaseInstance(this, 'PostgresDB', { 
        engine: DatabaseInstanceEngine.postgres({version: PostgresEngineVersion.VER_18_2}),
        databaseName: DATABASE_NAME, //without this RDS only creates the engine default 'postgres'
        instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
        vpc: this.vpc,
        securityGroups: [dbSG],
        allocatedStorage: 20, //disable autoscaling to stay in free tier scope
       // storageType: StorageType.GP2,
        multiAz: false, //no multi Availability Zones
        backupRetention: Duration.days(0), //backups stored for 0 days
        removalPolicy: config.environment === 'dev' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN, //automatically delete db when stack is removed for dev
      });
      
      // Copy the generated credentials into SSM Parameter Store so ECS can inject them
      // at task start. RDS keeps its Secrets Manager secret as the source of truth --
      // this is the delivery mechanism to the backend, not a replacement store.
      this.dbCredentials = new DbCredentialsToSsm(this, 'DbCredentials', {
        secret: this.postgresDB.secret!,
        environment: config.environment,
        syncVersion: config.dbSyncVersion,
      });

   }
 }