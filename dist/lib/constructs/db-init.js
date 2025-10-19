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
exports.DbInitConstruct = void 0;
const constructs_1 = require("constructs");
const path = __importStar(require("path"));
const aws_cdk_lib_1 = require("aws-cdk-lib");
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const cr = __importStar(require("aws-cdk-lib/custom-resources"));
const aws_lambda_python_alpha_1 = require("@aws-cdk/aws-lambda-python-alpha");
/**
 * Runs a one-time Lambda-backed custom resource to initialise database roles
 * and the application user using IAM authentication.
 */
class DbInitConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const fn = new aws_lambda_python_alpha_1.PythonFunction(this, "DbInitFunction", {
            functionName: props.namer("lambda-dbinit"),
            entry: path.join(__dirname, "../../lambda/db_init"),
            runtime: lambda.Runtime.PYTHON_3_12,
            index: "index.py",
            handler: "handler",
            vpc: props.vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            environment: {
                DB_HOST: props.database.dbInstanceEndpointAddress,
                DB_USER: props.adminUser,
                DB_NAME: props.databaseName,
                APP_USER: props.appUser,
                DB_SECRET_ARN: props.secret.secretArn,
            },
            timeout: aws_cdk_lib_1.Duration.seconds(30),
        });
        fn.addToRolePolicy(new iam.PolicyStatement({
            actions: ["rds-db:connect", "rds:DescribeDBInstances", "rds:GenerateDbAuthToken"],
            resources: ["*"],
        }));
        props.secret.grantRead(fn);
        props.database.connections.allowFrom(fn, ec2.Port.tcp(5432), "Allow DB init Lambda to reach PostgreSQL");
        new cr.AwsCustomResource(this, "DbInitTrigger", {
            resourceType: "Custom::DjangoDbInit",
            policy: cr.AwsCustomResourcePolicy.fromStatements([
                new iam.PolicyStatement({
                    actions: ["lambda:InvokeFunction"],
                    resources: [fn.functionArn],
                }),
            ]),
            onCreate: {
                service: "Lambda",
                action: "invoke",
                parameters: { FunctionName: fn.functionName },
                physicalResourceId: cr.PhysicalResourceId.of(props.namer("dbinit")),
            },
            onUpdate: {
                service: "Lambda",
                action: "invoke",
                parameters: { FunctionName: fn.functionName },
            },
        });
    }
}
exports.DbInitConstruct = DbInitConstruct;
//# sourceMappingURL=db-init.js.map