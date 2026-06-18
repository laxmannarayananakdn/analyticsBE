/**
 * FIS Country master data (admin.fis_country, admin.fis_country_entity)
 */
export interface FisCountry {
    countryCode: string;
    countryName: string;
    createdAt?: string;
    updatedAt?: string;
}
export interface CreateFisCountryRequest {
    countryCode: string;
    countryName: string;
    createdBy?: string;
}
export interface UpdateFisCountryRequest {
    countryName?: string;
    updatedBy?: string;
}
export declare function getAllFisCountries(): Promise<FisCountry[]>;
export declare function getFisCountryByCode(countryCode: string): Promise<FisCountry | null>;
export declare function createFisCountry(req: CreateFisCountryRequest): Promise<FisCountry>;
export declare function updateFisCountry(countryCode: string, req: UpdateFisCountryRequest): Promise<FisCountry>;
export declare function setEntityCountry(entityCode: string, countryCode: string | null | undefined, updatedBy?: string): Promise<void>;
export declare function getEntityCountryCode(entityCode: string): Promise<string | null>;
//# sourceMappingURL=FisCountryService.d.ts.map