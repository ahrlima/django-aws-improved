import { Construct } from "constructs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as s3 from "aws-cdk-lib/aws-s3";
export interface ObservabilityProps {
    namer: (resource: string) => string;
    logGroupPrefix: string;
    logRetentionDays: number;
    logKmsAlias?: string;
    alertEmail?: string;
    enableAlbAccessLogs?: boolean;
    albLogPrefix?: string;
    albLogExpirationDays?: number;
}
/**
 * Centralises logging and alarm primitives while aligning resource names with
 * global standards and optional KMS encryption controls.
 */
export declare class ObservabilityConstruct extends Construct {
    readonly logGroup: logs.LogGroup;
    readonly alarmTopic: sns.Topic;
    readonly albLogBucket?: s3.Bucket;
    readonly albLogPrefix?: string;
    constructor(scope: Construct, id: string, props: ObservabilityProps);
    /**
     * Attaches CPU and memory alarms to the provided ECS service.
     */
    configureServiceAlarms(service: ecs.FargateService): void;
    /**
     * Configures 5xx alarms on the supplied Application Load Balancer.
     */
    configureAlbAlarms(alb: elbv2.ApplicationLoadBalancer): void;
}
