/**
 * Test script to parse the Excel file and diagnose issues
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.join(__dirname, '../docs/marks-pjhsw.xlsx');

console.log('🧪 Testing Excel file parsing...');
console.log(`📁 File path: ${filePath}`);
console.log(`📦 Checking file existence...`);

if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  process.exit(1);
}

const stats = fs.statSync(filePath);
const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
console.log(`✅ File found: ${fileSizeMB} MB (${stats.size.toLocaleString()} bytes)`);

console.log('\n📖 Reading file buffer...');
const buffer = fs.readFileSync(filePath);
console.log(`✅ Buffer size: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB`);

// Test different parsing strategies
const strategies = [
  {
    name: 'Strategy 1: Optimized (cellDates: false, cellNF: false, cellText: false)',
    options: {
      type: 'buffer' as const,
      cellDates: false,
      cellNF: false,
      cellText: false
    }
  },
  {
    name: 'Strategy 2: Minimal (with sheetStubs: false)',
    options: {
      type: 'buffer' as const,
      cellDates: false,
      cellNF: false,
      cellText: false,
      sheetStubs: false
    }
  },
  {
    name: 'Strategy 3: Default options',
    options: {
      type: 'buffer' as const
    }
  },
  {
    name: 'Strategy 4: With dense: false',
    options: {
      type: 'buffer' as const,
      cellDates: false,
      cellNF: false,
      cellText: false,
      dense: false
    }
  }
];

for (let i = 0; i < strategies.length; i++) {
  const strategy = strategies[i];
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔄 ${strategy.name}`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    const startTime = Date.now();
    const workbook = XLSX.read(buffer, strategy.options);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ Parsing succeeded in ${duration} seconds`);
    
    // Check workbook structure
    console.log(`\n📊 Workbook structure:`);
    console.log(`   - SheetNames: ${workbook.SheetNames?.length || 0} sheet(s)`);
    if (workbook.SheetNames && workbook.SheetNames.length > 0) {
      console.log(`   - Sheet names: ${workbook.SheetNames.join(', ')}`);
    }
    
    console.log(`   - Sheets object keys: ${workbook.Sheets ? Object.keys(workbook.Sheets).length : 0}`);
    if (workbook.Sheets) {
      const sheetKeys = Object.keys(workbook.Sheets);
      console.log(`   - Available sheet keys: ${sheetKeys.join(', ')}`);
    }
    
    // Try to access the first sheet
    if (workbook.SheetNames && workbook.SheetNames.length > 0) {
      const sheetName = workbook.SheetNames[0];
      console.log(`\n📄 Accessing first sheet: "${sheetName}"`);
      
      // Debug workbook structure
      console.log(`\n🔍 Debugging workbook structure:`);
      console.log(`   - workbook type: ${typeof workbook}`);
      console.log(`   - workbook keys: ${Object.keys(workbook).join(', ')}`);
      console.log(`   - workbook.Sheets type: ${typeof workbook.Sheets}`);
      console.log(`   - workbook.Sheets value: ${JSON.stringify(workbook.Sheets)}`);
      
      // Check Workbook property
      if (workbook.Workbook) {
        console.log(`   - workbook.Workbook exists: ${typeof workbook.Workbook}`);
        if (workbook.Workbook.Sheets) {
          console.log(`   - workbook.Workbook.Sheets: ${JSON.stringify(workbook.Workbook.Sheets)}`);
        }
      }
      
      // Try to manually load the sheet using XLSX.utils
      console.log(`\n🔄 Trying to manually access sheet data...`);
      try {
        // Try using XLSX.utils.book_get_sheet
        const sheet = (XLSX.utils as any).book_get_sheet?.(workbook, sheetName);
        if (sheet) {
          console.log(`   ✅ Found sheet via book_get_sheet`);
        }
      } catch (e) {
        console.log(`   ⚠️  book_get_sheet not available`);
      }
      
      // Try different ways to access the sheet
      let worksheet = workbook.Sheets?.[sheetName];
      
      // Try accessing via workbook.Directory if it exists
      if (!worksheet && (workbook as any).Directory) {
        console.log(`   - Checking Directory property...`);
        const dir = (workbook as any).Directory;
        console.log(`   - Directory type: ${typeof dir}`);
        if (dir && typeof dir === 'object') {
          console.log(`   - Directory keys: ${Object.keys(dir).slice(0, 10).join(', ')}`);
          
          // Try to find sheet data in Directory
          if (dir.sheets && Array.isArray(dir.sheets)) {
            console.log(`   - Found ${dir.sheets.length} sheet(s) in Directory`);
            for (const sheetEntry of dir.sheets) {
              console.log(`     - Sheet entry: ${JSON.stringify(sheetEntry)}`);
            }
          }
          
          // Try accessing via Directory.sheets
          if (dir.sheets && dir.sheets.length > 0) {
            const sheetEntry = dir.sheets.find((s: any) => 
              s.name === sheetName || s.$.name === sheetName
            );
            if (sheetEntry) {
              console.log(`   ✅ Found sheet entry in Directory`);
              console.log(`     - Entry: ${JSON.stringify(sheetEntry).substring(0, 200)}`);
            }
          }
        }
      }
      
      // Try to force load the sheet by accessing it differently
      // Sometimes XLSX needs the sheet to be accessed to trigger loading
      console.log(`\n🔄 Trying to force sheet loading...`);
      try {
        // Try accessing workbook.Sheets with bracket notation
        const sheetKey = Object.keys(workbook.Sheets || {})[0] || sheetName;
        worksheet = (workbook.Sheets as any)?.[sheetKey];
        
        if (!worksheet) {
          // Try using XLSX.utils methods
          const utils = XLSX.utils as any;
          if (utils.book_get_sheet) {
            worksheet = utils.book_get_sheet(workbook, sheetName);
            console.log(`   - book_get_sheet result: ${worksheet ? 'found' : 'not found'}`);
          }
        }
      } catch (e: any) {
        console.log(`   ⚠️  Force loading failed: ${e.message}`);
      }
      
      // Last resort: try reading with different options
      if (!worksheet) {
        console.log(`\n🔄 Trying alternative reading strategies...`);
        
        // Strategy A: Try with sheetRows to limit memory
        try {
          console.log(`   - Trying with sheetRows: 1000 (to test if it loads)...`);
          const workbookA = XLSX.read(buffer, {
            type: 'buffer',
            cellDates: false,
            cellNF: false,
            cellText: false,
            sheetRows: 1000  // Limit rows to test
          });
          
          if (workbookA.Sheets && Object.keys(workbookA.Sheets).length > 0) {
            worksheet = workbookA.Sheets[sheetName] || workbookA.Sheets[Object.keys(workbookA.Sheets)[0]];
            console.log(`   ✅ Found worksheet with sheetRows option!`);
            console.log(`   - This means the file CAN be parsed, but needs row limiting for large files`);
          }
        } catch (e: any) {
          console.log(`   ⚠️  sheetRows option failed: ${e.message}`);
        }
        
        // Strategy B: Try without any optimization
        if (!worksheet) {
          try {
            console.log(`   - Trying with no options (full parse)...`);
            const workbookB = XLSX.read(buffer, {
              type: 'buffer'
            });
            
            if (workbookB.Sheets && Object.keys(workbookB.Sheets).length > 0) {
              worksheet = workbookB.Sheets[sheetName] || workbookB.Sheets[Object.keys(workbookB.Sheets)[0]];
              console.log(`   ✅ Found worksheet with no options!`);
            } else {
              console.log(`   ⚠️  Still empty Sheets object even with no options`);
            }
          } catch (e: any) {
            console.log(`   ⚠️  Full parse failed: ${e.message}`);
          }
        }
      }
      
      if (!worksheet) {
        // Try accessing by index
        const sheetKeys = workbook.Sheets ? Object.keys(workbook.Sheets) : [];
        if (sheetKeys.length > 0) {
          console.log(`   ⚠️  Trying first available sheet key: ${sheetKeys[0]}`);
          worksheet = workbook.Sheets[sheetKeys[0]];
        }
      }
      
      // Try using workbook.Sheets directly if it exists
      if (!worksheet && workbook.Sheets) {
        const firstKey = Object.keys(workbook.Sheets)[0];
        if (firstKey) {
          worksheet = workbook.Sheets[firstKey];
        }
      }
      
      if (worksheet) {
        console.log(`✅ Worksheet found`);
        console.log(`   - Worksheet keys: ${Object.keys(worksheet).length}`);
        console.log(`   - First 10 keys: ${Object.keys(worksheet).slice(0, 10).join(', ')}`);
        console.log(`   - !ref: ${worksheet['!ref'] || 'NOT SET'}`);
        
        if (worksheet['!ref']) {
          const range = XLSX.utils.decode_range(worksheet['!ref']);
          console.log(`   - Range: ${worksheet['!ref']} (${range.e.r + 1} rows, ${range.e.c + 1} columns)`);
        }
        
        // Try to convert to JSON
        console.log(`\n🔄 Converting to JSON...`);
        try {
          const records = XLSX.utils.sheet_to_json(worksheet, {
            defval: null,
            raw: false,
            dateNF: 'yyyy-mm-dd',
            blankrows: false
          });
          
          console.log(`✅ Successfully converted to JSON: ${records.length} records`);
          
          if (records.length > 0) {
            console.log(`\n📋 Sample record (first record):`);
            console.log(JSON.stringify(records[0], null, 2).substring(0, 500));
            
            // Check for Grade Name column
            const firstRecord = records[0] as any;
            const gradeNameKey = Object.keys(firstRecord).find(
              key => key.toLowerCase().includes('grade')
            );
            if (gradeNameKey) {
              console.log(`\n📚 Found grade column: "${gradeNameKey}"`);
              const uniqueGrades = new Set(
                records.map((r: any) => String(r[gradeNameKey] || 'Unknown').trim())
              );
              console.log(`   - Unique grades: ${Array.from(uniqueGrades).join(', ')}`);
            }
          }
        } catch (jsonError: any) {
          console.error(`❌ Failed to convert to JSON: ${jsonError.message}`);
          console.error(`   Error stack: ${jsonError.stack?.substring(0, 300)}`);
        }
      } else {
        console.error(`❌ Worksheet "${sheetName}" not found in Sheets object`);
        console.log(`\n🔍 Trying alternative approach: Reading file directly...`);
        
        // Try reading the file again with different method
        try {
          const workbook2 = XLSX.readFile(filePath, {
            cellDates: false,
            cellNF: false,
            cellText: false
          });
          
          console.log(`✅ Direct file read succeeded`);
          console.log(`   - SheetNames: ${workbook2.SheetNames?.length || 0}`);
          console.log(`   - Sheets keys: ${workbook2.Sheets ? Object.keys(workbook2.Sheets).length : 0}`);
          
          if (workbook2.Sheets && Object.keys(workbook2.Sheets).length > 0) {
            const firstSheetKey = Object.keys(workbook2.Sheets)[0];
            const ws = workbook2.Sheets[firstSheetKey];
            console.log(`   ✅ Found worksheet via direct read: ${firstSheetKey}`);
            
            if (ws && ws['!ref']) {
              const records = XLSX.utils.sheet_to_json(ws, {
                defval: null,
                raw: false,
                blankrows: false
              });
              console.log(`   ✅ Converted ${records.length} records`);
            }
          }
        } catch (fileError: any) {
          console.error(`❌ Direct file read failed: ${fileError.message}`);
        }
      }
    }
    
    // If this strategy worked, we can stop
    if (workbook.Sheets && Object.keys(workbook.Sheets).length > 0) {
      console.log(`\n✅ Strategy ${i + 1} works! This is the strategy to use.`);
      break;
    }
    
  } catch (error: any) {
    console.error(`❌ Parsing failed: ${error.message}`);
    console.error(`   Error stack: ${error.stack?.substring(0, 300)}`);
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`✅ Testing complete`);
console.log(`${'='.repeat(60)}`);
