import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";
import type { EnvironmentName, EnvironmentSettings } from "../../config/environments";
import type { GlobalsConfig } from "../../config/globals";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import type * as rds from "aws-cdk-lib/aws-rds";
export interface DataStackProps extends cdk.StackProps {
    envName: EnvironmentName;
    config: EnvironmentSettings;
    globals: GlobalsConfig;
    nameFor: (resource: string) => string;
    vpc: ec2.IVpc;
}
export declare class DataStack extends cdk.Stack {
    readonly database: rds.DatabaseInstance;
    constructor(scope: Construct, id: string, props: DataStackProps);
}
