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
exports.AppStack = void 0;
const path = __importStar(require("path"));
const cdk = __importStar(require("aws-cdk-lib"));
const guardduty = __importStar(require("aws-cdk-lib/aws-guardduty"));
const wafv2 = __importStar(require("aws-cdk-lib/aws-wafv2"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const ecr = __importStar(require("aws-cdk-lib/aws-ecr"));
const ecrAssets = __importStar(require("aws-cdk-lib/aws-ecr-assets"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const cloudfront = __importStar(require("aws-cdk-lib/aws-cloudfront"));
const origins = __importStar(require("aws-cdk-lib/aws-cloudfront-origins"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const targets = __importStar(require("aws-cdk-lib/aws-route53-targets"));
const acm = __importStar(require("aws-cdk-lib/aws-certificatemanager"));
const globals_1 = require("../../config/globals");
const observability_1 = require("../constructs/observability");
const ecs_1 = require("../constructs/ecs");
class AppStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { envName, config, globals, nameFor, vpc, database, databaseSecret, defaultImageTag } = props;
        (0, globals_1.applyGlobalTags)(this, envName, {
            confidentiality: config.confidentiality ?? globals.tags.confidentiality,
            ...config.tagOverrides,
        });
        const observability = new observability_1.ObservabilityConstruct(this, "Observability", {
            namer: nameFor,
            logGroupPrefix: globals.security.logGroupPrefix,
            logRetentionDays: config.observability.logRetentionDays,
            logKmsAlias: globals.security.kmsAliases?.logs,
            alertEmail: config.observability.alertEmail,
            enableAlbAccessLogs: config.observability.albAccessLogs?.enabled ?? false,
            albLogPrefix: config.observability.albAccessLogs?.prefix,
            albLogExpirationDays: config.observability.albAccessLogs?.expirationDays,
        });
        let containerImage;
        let repository;
        const outputs = [];
        if (config.ecs.buildOnDeploy) {
            const appImageAsset = new ecrAssets.DockerImageAsset(this, "AppImage", {
                directory: path.join(__dirname, "../../app"),
            });
            containerImage = ecs.ContainerImage.fromDockerImageAsset(appImageAsset);
            outputs.push({ key: "DevImageAssetUri", value: appImageAsset.imageUri });
        }
        else {
            if (!config.ecs.repositoryName) {
                throw new Error("ecs.repositoryName must be defined when buildOnDeploy=false.");
            }
            const repoId = "AppRepository";
            repository = config.ecs.manageRepository
                ? new ecr.Repository(this, repoId, {
                    repositoryName: config.ecs.repositoryName,
                    imageScanOnPush: true,
                    removalPolicy: cdk.RemovalPolicy.RETAIN,
                    lifecycleRules: [{ maxImageCount: 10 }],
                })
                : ecr.Repository.fromRepositoryName(this, repoId, config.ecs.repositoryName);
            const imageTag = this.node.tryGetContext("imageTag") ?? defaultImageTag;
            containerImage = ecs.ContainerImage.fromEcrRepository(repository, imageTag);
            const repositoryUri = config.ecs.manageRepository && repository instanceof ecr.Repository
                ? repository.repositoryUri
                : `${cdk.Stack.of(this).account}.dkr.ecr.${cdk.Stack.of(this).region}.amazonaws.com/${config.ecs.repositoryName}`;
            outputs.push({ key: "EcrRepositoryUri", value: repositoryUri });
            outputs.push({ key: "AppImageTag", value: imageTag });
        }
        const zoneNameSanitized = config.ecs.hostedZoneName?.replace(/\.$/, "");
        const albDomainName = config.ecs.domainName?.replace(/\.$/, "");
        let albHostedZone;
        if (config.ecs.hostedZoneId && zoneNameSanitized) {
            albHostedZone = route53.HostedZone.fromHostedZoneAttributes(this, "AppHostedZone", {
                hostedZoneId: config.ecs.hostedZoneId,
                zoneName: zoneNameSanitized,
            });
        }
        let resolvedCertificateArn = config.ecs.certificateArn;
        if (!resolvedCertificateArn && albDomainName && albHostedZone) {
            const albCertificate = new acm.DnsValidatedCertificate(this, "AlbCertificate", {
                domainName: albDomainName,
                hostedZone: albHostedZone,
                region: cdk.Stack.of(this).region,
            });
            resolvedCertificateArn = albCertificate.certificateArn;
        }
        const ecsConstruct = new ecs_1.EcsConstruct(this, "Ecs", {
            vpc,
            namer: nameFor,
            cpu: config.ecs.cpu,
            memoryMiB: config.ecs.memoryMiB,
            desiredCount: config.ecs.desiredCount,
            containerImage,
            repository,
            containerPort: config.ecs.containerPort,
            assignPublicIp: config.ecs.assignPublicIp,
            minCapacity: config.ecs.minCapacity,
            maxCapacity: config.ecs.maxCapacity,
            scalingTargetUtilization: config.ecs.scalingTargetUtilization,
            requestsPerTarget: config.ecs.requestsPerTarget,
            certificateArn: resolvedCertificateArn,
            security: globals.security,
            logGroup: observability.logGroup,
            database,
            databaseSecret,
            databaseSecurityGroupIds: database.connections.securityGroups.map((sg) => sg.securityGroupId),
            databaseName: config.rds.databaseName,
            databaseUser: config.rds.adminUser,
            region: config.region,
            environmentName: envName,
        });
        observability.configureServiceAlarms(ecsConstruct.service);
        observability.configureAlbAlarms(ecsConstruct.alb);
        if (albDomainName) {
            if (albHostedZone) {
                const zoneName = zoneNameSanitized;
                const desiredDomain = albDomainName;
                let recordName;
                if (desiredDomain === zoneName) {
                    recordName = undefined;
                }
                else if (desiredDomain.endsWith(`.${zoneName}`)) {
                    recordName = desiredDomain.slice(0, desiredDomain.length - zoneName.length - 1);
                }
                else {
                    recordName = desiredDomain;
                }
                const aliasTarget = route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(ecsConstruct.alb));
                new route53.ARecord(this, "AlbAliasARecord", {
                    zone: albHostedZone,
                    recordName,
                    target: aliasTarget,
                });
                new route53.AaaaRecord(this, "AlbAliasAaaaRecord", {
                    zone: albHostedZone,
                    recordName,
                    target: aliasTarget,
                });
                new cdk.CfnOutput(this, "AlbCustomDomain", { value: desiredDomain });
            }
            else {
                cdk.Annotations.of(this).addWarning("ecs.domainName specified without hosted zone information; Route 53 alias record was not created.");
            }
        }
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
                resourceArn: ecsConstruct.alb.loadBalancerArn,
                webAclArn: webAcl.attrArn,
            });
        }
        let dashboardBucket;
        let dashboardDistribution;
        if (config.dashboard?.enabled) {
            const bucketProps = {
                encryption: s3.BucketEncryption.S3_MANAGED,
                blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
                enforceSSL: true,
                versioned: false,
                removalPolicy: cdk.RemovalPolicy.RETAIN,
                autoDeleteObjects: false,
                ...(config.dashboard.bucketName ? { bucketName: config.dashboard.bucketName } : {}),
            };
            dashboardBucket = new s3.Bucket(this, "DashboardBucket", bucketProps);
            const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, "DashboardOAI");
            dashboardBucket.grantRead(originAccessIdentity);
            let certificate;
            let hostedZone;
            if (config.dashboard.domainName && config.dashboard.hostedZoneId && config.dashboard.hostedZoneName) {
                hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, "DashboardHostedZone", {
                    hostedZoneId: config.dashboard.hostedZoneId,
                    zoneName: config.dashboard.hostedZoneName,
                });
            }
            if (config.dashboard.domainName && config.dashboard.certificateArn) {
                certificate = acm.Certificate.fromCertificateArn(this, "DashboardCertificate", config.dashboard.certificateArn);
            }
            else if (config.dashboard.domainName && hostedZone) {
                certificate = new acm.DnsValidatedCertificate(this, "DashboardCertificate", {
                    domainName: config.dashboard.domainName,
                    hostedZone,
                    region: "us-east-1",
                });
            }
            else if (config.dashboard.domainName) {
                cdk.Annotations.of(this).addWarning("dashboard.domainName specified without hosted zone information; custom domain will not be enabled.");
            }
            const hasCustomDomain = Boolean(certificate && config.dashboard.domainName);
            dashboardDistribution = new cloudfront.Distribution(this, "DashboardDistribution", {
                defaultRootObject: "index.html",
                minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
                defaultBehavior: {
                    origin: new origins.S3Origin(dashboardBucket, {
                        originAccessIdentity,
                    }),
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                },
                domainNames: hasCustomDomain ? [config.dashboard.domainName] : undefined,
                certificate,
            });
            if (hasCustomDomain && hostedZone) {
                new route53.ARecord(this, "DashboardAliasRecord", {
                    zone: hostedZone,
                    recordName: config.dashboard.domainName,
                    target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(dashboardDistribution)),
                });
            }
            else if (config.dashboard.domainName) {
                cdk.Annotations.of(this).addWarning("dashboard.domainName specified but a Route 53 alias could not be created (missing hosted zone or certificate).");
            }
        }
        new cdk.CfnOutput(this, "AlbDnsName", { value: ecsConstruct.alb.loadBalancerDnsName });
        new cdk.CfnOutput(this, "RdsEndpoint", { value: database.dbInstanceEndpointAddress });
        for (const output of outputs) {
            new cdk.CfnOutput(this, output.key, { value: output.value });
        }
        if (dashboardBucket) {
            new cdk.CfnOutput(this, "DashboardBucketName", { value: dashboardBucket.bucketName });
        }
        if (dashboardDistribution) {
            new cdk.CfnOutput(this, "DashboardDistributionId", { value: dashboardDistribution.distributionId });
            new cdk.CfnOutput(this, "DashboardDistributionDomainName", {
                value: dashboardDistribution.distributionDomainName,
            });
        }
        if (resolvedCertificateArn) {
            new cdk.CfnOutput(this, "AlbCertificateArn", { value: resolvedCertificateArn });
        }
    }
}
exports.AppStack = AppStack;
//# sourceMappingURL=app-stack.js.map