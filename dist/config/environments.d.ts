import type { GlobalTagValues } from "./globals";
export type EnvironmentName = "dev" | "hml" | "prd";
export interface VpcSettings {
    cidr: string;
    availabilityZones?: string[];
    natGatewayCount: number;
    useNatInstance: boolean;
}
export interface NatInstanceSettings {
    instanceType: string;
    allowSshFrom?: string[];
}
export interface RdsSettings {
    instanceType: string;
    allocatedStorage: number;
    multiAz: boolean;
    databaseName: string;
    adminUser: string;
    appUser: string;
    backupRetentionDays: number;
    enableReplica: boolean;
}
export interface EcsSettings {
    buildOnDeploy: boolean;
    cpu: number;
    memoryMiB: number;
    desiredCount: number;
    repositoryName?: string;
    manageRepository?: boolean;
    imageTag: string;
    containerPort: number;
    assignPublicIp: boolean;
    minCapacity: number;
    maxCapacity: number;
    scalingTargetUtilization: number;
    requestsPerTarget: number;
    certificateArn?: string;
    domainName?: string;
    hostedZoneId?: string;
    hostedZoneName?: string;
}
export interface ObservabilityAlbAccessLogSettings {
    enabled: boolean;
    prefix?: string;
    expirationDays?: number;
}
export interface ObservabilitySettings {
    alertEmail?: string;
    logRetentionDays: number;
    albAccessLogs?: ObservabilityAlbAccessLogSettings;
}
export interface DashboardSettings {
    enabled: boolean;
    domainName?: string;
    hostedZoneId?: string;
    hostedZoneName?: string;
    certificateArn?: string;
    bucketName?: string;
}
export interface EnvironmentSettings {
    region: string;
    service: string;
    client: string;
    confidentiality?: string;
    vpc: VpcSettings;
    natInstance?: NatInstanceSettings;
    rds: RdsSettings;
    ecs: EcsSettings;
    observability: ObservabilitySettings;
    dashboard?: DashboardSettings;
    tagOverrides?: Partial<GlobalTagValues>;
}
export declare function resolveEnvironment(env?: string): {
    name: EnvironmentName;
    config: EnvironmentSettings;
};
