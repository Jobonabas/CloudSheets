import { Stack, StackProps, CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Mfa, OAuthScope, UserPool, UserPoolClient, UserPoolClientIdentityProvider } from "aws-cdk-lib/aws-cognito";


export interface AuthStackConfig {
    environment: 'dev' | 'prod';
    callbackUrls: string[];
}

export class AuthStack extends Stack {
    public readonly userPoolId: string;
    public readonly userPoolClientId: string;
    public readonly cognitoDomain: string;

    constructor(scope: Construct, id: string, config: AuthStackConfig, props?: StackProps) {
        super(scope, id, props);


        const userPool = new UserPool(this, 'FrontendUserPool', {
            userPoolName: `cloudsheets-user-pool-${config.environment}`,
            selfSignUpEnabled: true,
            signInAliases: { email: true },
            autoVerify: { email: true },
            passwordPolicy: {
                minLength: 12,
                requireDigits: true,
                requireSymbols: true,
                requireLowercase: true,
                requireUppercase: true,
            },
            mfa: Mfa.REQUIRED,
            mfaSecondFactor: { sms: false, otp: true },
            removalPolicy: config.environment === 'dev' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
        });

        const providerDomain = userPool.addDomain('CognitoDomain', {
            cognitoDomain: { domainPrefix: `cloudsheets-auth-${config.environment}` },
        });


        const userPoolClient = new UserPoolClient(this, 'Frontend-Userpool-Client', {
            userPool,
            supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
            oAuth: {
                flows: {authorizationCodeGrant: true},
                scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
                callbackUrls: config.callbackUrls,
                logoutUrls: config.callbackUrls,
            },
        });

        this.userPoolId = userPool.userPoolId;
        this.userPoolClientId = userPoolClient.userPoolClientId;
        this.cognitoDomain = providerDomain.baseUrl();

        new CfnOutput(this, 'UserPoolId',{value: this.userPoolId});
        new CfnOutput(this, 'UserPoolClientId',{value: this.userPoolClientId});
        new CfnOutput(this, 'CognitoDomainUrl',{value: this.cognitoDomain});
    }
}