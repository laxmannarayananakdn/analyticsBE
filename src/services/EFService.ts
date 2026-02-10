/**
 * EF Service
 * Handles all database operations for External Files Upload System
 */

import { getConnection, executeQuery, sql } from '../config/database';
import {
  FileType,
  Upload,
  UploadStatus,
  IBExternalExam,
  MSNAVFinancialAid,
  CEMPredictionReport,
  CEMSubjectLevelAnalysis
} from '../types/ef';

export class EFService {
  /**
   * Get all active file types
   */
  async getActiveFileTypes(): Promise<FileType[]> {
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

    const result = await executeQuery<FileType>(query);
    
    if (result.error) {
      throw new Error(`Failed to get active file types: ${result.error}`);
    }

    return result.data || [];
  }

  /**
   * Create a new upload record
   * @returns The ID of the created upload
   */
  async createUpload(
    fileTypeCode: string,
    fileName: string,
    fileSize: number,
    uploadedBy: string = 'Admin'
  ): Promise<number> {
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
        uploaded_at
      )
      VALUES (
        @file_type_id,
        @fileName,
        @fileSize,
        'PENDING',
        @uploadedBy,
        SYSDATETIMEOFFSET()
      );
      
      SELECT SCOPE_IDENTITY() AS id;
    `;

    const result = await executeQuery<{ id: number }>(query, {
      fileTypeCode,
      fileName,
      fileSize,
      uploadedBy
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
  async updateUploadStatus(
    uploadId: number,
    status: UploadStatus,
    rowCount?: number,
    errorMessage?: string
  ): Promise<void> {
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

    const params: Record<string, any> = {
      uploadId,
      status
    };

    if (rowCount !== undefined) {
      params.rowCount = rowCount;
    } else {
      params.rowCount = null;
    }

    if (errorMessage !== undefined) {
      params.errorMessage = errorMessage;
    } else {
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
  async insertIBExternalExams(
    uploadId: number,
    fileName: string,
    uploadedBy: string,
    records: IBExternalExam[]
  ): Promise<number> {
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
    } catch (error: any) {
      await transaction.rollback();
      throw new Error(`Failed to insert IB External Exams: ${error.message || error}`);
    }
  }

  /**
   * Insert MSNAV Financial Aid records using bulk insert
   */
  async insertMSNAVFinancialAid(
    uploadId: number,
    fileName: string,
    uploadedBy: string,
    records: MSNAVFinancialAid[]
  ): Promise<number> {
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
    } catch (error: any) {
      await transaction.rollback();
      throw new Error(`Failed to insert MSNAV Financial Aid: ${error.message || error}`);
    }
  }

  /**
   * Insert CEM Prediction Report records using bulk insert
   */
  async insertCEMPredictionReport(
    uploadId: number,
    fileName: string,
    uploadedBy: string,
    records: CEMPredictionReport[]
  ): Promise<number> {
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
    } catch (error: any) {
      await transaction.rollback();
      throw new Error(`Failed to insert CEM Prediction Report: ${error.message || error}`);
    }
  }

  /**
   * Insert CEM Subject Level Analysis records using bulk insert
   */
  async insertCEMSubjectLevelAnalysis(
    uploadId: number,
    fileName: string,
    uploadedBy: string,
    records: CEMSubjectLevelAnalysis[]
  ): Promise<number> {
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
    } catch (error: any) {
      await transaction.rollback();
      throw new Error(`Failed to insert CEM Subject Level Analysis: ${error.message || error}`);
    }
  }

  /**
   * Get upload by ID
   */
  async getUploadById(uploadId: number): Promise<Upload | null> {
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
        u.processed_at
      FROM EF.Uploads u
      WHERE u.id = @uploadId;
    `;

    const result = await executeQuery<Upload>(query, { uploadId });

    if (result.error) {
      throw new Error(`Failed to get upload: ${result.error}`);
    }

    return result.data && result.data.length > 0 ? result.data[0] : null;
  }

  /**
   * Get recent uploads
   */
  async getRecentUploads(
    fileTypeCode?: string,
    limit: number = 50
  ): Promise<Upload[]> {
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

    const params: Record<string, any> = { limit };

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

    const result = await executeQuery<Upload>(query, params);

    if (result.error) {
      throw new Error(`Failed to get recent uploads: ${result.error}`);
    }

    return result.data || [];
  }

  /**
   * Get upload data (paginated)
   * Returns data from the appropriate table based on upload's file type
   */
  async getUploadData(
    uploadId: number,
    page: number = 1,
    limit: number = 100
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
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

    let dataQuery = '';
    let countQuery = '';
    const params: Record<string, any> = { uploadId, limit, offset };

    if (fileType.type_code === 'IB_EXTERNAL_EXAMS') {
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
        WHERE upload_id = @uploadId
        ORDER BY id
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY;
      `;

      countQuery = `
        SELECT COUNT(*) as total
        FROM EF.IB_ExternalExams
        WHERE upload_id = @uploadId;
      `;
    } else if (fileType.type_code === 'MSNAV_FINANCIAL_AID') {
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
        WHERE upload_id = @uploadId
        ORDER BY id
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY;
      `;

      countQuery = `
        SELECT COUNT(*) as total
        FROM EF.MSNAV_FinancialAid
        WHERE upload_id = @uploadId;
      `;
    } else if (fileType.type_code === 'CEM_INITIAL') {
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
        WHERE upload_id = @uploadId
        ORDER BY id
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY;
      `;

      countQuery = `
        SELECT COUNT(*) as total
        FROM EF.CEM_PredictionReport
        WHERE upload_id = @uploadId;
      `;
    } else if (fileType.type_code === 'CEM_FINAL') {
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
        WHERE upload_id = @uploadId
        ORDER BY id
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY;
      `;

      countQuery = `
        SELECT COUNT(*) as total
        FROM EF.CEM_SubjectLevelAnalysis
        WHERE upload_id = @uploadId;
      `;
    } else {
      throw new Error(`Unsupported file type: ${fileType.type_code}`);
    }

    // Get total count
    const countResult = await executeQuery<{ total: number }>(countQuery, { uploadId });
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
  async deleteUpload(uploadId: number): Promise<void> {
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

    const fileTypeResult = await executeQuery<{ id: number; type_code: string; target_table: string }>(
      fileTypeQuery,
      { fileTypeId: upload.file_type_id }
    );

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
      'CEM_SubjectLevelAnalysis'
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
      const deleteDataQuery = `
        DELETE FROM EF.[${targetTable}]
        WHERE upload_id = @uploadId;
      `;

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
    } catch (error: any) {
      await transaction.rollback();
      throw new Error(`Failed to delete upload: ${error.message || error}`);
    }
  }
}

export const efService = new EFService();

