import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as logs from "aws-cdk-lib/aws-logs";
import type { SecurityDefaults } from "../../config/globals";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type * as ecr from "aws-cdk-lib/aws-ecr";
export interface EcsConstructProps {
    vpc: ec2.IVpc;
    namer: (resource: string) => string;
    security: SecurityDefaults;
    cpu: number;
    memoryMiB: number;
    desiredCount: number;
    containerImage: ecs.ContainerImage;
    repository?: ecr.IRepository;
    containerPort: number;
    assignPublicIp: boolean;
    minCapacity: number;
    maxCapacity: number;
    scalingTargetUtilization: number;
    requestsPerTarget?: number;
    certificateArn?: string;
    logGroup: logs.ILogGroup;
    database: rds.DatabaseInstance;
    databaseSecret: secretsmanager.ISecret;
    databaseName: string;
    databaseUser: string;
    environmentName: string;
    region: string;
    databaseSecurityGroupIds: string[];
    databasePort?: number;
}
/**
 * Creates the ECS Fargate control plane with ALB routing, applying global
 * naming, scaling defaults, and database IAM policies.
 */
export declare class EcsConstruct extends Construct {
    readonly service: ecs.FargateService;
    readonly alb: elbv2.ApplicationLoadBalancer;
    constructor(scope: Construct, id: string, props: EcsConstructProps);
}
