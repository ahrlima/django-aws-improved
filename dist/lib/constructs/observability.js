"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObservabilityConstruct = void 0;
const constructs_1 = require("constructs");
const cdk = __importStar(require("aws-cdk-lib"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const subs = __importStar(require("aws-cdk-lib/aws-sns-subscriptions"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const kms = __importStar(require("aws-cdk-lib/aws-kms"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
/**
 * Centralises logging and alarm primitives while aligning resource names with
 * global standards and optional KMS encryption controls.
 */
class ObservabilityConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const kmsKey = props.logKmsAlias
            ? kms.Alias.fromAliasName(this, "LogGroupKmsAlias", props.logKmsAlias)
            : undefined;
        this.logGroup = new logs.LogGroup(this, "LogGroup", {
            logGroupName: `${props.logGroupPrefix}/${props.namer("service")}`,
            retention: resolveRetention(props.logRetentionDays),
            encryptionKey: kmsKey,
        });
        this.alarmTopic = new sns.Topic(this, "AlarmTopic", {
            topicName: props.namer("sns-alarms"),
            displayName: props.namer("sns-alarms"),
        });
        if (props.alertEmail) {
            this.alarmTopic.addSubscription(new subs.EmailSubscription(props.alertEmail));
        }
        if (props.enableAlbAccessLogs) {
            this.albLogPrefix = props.albLogPrefix ?? props.namer("alb");
            this.albLogBucket = new s3.Bucket(this, "AlbAccessLogsBucket", {
                encryption: s3.BucketEncryption.S3_MANAGED,
                blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
                enforceSSL: true,
                versioned: false,
                lifecycleRules: props.albLogExpirationDays !== undefined
                    ? [
                        {
                            enabled: true,
                            expiration: cdk.Duration.days(props.albLogExpirationDays),
                        },
                    ]
                    : undefined,
                removalPolicy: cdk.RemovalPolicy.DESTROY,
                autoDeleteObjects: true,
            });
        }
    }
    /**
     * Attaches CPU and memory alarms to the provided ECS service.
     */
    configureServiceAlarms(service) {
        const cpuAlarm = new cloudwatch.Alarm(this, "CpuAlarm", {
            alarmName: service.serviceName
                ? `${service.serviceName}-cpu-utilization`
                : undefined,
            metric: service.metricCpuUtilization(),
            threshold: 80,
            evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            datapointsToAlarm: 2,
            alarmDescription: "CPU utilisation sustained above 80%",
        });
        cpuAlarm.addAlarmAction({
            bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
        });
        const memoryAlarm = new cloudwatch.Alarm(this, "MemoryAlarm", {
            alarmName: service.serviceName
                ? `${service.serviceName}-memory-utilization`
                : undefined,
            metric: service.metricMemoryUtilization(),
            threshold: 80,
            evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            datapointsToAlarm: 2,
            alarmDescription: "Memory utilisation sustained above 80%",
        });
        memoryAlarm.addAlarmAction({
            bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
        });
    }
    /**
     * Configures 5xx alarms on the supplied Application Load Balancer.
     */
    configureAlbAlarms(alb) {
        if (this.albLogBucket) {
            alb.logAccessLogs(this.albLogBucket, this.albLogPrefix);
        }
        const alb5xx = new cloudwatch.Metric({
            namespace: "AWS/ApplicationELB",
            metricName: "HTTPCode_Target_5XX_Count",
            dimensionsMap: { LoadBalancer: alb.loadBalancerFullName },
            statistic: "Sum",
            period: cdk.Duration.minutes(5),
        });
        const alarm = new cloudwatch.Alarm(this, "Alb5xxAlarm", {
            alarmName: `${alb.loadBalancerName}-5xx`,
            metric: alb5xx,
            threshold: 5,
            evaluationPeriods: 1,
            datapointsToAlarm: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            alarmDescription: "ALB target group returning high rate of 5xx responses",
        });
        alarm.addAlarmAction({
            bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
        });
    }
}
exports.ObservabilityConstruct = ObservabilityConstruct;
function resolveRetention(days) {
    const mapping = {
        1: logs.RetentionDays.ONE_DAY,
        3: logs.RetentionDays.THREE_DAYS,
        5: logs.RetentionDays.FIVE_DAYS,
        7: logs.RetentionDays.ONE_WEEK,
        14: logs.RetentionDays.TWO_WEEKS,
        30: logs.RetentionDays.ONE_MONTH,
        60: logs.RetentionDays.TWO_MONTHS,
        90: logs.RetentionDays.THREE_MONTHS,
        180: logs.RetentionDays.SIX_MONTHS,
        365: logs.RetentionDays.ONE_YEAR,
        730: logs.RetentionDays.TWO_YEARS,
        1825: logs.RetentionDays.FIVE_YEARS,
        3650: logs.RetentionDays.TEN_YEARS,
    };
    return mapping[days] ?? logs.RetentionDays.ONE_WEEK;
}
//# sourceMappingURL=observability.js.map