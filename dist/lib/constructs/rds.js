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
exports.RdsConstruct = void 0;
const constructs_1 = require("constructs");
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const rds = __importStar(require("aws-cdk-lib/aws-rds"));
const cdk = __importStar(require("aws-cdk-lib"));
const kms = __importStar(require("aws-cdk-lib/aws-kms"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
/**
 * Provisions the primary PostgreSQL instance (and optional replica)
 * with encryption at rest, and globally consistent identifiers.
 */
class RdsConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const kmsKey = props.security.kmsAliases?.rds
            ? kms.Alias.fromAliasName(this, "RdsKmsAlias", props.security.kmsAliases.rds)
            : undefined;
        this.db = new rds.DatabaseInstance(this, "Postgres", {
            instanceIdentifier: props.namer("rds"),
            engine: rds.DatabaseInstanceEngine.postgres({
                version: rds.PostgresEngineVersion.VER_16,
            }),
            instanceType: new ec2.InstanceType(props.instanceType),
            vpc: props.vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            multiAz: props.multiAz,
            allocatedStorage: props.allocatedStorage,
            publiclyAccessible: false,
            iamAuthentication: true,
            credentials: rds.Credentials.fromGeneratedSecret(props.adminUser),
            databaseName: props.databaseName,
            backupRetention: cdk.Duration.days(props.backupRetentionDays),
            deletionProtection: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            storageEncrypted: props.security.enforceEncryptionAtRest,
            storageEncryptionKey: kmsKey,
            cloudwatchLogsExports: ["postgresql"],
            cloudwatchLogsRetention: logs.RetentionDays.ONE_WEEK,
        });
        this.db.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
        const cfnDbInstance = this.db.node.defaultChild;
        cfnDbInstance.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN, {
            applyToUpdateReplacePolicy: true,
        });
        if (props.enableReplica) {
            this.replica = new rds.DatabaseInstanceReadReplica(this, "PostgresReplica", {
                instanceIdentifier: props.namer("rds-replica"),
                sourceDatabaseInstance: this.db,
                instanceType: new ec2.InstanceType(props.instanceType),
                vpc: props.vpc,
                vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
                deletionProtection: true,
                publiclyAccessible: false,
            });
            this.replica.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
            const cfnReplica = this.replica.node.defaultChild;
            cfnReplica.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN, {
                applyToUpdateReplacePolicy: true,
            });
        }
    }
}
exports.RdsConstruct = RdsConstruct;
//# sourceMappingURL=rds.js.map