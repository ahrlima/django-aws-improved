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
exports.EcsConstruct = void 0;
const constructs_1 = require("constructs");
const cdk = __importStar(require("aws-cdk-lib"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const elbv2 = __importStar(require("aws-cdk-lib/aws-elasticloadbalancingv2"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
/**
 * Creates the ECS Fargate control plane with ALB routing, applying global
 * naming, scaling defaults, and database IAM policies.
 */
class EcsConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const cluster = new ecs.Cluster(this, "Cluster", {
            vpc: props.vpc,
            clusterName: props.namer("ecs-cluster"),
        });
        const serviceSecurityGroup = new ec2.SecurityGroup(this, "ServiceSecurityGroup", {
            vpc: props.vpc,
            allowAllOutbound: true,
            securityGroupName: props.namer("sg-ecs"),
            description: "Security group for ECS service tasks",
        });
        const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDefinition", {
            cpu: props.cpu,
            memoryLimitMiB: props.memoryMiB,
        });
        if (props.repository) {
            props.repository.grantPull(taskDefinition.obtainExecutionRole());
        }
        taskDefinition.addToTaskRolePolicy(new iam.PolicyStatement({
            actions: ["rds-db:connect"],
            resources: [
                `arn:aws:rds-db:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:dbuser:*/${props.databaseUser}`,
            ],
        }));
        taskDefinition.addToTaskRolePolicy(new iam.PolicyStatement({
            actions: ["rds:GenerateDbAuthToken"],
            resources: ["*"],
        }));
        taskDefinition.addContainer("AppContainer", {
            containerName: props.namer("container"),
            image: props.containerImage,
            logging: ecs.LogDrivers.awsLogs({
                logGroup: props.logGroup,
                streamPrefix: props.namer("stream"),
            }),
            portMappings: [{ containerPort: props.containerPort }],
            environment: {
                ENVIRONMENT: props.environmentName,
                AWS_REGION: props.region,
                DB_NAME: props.databaseName,
                DB_USER: props.databaseUser,
                DB_HOST: props.database.dbInstanceEndpointAddress,
            },
            secrets: {
                DB_PASSWORD: ecs.Secret.fromSecretsManager(props.databaseSecret, "password"),
            },
        });
        this.service = new ecs.FargateService(this, "Service", {
            serviceName: props.namer("service"),
            cluster,
            taskDefinition,
            desiredCount: props.desiredCount,
            assignPublicIp: props.assignPublicIp,
            circuitBreaker: { enable: true, rollback: true },
            securityGroups: [serviceSecurityGroup],
        });
        const scaling = this.service.autoScaleTaskCount({
            minCapacity: props.minCapacity,
            maxCapacity: props.maxCapacity,
        });
        scaling.scaleOnCpuUtilization("CpuScaling", {
            targetUtilizationPercent: props.scalingTargetUtilization,
            scaleInCooldown: cdk.Duration.seconds(60),
            scaleOutCooldown: cdk.Duration.seconds(60),
        });
        scaling.scaleOnMemoryUtilization("MemoryScaling", {
            targetUtilizationPercent: props.scalingTargetUtilization,
            scaleInCooldown: cdk.Duration.seconds(120),
            scaleOutCooldown: cdk.Duration.seconds(60),
        });
        let targetGroup;
        this.alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
            vpc: props.vpc,
            loadBalancerName: props.namer("alb"),
            internetFacing: true,
        });
        const targetProps = {
            targets: [this.service],
            port: props.containerPort,
            healthCheck: { path: "/healthz" },
        };
        const enforceTls = props.security.enforceTls || Boolean(props.certificateArn);
        if (enforceTls) {
            if (!props.certificateArn) {
                throw new Error("TLS enforcement enabled but no ecs.certificateArn configured for HTTPS listener.");
            }
            const httpsListener = this.alb.addListener("HttpsListener", {
                port: 443,
                open: true,
                certificates: [elbv2.ListenerCertificate.fromArn(props.certificateArn)],
            });
            targetGroup = httpsListener.addTargets("HttpsTarget", targetProps);
            this.alb.addListener("HttpListener", {
                port: 80,
                open: true,
                defaultAction: elbv2.ListenerAction.redirect({
                    protocol: "HTTPS",
                    port: "443",
                    permanent: true,
                }),
            });
        }
        else {
            const httpListener = this.alb.addListener("HttpListener", {
                port: 80,
                open: true,
            });
            targetGroup = httpListener.addTargets("HttpTarget", targetProps);
        }
        this.service.connections.allowFrom(this.alb, ec2.Port.tcp(props.containerPort), "Allow ALB to reach service tasks");
        if (props.requestsPerTarget !== undefined) {
            scaling.scaleOnRequestCount("RequestScaling", {
                requestsPerTarget: props.requestsPerTarget,
                targetGroup,
                scaleInCooldown: cdk.Duration.seconds(60),
                scaleOutCooldown: cdk.Duration.seconds(30),
            });
        }
        const dbPort = props.databasePort ?? 5432;
        props.databaseSecurityGroupIds.forEach((groupId, index) => {
            new ec2.CfnSecurityGroupIngress(this, `DbIngress${index}`, {
                groupId,
                sourceSecurityGroupId: serviceSecurityGroup.securityGroupId,
                ipProtocol: "tcp",
                fromPort: dbPort,
                toPort: dbPort,
                description: "Allow ECS tasks to reach PostgreSQL",
            });
        });
    }
}
exports.EcsConstruct = EcsConstruct;
//# sourceMappingURL=ecs.js.map