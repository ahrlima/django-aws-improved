import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import type { SecurityDefaults } from "../../config/globals";
export interface RdsConstructProps {
    vpc: ec2.IVpc;
    namer: (resource: string) => string;
    security: SecurityDefaults;
    instanceType: string;
    multiAz: boolean;
    allocatedStorage: number;
    databaseName: string;
    adminUser: string;
    appUser: string;
    backupRetentionDays: number;
    enableReplica: boolean;
}
/**
 * Provisions the primary PostgreSQL instance (and optional replica)
 * with encryption at rest, and globally consistent identifiers.
 */
export declare class RdsConstruct extends Construct {
    readonly db: rds.DatabaseInstance;
    readonly replica?: rds.DatabaseInstanceReadReplica;
    constructor(scope: Construct, id: string, props: RdsConstructProps);
}
