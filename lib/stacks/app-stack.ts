import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as guardduty from "aws-cdk-lib/aws-guardduty";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import type * as rds from "aws-cdk-lib/aws-rds";
import type * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import type { EnvironmentName, EnvironmentSettings } from "../../config/environments";
import type { GlobalsConfig } from "../../config/globals";
import { applyGlobalTags } from "../../config/globals";
import { ObservabilityConstruct } from "../constructs/observability";
import { EcsConstruct } from "../constructs/ecs";

export interface AppStackProps extends cdk.StackProps {
  envName: EnvironmentName;
  config: EnvironmentSettings;
  globals: GlobalsConfig;
  nameFor: (resource: string) => string;
  vpc: ec2.IVpc;
  database: rds.DatabaseInstance;
  databaseSecret: secretsmanager.ISecret;
  defaultImageTag: string;
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { envName, config, globals, nameFor, vpc, database, databaseSecret, defaultImageTag } = props;

    applyGlobalTags(this, envName, {
      confidentiality: config.confidentiality ?? globals.tags.confidentiality,
      ...config.tagOverrides,
    });

    const observability = new ObservabilityConstruct(this, "Observability", {
      namer: nameFor,
      logGroupPrefix: globals.security.logGroupPrefix,
      logRetentionDays: config.observability.logRetentionDays,
      logKmsAlias: globals.security.kmsAliases?.logs,
      alertEmail: config.observability.alertEmail,
      enableAlbAccessLogs: config.observability.albAccessLogs?.enabled ?? false,
      albLogPrefix: config.observability.albAccessLogs?.prefix,
      albLogExpirationDays: config.observability.albAccessLogs?.expirationDays,
    });

    let containerImage: ecs.ContainerImage;
    let repository: ecr.IRepository | undefined;
    const outputs: { key: string; value: string }[] = [];

    if (config.ecs.buildOnDeploy) {
      const appImageAsset = new ecrAssets.DockerImageAsset(this, "AppImage", {
        directory: path.join(__dirname, "../../app"),
      });
      containerImage = ecs.ContainerImage.fromDockerImageAsset(appImageAsset);
      outputs.push({ key: "DevImageAssetUri", value: appImageAsset.imageUri });
    } else {
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

      const repositoryUri =
        config.ecs.manageRepository && repository instanceof ecr.Repository
          ? repository.repositoryUri
          : `${cdk.Stack.of(this).account}.dkr.ecr.${cdk.Stack.of(this).region}.amazonaws.com/${config.ecs.repositoryName}`;

      outputs.push({ key: "EcrRepositoryUri", value: repositoryUri });
      outputs.push({ key: "AppImageTag", value: imageTag });
    }

    const zoneNameSanitized = config.ecs.hostedZoneName?.replace(/\.$/, "");
    const albDomainName = config.ecs.domainName?.replace(/\.$/, "");
    let albHostedZone: route53.IHostedZone | undefined;
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

    const ecsConstruct = new EcsConstruct(this, "Ecs", {
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
        const zoneName = zoneNameSanitized!;
        const desiredDomain = albDomainName;
        let recordName: string | undefined;
        if (desiredDomain === zoneName) {
          recordName = undefined;
        } else if (desiredDomain.endsWith(`.${zoneName}`)) {
          recordName = desiredDomain.slice(0, desiredDomain.length - zoneName.length - 1);
        } else {
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
      } else {
        cdk.Annotations.of(this).addWarning(
          "ecs.domainName specified without hosted zone information; Route 53 alias record was not created.",
        );
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

    let dashboardBucket: s3.Bucket | undefined;
    let dashboardDistribution: cloudfront.Distribution | undefined;
    if (config.dashboard?.enabled) {
      const bucketProps: s3.BucketProps = {
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

      let certificate: acm.ICertificate | undefined;
      let hostedZone: route53.IHostedZone | undefined;
      if (config.dashboard.domainName && config.dashboard.hostedZoneId && config.dashboard.hostedZoneName) {
        hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, "DashboardHostedZone", {
          hostedZoneId: config.dashboard.hostedZoneId,
          zoneName: config.dashboard.hostedZoneName,
        });
      }
      if (config.dashboard.domainName && config.dashboard.certificateArn) {
        certificate = acm.Certificate.fromCertificateArn(
          this,
          "DashboardCertificate",
          config.dashboard.certificateArn,
        );
      } else if (config.dashboard.domainName && hostedZone) {
        certificate = new acm.DnsValidatedCertificate(this, "DashboardCertificate", {
          domainName: config.dashboard.domainName,
          hostedZone,
          region: "us-east-1",
        });
      } else if (config.dashboard.domainName) {
        cdk.Annotations.of(this).addWarning(
          "dashboard.domainName specified without hosted zone information; custom domain will not be enabled.",
        );
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
        domainNames: hasCustomDomain ? [config.dashboard.domainName!] : undefined,
        certificate,
      });

      if (hasCustomDomain && hostedZone) {
        new route53.ARecord(this, "DashboardAliasRecord", {
          zone: hostedZone,
          recordName: config.dashboard.domainName,
          target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(dashboardDistribution)),
        });
      } else if (config.dashboard.domainName) {
        cdk.Annotations.of(this).addWarning(
          "dashboard.domainName specified but a Route 53 alias could not be created (missing hosted zone or certificate).",
        );
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
