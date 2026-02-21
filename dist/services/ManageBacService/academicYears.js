/**
 * Academic Years Methods
 * Handles fetching and saving academic years and terms from ManageBac API
 */
import { MANAGEBAC_ENDPOINTS } from '../../config/managebac.js';
import { databaseService } from '../DatabaseService.js';
export async function getAcademicYears(apiKey, programCode, baseUrl) {
    try {
        const response = await this.makeRequest(MANAGEBAC_ENDPOINTS.ACADEMIC_YEARS, apiKey, {}, baseUrl);
        if (this.currentSchoolId && response.data?.academic_years) {
            console.log('💾 Saving academic years to database...');
            const academicData = response.data.academic_years;
            let programsToProcess = academicData;
            if (programCode) {
                const resolvedKey = this.resolveProgramKey(programCode, academicData);
                if (resolvedKey && academicData[resolvedKey]) {
                    programsToProcess = { [resolvedKey]: academicData[resolvedKey] };
                }
                else {
                    console.warn(`⚠️ Program "${programCode}" not found in academic years response. Processing all programs.`);
                }
            }
            for (const [programKey, programInfo] of Object.entries(programsToProcess)) {
                if (!programInfo) {
                    console.warn(`⚠️ No academic year data found for program: ${programKey}`);
                    continue;
                }
                const rawYears = programInfo.academic_years || [];
                if (!rawYears.length) {
                    console.log(`ℹ️ No academic years to save for program: ${programKey}`);
                    continue;
                }
                console.log(`📚 Processing ${rawYears.length} academic years for program: ${programKey}`);
                const normalizedYears = [];
                const schoolId = this.currentSchoolId;
                const termMap = new Map();
                for (const rawYear of rawYears) {
                    const yearId = typeof rawYear.id === 'string' ? parseInt(rawYear.id, 10) : rawYear.id;
                    const { startsOn, endsOn } = this.getAcademicYearDates(rawYear);
                    normalizedYears.push({
                        id: yearId,
                        school_id: schoolId,
                        program_code: programKey,
                        name: rawYear.name,
                        starts_on: new Date(startsOn),
                        ends_on: new Date(endsOn)
                    });
                    if (rawYear.academic_terms && rawYear.academic_terms.length > 0) {
                        const normalizedTerms = rawYear.academic_terms.map((term) => {
                            const termId = typeof term.id === 'string' ? parseInt(term.id, 10) : term.id;
                            const { startsOn: termStart, endsOn: termEnd } = this.getAcademicTermDates(term, startsOn, endsOn);
                            return {
                                id: termId,
                                academic_year_id: yearId,
                                name: term.name,
                                starts_on: termStart,
                                ends_on: termEnd,
                                locked: term.locked ?? false,
                                exam_grade: term.exam_grade || false
                            };
                        });
                        termMap.set(yearId, normalizedTerms);
                    }
                }
                const { error: yearsError } = await databaseService.upsertAcademicYears(normalizedYears, schoolId, programKey);
                if (yearsError) {
                    console.error(`❌ Failed to save academic years for program ${programKey}:`, yearsError);
                }
                else {
                    console.log(`✅ Saved ${normalizedYears.length} academic years for program ${programKey}`);
                    for (const year of normalizedYears) {
                        const terms = termMap.get(year.id);
                        if (terms && terms.length > 0) {
                            const { error: termsError } = await databaseService.upsertAcademicTerms(terms, year.id);
                            if (termsError) {
                                console.error(`❌ Failed to save terms for academic year ${year.id}:`, termsError);
                            }
                            else {
                                console.log(`✅ Saved ${terms.length} terms for academic year ${year.id}`);
                            }
                        }
                    }
                }
            }
        }
        return response.data;
    }
    catch (error) {
        console.error('Failed to fetch academic years:', error);
        throw error;
    }
}
//# sourceMappingURL=academicYears.js.map