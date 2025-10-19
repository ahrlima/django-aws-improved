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
exports.NatInstanceConstruct = void 0;
const constructs_1 = require("constructs");
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const cdk = __importStar(require("aws-cdk-lib"));
/**
 * Optionally provisions a cost-effective NAT Instance for development
 * environments, configured for Session Manager access and global naming.
 */
class NatInstanceConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        if (!props.enableNatInstance) {
            new cdk.CfnOutput(this, "NatInstanceSkipped", { value: "NAT instance disabled" });
            return;
        }
        const natAmi = ec2.MachineImage.latestAmazonLinux2({
            cachedInContext: true,
            virtualization: ec2.AmazonLinuxVirt.HVM,
            storage: ec2.AmazonLinuxStorage.GENERAL_PURPOSE,
        });
        const securityGroup = new ec2.SecurityGroup(this, "NatSecurityGroup", {
            vpc: props.vpc,
            securityGroupName: props.namer("sg-nat"),
            allowAllOutbound: true,
            description: "Security group for NAT instance (prefer SSM over SSH).",
        });
        securityGroup.addIngressRule(ec2.Peer.ipv4(props.vpc.vpcCidrBlock), ec2.Port.allTraffic(), "Allow private subnets to route through NAT");
        for (const cidr of props.allowedSshCidrs) {
            securityGroup.addIngressRule(ec2.Peer.ipv4(cidr), ec2.Port.tcp(22), "Temporary SSH access");
        }
        const instanceRole = new iam.Role(this, "NatInstanceRole", {
            roleName: props.namer("role-nat"),
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
            ],
        });
        const userData = ec2.UserData.forLinux();
        userData.addCommands("set -xe", "yum install -y iptables-services", "systemctl enable iptables", "sysctl -w net.ipv4.ip_forward=1", "sed -i '/^net.ipv4.ip_forward/d' /etc/sysctl.conf", "echo 'net.ipv4.ip_forward = 1' >> /etc/sysctl.conf", "iptables -t nat -F", "iptables -F", "iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE", "iptables -A FORWARD -i eth0 -o eth0 -m state --state RELATED,ESTABLISHED -j ACCEPT", "iptables -A FORWARD -i eth0 -o eth0 -j ACCEPT", "service iptables save");
        this.instance = new ec2.Instance(this, "NatInstance", {
            instanceName: props.namer("nat"),
            vpc: props.vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
            instanceType: new ec2.InstanceType(props.instanceType),
            machineImage: natAmi,
            securityGroup,
            role: instanceRole,
            userData,
        });
        const cfnInstance = this.instance.node.defaultChild;
        cfnInstance.sourceDestCheck = false;
        new cdk.CfnOutput(this, "NatInstancePublicIp", {
            value: this.instance.instancePublicIp,
            description: "Public IP of the NAT instance",
        });
        const natInstance = this.instance;
        if (!natInstance) {
            return;
        }
        props.vpc.privateSubnets.forEach((subnet, index) => {
            const route = new ec2.CfnRoute(this, `NatInstanceDefaultRoute${index}`, {
                routeTableId: subnet.routeTable.routeTableId,
                destinationCidrBlock: "0.0.0.0/0",
                instanceId: natInstance.instanceId,
            });
            route.node.addDependency(natInstance);
        });
    }
}
exports.NatInstanceConstruct = NatInstanceConstruct;
//# sourceMappingURL=nat-instance.js.map