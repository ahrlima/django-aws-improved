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
exports.DataStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const globals_1 = require("../../config/globals");
const rds_1 = require("../constructs/rds");
const db_init_1 = require("../constructs/db-init");
class DataStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { envName, config, globals, nameFor, vpc } = props;
        (0, globals_1.applyGlobalTags)(this, envName, {
            confidentiality: config.confidentiality ?? globals.tags.confidentiality,
            ...config.tagOverrides,
        });
        const databaseConstruct = new rds_1.RdsConstruct(this, "Rds", {
            vpc,
            namer: nameFor,
            security: globals.security,
            multiAz: config.rds.multiAz,
            allocatedStorage: config.rds.allocatedStorage,
            instanceType: config.rds.instanceType,
            databaseName: config.rds.databaseName,
            adminUser: config.rds.adminUser,
            appUser: config.rds.appUser,
            backupRetentionDays: config.rds.backupRetentionDays,
            enableReplica: config.rds.enableReplica,
        });
        this.database = databaseConstruct.db;
        new db_init_1.DbInitConstruct(this, "DbInit", {
            vpc,
            namer: nameFor,
            database: this.database,
            region: config.region,
            databaseName: config.rds.databaseName,
            adminUser: config.rds.adminUser,
            appUser: config.rds.appUser,
            secret: databaseConstruct.db.secret,
        });
    }
}
exports.DataStack = DataStack;
//# sourceMappingURL=data-stack.js.map