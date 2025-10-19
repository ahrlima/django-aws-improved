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
exports.RemoteStateConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const constructs_1 = require("constructs");
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
/**
 * Provides Terraform remote-state primitives (S3 + DynamoDB) that follow the
 * standard naming scheme and enforce encryption and TLS-only access.
 */
class RemoteStateConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const bucketName = props.bucketName ?? props.namer("tfstate");
        const tableName = props.tableName ?? props.namer("tfstate-locks");
        this.bucket = new s3.Bucket(this, "StateBucket", {
            bucketName,
            encryption: s3.BucketEncryption.S3_MANAGED,
            versioned: true,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            autoDeleteObjects: false,
        });
        this.table = new dynamodb.Table(this, "LockTable", {
            tableName,
            partitionKey: { name: "LockID", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption: dynamodb.TableEncryption.AWS_MANAGED,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        new cdk.CfnOutput(this, "RemoteStateBucketName", {
            value: this.bucket.bucketName,
            description: "S3 bucket storing Terraform remote state files.",
        });
        new cdk.CfnOutput(this, "RemoteStateLockTableName", {
            value: this.table.tableName,
            description: "DynamoDB table used for Terraform state locking.",
        });
    }
}
exports.RemoteStateConstruct = RemoteStateConstruct;
//# sourceMappingURL=remote-state.js.map