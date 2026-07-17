/**
 * Sync BS PREVIOUS_YEAR from period …00 into monthly as_of_period slices.
 */
import { executeQuery, executeProcedure } from '../config/database.js';
import { fisPreviousYearPeriodForYear, fisReportYearFromPeriod, isFisPreviousYearPeriod, } from '../utils/fisPreviousYearPeriod.js';
export async function syncBsPreviousYearColumn(params) {
    const entity = params.entityCode.trim().toUpperCase();
    const period = params.period.trim();
    const reportYear = fisReportYearFromPeriod(period);
    const sourcePeriod = isFisPreviousYearPeriod(period)
        ? period
        : fisPreviousYearPeriodForYear(reportYear);
    const outputTable = params.outputTable === 'new' ? 'new' : 'live';
    const result = await executeProcedure('rp.usp_SyncFISPreviousYearColumn', {
        entity_code: entity,
        source_period: sourcePeriod,
        file_status: params.fileStatus ?? null,
        output_table: outputTable,
    });
    if (result.error)
        throw new Error(result.error);
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return {
        sourcePeriod,
        monthlyPeriodsUpdated: Number(row?.monthly_periods_updated ?? 0),
        rowsCopied: Number(row?.rows_copied ?? 0),
    };
}
/** After monthly BS publish: restore PREVIOUS_YEAR from …00 if present. */
export async function restoreBsPreviousYearAfterMonthlyRun(params) {
    if (isFisPreviousYearPeriod(params.asOfPeriod))
        return;
    const sourcePeriod = fisPreviousYearPeriodForYear(fisReportYearFromPeriod(params.asOfPeriod));
    const entity = params.entityCode.trim().toUpperCase();
    const table = params.outputTable === 'new' ? 'rp.fis_report_output_new' : 'rp.fis_report_output';
    const exists = await executeQuery(`SELECT COUNT(*) AS cnt
     FROM ${table}
     WHERE report_type_code = N'BS'
       AND entity_code = @entity
       AND as_of_period = @sourcePeriod
       AND column_code = N'PREVIOUS_YEAR'
       AND (@fileStatus IS NULL OR file_status = @fileStatus)`, {
        entity,
        sourcePeriod,
        fileStatus: params.fileStatus ?? null,
    });
    if (exists.error)
        throw new Error(exists.error);
    if (!exists.data?.[0]?.cnt)
        return;
    await syncBsPreviousYearColumn({
        entityCode: entity,
        period: sourcePeriod,
        fileStatus: params.fileStatus,
        outputTable: params.outputTable,
    });
}
//# sourceMappingURL=FISPreviousYearSyncService.js.map