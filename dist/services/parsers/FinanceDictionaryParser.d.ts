import { ValidationResult } from '../../types/errors.js';
import { FinanceDictionaryRecord } from '../../types/ef.js';
export declare class FinanceDictionaryParser {
    parseFinanceDictionary(fileBuffer: Buffer, skipInvalidRows?: boolean): Promise<ValidationResult<FinanceDictionaryRecord>>;
}
//# sourceMappingURL=FinanceDictionaryParser.d.ts.map