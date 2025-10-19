import * as cdk from "aws-cdk-lib";
import type { EnvironmentName, EnvironmentSettings } from "../../config/environments";
import type { GlobalsConfig } from "../../config/globals";
import type { Construct } from "constructs";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
export interface NetworkStackProps extends cdk.StackProps {
    envName: EnvironmentName;
    config: EnvironmentSettings;
    globals: GlobalsConfig;
    nameFor: (resource: string) => string;
}
export declare class NetworkStack extends cdk.Stack {
    readonly vpc: ec2.Vpc;
    constructor(scope: Construct, id: string, props: NetworkStackProps);
}
