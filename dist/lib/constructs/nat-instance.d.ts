import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
export interface NatInstanceConstructProps {
    vpc: ec2.IVpc;
    namer: (resource: string) => string;
    enableNatInstance: boolean;
    instanceType: string;
    allowedSshCidrs: string[];
}
/**
 * Optionally provisions a cost-effective NAT Instance for development
 * environments, configured for Session Manager access and global naming.
 */
export declare class NatInstanceConstruct extends Construct {
    readonly instance?: ec2.Instance;
    constructor(scope: Construct, id: string, props: NatInstanceConstructProps);
}
