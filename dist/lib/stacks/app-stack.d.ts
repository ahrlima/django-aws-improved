import * as cdk from "aws-cdk-lib";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import type * as rds from "aws-cdk-lib/aws-rds";
import type * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import type { EnvironmentName, EnvironmentSettings } from "../../config/environments";
import type { GlobalsConfig } from "../../config/globals";
export interface AppStackProps extends cdk.StackProps {
    envName: EnvironmentName;
    config: EnvironmentSettings;
    globals: GlobalsConfig;
    nameFor: (resource: string) => string;
    vpc: ec2.IVpc;
    database: rds.DatabaseInstance;
    databaseSecret: secretsmanager.ISecret;
    defaultImageTag: string;
}
export declare class AppStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: AppStackProps);
}
