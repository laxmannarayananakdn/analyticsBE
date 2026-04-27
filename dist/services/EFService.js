/**
 * EF Service
 * Handles all database operations for External Files Upload System
 */
import { getConnection, executeQuery, sql } from '../config/database.js';
import { triggerRefresh } from './RefreshService.js';
export class EFService {
    static FINANCE_DICTIONARY_CODES = new Set([
        'FIN_DIC_ACCOUNT',
        'FIN_DIC_ACTIVITY',
        'FIN_DIC_DEPARTMENT',
        'FIN_DIC_FIXED_ASSETS',
        'FIN_DIC_OPERATING_UNIT',
        'FIN_DIC_PARTY',
        'FIN_DIC_PROJECT',
        'FIN_DIC_REFERENCE',
        'FIN_DIC_REGION',
        'FIN_DIC_RESOURCE',
        'FIN_DIC_SOURCE_OF_FUND'
    ]);
    /**
     * Get MB (ManageBac) schools for MSNAV Financial Aid upload dropdown.
     * MSNAV data is for MB schools only; UCI matches MB.students.uniq_student_id.
     */
    async getMBSchools() {
        const query = `
      SELECT CAST(school_id AS NVARCHAR(50)) AS school_id, school_name
      FROM MB.managebac_school_configs
      WHERE school_id IS NOT NULL AND is_active = 1
      ORDER BY school_name
    `;
        const result = await executeQuery(query);
        if (result.error)
            throw new Error(`Failed to get MB schools: ${result.error}`);
        return result.data || [];
    }
    /**
     * Get all active file types
     */
    async getActiveFileTypes() {
        const query = `
      SELECT 
        id,
        type_code,
        type_name,
        description,
        file_extension,
        target_table,
        is_active,
        validation_rules,
        created_at,
        updated_at
      FROM EF.FileTypes
      WHERE is_active = 1
      ORDER BY type_name;
    `;
        const result = await executeQuery(query);
        if (result.error) {
            throw new Error(`Failed to get active file types: ${result.error}`);
        }
        return result.data || [];
    }
    /**
     * Create a new upload record
     * @param schoolId Required for MSNAV_FINANCIAL_AID; used to trigger RP refresh for the school
     * @returns The ID of the created upload
     */
    async createUpload(fileTypeCode, fileName, fileSize, uploadedBy = 'Admin', schoolId) {
        const query = `
      DECLARE @file_type_id INT;
      
      SELECT @file_type_id = id 
      FROM EF.FileTypes 
      WHERE type_code = @fileTypeCode AND is_active = 1;
      
      IF @file_type_id IS NULL
      BEGIN
        THROW 50000, 'File type not found or inactive', 1;
      END
      
      INSERT INTO EF.Uploads (
        file_type_id,
        file_name,
        file_size_bytes,
        status,
        uploaded_by,
        uploaded_at,
        school_id
      )
      VALUES (
        @file_type_id,
        @fileName,
        @fileSize,
        'PENDING',
        @uploadedBy,
        SYSDATETIMEOFFSET(),
        @schoolId
      );
      
      SELECT SCOPE_IDENTITY() AS id;
    `;
        const result = await executeQuery(query, {
            fileTypeCode,
            fileName,
            fileSize,
            uploadedBy,
            schoolId: schoolId ?? null
        });
        if (result.error) {
            throw new Error(`Failed to create upload: ${result.error}`);
        }
        if (!result.data || result.data.length === 0) {
            throw new Error('Failed to create upload: No ID returned');
        }
        return result.data[0].id;
    }
    /**
     * Update upload status
     */
    async updateUploadStatus(uploadId, status, rowCount, errorMessage) {
        const query = `
      UPDATE EF.Uploads
      SET 
        status = @status,
        row_count = COALESCE(@rowCount, row_count),
        error_message = @errorMessage,
        processed_at = CASE 
          WHEN @status IN ('COMPLETED', 'FAILED') THEN SYSDATETIMEOFFSET()
          ELSE processed_at
        END
      WHERE id = @uploadId;
    `;
        const params = {
            uploadId,
            status
        };
        if (rowCount !== undefined) {
            params.rowCount = rowCount;
        }
        else {
            params.rowCount = null;
        }
        if (errorMessage !== undefined) {
            params.errorMessage = errorMessage;
        }
        else {
            params.errorMessage = null;
        }
        const result = await executeQuery(query, params);
        if (result.error) {
            throw new Error(`Failed to update upload status: ${result.error}`);
        }
    }
    /**
     * Insert IB External Exams records using bulk insert
     */
    async insertIBExternalExams(uploadId, fileName, uploadedBy, records) {
        if (records.length === 0) {
            return 0;
        }
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        try {
            await transaction.begin();
            // Use bulk insert with batching for better performance
            // Batch size limited to 100 to stay within SQL Server's 2100 parameter limit
            // (100 records * ~20 parameters = ~2000 parameters)
            const batchSize = 100;
            let totalInserted = 0;
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                // Build values for batch insert
                const values = batch.map((record, index) => {
                    const baseIndex = i + index;
                    return `(
            @uploadId,
            @fileName,
            @uploadedBy,
            SYSDATETIMEOFFSET(),
            @year${baseIndex},
            @month${baseIndex},
            @school${baseIndex},
            @registrationNumber${baseIndex},
            @personalCode${baseIndex},
            @name${baseIndex},
            @category${baseIndex},
            @subject${baseIndex},
            @level${baseIndex},
            @language${baseIndex},
            @predictedGrade${baseIndex},
            @grade${baseIndex},
            @eeTokPoints${baseIndex},
            @totalPoints${baseIndex},
            @result${baseIndex},
            @diplomaRequirementsCode${baseIndex}
          )`;
                }).join(',');
                const batchQuery = `
          INSERT INTO EF.IB_ExternalExams (
            upload_id,
            file_name,
            uploaded_by,
            uploaded_at,
            [Year],
            [Month],
            [School],
            [Registration_Number],
            [Personal_Code],
            [Name],
            [Category],
            [Subject],
            [Level],
            [Language],
            [Predicted_Grade],
            [Grade],
            [EE_TOK_Points],
            [Total_Points],
            [Result],
            [Diploma_Requirements_Code]
          ) VALUES ${values};
        `;
                const request = transaction.request();
                request.input('uploadId', sql.BigInt, uploadId);
                request.input('fileName', sql.NVarChar, fileName);
                request.input('uploadedBy', sql.NVarChar, uploadedBy);
                // Add parameters for each record in the batch
                batch.forEach((record, index) => {
                    const baseIndex = i + index;
                    request.input(`year${baseIndex}`, sql.Int, record.Year ?? null);
                    request.input(`month${baseIndex}`, sql.NVarChar(50), record.Month ?? null);
                    request.input(`school${baseIndex}`, sql.NVarChar(50), record.School ?? null);
                    request.input(`registrationNumber${baseIndex}`, sql.NVarChar(50), record.Registration_Number ?? null);
                    request.input(`personalCode${baseIndex}`, sql.NVarChar(50), record.Personal_Code ?? null);
                    request.input(`name${baseIndex}`, sql.NVarChar(255), record.Name ?? null);
                    request.input(`category${baseIndex}`, sql.NVarChar(50), record.Category ?? null);
                    request.input(`subject${baseIndex}`, sql.NVarChar(255), record.Subject ?? null);
                    request.input(`level${baseIndex}`, sql.NVarChar(50), record.Level ?? null);
                    request.input(`language${baseIndex}`, sql.NVarChar(100), record.Language ?? null);
                    request.input(`predictedGrade${baseIndex}`, sql.NVarChar(10), record.Predicted_Grade ?? null);
                    request.input(`grade${baseIndex}`, sql.NVarChar(10), record.Grade ?? null);
                    request.input(`eeTokPoints${baseIndex}`, sql.NVarChar(10), record.EE_TOK_Points ?? null);
                    request.input(`totalPoints${baseIndex}`, sql.NVarChar(10), record.Total_Points ?? null);
                    request.input(`result${baseIndex}`, sql.NVarChar(255), record.Result ?? null);
                    request.input(`diplomaRequirementsCode${baseIndex}`, sql.NVarChar(sql.MAX), record.Diploma_Requirements_Code ?? null);
                });
                await request.query(batchQuery);
                totalInserted += batch.length;
            }
            await transaction.commit();
            return totalInserted;
        }
        catch (error) {
            await transaction.rollback();
            throw new Error(`Failed to insert IB External Exams: ${error.message || error}`);
        }
    }
    /**
     * Insert MSNAV Financial Aid records using bulk insert
     */
    async insertMSNAVFinancialAid(uploadId, fileName, uploadedBy, records) {
        if (records.length === 0) {
            return 0;
        }
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        try {
            await transaction.begin();
            // Batch size limited to 100 to stay within SQL Server's 2100 parameter limit
            // (100 records * ~17 parameters = ~1700 parameters)
            const batchSize = 100;
            let totalInserted = 0;
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                const values = batch.map((record, index) => {
                    const baseIndex = i + index;
                    return `(
            @uploadId,
            @fileName,
            @uploadedBy,
            SYSDATETIMEOFFSET(),
            @sNo${baseIndex},
            @uci${baseIndex},
            @academicYear${baseIndex},
            @class${baseIndex},
            @classCode${baseIndex},
            @studentNo${baseIndex},
            @studentName${baseIndex},
            @percentage${baseIndex},
            @feeClassification${baseIndex},
            @faSubType${baseIndex},
            @feeCode${baseIndex},
            @communityStatus${baseIndex}
          )`;
                }).join(',');
                const batchQuery = `
          INSERT INTO EF.MSNAV_FinancialAid (
            upload_id,
            file_name,
            uploaded_by,
            uploaded_at,
            [S_No],
            [UCI],
            [Academic_Year],
            [Class],
            [Class_Code],
            [Student_No],
            [Student_Name],
            [Percentage],
            [Fee_Classification],
            [FA_Sub_Type],
            [Fee_Code],
            [Community_Status]
          ) VALUES ${values};
        `;
                const request = transaction.request();
                request.input('uploadId', sql.BigInt, uploadId);
                request.input('fileName', sql.NVarChar, fileName);
                request.input('uploadedBy', sql.NVarChar, uploadedBy);
                // Add parameters for each record in the batch
                batch.forEach((record, index) => {
                    const baseIndex = i + index;
                    request.input(`sNo${baseIndex}`, sql.Int, record.S_No ?? null);
                    request.input(`uci${baseIndex}`, sql.NVarChar(50), record.UCI ?? null);
                    request.input(`academicYear${baseIndex}`, sql.NVarChar(50), record.Academic_Year ?? null);
                    request.input(`class${baseIndex}`, sql.NVarChar(100), record.Class ?? null);
                    request.input(`classCode${baseIndex}`, sql.NVarChar(100), record.Class_Code ?? null);
                    request.input(`studentNo${baseIndex}`, sql.NVarChar(50), record.Student_No ?? null);
                    request.input(`studentName${baseIndex}`, sql.NVarChar(255), record.Student_Name ?? null);
                    request.input(`percentage${baseIndex}`, sql.Decimal(5, 2), record.Percentage ?? null);
                    request.input(`feeClassification${baseIndex}`, sql.NVarChar(100), record.Fee_Classification ?? null);
                    request.input(`faSubType${baseIndex}`, sql.NVarChar(100), record.FA_Sub_Type ?? null);
                    request.input(`feeCode${baseIndex}`, sql.NVarChar(100), record.Fee_Code ?? null);
                    request.input(`communityStatus${baseIndex}`, sql.NVarChar(100), record.Community_Status ?? null);
                });
                await request.query(batchQuery);
                totalInserted += batch.length;
            }
            await transaction.commit();
            return totalInserted;
        }
        catch (error) {
            await transaction.rollback();
            throw new Error(`Failed to insert MSNAV Financial Aid: ${error.message || error}`);
        }
    }
    /**
     * Insert CEM Prediction Report records using bulk insert
     */
    async insertCEMPredictionReport(uploadId, fileName, uploadedBy, records) {
        if (records.length === 0) {
            return 0;
        }
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        try {
            await transaction.begin();
            // Batch size limited to 100 to stay within SQL Server's 2100 parameter limit
            // (100 records * ~18 parameters = ~1800 parameters)
            const batchSize = 100;
            let totalInserted = 0;
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                const values = batch.map((record, index) => {
                    const baseIndex = i + index;
                    return `(
            @uploadId,
            @fileName,
            @uploadedBy,
            SYSDATETIMEOFFSET(),
            @studentId${baseIndex},
            @class${baseIndex},
            @name${baseIndex},
            @gender${baseIndex},
            @dateOfBirth${baseIndex},
            @yearGroup${baseIndex},
            @gcseScore${baseIndex},
            @subject${baseIndex},
            @level${baseIndex},
            @gcsePredictionPoints${baseIndex},
            @gcsePredictionGrade${baseIndex},
            @testTaken${baseIndex},
            @testScore${baseIndex},
            @testPredictionPoints${baseIndex},
            @testPredictionGrade${baseIndex}
          )`;
                }).join(',');
                const batchQuery = `
          INSERT INTO EF.CEM_PredictionReport (
            upload_id,
            file_name,
            uploaded_by,
            uploaded_at,
            [Student_ID],
            [Class],
            [Name],
            [Gender],
            [Date_of_Birth],
            [Year_Group],
            [GCSE_Score],
            [Subject],
            [Level],
            [GCSE_Prediction_Points],
            [GCSE_Prediction_Grade],
            [Test_Taken],
            [Test_Score],
            [Test_Prediction_Points],
            [Test_Prediction_Grade]
          ) VALUES ${values};
        `;
                const request = transaction.request();
                request.input('uploadId', sql.BigInt, uploadId);
                request.input('fileName', sql.NVarChar, fileName);
                request.input('uploadedBy', sql.NVarChar, uploadedBy);
                // Add parameters for each record in the batch
                batch.forEach((record, index) => {
                    const baseIndex = i + index;
                    request.input(`studentId${baseIndex}`, sql.NVarChar(50), record.Student_ID ?? null);
                    request.input(`class${baseIndex}`, sql.NVarChar(100), record.Class ?? null);
                    request.input(`name${baseIndex}`, sql.NVarChar(255), record.Name ?? null);
                    request.input(`gender${baseIndex}`, sql.NVarChar(50), record.Gender ?? null);
                    request.input(`dateOfBirth${baseIndex}`, sql.NVarChar(50), record.Date_of_Birth ?? null);
                    request.input(`yearGroup${baseIndex}`, sql.Int, record.Year_Group ?? null);
                    request.input(`gcseScore${baseIndex}`, sql.Decimal(10, 2), record.GCSE_Score ?? null);
                    request.input(`subject${baseIndex}`, sql.NVarChar(255), record.Subject ?? null);
                    request.input(`level${baseIndex}`, sql.NVarChar(50), record.Level ?? null);
                    request.input(`gcsePredictionPoints${baseIndex}`, sql.Decimal(10, 2), record.GCSE_Prediction_Points ?? null);
                    request.input(`gcsePredictionGrade${baseIndex}`, sql.NVarChar(10), record.GCSE_Prediction_Grade ?? null);
                    request.input(`testTaken${baseIndex}`, sql.NVarChar(50), record.Test_Taken ?? null);
                    request.input(`testScore${baseIndex}`, sql.Decimal(10, 2), record.Test_Score ?? null);
                    request.input(`testPredictionPoints${baseIndex}`, sql.Decimal(10, 2), record.Test_Prediction_Points ?? null);
                    request.input(`testPredictionGrade${baseIndex}`, sql.NVarChar(10), record.Test_Prediction_Grade ?? null);
                });
                await request.query(batchQuery);
                totalInserted += batch.length;
            }
            await transaction.commit();
            return totalInserted;
        }
        catch (error) {
            await transaction.rollback();
            throw new Error(`Failed to insert CEM Prediction Report: ${error.message || error}`);
        }
    }
    /**
     * Insert CEM Subject Level Analysis records using bulk insert
     */
    async insertCEMSubjectLevelAnalysis(uploadId, fileName, uploadedBy, records) {
        if (records.length === 0) {
            return 0;
        }
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        try {
            await transaction.begin();
            // Batch size limited to 50 to stay within SQL Server's 2100 parameter limit
            // (50 records * ~36 parameters = ~1800 parameters)
            const batchSize = 50;
            let totalInserted = 0;
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                const values = batch.map((record, index) => {
                    const baseIndex = i + index;
                    return `(
            @uploadId,
            @fileName,
            @uploadedBy,
            SYSDATETIMEOFFSET(),
            @studentId${baseIndex},
            @class${baseIndex},
            @surname${baseIndex},
            @forename${baseIndex},
            @gender${baseIndex},
            @examType${baseIndex},
            @subjectTitle${baseIndex},
            @syllabusTitle${baseIndex},
            @examBoard${baseIndex},
            @syllabusCode${baseIndex},
            @grade${baseIndex},
            @gradeAsPoints${baseIndex},
            @gcseScore${baseIndex},
            @gcsePrediction${baseIndex},
            @gcseResidual${baseIndex},
            @gcseStandardisedResidual${baseIndex},
            @gcseGenderAdjPrediction${baseIndex},
            @gcseGenderAdjResidual${baseIndex},
            @gcseGenderAdjStdResidual${baseIndex},
            @adaptiveScore${baseIndex},
            @adaptivePrediction${baseIndex},
            @adaptiveResidual${baseIndex},
            @adaptiveStandardisedResidual${baseIndex},
            @adaptiveGenderAdjPrediction${baseIndex},
            @adaptiveGenderAdjResidual${baseIndex},
            @adaptiveGenderAdjStdResidual${baseIndex},
            @tdaScore${baseIndex},
            @tdaPrediction${baseIndex},
            @tdaResidual${baseIndex},
            @tdaStandardisedResidual${baseIndex},
            @tdaGenderAdjPrediction${baseIndex},
            @tdaGenderAdjResidual${baseIndex},
            @tdaGenderAdjStdResidual${baseIndex}
          )`;
                }).join(',');
                const batchQuery = `
          INSERT INTO EF.CEM_SubjectLevelAnalysis (
            upload_id,
            file_name,
            uploaded_by,
            uploaded_at,
            [Student_ID],
            [Class],
            [Surname],
            [Forename],
            [Gender],
            [Exam_Type],
            [Subject_Title],
            [Syllabus_Title],
            [Exam_Board],
            [Syllabus_Code],
            [Grade],
            [Grade_as_Points],
            [GCSE_Score],
            [GCSE_Prediction],
            [GCSE_Residual],
            [GCSE_Standardised_Residual],
            [GCSE_Gender_Adj_Prediction],
            [GCSE_Gender_Adj_Residual],
            [GCSE_Gender_Adj_Std_Residual],
            [Adaptive_Score],
            [Adaptive_Prediction],
            [Adaptive_Residual],
            [Adaptive_Standardised_Residual],
            [Adaptive_Gender_Adj_Prediction],
            [Adaptive_Gender_Adj_Residual],
            [Adaptive_Gender_Adj_Std_Residual],
            [TDA_Score],
            [TDA_Prediction],
            [TDA_Residual],
            [TDA_Standardised_Residual],
            [TDA_Gender_Adj_Prediction],
            [TDA_Gender_Adj_Residual],
            [TDA_Gender_Adj_Std_Residual]
          ) VALUES ${values};
        `;
                const request = transaction.request();
                request.input('uploadId', sql.BigInt, uploadId);
                request.input('fileName', sql.NVarChar, fileName);
                request.input('uploadedBy', sql.NVarChar, uploadedBy);
                // Add parameters for each record in the batch
                batch.forEach((record, index) => {
                    const baseIndex = i + index;
                    request.input(`studentId${baseIndex}`, sql.NVarChar(50), record.Student_ID ?? null);
                    request.input(`class${baseIndex}`, sql.NVarChar(100), record.Class ?? null);
                    request.input(`surname${baseIndex}`, sql.NVarChar(255), record.Surname ?? null);
                    request.input(`forename${baseIndex}`, sql.NVarChar(255), record.Forename ?? null);
                    request.input(`gender${baseIndex}`, sql.NVarChar(50), record.Gender ?? null);
                    request.input(`examType${baseIndex}`, sql.NVarChar(100), record.Exam_Type ?? null);
                    request.input(`subjectTitle${baseIndex}`, sql.NVarChar(255), record.Subject_Title ?? null);
                    request.input(`syllabusTitle${baseIndex}`, sql.NVarChar(255), record.Syllabus_Title ?? null);
                    request.input(`examBoard${baseIndex}`, sql.NVarChar(100), record.Exam_Board ?? null);
                    request.input(`syllabusCode${baseIndex}`, sql.NVarChar(100), record.Syllabus_Code ?? null);
                    request.input(`grade${baseIndex}`, sql.NVarChar(10), record.Grade ?? null);
                    request.input(`gradeAsPoints${baseIndex}`, sql.Decimal(10, 2), record.Grade_as_Points ?? null);
                    request.input(`gcseScore${baseIndex}`, sql.Decimal(10, 2), record.GCSE_Score ?? null);
                    request.input(`gcsePrediction${baseIndex}`, sql.Decimal(10, 2), record.GCSE_Prediction ?? null);
                    request.input(`gcseResidual${baseIndex}`, sql.Decimal(10, 2), record.GCSE_Residual ?? null);
                    request.input(`gcseStandardisedResidual${baseIndex}`, sql.Decimal(10, 2), record.GCSE_Standardised_Residual ?? null);
                    request.input(`gcseGenderAdjPrediction${baseIndex}`, sql.Decimal(10, 2), record.GCSE_Gender_Adj_Prediction ?? null);
                    request.input(`gcseGenderAdjResidual${baseIndex}`, sql.Decimal(10, 2), record.GCSE_Gender_Adj_Residual ?? null);
                    request.input(`gcseGenderAdjStdResidual${baseIndex}`, sql.Decimal(10, 2), record.GCSE_Gender_Adj_Std_Residual ?? null);
                    request.input(`adaptiveScore${baseIndex}`, sql.Decimal(10, 2), record.Adaptive_Score ?? null);
                    request.input(`adaptivePrediction${baseIndex}`, sql.Decimal(10, 2), record.Adaptive_Prediction ?? null);
                    request.input(`adaptiveResidual${baseIndex}`, sql.Decimal(10, 2), record.Adaptive_Residual ?? null);
                    request.input(`adaptiveStandardisedResidual${baseIndex}`, sql.Decimal(10, 2), record.Adaptive_Standardised_Residual ?? null);
                    request.input(`adaptiveGenderAdjPrediction${baseIndex}`, sql.Decimal(10, 2), record.Adaptive_Gender_Adj_Prediction ?? null);
                    request.input(`adaptiveGenderAdjResidual${baseIndex}`, sql.Decimal(10, 2), record.Adaptive_Gender_Adj_Residual ?? null);
                    request.input(`adaptiveGenderAdjStdResidual${baseIndex}`, sql.Decimal(10, 2), record.Adaptive_Gender_Adj_Std_Residual ?? null);
                    request.input(`tdaScore${baseIndex}`, sql.Decimal(10, 2), record.TDA_Score ?? null);
                    request.input(`tdaPrediction${baseIndex}`, sql.Decimal(10, 2), record.TDA_Prediction ?? null);
                    request.input(`tdaResidual${baseIndex}`, sql.Decimal(10, 2), record.TDA_Residual ?? null);
                    request.input(`tdaStandardisedResidual${baseIndex}`, sql.Decimal(10, 2), record.TDA_Standardised_Residual ?? null);
                    request.input(`tdaGenderAdjPrediction${baseIndex}`, sql.Decimal(10, 2), record.TDA_Gender_Adj_Prediction ?? null);
                    request.input(`tdaGenderAdjResidual${baseIndex}`, sql.Decimal(10, 2), record.TDA_Gender_Adj_Residual ?? null);
                    request.input(`tdaGenderAdjStdResidual${baseIndex}`, sql.Decimal(10, 2), record.TDA_Gender_Adj_Std_Residual ?? null);
                });
                await request.query(batchQuery);
                totalInserted += batch.length;
            }
            await transaction.commit();
            return totalInserted;
        }
        catch (error) {
            await transaction.rollback();
            throw new Error(`Failed to insert CEM Subject Level Analysis: ${error.message || error}`);
        }
    }
    /**
     * Delete all rows from EF.HR_EmployeeData (for overwrite before new upload)
     */
    async deleteAllHREmployeeData() {
        const query = `DELETE FROM EF.HR_EmployeeData;`;
        const result = await executeQuery(query);
        if (result.error) {
            throw new Error(`Failed to delete HR Employee Data: ${result.error}`);
        }
    }
    /**
     * Delete all rows from EF.HR_BudgetVsActual (for overwrite before new upload)
     */
    async deleteAllHRBudgetVsActual() {
        const query = `DELETE FROM EF.HR_BudgetVsActual;`;
        const result = await executeQuery(query);
        if (result.error) {
            throw new Error(`Failed to delete HR Budget vs Actual: ${result.error}`);
        }
    }
    /**
     * Insert HR Employee Data records using bulk insert
     */
    async insertHREmployeeData(uploadId, fileName, uploadedBy, records) {
        if (records.length === 0) {
            return 0;
        }
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        try {
            await transaction.begin();
            // Use bulk insert with batching for better performance
            // Batch size limited to 50 to stay within SQL Server's 2100 parameter limit
            // (50 records * 29 parameters = 1450 parameters)
            const batchSize = 50;
            let totalInserted = 0;
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                // Build values for batch insert
                const values = batch.map((record, index) => {
                    const baseIndex = i + index;
                    return `(
            @uploadId,
            @fileName,
            @uploadedBy,
            SYSDATETIMEOFFSET(),
            @year${baseIndex},
            @quarter${baseIndex},
            @month${baseIndex},
            @country${baseIndex},
            @countryCity${baseIndex},
            @entity${baseIndex},
            @empId${baseIndex},
            @positionCategory${baseIndex},
            @attrition${baseIndex},
            @fte${baseIndex},
            @dateOfBirth${baseIndex},
            @dateOfHire${baseIndex},
            @sect${baseIndex},
            @staffNationality${baseIndex},
            @gender${baseIndex},
            @teachingLevel${baseIndex},
            @teachingSubjectCategory${baseIndex},
            @qualification${baseIndex},
            @dateOfSeparation${baseIndex},
            @reasonForLeaving${baseIndex},
            @aging${baseIndex},
            @ageGrouping${baseIndex},
            @longevity${baseIndex},
            @longevityGrouping${baseIndex},
            @reasonType${baseIndex},
            @reportingYear${baseIndex},
            @recruitment${baseIndex},
            @separation${baseIndex},
            @staffCategory${baseIndex},
            @contractType${baseIndex},
            @key${baseIndex}
          )`;
                }).join(',');
                const batchQuery = `
          INSERT INTO EF.HR_EmployeeData (
            upload_id,
            file_name,
            uploaded_by,
            uploaded_at,
            [Year],
            [Quarter],
            [Month],
            [Country],
            [Country_City],
            [Entity],
            [Emp_ID],
            [Position_Category],
            [Attrition],
            [FTE],
            [Date_of_Birth],
            [Date_of_Hire],
            [Sect],
            [Staff_Nationality],
            [Gender],
            [Teaching_Level],
            [Teaching_Subject_Category],
            [Qualification],
            [Date_of_Separation],
            [reason_for_leaving],
            [Aging],
            [Age_Grouping],
            [Longevity],
            [Longevity_Grouping],
            [Reason_type],
            [Reporting_Year],
            [recruitment],
            [separation],
            [Staff_Category],
            [Contract_type],
            [Key]
          ) VALUES ${values};
        `;
                const request = transaction.request();
                request.input('uploadId', sql.BigInt, uploadId);
                request.input('fileName', sql.NVarChar, fileName);
                request.input('uploadedBy', sql.NVarChar, uploadedBy);
                // Add parameters for each record in the batch
                batch.forEach((record, index) => {
                    const baseIndex = i + index;
                    request.input(`year${baseIndex}`, sql.Int, record.Year ?? null);
                    request.input(`quarter${baseIndex}`, sql.NVarChar(50), record.Quarter ?? null);
                    request.input(`month${baseIndex}`, sql.NVarChar(50), record.Month ?? null);
                    request.input(`country${baseIndex}`, sql.NVarChar(100), record.Country ?? null);
                    request.input(`countryCity${baseIndex}`, sql.NVarChar(200), record.Country_City ?? null);
                    request.input(`entity${baseIndex}`, sql.NVarChar(100), record.Entity ?? null);
                    request.input(`empId${baseIndex}`, sql.NVarChar(100), record.Emp_ID ?? null);
                    request.input(`positionCategory${baseIndex}`, sql.NVarChar(200), record.Position_Category ?? null);
                    request.input(`attrition${baseIndex}`, sql.NVarChar(50), record.Attrition ?? null);
                    request.input(`fte${baseIndex}`, sql.Decimal(10, 2), record.FTE ?? null);
                    request.input(`dateOfBirth${baseIndex}`, sql.NVarChar(50), record.Date_of_Birth ?? null);
                    request.input(`dateOfHire${baseIndex}`, sql.NVarChar(100), record.Date_of_Hire ?? null);
                    request.input(`sect${baseIndex}`, sql.NVarChar(100), record.Sect ?? null);
                    request.input(`staffNationality${baseIndex}`, sql.NVarChar(100), record.Staff_Nationality ?? null);
                    request.input(`gender${baseIndex}`, sql.NVarChar(50), record.Gender ?? null);
                    request.input(`teachingLevel${baseIndex}`, sql.NVarChar(200), record.Teaching_Level ?? null);
                    request.input(`teachingSubjectCategory${baseIndex}`, sql.NVarChar(200), record.Teaching_Subject_Category ?? null);
                    request.input(`qualification${baseIndex}`, sql.NVarChar(200), record.Qualification ?? null);
                    request.input(`dateOfSeparation${baseIndex}`, sql.NVarChar(100), record.Date_of_Separation ?? null);
                    request.input(`reasonForLeaving${baseIndex}`, sql.NVarChar(500), record.reason_for_leaving ?? null);
                    request.input(`aging${baseIndex}`, sql.Int, record.Aging ?? null);
                    request.input(`ageGrouping${baseIndex}`, sql.NVarChar(50), record.Age_Grouping ?? null);
                    request.input(`longevity${baseIndex}`, sql.Int, record.Longevity ?? null);
                    request.input(`longevityGrouping${baseIndex}`, sql.NVarChar(50), record.Longevity_Grouping ?? null);
                    request.input(`reasonType${baseIndex}`, sql.NVarChar(200), record.Reason_type ?? null);
                    request.input(`reportingYear${baseIndex}`, sql.NVarChar(50), record.Reporting_Year ?? null);
                    request.input(`recruitment${baseIndex}`, sql.NVarChar(200), record.recruitment ?? null);
                    request.input(`separation${baseIndex}`, sql.NVarChar(200), record.separation ?? null);
                    request.input(`staffCategory${baseIndex}`, sql.NVarChar(100), record.Staff_Category ?? null);
                    request.input(`contractType${baseIndex}`, sql.NVarChar(200), record.Contract_type ?? null);
                    request.input(`key${baseIndex}`, sql.NVarChar(500), record.Key ?? null);
                });
                await request.query(batchQuery);
                totalInserted += batch.length;
            }
            await transaction.commit();
            return totalInserted;
        }
        catch (error) {
            await transaction.rollback();
            throw new Error(`Failed to insert HR Employee Data: ${error.message || error}`);
        }
    }
    /**
     * Insert HR Budget vs Actual records using bulk insert
     */
    async insertHRBudgetVsActual(uploadId, fileName, uploadedBy, records) {
        if (records.length === 0) {
            return 0;
        }
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        try {
            await transaction.begin();
            // Use bulk insert with batching for better performance
            // Batch size limited to 100 to stay within SQL Server's 2100 parameter limit
            // (100 records * 10 parameters = 1000 parameters)
            const batchSize = 100;
            let totalInserted = 0;
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                // Build values for batch insert
                const values = batch.map((record, index) => {
                    const baseIndex = i + index;
                    return `(
            @uploadId,
            @fileName,
            @uploadedBy,
            SYSDATETIMEOFFSET(),
            @year${baseIndex},
            @quarter${baseIndex},
            @country${baseIndex},
            @category${baseIndex},
            @budget${baseIndex},
            @recordKey${baseIndex}
          )`;
                }).join(',');
                const batchQuery = `
          INSERT INTO EF.HR_BudgetVsActual (
            upload_id,
            file_name,
            uploaded_by,
            uploaded_at,
            [Year],
            [Quarter],
            [Country],
            [Category],
            [Budget],
            [Key]
          ) VALUES ${values};
        `;
                const request = transaction.request();
                request.input('uploadId', sql.BigInt, uploadId);
                request.input('fileName', sql.NVarChar, fileName);
                request.input('uploadedBy', sql.NVarChar, uploadedBy);
                // Add parameters for each record in the batch
                batch.forEach((record, index) => {
                    const baseIndex = i + index;
                    request.input(`year${baseIndex}`, sql.NVarChar(20), record.Year ?? null);
                    request.input(`quarter${baseIndex}`, sql.NVarChar(50), record.Quarter ?? null);
                    request.input(`country${baseIndex}`, sql.NVarChar(100), record.Country ?? null);
                    request.input(`category${baseIndex}`, sql.NVarChar(200), record.Category ?? null);
                    request.input(`budget${baseIndex}`, sql.Decimal(18, 2), record.Budget ?? null);
                    request.input(`recordKey${baseIndex}`, sql.NVarChar(500), record.Key ?? null);
                });
                await request.query(batchQuery);
                totalInserted += batch.length;
            }
            await transaction.commit();
            return totalInserted;
        }
        catch (error) {
            await transaction.rollback();
            throw new Error(`Failed to insert HR Budget vs Actual: ${error.message || error}`);
        }
    }
    async deleteAllFINDictionaryByType(dictionaryType) {
        const result = await executeQuery(`DELETE FROM FIN.DictionaryData WHERE dictionary_type = @dictionaryType;`, { dictionaryType });
        if (result.error) {
            throw new Error(`Failed to delete FIN dictionary data (${dictionaryType}): ${result.error}`);
        }
    }
    async deleteAllFINTrialBalanceByType(tbType) {
        const result = await executeQuery(`DELETE FROM FIN.TrialBalance WHERE tb_type = @tbType;`, { tbType });
        if (result.error) {
            throw new Error(`Failed to delete FIN trial balance data (${tbType}): ${result.error}`);
        }
    }
    async insertFINDictionary(uploadId, fileName, uploadedBy, dictionaryType, records) {
        if (records.length === 0)
            return 0;
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        try {
            await transaction.begin();
            const batchSize = 100;
            let totalInserted = 0;
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                const values = batch.map((_, index) => {
                    const baseIndex = i + index;
                    return `(
            @uploadId, @fileName, @uploadedBy, @dictionaryType,
            @code${baseIndex}, @description${baseIndex}, @suspended${baseIndex}, @entity${baseIndex},
            @groupDimension${baseIndex}, @uploadedBy, SYSDATETIMEOFFSET()
          )`;
                }).join(',');
                const query = `
          INSERT INTO FIN.DictionaryData (
            upload_id, file_name, uploaded_by, dictionary_type,
            code, description, suspended, entity, group_dimension, last_updated_by, last_updated_at
          ) VALUES ${values};
        `;
                const request = transaction.request();
                request.input('uploadId', sql.BigInt, uploadId);
                request.input('fileName', sql.NVarChar, fileName);
                request.input('uploadedBy', sql.NVarChar, uploadedBy);
                request.input('dictionaryType', sql.NVarChar(50), dictionaryType);
                batch.forEach((record, index) => {
                    const baseIndex = i + index;
                    request.input(`code${baseIndex}`, sql.NVarChar(100), record.code ?? null);
                    request.input(`description${baseIndex}`, sql.NVarChar(500), record.description ?? null);
                    request.input(`suspended${baseIndex}`, sql.NVarChar(50), record.suspended ?? null);
                    request.input(`entity${baseIndex}`, sql.NVarChar(100), record.entity ?? null);
                    request.input(`groupDimension${baseIndex}`, sql.NVarChar(100), record.group_dimension ?? null);
                });
                await request.query(query);
                totalInserted += batch.length;
            }
            await transaction.commit();
            return totalInserted;
        }
        catch (error) {
            await transaction.rollback();
            throw new Error(`Failed to insert FIN dictionary records: ${error.message || error}`);
        }
    }
    async insertFINTrialBalance(uploadId, fileName, uploadedBy, tbType, records) {
        if (records.length === 0)
            return 0;
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        try {
            await transaction.begin();
            const batchSize = 100;
            let totalInserted = 0;
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                const values = batch.map((_, index) => {
                    const baseIndex = i + index;
                    return `(
            @uploadId, @fileName, @uploadedBy, @tbType,
            @mainAccount${baseIndex}, @fundingSource${baseIndex}, @region${baseIndex}, @operatingUnit${baseIndex},
            @department${baseIndex}, @project${baseIndex}, @activity${baseIndex}, @resource${baseIndex},
            @party${baseIndex}, @fixedAssets${baseIndex}, @reference${baseIndex}, @debit${baseIndex},
            @credit${baseIndex}, @status${baseIndex}, @uploadedBy, SYSDATETIMEOFFSET()
          )`;
                }).join(',');
                const query = `
          INSERT INTO FIN.TrialBalance (
            upload_id, file_name, uploaded_by, tb_type,
            main_account, funding_source, region, operating_unit, department, project, activity,
            resource, party, fixed_assets, reference, debit, credit, status, last_updated_by, last_updated_at
          ) VALUES ${values};
        `;
                const request = transaction.request();
                request.input('uploadId', sql.BigInt, uploadId);
                request.input('fileName', sql.NVarChar, fileName);
                request.input('uploadedBy', sql.NVarChar, uploadedBy);
                request.input('tbType', sql.NVarChar(20), tbType);
                batch.forEach((record, index) => {
                    const baseIndex = i + index;
                    request.input(`mainAccount${baseIndex}`, sql.NVarChar(100), record.main_account ?? null);
                    request.input(`fundingSource${baseIndex}`, sql.NVarChar(100), record.funding_source ?? null);
                    request.input(`region${baseIndex}`, sql.NVarChar(100), record.region ?? null);
                    request.input(`operatingUnit${baseIndex}`, sql.NVarChar(100), record.operating_unit ?? null);
                    request.input(`department${baseIndex}`, sql.NVarChar(100), record.department ?? null);
                    request.input(`project${baseIndex}`, sql.NVarChar(100), record.project ?? null);
                    request.input(`activity${baseIndex}`, sql.NVarChar(100), record.activity ?? null);
                    request.input(`resource${baseIndex}`, sql.NVarChar(100), record.resource ?? null);
                    request.input(`party${baseIndex}`, sql.NVarChar(100), record.party ?? null);
                    request.input(`fixedAssets${baseIndex}`, sql.NVarChar(100), record.fixed_assets ?? null);
                    request.input(`reference${baseIndex}`, sql.NVarChar(100), record.reference ?? null);
                    request.input(`debit${baseIndex}`, sql.Decimal(19, 4), record.debit ?? null);
                    request.input(`credit${baseIndex}`, sql.Decimal(19, 4), record.credit ?? null);
                    request.input(`status${baseIndex}`, sql.NVarChar(100), record.status ?? null);
                });
                await request.query(query);
                totalInserted += batch.length;
            }
            await transaction.commit();
            return totalInserted;
        }
        catch (error) {
            await transaction.rollback();
            throw new Error(`Failed to insert FIN trial balance records: ${error.message || error}`);
        }
    }
    /** File types that support Promote to RP (EF → reporting tables). */
    static PROMOTABLE_TO_RP = new Set([
        'HR_EMPLOYEE_DATA',
        'HR_BUDGET_VS_ACTUAL',
        'IB_EXTERNAL_EXAMS',
        'MSNAV_FINANCIAL_AID',
        'CEM_INITIAL',
        'CEM_FINAL'
    ]);
    /**
     * Promote completed upload to RP schema (copy EF data to RP mart table).
     * @param mode replace: clear RP mart table then load this upload; append: insert this upload without clearing RP.
     */
    async promoteUploadToRP(uploadId, mode = 'replace') {
        const upload = await this.getUploadById(uploadId);
        if (!upload)
            throw new Error('Upload not found');
        if (upload.status !== 'COMPLETED')
            throw new Error('Only completed uploads can be promoted');
        const fileTypes = await this.getActiveFileTypes();
        const fileType = fileTypes.find((ft) => ft.id === upload.file_type_id);
        if (!fileType)
            throw new Error('File type not found');
        const code = fileType.type_code.toUpperCase();
        if (!EFService.PROMOTABLE_TO_RP.has(code)) {
            throw new Error(`File type ${code} cannot be promoted to RP`);
        }
        const promoteMode = mode === 'append' ? 'append' : 'replace';
        const replace = promoteMode === 'replace';
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        try {
            await transaction.begin();
            let rowCount = 0;
            if (code === 'HR_EMPLOYEE_DATA') {
                if (replace)
                    await transaction.request().query('DELETE FROM RP.hr_employee_data;');
                const req = transaction.request();
                req.input('uploadId', sql.BigInt, uploadId);
                const insertResult = await req.query(`
          INSERT INTO RP.hr_employee_data (
            country,[Year],[Quarter],[Month],[Country_City],[Entity],[Emp_ID],[Position_Category],[Attrition],[FTE],
            [Date_of_Birth],[Date_of_Hire],[Sect],[Staff_Nationality],[Gender],[Teaching_Level],[Teaching_Subject_Category],[Qualification],
            [Date_of_Separation],[reason_for_leaving],[Aging],[Age_Grouping],[Longevity],[Longevity_Grouping],[Reason_type],[Reporting_Year],
            [recruitment],[separation],[Staff_Category],[Contract_type],[Key]
          )
          SELECT COALESCE([Country],'Unknown'),[Year],[Quarter],[Month],[Country_City],[Entity],[Emp_ID],[Position_Category],[Attrition],[FTE],
            [Date_of_Birth],[Date_of_Hire],[Sect],[Staff_Nationality],[Gender],[Teaching_Level],[Teaching_Subject_Category],[Qualification],
            [Date_of_Separation],[reason_for_leaving],[Aging],[Age_Grouping],[Longevity],[Longevity_Grouping],[Reason_type],[Reporting_Year],
            [recruitment],[separation],[Staff_Category],[Contract_type],[Key]
          FROM EF.HR_EmployeeData WHERE upload_id = @uploadId
        `);
                rowCount = insertResult.rowsAffected?.[0] ?? 0;
            }
            else if (code === 'HR_BUDGET_VS_ACTUAL') {
                if (replace)
                    await transaction.request().query('DELETE FROM RP.hr_budget_vs_actual;');
                const req = transaction.request();
                req.input('uploadId', sql.BigInt, uploadId);
                const insertResult = await req.query(`
          INSERT INTO RP.hr_budget_vs_actual (country,[Year],[Quarter],[Category],[Budget],[Actual],[Key])
          SELECT COALESCE([Country],'Unknown'),[Year],[Quarter],[Category],[Budget],NULL,[Key]
          FROM EF.HR_BudgetVsActual WHERE upload_id = @uploadId
        `);
                rowCount = insertResult.rowsAffected?.[0] ?? 0;
            }
            else if (code === 'IB_EXTERNAL_EXAMS') {
                if (replace)
                    await transaction.request().query('DELETE FROM RP.IB_ExternalExams;');
                const req = transaction.request();
                req.input('uploadId', sql.BigInt, uploadId);
                const insertResult = await req.query(`
          INSERT INTO RP.IB_ExternalExams (
            upload_id, file_name, uploaded_at, uploaded_by,
            [Year],[Month],[School],[Registration_Number],[Personal_Code],[Name],[Category],[Subject],[Level],[Language],
            [Predicted_Grade],[Grade],[EE_TOK_Points],[Total_Points],[Result],[Diploma_Requirements_Code],
            school_id
          )
          SELECT
            ib.upload_id, ib.file_name, ib.uploaded_at, ib.uploaded_by,
            ib.[Year], ib.[Month], ib.[School], ib.[Registration_Number], ib.[Personal_Code], ib.[Name], ib.[Category],
            ib.[Subject], ib.[Level], ib.[Language],
            ib.[Predicted_Grade], ib.[Grade], ib.[EE_TOK_Points], ib.[Total_Points], ib.[Result], ib.[Diploma_Requirements_Code],
            m.school_id
          FROM EF.IB_ExternalExams ib
          LEFT JOIN admin.ib_external_exam_school_map m
            ON m.is_active = 1
            AND LTRIM(RTRIM(COALESCE(ib.[School], N''))) = LTRIM(RTRIM(m.ib_school_code))
          WHERE ib.upload_id = @uploadId
        `);
                rowCount = insertResult.rowsAffected?.[0] ?? 0;
            }
            else if (code === 'MSNAV_FINANCIAL_AID') {
                if (replace)
                    await transaction.request().query('DELETE FROM RP.msnav_financial_aid;');
                const req = transaction.request();
                req.input('uploadId', sql.BigInt, uploadId);
                const insertResult = await req.query(`
          INSERT INTO RP.msnav_financial_aid (
            school_id,[S_No],[UCI],[Academic_Year],[Class],[Class_Code],[Student_No],[Student_Name],
            [Percentage],[Fee_Classification],[FA_Sub_Type],[Fee_Code],[Community_Status]
          )
          SELECT
            CAST(u.school_id AS NVARCHAR(50)),
            m.[S_No],m.[UCI],m.[Academic_Year],m.[Class],m.[Class_Code],m.[Student_No],m.[Student_Name],
            m.[Percentage],m.[Fee_Classification],m.[FA_Sub_Type],m.[Fee_Code],m.[Community_Status]
          FROM EF.MSNAV_FinancialAid m
          INNER JOIN EF.Uploads u ON u.id = m.upload_id
          WHERE m.upload_id = @uploadId
        `);
                rowCount = insertResult.rowsAffected?.[0] ?? 0;
            }
            else if (code === 'CEM_INITIAL') {
                if (replace)
                    await transaction.request().query('DELETE FROM RP.cem_prediction_report;');
                const req = transaction.request();
                req.input('uploadId', sql.BigInt, uploadId);
                const insertResult = await req.query(`
          INSERT INTO RP.cem_prediction_report (
            [Student_ID],[Class],[Name],[Gender],[Date_of_Birth],[Year_Group],[GCSE_Score],[Subject],[Level],
            [GCSE_Prediction_Points],[GCSE_Prediction_Grade],[Test_Taken],[Test_Score],[Test_Prediction_Points],[Test_Prediction_Grade]
          )
          SELECT
            [Student_ID],[Class],[Name],[Gender],[Date_of_Birth],[Year_Group],[GCSE_Score],[Subject],[Level],
            [GCSE_Prediction_Points],[GCSE_Prediction_Grade],[Test_Taken],[Test_Score],[Test_Prediction_Points],[Test_Prediction_Grade]
          FROM EF.CEM_PredictionReport WHERE upload_id = @uploadId
        `);
                rowCount = insertResult.rowsAffected?.[0] ?? 0;
            }
            else if (code === 'CEM_FINAL') {
                if (replace)
                    await transaction.request().query('DELETE FROM RP.cem_subject_level_analysis;');
                const req = transaction.request();
                req.input('uploadId', sql.BigInt, uploadId);
                const insertResult = await req.query(`
          INSERT INTO RP.cem_subject_level_analysis (
            [Student_ID],[Class],[Surname],[Forename],[Gender],[Exam_Type],[Subject_Title],[Syllabus_Title],[Exam_Board],[Syllabus_Code],
            [Grade],[Grade_as_Points],[GCSE_Score],[GCSE_Prediction],[GCSE_Residual],[GCSE_Standardised_Residual],
            [GCSE_Gender_Adj_Prediction],[GCSE_Gender_Adj_Residual],[GCSE_Gender_Adj_Std_Residual],
            [Adaptive_Score],[Adaptive_Prediction],[Adaptive_Residual],[Adaptive_Standardised_Residual],
            [Adaptive_Gender_Adj_Prediction],[Adaptive_Gender_Adj_Residual],[Adaptive_Gender_Adj_Std_Residual],
            [TDA_Score],[TDA_Prediction],[TDA_Residual],[TDA_Standardised_Residual],
            [TDA_Gender_Adj_Prediction],[TDA_Gender_Adj_Residual],[TDA_Gender_Adj_Std_Residual]
          )
          SELECT
            [Student_ID],[Class],[Surname],[Forename],[Gender],[Exam_Type],[Subject_Title],[Syllabus_Title],[Exam_Board],[Syllabus_Code],
            [Grade],[Grade_as_Points],[GCSE_Score],[GCSE_Prediction],[GCSE_Residual],[GCSE_Standardised_Residual],
            [GCSE_Gender_Adj_Prediction],[GCSE_Gender_Adj_Residual],[GCSE_Gender_Adj_Std_Residual],
            [Adaptive_Score],[Adaptive_Prediction],[Adaptive_Residual],[Adaptive_Standardised_Residual],
            [Adaptive_Gender_Adj_Prediction],[Adaptive_Gender_Adj_Residual],[Adaptive_Gender_Adj_Std_Residual],
            [TDA_Score],[TDA_Prediction],[TDA_Residual],[TDA_Standardised_Residual],
            [TDA_Gender_Adj_Prediction],[TDA_Gender_Adj_Residual],[TDA_Gender_Adj_Std_Residual]
          FROM EF.CEM_SubjectLevelAnalysis WHERE upload_id = @uploadId
        `);
                rowCount = insertResult.rowsAffected?.[0] ?? 0;
            }
            await transaction.commit();
            if (code === 'MSNAV_FINANCIAL_AID') {
                this.triggerRPRefreshAfterMsnavUpload(uploadId).catch((err) => console.error('[EFService] RP refresh after MSNAV promote failed:', err?.message || err));
            }
            return { rowCount, fileType: code, mode: promoteMode };
        }
        catch (error) {
            await transaction.rollback();
            throw new Error(`Failed to promote to RP: ${error.message || error}`);
        }
    }
    /**
     * Trigger RP refresh after MSNAV Financial Aid upload.
     * Gets school_id from upload and academic_year from uploaded MSNAV data,
     * then triggers the full RP refresh pipeline in the background.
     */
    async triggerRPRefreshAfterMsnavUpload(uploadId) {
        const upload = await this.getUploadById(uploadId);
        if (!upload || !upload.school_id)
            return null;
        const ayResult = await executeQuery(`SELECT TOP 1 [Academic_Year] FROM EF.MSNAV_FinancialAid WHERE upload_id = @uploadId AND [Academic_Year] IS NOT NULL`, { uploadId });
        const rawAy = ayResult.data?.[0]?.Academic_Year;
        if (!rawAy?.trim())
            return null;
        // Normalize "2025-26" -> "2025-2026" for RP refresh
        const academicYear = rawAy.includes('-') && rawAy.length <= 7
            ? rawAy.replace(/-(\d{2})$/, '-20$1')
            : rawAy.trim();
        triggerRefresh({
            school_id: upload.school_id,
            academic_year: academicYear,
            triggered_by: 'msnav_upload',
        }).catch((err) => console.error('[EFService] RP refresh after MSNAV upload failed:', err?.message || err));
        return { school_id: upload.school_id, academic_year: academicYear };
    }
    /**
     * Get upload by ID
     */
    async getUploadById(uploadId) {
        const query = `
      SELECT 
        u.id,
        u.file_type_id,
        u.file_name,
        u.file_size_bytes,
        u.row_count,
        u.status,
        u.error_message,
        u.uploaded_by,
        u.uploaded_at,
        u.processed_at,
        u.school_id
      FROM EF.Uploads u
      WHERE u.id = @uploadId;
    `;
        const result = await executeQuery(query, { uploadId });
        if (result.error) {
            throw new Error(`Failed to get upload: ${result.error}`);
        }
        return result.data && result.data.length > 0 ? result.data[0] : null;
    }
    /**
     * Get recent uploads
     */
    async getRecentUploads(fileTypeCode, limit = 50) {
        let query = `
      SELECT 
        u.id,
        u.file_type_id,
        u.file_name,
        u.file_size_bytes,
        u.row_count,
        u.status,
        u.error_message,
        u.uploaded_by,
        u.uploaded_at,
        u.processed_at
      FROM EF.Uploads u
    `;
        const params = { limit };
        if (fileTypeCode) {
            query += `
        INNER JOIN EF.FileTypes ft ON u.file_type_id = ft.id
        WHERE ft.type_code = @fileTypeCode
      `;
            params.fileTypeCode = fileTypeCode;
        }
        query += `
      ORDER BY u.uploaded_at DESC
      OFFSET 0 ROWS
      FETCH NEXT @limit ROWS ONLY;
    `;
        const result = await executeQuery(query, params);
        if (result.error) {
            throw new Error(`Failed to get recent uploads: ${result.error}`);
        }
        return result.data || [];
    }
    /**
     * Get upload data (paginated)
     * Returns data from the appropriate table based on upload's file type
     */
    async getUploadData(uploadId, page = 1, limit = 100, search) {
        // First, get the upload to determine file type
        const upload = await this.getUploadById(uploadId);
        if (!upload) {
            throw new Error('Upload not found');
        }
        // Get file type
        const fileTypes = await this.getActiveFileTypes();
        const fileType = fileTypes.find((ft) => ft.id === upload.file_type_id);
        if (!fileType) {
            throw new Error('File type not found');
        }
        const offset = (page - 1) * limit;
        const trimmedSearch = search?.trim();
        const hasSearch = !!trimmedSearch;
        let dataQuery = '';
        let countQuery = '';
        const params = { uploadId, limit, offset };
        if (hasSearch) {
            params.searchPattern = `%${trimmedSearch}%`;
        }
        const buildWhereClause = (searchColumns) => {
            if (!hasSearch || searchColumns.length === 0) {
                return 'WHERE upload_id = @uploadId';
            }
            const searchClause = searchColumns
                .map((column) => `CONVERT(NVARCHAR(MAX), [${column}]) COLLATE Latin1_General_CS_AS LIKE @searchPattern COLLATE Latin1_General_CS_AS`)
                .join(' OR ');
            return `WHERE upload_id = @uploadId AND (${searchClause})`;
        };
        if (fileType.type_code === 'IB_EXTERNAL_EXAMS') {
            const whereClause = buildWhereClause([
                'Year', 'Month', 'School', 'Registration_Number', 'Personal_Code', 'Name', 'Category',
                'Subject', 'Level', 'Language', 'Predicted_Grade', 'Grade', 'EE_TOK_Points',
                'Total_Points', 'Result', 'Diploma_Requirements_Code'
            ]);
            dataQuery = `
        SELECT 
          id,
          upload_id,
          file_name,
          uploaded_at,
          uploaded_by,
          [Year],
          [Month],
          [School],
          [Registration_Number],
          [Personal_Code],
          [Name],
          [Category],
          [Subject],
          [Level],
          [Language],
          [Predicted_Grade],
          [Grade],
          [EE_TOK_Points],
          [Total_Points],
          [Result],
          [Diploma_Requirements_Code]
        FROM EF.IB_ExternalExams
        ${whereClause}
        ORDER BY id
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY;
      `;
            countQuery = `
        SELECT COUNT(*) as total
        FROM EF.IB_ExternalExams
        ${whereClause};
      `;
        }
        else if (fileType.type_code === 'MSNAV_FINANCIAL_AID') {
            const whereClause = buildWhereClause([
                'S_No', 'UCI', 'Academic_Year', 'Class', 'Class_Code', 'Student_No', 'Student_Name',
                'Percentage', 'Fee_Classification', 'FA_Sub_Type', 'Fee_Code', 'Community_Status'
            ]);
            dataQuery = `
        SELECT 
          id,
          upload_id,
          file_name,
          uploaded_at,
          uploaded_by,
          [S_No],
          [UCI],
          [Academic_Year],
          [Class],
          [Class_Code],
          [Student_No],
          [Student_Name],
          [Percentage],
          [Fee_Classification],
          [FA_Sub_Type],
          [Fee_Code],
          [Community_Status]
        FROM EF.MSNAV_FinancialAid
        ${whereClause}
        ORDER BY id
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY;
      `;
            countQuery = `
        SELECT COUNT(*) as total
        FROM EF.MSNAV_FinancialAid
        ${whereClause};
      `;
        }
        else if (fileType.type_code === 'CEM_INITIAL') {
            const whereClause = buildWhereClause([
                'Student_ID', 'Class', 'Name', 'Gender', 'Date_of_Birth', 'Year_Group', 'GCSE_Score',
                'Subject', 'Level', 'GCSE_Prediction_Points', 'GCSE_Prediction_Grade', 'Test_Taken',
                'Test_Score', 'Test_Prediction_Points', 'Test_Prediction_Grade'
            ]);
            dataQuery = `
        SELECT 
          id,
          upload_id,
          file_name,
          uploaded_at,
          uploaded_by,
          [Student_ID],
          [Class],
          [Name],
          [Gender],
          [Date_of_Birth],
          [Year_Group],
          [GCSE_Score],
          [Subject],
          [Level],
          [GCSE_Prediction_Points],
          [GCSE_Prediction_Grade],
          [Test_Taken],
          [Test_Score],
          [Test_Prediction_Points],
          [Test_Prediction_Grade]
        FROM EF.CEM_PredictionReport
        ${whereClause}
        ORDER BY id
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY;
      `;
            countQuery = `
        SELECT COUNT(*) as total
        FROM EF.CEM_PredictionReport
        ${whereClause};
      `;
        }
        else if (fileType.type_code === 'CEM_FINAL') {
            const whereClause = buildWhereClause([
                'Student_ID', 'Class', 'Surname', 'Forename', 'Gender', 'Exam_Type', 'Subject_Title',
                'Syllabus_Title', 'Exam_Board', 'Syllabus_Code', 'Grade', 'Grade_as_Points',
                'GCSE_Score', 'GCSE_Prediction', 'GCSE_Residual', 'GCSE_Standardised_Residual',
                'GCSE_Gender_Adj_Prediction', 'GCSE_Gender_Adj_Residual', 'GCSE_Gender_Adj_Std_Residual',
                'Adaptive_Score', 'Adaptive_Prediction', 'Adaptive_Residual', 'Adaptive_Standardised_Residual',
                'Adaptive_Gender_Adj_Prediction', 'Adaptive_Gender_Adj_Residual', 'Adaptive_Gender_Adj_Std_Residual',
                'TDA_Score', 'TDA_Prediction', 'TDA_Residual', 'TDA_Standardised_Residual',
                'TDA_Gender_Adj_Prediction', 'TDA_Gender_Adj_Residual', 'TDA_Gender_Adj_Std_Residual'
            ]);
            dataQuery = `
        SELECT 
          id,
          upload_id,
          file_name,
          uploaded_at,
          uploaded_by,
          [Student_ID],
          [Class],
          [Surname],
          [Forename],
          [Gender],
          [Exam_Type],
          [Subject_Title],
          [Syllabus_Title],
          [Exam_Board],
          [Syllabus_Code],
          [Grade],
          [Grade_as_Points],
          [GCSE_Score],
          [GCSE_Prediction],
          [GCSE_Residual],
          [GCSE_Standardised_Residual],
          [GCSE_Gender_Adj_Prediction],
          [GCSE_Gender_Adj_Residual],
          [GCSE_Gender_Adj_Std_Residual],
          [Adaptive_Score],
          [Adaptive_Prediction],
          [Adaptive_Residual],
          [Adaptive_Standardised_Residual],
          [Adaptive_Gender_Adj_Prediction],
          [Adaptive_Gender_Adj_Residual],
          [Adaptive_Gender_Adj_Std_Residual],
          [TDA_Score],
          [TDA_Prediction],
          [TDA_Residual],
          [TDA_Standardised_Residual],
          [TDA_Gender_Adj_Prediction],
          [TDA_Gender_Adj_Residual],
          [TDA_Gender_Adj_Std_Residual]
        FROM EF.CEM_SubjectLevelAnalysis
        ${whereClause}
        ORDER BY id
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY;
      `;
            countQuery = `
        SELECT COUNT(*) as total
        FROM EF.CEM_SubjectLevelAnalysis
        ${whereClause};
      `;
        }
        else if (fileType.type_code === 'HR_EMPLOYEE_DATA') {
            const whereClause = buildWhereClause([
                'Year', 'Quarter', 'Month', 'Country', 'Country_City', 'Entity', 'Emp_ID',
                'Position_Category', 'Attrition', 'FTE', 'Date_of_Birth', 'Date_of_Hire', 'Sect',
                'Staff_Nationality', 'Gender', 'Teaching_Level', 'Teaching_Subject_Category',
                'Qualification', 'Date_of_Separation', 'reason_for_leaving', 'Aging', 'Age_Grouping',
                'Longevity', 'Longevity_Grouping', 'Reason_type', 'Reporting_Year', 'recruitment',
                'separation', 'Staff_Category', 'Contract_type', 'Key'
            ]);
            dataQuery = `
        SELECT id,upload_id,file_name,uploaded_at,uploaded_by,
          [Year],[Quarter],[Month],[Country],[Country_City],[Entity],[Emp_ID],[Position_Category],[Attrition],[FTE],
          [Date_of_Birth],[Date_of_Hire],[Sect],[Staff_Nationality],[Gender],[Teaching_Level],[Teaching_Subject_Category],[Qualification],
          [Date_of_Separation],[reason_for_leaving],[Aging],[Age_Grouping],[Longevity],[Longevity_Grouping],[Reason_type],[Reporting_Year],
          [recruitment],[separation],[Staff_Category],[Contract_type],[Key]
        FROM EF.HR_EmployeeData
        ${whereClause}
        ORDER BY id
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
      `;
            countQuery = `SELECT COUNT(*) as total FROM EF.HR_EmployeeData ${whereClause};`;
        }
        else if (fileType.type_code === 'HR_BUDGET_VS_ACTUAL') {
            const whereClause = buildWhereClause([
                'Year', 'Quarter', 'Country', 'Category', 'Budget', 'Key'
            ]);
            dataQuery = `
        SELECT id,upload_id,file_name,uploaded_at,uploaded_by,
          [Year],[Quarter],[Country],[Category],[Budget],[Key]
        FROM EF.HR_BudgetVsActual
        ${whereClause}
        ORDER BY id
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
      `;
            countQuery = `SELECT COUNT(*) as total FROM EF.HR_BudgetVsActual ${whereClause};`;
        }
        else if (EFService.FINANCE_DICTIONARY_CODES.has(fileType.type_code)) {
            const whereClause = buildWhereClause([
                'dictionary_type', 'code', 'description', 'suspended', 'entity', 'group_dimension',
                'last_updated_by'
            ]);
            dataQuery = `
        SELECT
          id, upload_id, file_name, uploaded_at, uploaded_by,
          dictionary_type, code, description, suspended, entity, group_dimension,
          last_updated_by, last_updated_at
        FROM FIN.DictionaryData
        ${whereClause}
        ORDER BY id
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
      `;
            countQuery = `SELECT COUNT(*) as total FROM FIN.DictionaryData ${whereClause};`;
        }
        else if (fileType.type_code === 'FIN_TB_ACTUAL' || fileType.type_code === 'FIN_TB_BUDGET') {
            const whereClause = buildWhereClause([
                'tb_type', 'main_account', 'funding_source', 'region', 'operating_unit', 'department',
                'project', 'activity', 'resource', 'party', 'fixed_assets', 'reference',
                'debit', 'credit', 'status', 'last_updated_by'
            ]);
            dataQuery = `
        SELECT
          id, upload_id, file_name, uploaded_at, uploaded_by,
          tb_type, main_account, funding_source, region, operating_unit, department, project, activity,
          resource, party, fixed_assets, reference, debit, credit, status,
          last_updated_by, last_updated_at
        FROM FIN.TrialBalance
        ${whereClause}
        ORDER BY id
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
      `;
            countQuery = `SELECT COUNT(*) as total FROM FIN.TrialBalance ${whereClause};`;
        }
        else {
            throw new Error(`Unsupported file type: ${fileType.type_code}`);
        }
        // Get total count
        const countResult = await executeQuery(countQuery, params);
        if (countResult.error) {
            throw new Error(`Failed to get data count: ${countResult.error}`);
        }
        const total = countResult.data?.[0]?.total || 0;
        // Get paginated data
        const dataResult = await executeQuery(dataQuery, params);
        if (dataResult.error) {
            throw new Error(`Failed to get upload data: ${dataResult.error}`);
        }
        return {
            data: dataResult.data || [],
            total,
            page,
            limit
        };
    }
    /**
     * Delete an upload and its associated data
     * Uses dynamic table name from FileTypes.target_table for extensibility
     */
    async deleteUpload(uploadId) {
        // First, get the upload to find its file type
        const upload = await this.getUploadById(uploadId);
        if (!upload) {
            throw new Error(`Upload with ID ${uploadId} not found`);
        }
        // Get the file type to determine the target table
        const fileTypeQuery = `
      SELECT 
        id,
        type_code,
        target_table
      FROM EF.FileTypes
      WHERE id = @fileTypeId;
    `;
        const fileTypeResult = await executeQuery(fileTypeQuery, { fileTypeId: upload.file_type_id });
        if (fileTypeResult.error || !fileTypeResult.data || fileTypeResult.data.length === 0) {
            throw new Error(`File type not found for upload ${uploadId}`);
        }
        const fileType = fileTypeResult.data[0];
        const targetTable = fileType.target_table;
        // Whitelist of allowed table names for security (prevents SQL injection)
        // Only tables in the EF schema that store upload data
        const allowedTables = [
            'IB_ExternalExams',
            'MSNAV_FinancialAid',
            'CEM_PredictionReport',
            'CEM_SubjectLevelAnalysis',
            'HR_EmployeeData',
            'HR_BudgetVsActual',
            'FIN_DictionaryData',
            'FIN_TrialBalance'
        ];
        if (!allowedTables.includes(targetTable)) {
            throw new Error(`Invalid target table: ${targetTable}. Table not in whitelist.`);
        }
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        try {
            await transaction.begin();
            // Delete from the appropriate data table using dynamic table name
            // Table name is whitelist-validated and comes from trusted database source
            // Using square brackets for SQL Server identifier quoting
            const dataTableRef = targetTable === 'FIN_DictionaryData'
                ? 'FIN.DictionaryData'
                : targetTable === 'FIN_TrialBalance'
                    ? 'FIN.TrialBalance'
                    : `EF.[${targetTable}]`;
            const deleteDataQuery = `DELETE FROM ${dataTableRef} WHERE upload_id = @uploadId;`;
            const deleteUploadQuery = `
        DELETE FROM EF.Uploads
        WHERE id = @uploadId;
      `;
            const request = transaction.request();
            request.input('uploadId', sql.BigInt, uploadId);
            // Delete from the specific data table
            await request.query(deleteDataQuery);
            // Delete the upload record
            await request.query(deleteUploadQuery);
            await transaction.commit();
        }
        catch (error) {
            await transaction.rollback();
            throw new Error(`Failed to delete upload: ${error.message || error}`);
        }
    }
}
export const efService = new EFService();
//# sourceMappingURL=EFService.js.map