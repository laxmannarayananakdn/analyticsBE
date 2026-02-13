/**
 * Microsoft Tenant Config Service
 * CRUD for Azure AD tenant configs and OAuth token verification
 */
import { executeQuery } from '../config/database.js';
function rowToConfig(row) {
    return {
        tenantConfigId: row.Tenant_Config_ID,
        domain: row.Domain,
        authorityTenant: row.Authority_Tenant,
        clientId: row.Client_ID,
        clientSecret: row.Client_Secret,
        displayName: row.Display_Name,
        isActive: !!row.Is_Active,
        createdDate: row.Created_Date,
        modifiedDate: row.Modified_Date,
        createdBy: row.Created_By,
    };
}
/**
 * Get all tenant configs (including secrets - admin only)
 */
export async function getAllTenantConfigs() {
    const result = await executeQuery(`SELECT * FROM admin.Microsoft_Tenant_Config ORDER BY Domain`);
    if (result.error || !result.data)
        return [];
    return result.data.map(rowToConfig);
}
/**
 * Get tenant config by domain (for login - returns public fields only, no secret)
 * Used by frontend to determine if Microsoft login is available and get client config
 */
export async function getTenantConfigByDomainPublic(domain) {
    const normalizedDomain = domain?.toLowerCase().trim();
    if (!normalizedDomain)
        return null;
    const result = await executeQuery(`SELECT Domain, Authority_Tenant, Client_ID, Display_Name 
     FROM admin.Microsoft_Tenant_Config 
     WHERE LOWER(TRIM(Domain)) = @domain AND Is_Active = 1`, { domain: normalizedDomain });
    if (result.error || !result.data || result.data.length === 0)
        return null;
    const row = result.data[0];
    const authorityTenant = row.Authority_Tenant || row.Domain;
    const authority = `https://login.microsoftonline.com/${authorityTenant}`;
    return {
        clientId: row.Client_ID,
        authority,
        displayName: row.Display_Name,
    };
}
/**
 * Get tenant config by domain (full - includes secret) for token verification
 */
export async function getTenantConfigByDomain(domain) {
    const normalizedDomain = domain?.toLowerCase().trim();
    if (!normalizedDomain)
        return null;
    const result = await executeQuery(`SELECT * FROM admin.Microsoft_Tenant_Config 
     WHERE LOWER(TRIM(Domain)) = @domain AND Is_Active = 1`, { domain: normalizedDomain });
    if (result.error || !result.data || result.data.length === 0)
        return null;
    return rowToConfig(result.data[0]);
}
/**
 * Get tenant config by client ID (for token verification - token aud claim)
 */
export async function getTenantConfigByClientId(clientId) {
    const result = await executeQuery(`SELECT * FROM admin.Microsoft_Tenant_Config 
     WHERE Client_ID = @clientId AND Is_Active = 1`, { clientId });
    if (result.error || !result.data || result.data.length === 0)
        return null;
    return rowToConfig(result.data[0]);
}
/**
 * Create tenant config
 */
export async function createTenantConfig(data) {
    const domain = data.domain.trim();
    if (!domain || !data.clientId || !data.clientSecret) {
        return { config: null, error: 'Domain, client ID, and client secret are required' };
    }
    const existing = await getTenantConfigByDomain(domain.toLowerCase());
    if (existing) {
        return { config: null, error: 'A config for this domain already exists' };
    }
    const result = await executeQuery(`INSERT INTO admin.Microsoft_Tenant_Config 
     (Domain, Authority_Tenant, Client_ID, Client_Secret, Display_Name, Is_Active, Created_By)
     OUTPUT INSERTED.*
     VALUES (@domain, @authorityTenant, @clientId, @clientSecret, @displayName, 1, @createdBy)`, {
        domain,
        authorityTenant: data.authorityTenant || null,
        clientId: data.clientId.trim(),
        clientSecret: data.clientSecret,
        displayName: data.displayName || null,
        createdBy: data.createdBy || null,
    });
    if (result.error || !result.data || result.data.length === 0) {
        return { config: null, error: result.error || 'Failed to create tenant config' };
    }
    return { config: rowToConfig(result.data[0]) };
}
/**
 * Update tenant config
 */
export async function updateTenantConfig(id, data) {
    const updates = [];
    const params = { id };
    if (data.domain !== undefined) {
        updates.push('Domain = @domain');
        params.domain = data.domain.trim();
    }
    if (data.authorityTenant !== undefined) {
        updates.push('Authority_Tenant = @authorityTenant');
        params.authorityTenant = data.authorityTenant || null;
    }
    if (data.clientId !== undefined) {
        updates.push('Client_ID = @clientId');
        params.clientId = data.clientId.trim();
    }
    if (data.clientSecret !== undefined) {
        updates.push('Client_Secret = @clientSecret');
        params.clientSecret = data.clientSecret;
    }
    if (data.displayName !== undefined) {
        updates.push('Display_Name = @displayName');
        params.displayName = data.displayName || null;
    }
    if (data.isActive !== undefined) {
        updates.push('Is_Active = @isActive');
        params.isActive = data.isActive ? 1 : 0;
    }
    if (updates.length === 0) {
        const all = await executeQuery(`SELECT * FROM admin.Microsoft_Tenant_Config WHERE Tenant_Config_ID = @id`, { id });
        if (all.error || !all.data || all.data.length === 0) {
            return { config: null, error: 'Tenant config not found' };
        }
        return { config: rowToConfig(all.data[0]) };
    }
    updates.push('Modified_Date = GETDATE()');
    const result = await executeQuery(`UPDATE admin.Microsoft_Tenant_Config SET ${updates.join(', ')} OUTPUT INSERTED.* WHERE Tenant_Config_ID = @id`, params);
    if (result.error || !result.data || result.data.length === 0) {
        return { config: null, error: result.error || 'Failed to update tenant config' };
    }
    return { config: rowToConfig(result.data[0]) };
}
/**
 * Delete tenant config
 */
export async function deleteTenantConfig(id) {
    const result = await executeQuery(`DELETE FROM admin.Microsoft_Tenant_Config WHERE Tenant_Config_ID = @id`, { id });
    if (result.error)
        return { error: result.error };
    return {};
}
//# sourceMappingURL=MicrosoftTenantService.js.map