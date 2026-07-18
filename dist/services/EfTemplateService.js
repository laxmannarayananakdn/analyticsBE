/**
 * Generates downloadable upload templates for each EF file type.
 * Column layouts mirror the parsers in services/parsers/.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
const FIN_DIC_CODE_COLUMN = {
    FIN_DIC_ACCOUNT: 'Account',
    FIN_DIC_ACTIVITY: 'Activity',
    FIN_DIC_DEPARTMENT: 'Department',
    FIN_DIC_FIXED_ASSETS: 'FixedAssets',
    FIN_DIC_OPERATING_UNIT: 'OperatingUnit',
    FIN_DIC_PARTY: 'Party',
    FIN_DIC_PROJECT: 'Project',
    FIN_DIC_REFERENCE: 'Reference',
    FIN_DIC_REGION: 'Region',
    FIN_DIC_RESOURCE: 'Resource',
    FIN_DIC_SOURCE_OF_FUND: 'SourceOfFund',
};
const SUPPORTED_TEMPLATE_TYPES = new Set([
    'IB_EXTERNAL_EXAMS',
    'MSNAV_FINANCIAL_AID',
    'CEM_INITIAL',
    'CEM_FINAL',
    'HR_EMPLOYEE_DATA',
    'HR_BUDGET_VS_ACTUAL',
    ...Object.keys(FIN_DIC_CODE_COLUMN),
    'FIN_TB_ACTUAL',
    'FIN_TB_BUDGET',
]);
export function isSupportedTemplateType(typeCode) {
    return SUPPORTED_TEMPLATE_TYPES.has(typeCode.toUpperCase());
}
function workbookToBuffer(workbook, bookType) {
    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType }));
}
function resolveMsnavTemplatePath() {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
        // Deployed / local backend root
        path.join(process.cwd(), 'templates', 'MSNAV_Financial_Aid_template.xlsx'),
        // From dist/services or src/services → backend/templates
        path.join(here, '..', '..', 'templates', 'MSNAV_Financial_Aid_template.xlsx'),
        // Repo Sample/ when running from monorepo
        path.join(process.cwd(), '..', 'Sample', 'Financial_Aid_template.xlsx'),
        path.join(process.cwd(), 'Sample', 'Financial_Aid_template.xlsx'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}
function generateIbExternalExamsTemplate() {
    const headers = [
        'Year',
        'Month',
        'School',
        'Registration_Number',
        'Personal_Code',
        'Name',
        'Category',
        'Subject',
        'Level',
        'Language',
        'Predicted_Grade',
        'Grade',
        'EE_TOK_Points',
        'Total_Points',
        'Result',
        'Diploma_Requirements_Code',
    ];
    const sample = [
        2025,
        'MAY',
        '049369',
        '0001',
        'jfx329',
        'Jane Doe',
        'DIPLOMA',
        'Biology',
        'SL',
        'ENGLISH',
        '5',
        '6',
        '2',
        '32',
        'PASS',
        'A',
    ];
    const csv = `${headers.join(',')}\n${sample.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')}\n`;
    return {
        buffer: Buffer.from(csv, 'utf-8'),
        fileName: 'IB_External_Exams_template.csv',
        contentType: 'text/csv; charset=utf-8',
    };
}
function generateMsnavFinancialAidTemplate() {
    const templatePath = resolveMsnavTemplatePath();
    if (templatePath) {
        return {
            buffer: fs.readFileSync(templatePath),
            fileName: 'MSNAV_Financial_Aid_template.xlsx',
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
    }
    // Fallback if the sample file is missing from the deploy package
    const headers = [
        'S.No',
        'UCI',
        'Academic Year',
        'Class',
        'Class Code',
        'Student No',
        'Student Name',
        'Percentage',
        'Fee Classification',
        'FA Sub-Type',
        'Fee Code',
        'Community status',
        'Year of Joining Academy',
        'Curriculum from which the student joined the academy',
        'Talent ID Prog. [Yes]',
        'Rebalancing [Tajik/Afgh/Syri/Iranian]',
    ];
    const sample = [
        1,
        '19MAP0516',
        '2025-26',
        'DP2',
        'DP2-A-DP-IB-2025-26',
        'S030235',
        'ROZY TIVANE',
        100,
        'SS-RES',
        'Talent ID',
        'TUITION SS',
        'ISMAILI',
        '1/22/2020',
        '',
        'TID',
        '',
    ];
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([headers, sample]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Financial Aid');
    return {
        buffer: workbookToBuffer(workbook, 'xlsx'),
        fileName: 'MSNAV_Financial_Aid_template.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
}
function generateCemInitialTemplate() {
    const headers = [
        'Student_ID',
        'Class',
        'Name',
        'Gender',
        'Date_of_Birth',
        'Year_Group',
        'GCSE_Score',
        'Subject',
        'Level',
        'GCSE_Prediction_Points',
        'GCSE_Prediction_Grade',
        'Test_Taken',
        'Test_Score',
        'Test_Prediction_Points',
        'Test_Prediction_Grade',
    ];
    const sample = [
        'STU001',
        '11A',
        'Jane Doe',
        'F',
        '09/06/07',
        11,
        '',
        'Mathematics',
        'HL',
        '',
        '',
        'Adaptive',
        112.5,
        6.2,
        '6',
    ];
    const rows = [
        ['Alis Prediction Report'],
        [],
        headers,
        [],
        sample,
    ];
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Prediction Report');
    return {
        buffer: workbookToBuffer(workbook, 'biff8'),
        fileName: 'CEM_Initial_Prediction_Report_template.xls',
        contentType: 'application/vnd.ms-excel',
    };
}
function generateCemFinalTemplate() {
    const headers = [
        'Student_ID',
        'Class',
        'Surname',
        'Forename',
        'Gender',
        'Exam_Type',
        'Subject_Title',
        'Syllabus_Title',
        'Exam_Board',
        'Syllabus_Code',
        'Grade',
        'Grade_as_Points',
        'GCSE_Score',
        'GCSE_Prediction',
        'GCSE_Residual',
        'GCSE_Standardised_Residual',
        'GCSE_Gender_Adj_Prediction',
        'GCSE_Gender_Adj_Residual',
        'GCSE_Gender_Adj_Std_Residual',
        'Adaptive_Score',
        'Adaptive_Prediction',
        'Adaptive_Residual',
        'Adaptive_Standardised_Residual',
        'Adaptive_Gender_Adj_Prediction',
        'Adaptive_Gender_Adj_Residual',
        'Adaptive_Gender_Adj_Std_Residual',
        'TDA_Score',
        'TDA_Prediction',
        'TDA_Residual',
        'TDA_Standardised_Residual',
        'TDA_Gender_Adj_Prediction',
        'TDA_Gender_Adj_Residual',
        'TDA_Gender_Adj_Std_Residual',
    ];
    const sample = [
        'STU001',
        '11A',
        'Doe',
        'Jane',
        'F',
        'A Level',
        'Mathematics',
        'Mathematics',
        'Edexcel',
        '9MA0',
        'A',
        7,
        6.5,
        6.8,
        0.3,
        0.15,
        6.7,
        0.2,
        0.1,
        112,
        6.5,
        0.5,
        0.2,
        6.4,
        0.6,
        0.25,
        105,
        6.2,
        0.3,
        0.12,
        6.1,
        0.4,
        0.18,
    ];
    const rows = [
        ['Alis SLR Report'],
        ['School:', 'Example School'],
        ['Academic Year:', '2025-2026'],
        ['Report Date:', '01/07/2025'],
        [],
        headers.slice(0, 11),
        headers.slice(11, 20),
        headers.slice(20),
        sample,
    ];
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Subject Level Analysis');
    return {
        buffer: workbookToBuffer(workbook, 'biff8'),
        fileName: 'CEM_Final_Subject_Level_Analysis_template.xls',
        contentType: 'application/vnd.ms-excel',
    };
}
function generateHrEmployeeDataTemplate() {
    const headers = [
        'Year',
        'Quarter',
        'Month',
        'Country / City',
        'Entity',
        'Emp ID',
        'Position Category',
        'Attrition',
        'FTE',
        'Date of Birth',
        'Date of Hire',
        'Sect',
        'Staff Nationality',
        'Gender',
        'Teaching Level',
        'Teaching Subject Category',
        'Qualification',
        'Date of Separation',
        'reason for leaving',
        'Aging',
        'Age Grouping',
        'Longevity',
        'Longevity Grouping',
        'Reason type',
        'Reporting Year',
        'recruitment',
        'separation',
        'Staff Category',
        'Contract type',
        'Key',
        'Node_ID',
    ];
    const sample = [
        2025,
        'Q1',
        'January',
        'KEN',
        'AKS Nairobi',
        'EMP001',
        'Teaching',
        'No',
        1,
        '15/03/1985',
        '01/08/2010',
        'Secondary',
        'Kenyan',
        'F',
        'Secondary',
        'Mathematics',
        'B.Ed',
        '',
        '',
        40,
        '35-44',
        14,
        '10-15 years',
        '',
        '2025',
        '',
        '',
        'Teaching',
        'Permanent',
        'KEN-EMP001',
        'NODE001',
    ];
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([headers, sample]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Employee Data');
    return {
        buffer: workbookToBuffer(workbook, 'xlsx'),
        fileName: 'HR_Employee_Data_template.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
}
function generateHrBudgetVsActualTemplate() {
    const headers = ['Year', 'Quarter', 'Country', 'Category', 'Budget', 'Key'];
    const sample = ['2025', 'Q1', 'Kenya', 'Teaching Staff', 1500000, 'KEN-Q1-Teaching'];
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([headers, sample]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Budget vs actual');
    return {
        buffer: workbookToBuffer(workbook, 'xlsx'),
        fileName: 'HR_Budget_vs_Actual_template.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
}
function generateFinanceDictionaryTemplate(typeCode) {
    const codeColumn = FIN_DIC_CODE_COLUMN[typeCode];
    if (!codeColumn) {
        throw new Error(`Unsupported finance dictionary type: ${typeCode}`);
    }
    const headers = [codeColumn, 'Description', 'Suspended', 'Entity', 'GroupDimension', 'RunBy', 'RunDTM'];
    const sample = ['1000', 'Cash and Bank', 'No', 'TZES', 'Assets', 'admin@example.com', '2026-04-01 10:00:00'];
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([headers, sample]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Dictionary');
    return {
        buffer: workbookToBuffer(workbook, 'xlsx'),
        fileName: `Dic_${codeColumn}_template.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
}
function generateFinanceTrialBalanceTemplate(typeCode) {
    const isBudget = typeCode.toUpperCase() === 'FIN_TB_BUDGET';
    const headers = [
        'MainAccount',
        'FundingSource',
        'Region',
        'OperatingUnit',
        'Department',
        'Project',
        'Activity',
        'Resource',
        'Party',
        'FixedAssets',
        'Reference',
        'Debit',
        'Credit',
        'Status',
        'RunBy',
        'RunDTM',
    ];
    const sample = [
        '1000',
        'GEN',
        'EA',
        'TZES',
        'FIN',
        '',
        '',
        '',
        '',
        '',
        '',
        50000,
        0,
        'Posted',
        'admin@example.com',
        '2026-01-15 09:30:00',
    ];
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([headers, sample]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Trial Balance');
    const suffix = isBudget ? 'Budget' : 'Actual';
    return {
        buffer: workbookToBuffer(workbook, 'xlsx'),
        fileName: `TB_202601_TZES_${suffix}_template.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
}
/**
 * Generate a template file buffer for the given EF file type code.
 */
export function generateEfTemplate(typeCode) {
    const upper = typeCode.toUpperCase();
    if (!isSupportedTemplateType(upper)) {
        throw new Error(`No template available for file type: ${typeCode}`);
    }
    switch (upper) {
        case 'IB_EXTERNAL_EXAMS':
            return generateIbExternalExamsTemplate();
        case 'MSNAV_FINANCIAL_AID':
            return generateMsnavFinancialAidTemplate();
        case 'CEM_INITIAL':
            return generateCemInitialTemplate();
        case 'CEM_FINAL':
            return generateCemFinalTemplate();
        case 'HR_EMPLOYEE_DATA':
            return generateHrEmployeeDataTemplate();
        case 'HR_BUDGET_VS_ACTUAL':
            return generateHrBudgetVsActualTemplate();
        case 'FIN_TB_ACTUAL':
        case 'FIN_TB_BUDGET':
            return generateFinanceTrialBalanceTemplate(upper);
        default:
            if (FIN_DIC_CODE_COLUMN[upper]) {
                return generateFinanceDictionaryTemplate(upper);
            }
            throw new Error(`No template available for file type: ${typeCode}`);
    }
}
//# sourceMappingURL=EfTemplateService.js.map