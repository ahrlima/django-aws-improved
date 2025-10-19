import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
export interface VpcConstructProps {
    namer: (resource: string) => string;
    cidr: string;
    availabilityZones: string[];
    natGatewayCount: number;
    useNatInstance: boolean;
}
/**
 * Builds the shared VPC topology with opinionated subnet sizing while honouring
 * the global naming convention for every network component.
 */
export declare class VpcConstruct extends Construct {
    readonly vpc: ec2.Vpc;
    constructor(scope: Construct, id: string, props: VpcConstructProps);
}
