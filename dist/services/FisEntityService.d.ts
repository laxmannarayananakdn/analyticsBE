/**
 * FIS Entity master data (admin.fis_entity)
 */
export interface FisEntity {
    entityCode: string;
    entityName: string;
    status: 'active' | 'inactive';
    createdAt?: string;
    updatedAt?: string;
}
export interface CreateFisEntityRequest {
    entityCode: string;
    entityName: string;
    status?: 'active' | 'inactive';
    createdBy?: string;
}
export interface UpdateFisEntityRequest {
    entityName?: string;
    status?: 'active' | 'inactive';
    updatedBy?: string;
}
export declare function getAllFisEntities(activeOnly?: boolean): Promise<FisEntity[]>;
export declare function getFisEntityByCode(entityCode: string): Promise<FisEntity | null>;
export declare function createFisEntity(req: CreateFisEntityRequest): Promise<FisEntity>;
export declare function updateFisEntity(entityCode: string, req: UpdateFisEntityRequest): Promise<FisEntity>;
//# sourceMappingURL=FisEntityService.d.ts.map