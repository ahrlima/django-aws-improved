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
exports.VpcConstruct = void 0;
const constructs_1 = require("constructs");
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
/**
 * Builds the shared VPC topology with opinionated subnet sizing while honouring
 * the global naming convention for every network component.
 */
class VpcConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const subnetConfiguration = [
            {
                name: props.namer("subnet-public"),
                subnetType: ec2.SubnetType.PUBLIC,
                cidrMask: 26,
            },
            {
                name: props.namer("subnet-private"),
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                cidrMask: 22,
            },
        ];
        this.vpc = new ec2.Vpc(this, "Vpc", {
            vpcName: props.namer("vpc"),
            ipAddresses: ec2.IpAddresses.cidr(props.cidr),
            availabilityZones: props.availabilityZones,
            natGateways: props.useNatInstance ? 0 : Math.max(1, props.natGatewayCount),
            subnetConfiguration,
        });
    }
}
exports.VpcConstruct = VpcConstruct;
//# sourceMappingURL=vpc.js.map