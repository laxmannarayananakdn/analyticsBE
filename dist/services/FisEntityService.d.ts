/**
 * FIS Entity master data (admin.fis_entity)
 */
export interface FisEntity {
    entityCode: string;
    entityName: string;
    status: 'active' | 'inactive';
    countryCode?: string | null;
    countryName?: string | null;
    createdAt?: string;
    updatedAt?: string;
}
export interface CreateFisEntityRequest {
    entityCode: string;
    entityName: string;
    status?: 'active' | 'inactive';
    countryCode?: string | null;
    createdBy?: string;
}
export interface UpdateFisEntityRequest {
    entityName?: string;
    status?: 'active' | 'inactive';
    countryCode?: string | null;
    updatedBy?: string;
}
export declare function getAllFisEntities(activeOnly?: boolean): Promise<FisEntity[]>;
export declare function getFisEntityByCode(entityCode: string): Promise<FisEntity | null>;
export declare function createFisEntity(req: CreateFisEntityRequest): Promise<FisEntity>;
export declare function updateFisEntity(entityCode: string, req: UpdateFisEntityRequest): Promise<FisEntity>;
//# sourceMappingURL=FisEntityService.d.ts.map