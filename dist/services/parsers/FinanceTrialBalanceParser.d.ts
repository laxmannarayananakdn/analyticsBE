import { ValidationResult } from '../../types/errors.js';
import { FinanceTrialBalanceRecord } from '../../types/ef.js';
export declare class FinanceTrialBalanceParser {
    parseFinanceTrialBalance(fileBuffer: Buffer, skipInvalidRows?: boolean): Promise<ValidationResult<FinanceTrialBalanceRecord>>;
}
//# sourceMappingURL=FinanceTrialBalanceParser.d.ts.map