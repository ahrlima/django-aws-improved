import type { Construct } from "constructs";
export interface NamingInput {
    env: string;
    service: string;
    resource: string;
    client: string;
}
export interface GlobalTagValues {
    project: string;
    owner: string;
    managedBy: string;
    confidentiality: string;
}
export interface SecurityDefaults {
    enforceEncryptionAtRest: boolean;
    enforceTls: boolean;
    enableGuardDuty: boolean;
    enableWaf: boolean;
    logGroupPrefix: string;
    kmsAliases?: {
        logs?: string;
        rds?: string;
        general?: string;
    };
}
export interface GlobalsConfig {
    readonly tags: GlobalTagValues;
    readonly security: SecurityDefaults;
}
export declare function naming(input: NamingInput): string;
export declare const globals: GlobalsConfig;
export declare function applyGlobalTags(scope: Construct, env: string, overrides?: Partial<GlobalTagValues>): void;
