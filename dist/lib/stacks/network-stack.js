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
exports.NetworkStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const globals_1 = require("../../config/globals");
const vpc_1 = require("../constructs/vpc");
const nat_instance_1 = require("../constructs/nat-instance");
class NetworkStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { envName, config, globals, nameFor } = props;
        (0, globals_1.applyGlobalTags)(this, envName, {
            confidentiality: config.confidentiality ?? globals.tags.confidentiality,
            ...config.tagOverrides,
        });
        const availabilityZones = config.vpc.availabilityZones && config.vpc.availabilityZones.length > 0
            ? config.vpc.availabilityZones
            : this.availabilityZones.length > 0
                ? this.availabilityZones
                : [`${this.region}a`, `${this.region}b`];
        const vpcConstruct = new vpc_1.VpcConstruct(this, "Vpc", {
            namer: nameFor,
            cidr: config.vpc.cidr,
            availabilityZones,
            natGatewayCount: config.vpc.natGatewayCount,
            useNatInstance: config.vpc.useNatInstance,
        });
        this.vpc = vpcConstruct.vpc;
        new nat_instance_1.NatInstanceConstruct(this, "NatInstance", {
            vpc: this.vpc,
            namer: nameFor,
            enableNatInstance: config.vpc.useNatInstance,
            instanceType: config.natInstance?.instanceType ?? "t3.micro",
            allowedSshCidrs: config.natInstance?.allowSshFrom ?? [],
        });
    }
}
exports.NetworkStack = NetworkStack;
//# sourceMappingURL=network-stack.js.map