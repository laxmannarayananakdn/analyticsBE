/**
 * Simple test to see if we can access the sheet directly
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.join(__dirname, '../docs/marks-pjhsw.xlsx');

console.log('🧪 Simple Excel parsing test...\n');

const buffer = fs.readFileSync(filePath);
console.log(`📦 File size: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB\n`);

// Try with sheetRows to see if that helps
console.log('🔄 Testing with sheetRows: 10000...');
try {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: false,
    cellNF: false,
    cellText: false,
    sheetRows: 10000  // Limit to first 10k rows
  });
  
  console.log(`✅ Workbook parsed`);
  console.log(`   - SheetNames: ${workbook.SheetNames?.length || 0}`);
  console.log(`   - Sheets keys: ${workbook.Sheets ? Object.keys(workbook.Sheets).length : 0}`);
  
  if (workbook.SheetNames && workbook.SheetNames.length > 0) {
    const sheetName = workbook.SheetNames[0];
    console.log(`\n📄 Sheet name: "${sheetName}"`);
    
    // Try to access directly - this might trigger loading
    const worksheet = workbook.Sheets[sheetName];
    
    if (worksheet) {
      console.log(`✅ Worksheet found!`);
      console.log(`   - Keys: ${Object.keys(worksheet).length}`);
      console.log(`   - !ref: ${worksheet['!ref'] || 'NOT SET'}`);
      
      if (worksheet['!ref']) {
        const records = XLSX.utils.sheet_to_json(worksheet, {
          defval: null,
          raw: false,
          blankrows: false
        });
        console.log(`\n✅ Successfully parsed ${records.length} records!`);
        
        if (records.length > 0) {
          console.log(`\n📋 First record keys: ${Object.keys(records[0] as any).join(', ')}`);
          const gradeKey = Object.keys(records[0] as any).find(k => k.toLowerCase().includes('grade'));
          if (gradeKey) {
            console.log(`\n📚 Grade column found: "${gradeKey}"`);
            const grades = new Set((records as any[]).map(r => String(r[gradeKey] || '').trim()).filter(g => g));
            console.log(`   - Unique grades (first 10k rows): ${Array.from(grades).slice(0, 10).join(', ')}`);
          }
        }
      }
    } else {
      console.log(`❌ Worksheet not found in Sheets object`);
      console.log(`   - This suggests the file is too large and XLSX is not loading sheets`);
      console.log(`   - Solution: We need to process the file in chunks or use streaming`);
    }
  }
} catch (error: any) {
  console.error(`❌ Error: ${error.message}`);
  console.error(error.stack);
}
