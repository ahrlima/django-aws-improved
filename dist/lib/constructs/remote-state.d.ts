import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
interface RemoteStateProps {
    namer: (resource: string) => string;
    bucketName?: string;
    tableName?: string;
}
/**
 * Provides Terraform remote-state primitives (S3 + DynamoDB) that follow the
 * standard naming scheme and enforce encryption and TLS-only access.
 */
export declare class RemoteStateConstruct extends Construct {
    readonly bucket: s3.Bucket;
    readonly table: dynamodb.Table;
    constructor(scope: Construct, id: string, props: RemoteStateProps);
}
export {};
