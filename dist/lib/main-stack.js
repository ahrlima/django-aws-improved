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
exports.MainStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const guardduty = __importStar(require("aws-cdk-lib/aws-guardduty"));
const ecr = __importStar(require("aws-cdk-lib/aws-ecr"));
const wafv2 = __importStar(require("aws-cdk-lib/aws-wafv2"));
const globals_1 = require("../config/globals");
const vpc_1 = require("./constructs/vpc");
const nat_instance_1 = require("./constructs/nat-instance");
const rds_1 = require("./constructs/rds");
const db_init_1 = require("./constructs/db-init");
const observability_1 = require("./constructs/observability");
const ecs_1 = require("./constructs/ecs");
class MainStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { envName, config, globals } = props;
        const nameFor = (resource) => (0, globals_1.naming)({
            env: envName,
            service: config.service,
            resource,
            client: config.client,
        });
        (0, globals_1.applyGlobalTags)(this, envName, {
            confidentiality: config.confidentiality ?? globals.tags.confidentiality,
            ...config.tagOverrides,
        });
        const availabilityZones = config.vpc.availabilityZones && config.vpc.availabilityZones.length > 0
            ? config.vpc.availabilityZones
            : this.availabilityZones.length > 0
                ? this.availabilityZones
                : [`${this.region}a`, `${this.region}b`];
        const vpc = new vpc_1.VpcConstruct(this, "Vpc", {
            namer: nameFor,
            cidr: config.vpc.cidr,
            availabilityZones,
            natGatewayCount: config.vpc.natGatewayCount,
            useNatInstance: config.vpc.useNatInstance,
        });
        new nat_instance_1.NatInstanceConstruct(this, "NatInstance", {
            vpc: vpc.vpc,
            namer: nameFor,
            enableNatInstance: config.vpc.useNatInstance,
            instanceType: config.natInstance?.instanceType ?? "t3.micro",
            allowedSshCidrs: config.natInstance?.allowSshFrom ?? [],
        });
        const database = new rds_1.RdsConstruct(this, "Rds", {
            vpc: vpc.vpc,
            namer: nameFor,
            security: globals.security,
            multiAz: config.rds.multiAz,
            allocatedStorage: config.rds.allocatedStorage,
            instanceType: config.rds.instanceType,
            databaseName: config.rds.databaseName,
            adminUser: config.rds.adminUser,
            appUser: config.rds.appUser,
            backupRetentionDays: config.rds.backupRetentionDays,
            enableReplica: config.rds.enableReplica,
        });
        new db_init_1.DbInitConstruct(this, "DbInit", {
            vpc: vpc.vpc,
            namer: nameFor,
            database: database.db,
            region: config.region,
            databaseName: config.rds.databaseName,
            adminUser: config.rds.adminUser,
            appUser: config.rds.appUser,
        });
        const observability = new observability_1.ObservabilityConstruct(this, "Observability", {
            namer: nameFor,
            logGroupPrefix: globals.security.logGroupPrefix,
            logRetentionDays: config.observability.logRetentionDays,
            logKmsAlias: globals.security.kmsAliases?.logs,
            alertEmail: config.observability.alertEmail,
        });
        const repository = new ecr.Repository(this, "AppRepository", {
            repositoryName: nameFor("app"),
            imageScanOnPush: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            lifecycleRules: [{ maxImageCount: 10 }],
        });
        const imageTag = this.node.tryGetContext("imageTag") ?? config.ecs.imageTag;
        const ecs = new ecs_1.EcsConstruct(this, "Ecs", {
            vpc: vpc.vpc,
            namer: nameFor,
            cpu: config.ecs.cpu,
            memoryMiB: config.ecs.memoryMiB,
            desiredCount: config.ecs.desiredCount,
            repository,
            imageTag,
            containerPort: config.ecs.containerPort,
            assignPublicIp: config.ecs.assignPublicIp,
            minCapacity: config.ecs.minCapacity,
            maxCapacity: config.ecs.maxCapacity,
            scalingTargetUtilization: config.ecs.scalingTargetUtilization,
            certificateArn: config.ecs.certificateArn,
            security: globals.security,
            logGroup: observability.logGroup,
            database: database.db,
            databaseName: config.rds.databaseName,
            databaseUser: config.rds.appUser,
            region: config.region,
            environmentName: envName,
        });
        observability.configureServiceAlarms(ecs.service);
        observability.configureAlbAlarms(ecs.alb);
        if (globals.security.enableGuardDuty) {
            new guardduty.CfnDetector(this, "GuardDutyDetector", { enable: true });
        }
        if (globals.security.enableWaf) {
            const webAcl = new wafv2.CfnWebACL(this, "WebAcl", {
                defaultAction: { allow: {} },
                scope: "REGIONAL",
                visibilityConfig: {
                    cloudWatchMetricsEnabled: true,
                    metricName: nameFor("waf"),
                    sampledRequestsEnabled: true,
                },
                name: nameFor("acl"),
            });
            new wafv2.CfnWebACLAssociation(this, "WebAclAssociation", {
                resourceArn: ecs.alb.loadBalancerArn,
                webAclArn: webAcl.attrArn,
            });
        }
        new cdk.CfnOutput(this, "AlbDnsName", { value: ecs.alb.loadBalancerDnsName });
        new cdk.CfnOutput(this, "RdsEndpoint", { value: database.db.dbInstanceEndpointAddress });
        new cdk.CfnOutput(this, "EcrRepositoryUri", { value: repository.repositoryUri });
    }
}
exports.MainStack = MainStack;
//# sourceMappingURL=main-stack.js.map