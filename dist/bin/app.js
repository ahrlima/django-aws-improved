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
const cdk = __importStar(require("aws-cdk-lib"));
const environments_1 = require("../config/environments");
const globals_1 = require("../config/globals");
const network_stack_1 = require("../lib/stacks/network-stack");
const data_stack_1 = require("../lib/stacks/data-stack");
const app_stack_1 = require("../lib/stacks/app-stack");
const app = new cdk.App();
const envContext = app.node.tryGetContext("env") ?? app.node.tryGetContext("environment");
const explicitRegion = app.node.tryGetContext("region");
const { name: envName, config } = (0, environments_1.resolveEnvironment)(envContext);
const region = typeof explicitRegion === "string" && explicitRegion.length > 0 ? explicitRegion : config.region;
const nameFor = (resource) => (0, globals_1.naming)({ env: envName, service: config.service, resource, client: config.client });
const stackEnv = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region,
};
const networkStack = new network_stack_1.NetworkStack(app, `NetworkStack-${envName}`, {
    env: stackEnv,
    envName,
    config,
    globals: globals_1.globals,
    nameFor,
});
const dataStack = new data_stack_1.DataStack(app, `DataStack-${envName}`, {
    env: stackEnv,
    envName,
    config,
    globals: globals_1.globals,
    nameFor,
    vpc: networkStack.vpc,
});
const appStack = new app_stack_1.AppStack(app, `AppStack-${envName}`, {
    env: stackEnv,
    envName,
    config,
    globals: globals_1.globals,
    nameFor,
    vpc: networkStack.vpc,
    database: dataStack.database,
    databaseSecret: dataStack.database.secret,
    defaultImageTag: config.ecs.imageTag,
});
dataStack.addDependency(networkStack);
appStack.addDependency(dataStack);
//# sourceMappingURL=app.js.map