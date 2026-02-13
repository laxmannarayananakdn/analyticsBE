/**
 * Microsoft Tenant Config Service
 * CRUD for Azure AD tenant configs and OAuth token verification
 */
export interface MicrosoftTenantConfig {
    tenantConfigId: number;
    domain: string;
    authorityTenant: string | null;
    clientId: string;
    clientSecret: string;
    displayName: string | null;
    isActive: boolean;
    createdDate?: Date;
    modifiedDate?: Date;
    createdBy?: string | null;
}
export interface MicrosoftTenantConfigRow {
    Tenant_Config_ID: number;
    Domain: string;
    Authority_Tenant: string | null;
    Client_ID: string;
    Client_Secret: string;
    Display_Name: string | null;
    Is_Active: boolean;
    Created_Date?: Date;
    Modified_Date?: Date;
    Created_By?: string | null;
}
/**
 * Get all tenant configs (including secrets - admin only)
 */
export declare function getAllTenantConfigs(): Promise<MicrosoftTenantConfig[]>;
/**
 * Get tenant config by domain (for login - returns public fields only, no secret)
 * Used by frontend to determine if Microsoft login is available and get client config
 */
export declare function getTenantConfigByDomainPublic(domain: string): Promise<{
    clientId: string;
    authority: string;
    displayName: string | null;
} | null>;
/**
 * Get tenant config by domain (full - includes secret) for token verification
 */
export declare function getTenantConfigByDomain(domain: string): Promise<MicrosoftTenantConfig | null>;
/**
 * Get tenant config by client ID (for token verification - token aud claim)
 */
export declare function getTenantConfigByClientId(clientId: string): Promise<MicrosoftTenantConfig | null>;
/**
 * Create tenant config
 */
export declare function createTenantConfig(data: {
    domain: string;
    authorityTenant?: string | null;
    clientId: string;
    clientSecret: string;
    displayName?: string | null;
    createdBy?: string;
}): Promise<{
    config: MicrosoftTenantConfig;
    error?: string;
}>;
/**
 * Update tenant config
 */
export declare function updateTenantConfig(id: number, data: {
    domain?: string;
    authorityTenant?: string | null;
    clientId?: string;
    clientSecret?: string;
    displayName?: string | null;
    isActive?: boolean;
}): Promise<{
    config: MicrosoftTenantConfig;
    error?: string;
}>;
/**
 * Delete tenant config
 */
export declare function deleteTenantConfig(id: number): Promise<{
    error?: string;
}>;
//# sourceMappingURL=MicrosoftTenantService.d.ts.map