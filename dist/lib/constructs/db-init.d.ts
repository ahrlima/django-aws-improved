import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
export interface DbInitProps {
    vpc: ec2.IVpc;
    database: rds.DatabaseInstance;
    namer: (resource: string) => string;
    region: string;
    databaseName: string;
    adminUser: string;
    appUser: string;
    secret: secretsmanager.ISecret;
}
/**
 * Runs a one-time Lambda-backed custom resource to initialise database roles
 * and the application user using IAM authentication.
 */
export declare class DbInitConstruct extends Construct {
    constructor(scope: Construct, id: string, props: DbInitProps);
}
