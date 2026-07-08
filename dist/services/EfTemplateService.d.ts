/**
 * Generates downloadable upload templates for each EF file type.
 * Column layouts mirror the parsers in services/parsers/.
 */
export interface EfTemplateResult {
    buffer: Buffer;
    fileName: string;
    contentType: string;
}
export declare function isSupportedTemplateType(typeCode: string): boolean;
/**
 * Generate a template file buffer for the given EF file type code.
 */
export declare function generateEfTemplate(typeCode: string): EfTemplateResult;
//# sourceMappingURL=EfTemplateService.d.ts.map