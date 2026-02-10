/**
 * EF Schema Types
 * Types for External Files Upload System
 */
export type UploadStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export interface FileType {
    id: number;
    type_code: string;
    type_name: string;
    description?: string;
    file_extension: string;
    target_table: string;
    is_active: boolean;
    validation_rules?: string;
    created_at?: Date;
    updated_at?: Date;
}
export interface Upload {
    id: number;
    file_type_id: number;
    file_name: string;
    file_size_bytes?: number;
    row_count?: number;
    status: UploadStatus;
    error_message?: string;
    uploaded_by: string;
    uploaded_at: Date;
    processed_at?: Date;
}
export interface IBExternalExam {
    Year?: number;
    Month?: string;
    School?: string;
    Registration_Number?: string;
    Personal_Code?: string;
    Name?: string;
    Category?: string;
    Subject?: string;
    Level?: string;
    Language?: string;
    Predicted_Grade?: string;
    Grade?: string;
    EE_TOK_Points?: string;
    Total_Points?: string;
    Result?: string;
    Diploma_Requirements_Code?: string;
}
export interface MSNAVFinancialAid {
    S_No?: number;
    UCI?: string;
    Academic_Year?: string;
    Class?: string;
    Class_Code?: string;
    Student_No?: string;
    Student_Name?: string;
    Percentage?: number;
    Fee_Classification?: string;
    FA_Sub_Type?: string;
    Fee_Code?: string;
    Community_Status?: string;
}
export interface CEMPredictionReport {
    Student_ID: string | null;
    Class: string | null;
    Name: string | null;
    Gender: string | null;
    Date_of_Birth: string | null;
    Year_Group: number | null;
    GCSE_Score: number | null;
    Subject: string | null;
    Level: string | null;
    GCSE_Prediction_Points: number | null;
    GCSE_Prediction_Grade: string | null;
    Test_Taken: string | null;
    Test_Score: number | null;
    Test_Prediction_Points: number | null;
    Test_Prediction_Grade: string | null;
}
export interface CEMSubjectLevelAnalysis {
    Student_ID: string | null;
    Class: string | null;
    Surname: string | null;
    Forename: string | null;
    Gender: string | null;
    Exam_Type: string | null;
    Subject_Title: string | null;
    Syllabus_Title: string | null;
    Exam_Board: string | null;
    Syllabus_Code: string | null;
    Grade: string | null;
    Grade_as_Points: number | null;
    GCSE_Score: number | null;
    GCSE_Prediction: number | null;
    GCSE_Residual: number | null;
    GCSE_Standardised_Residual: number | null;
    GCSE_Gender_Adj_Prediction: number | null;
    GCSE_Gender_Adj_Residual: number | null;
    GCSE_Gender_Adj_Std_Residual: number | null;
    Adaptive_Score: number | null;
    Adaptive_Prediction: number | null;
    Adaptive_Residual: number | null;
    Adaptive_Standardised_Residual: number | null;
    Adaptive_Gender_Adj_Prediction: number | null;
    Adaptive_Gender_Adj_Residual: number | null;
    Adaptive_Gender_Adj_Std_Residual: number | null;
    TDA_Score: number | null;
    TDA_Prediction: number | null;
    TDA_Residual: number | null;
    TDA_Standardised_Residual: number | null;
    TDA_Gender_Adj_Prediction: number | null;
    TDA_Gender_Adj_Residual: number | null;
    TDA_Gender_Adj_Std_Residual: number | null;
}
//# sourceMappingURL=ef.d.ts.map