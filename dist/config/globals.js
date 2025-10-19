"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globals = void 0;
exports.naming = naming;
exports.applyGlobalTags = applyGlobalTags;
const aws_cdk_lib_1 = require("aws-cdk-lib");
function naming(input) {
    return `${input.env}-${input.service}-${input.resource}-${input.client}`.toLowerCase();
}
exports.globals = {
    tags: {
        project: "django-ecs",
        owner: "platform-team",
        managedBy: "cdk",
        confidentiality: "internal",
    },
    security: {
        enforceEncryptionAtRest: true,
        enforceTls: false,
        enableGuardDuty: false,
        enableWaf: false,
        logGroupPrefix: "/aws/django-ecs",
        kmsAliases: {
            rds: "alias/aws/rds",
        },
    },
};
function applyGlobalTags(scope, env, overrides) {
    const values = {
        ...exports.globals.tags,
        ...overrides,
    };
    aws_cdk_lib_1.Tags.of(scope).add("Project", values.project);
    aws_cdk_lib_1.Tags.of(scope).add("Owner", values.owner);
    aws_cdk_lib_1.Tags.of(scope).add("ManagedBy", values.managedBy);
    aws_cdk_lib_1.Tags.of(scope).add("Confidentiality", values.confidentiality);
    aws_cdk_lib_1.Tags.of(scope).add("Environment", env);
}
//# sourceMappingURL=globals.js.map