import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import type { GlobalsConfig } from "../config/globals";
import type { EnvironmentName, EnvironmentSettings } from "../config/environments";
interface MainStackProps extends cdk.StackProps {
    envName: EnvironmentName;
    config: EnvironmentSettings;
    globals: GlobalsConfig;
}
export declare class MainStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: MainStackProps);
}
export {};
