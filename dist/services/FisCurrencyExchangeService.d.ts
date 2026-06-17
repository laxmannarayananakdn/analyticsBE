/**
 * FIS Currency Exchange master data (admin.fis_currency_exchange)
 * with currency names and entity mappings (admin.fis_currency, admin.fis_currency_entity)
 */
export declare const TO_CURRENCY = "USD";
export type ExchangeType = 'Actual' | 'Budget' | 'Plan' | 'Average' | 'Spot';
export interface FisCurrencyEntityRef {
    entityCode: string;
    entityName: string;
}
export interface FisCurrencyExchange {
    exchangeId: number;
    fromCurrency: string;
    toCurrency: string;
    currencyName: string | null;
    entities: FisCurrencyEntityRef[];
    exchangeRate: number;
    exchangeType: ExchangeType;
    effectiveFrom: string;
    effectiveTo: string | null;
    year: number;
    createdBy?: string | null;
    createdAt?: string;
    updatedBy?: string | null;
    updatedAt?: string;
}
export interface CreateFisCurrencyExchangeRequest {
    fromCurrency: string;
    currencyName: string;
    entityCodes?: string[];
    exchangeRate: number;
    exchangeType: ExchangeType;
    effectiveFrom: string;
    effectiveTo?: string | null;
    year: number;
    createdBy?: string;
}
export interface UpdateFisCurrencyExchangeRequest {
    currencyName?: string;
    entityCodes?: string[];
    exchangeRate?: number;
    exchangeType?: ExchangeType;
    effectiveFrom?: string;
    effectiveTo?: string | null;
    year?: number;
    updatedBy?: string;
}
export declare function getAvailableYears(): Promise<number[]>;
export declare function getAllFisCurrencyExchanges(year?: number): Promise<FisCurrencyExchange[]>;
export declare function getFisCurrencyExchangeById(exchangeId: number): Promise<FisCurrencyExchange | null>;
export declare function createFisCurrencyExchange(req: CreateFisCurrencyExchangeRequest): Promise<FisCurrencyExchange>;
export declare function updateFisCurrencyExchange(exchangeId: number, req: UpdateFisCurrencyExchangeRequest): Promise<FisCurrencyExchange>;
//# sourceMappingURL=FisCurrencyExchangeService.d.ts.map