/**
 * Test temp file workaround
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.join(__dirname, '../docs/marks-pjhsw.xlsx');

console.log('🧪 Testing temp file workaround...\n');

const buffer = fs.readFileSync(filePath);
console.log(`📦 File size: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB\n`);

const tempDir = os.tmpdir();
const tempFile = path.join(tempDir, `test-nexquare-${Date.now()}.xlsx`);

try {
  console.log(`💾 Writing to temp file: ${tempFile}`);
  fs.writeFileSync(tempFile, buffer);
  console.log(`✅ Written\n`);
  
  console.log(`📖 Reading with XLSX.readFile...`);
  
  // Check if readFile exists
  if (typeof (XLSX as any).readFile === 'function') {
    const workbook = (XLSX as any).readFile(tempFile, {
      cellDates: false,
      cellNF: false,
      cellText: false
    });
    
    console.log(`✅ readFile succeeded`);
    console.log(`   - SheetNames: ${workbook.SheetNames?.length || 0}`);
    console.log(`   - Sheets keys: ${workbook.Sheets ? Object.keys(workbook.Sheets).length : 0}`);
    
    if (workbook.Sheets && Object.keys(workbook.Sheets).length > 0) {
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      if (worksheet && worksheet['!ref']) {
        const records = XLSX.utils.sheet_to_json(worksheet, {
          defval: null,
          raw: false,
          blankrows: false
        });
        console.log(`\n✅ Successfully parsed ${records.length} records!`);
      }
    } else {
      console.log(`❌ Sheets object still empty with readFile`);
    }
  } else {
    console.log(`❌ XLSX.readFile is not available in this version`);
    console.log(`   Available methods: ${Object.keys(XLSX).filter(k => typeof (XLSX as any)[k] === 'function').join(', ')}`);
  }
} finally {
  // Clean up
  try {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
      console.log(`\n🗑️  Temp file deleted`);
    }
  } catch (e) {
    console.log(`\n⚠️  Failed to delete temp file: ${tempFile}`);
  }
}
