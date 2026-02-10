/**
 * Script to setup nodes, schools, and grant initial access
 * Run with: node scripts/setup_nodes_schools.js
 * 
 * This script:
 * 1. Creates organizational nodes
 * 2. Assigns schools to nodes
 * 3. Grants access to a user (optional)
 */

import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  server: process.env.AZURE_SQL_SERVER || '',
  database: process.env.AZURE_SQL_DATABASE || '',
  user: process.env.AZURE_SQL_USER || '',
  password: process.env.AZURE_SQL_PASSWORD || '',
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
  },
};

// Configuration - Modify these values
const NODES = [
  { id: 'HQ', description: 'Headquarters', isHeadOffice: true, parentId: null },
  { id: 'IN-N', description: 'India North Region', isHeadOffice: false, parentId: 'HQ' },
  { id: 'IN-S', description: 'India South Region', isHeadOffice: false, parentId: 'HQ' },
  { id: 'UAE', description: 'UAE Region', isHeadOffice: false, parentId: 'HQ' },
];

// School assignments - Modify these based on your actual schools
const SCHOOL_ASSIGNMENTS = [
  // { schoolId: 'SCH001', nodeId: 'IN-N', source: 'nex' },
  // { schoolId: '1', nodeId: 'HQ', source: 'mb' },
];

// User access grants - Optional: grant access to a user
const USER_ACCESS = [
  // { email: 'laxman.narayanan-ext@akgn.org', nodeId: 'HQ', departments: ['ACADEMIC', 'HR', 'FINANCE', 'OPERATIONS'] },
];

async function setupNodes() {
  try {
    console.log('🔌 Connecting to database...');
    await sql.connect(config);
    console.log('✅ Connected to database\n');

    // Create nodes
    console.log('📋 Creating nodes...');
    for (const node of NODES) {
      const checkResult = await sql.query`
        SELECT Node_ID FROM admin.Node WHERE Node_ID = ${node.id}
      `;

      if (checkResult.recordset.length === 0) {
        await sql.query`
          INSERT INTO admin.Node (Node_ID, Node_Description, Is_Head_Office, Parent_Node_ID, Created_By)
          VALUES (${node.id}, ${node.description}, ${node.isHeadOffice ? 1 : 0}, ${node.parentId || null}, 'system')
        `;
        console.log(`  ✅ Created node: ${node.id} - ${node.description}`);
      } else {
        console.log(`  ⏭️  Node already exists: ${node.id}`);
      }
    }

    // Assign schools to nodes
    if (SCHOOL_ASSIGNMENTS.length > 0) {
      console.log('\n🏫 Assigning schools to nodes...');
      for (const assignment of SCHOOL_ASSIGNMENTS) {
        const checkResult = await sql.query`
          SELECT School_ID FROM admin.Node_School 
          WHERE School_ID = ${assignment.schoolId} AND School_Source = ${assignment.source}
        `;

        if (checkResult.recordset.length === 0) {
          await sql.query`
            INSERT INTO admin.Node_School (School_ID, Node_ID, School_Source, Created_By)
            VALUES (${assignment.schoolId}, ${assignment.nodeId}, ${assignment.source}, 'system')
          `;
          console.log(`  ✅ Assigned ${assignment.source} school ${assignment.schoolId} to node ${assignment.nodeId}`);
        } else {
          console.log(`  ⏭️  School ${assignment.schoolId} already assigned`);
        }
      }
    } else {
      console.log('\n⚠️  No school assignments configured. Update SCHOOL_ASSIGNMENTS array to assign schools.');
    }

    // Grant user access
    if (USER_ACCESS.length > 0) {
      console.log('\n👤 Granting user access...');
      for (const access of USER_ACCESS) {
        // Check if user exists
        const userCheck = await sql.query`
          SELECT User_ID FROM admin.[User] WHERE User_ID = ${access.email}
        `;

        if (userCheck.recordset.length === 0) {
          console.log(`  ⚠️  User ${access.email} does not exist. Skipping access grant.`);
          continue;
        }

        // Grant access for each department
        for (const deptId of access.departments) {
          const accessCheck = await sql.query`
            SELECT User_ID FROM admin.User_Node_Access
            WHERE User_ID = ${access.email} AND Node_ID = ${access.nodeId} AND Department_ID = ${deptId}
          `;

          if (accessCheck.recordset.length === 0) {
            await sql.query`
              INSERT INTO admin.User_Node_Access (User_ID, Node_ID, Department_ID, Created_By)
              VALUES (${access.email}, ${access.nodeId}, ${deptId}, 'system')
            `;
            console.log(`  ✅ Granted ${access.email} access to ${access.nodeId} - ${deptId}`);
          } else {
            console.log(`  ⏭️  Access already exists: ${access.email} → ${access.nodeId} - ${deptId}`);
          }
        }
      }
    } else {
      console.log('\n⚠️  No user access configured. Update USER_ACCESS array to grant access.');
    }

    // Display summary
    console.log('\n📊 Summary:');
    
    const nodesResult = await sql.query`SELECT COUNT(*) as count FROM admin.Node`;
    console.log(`  Nodes: ${nodesResult.recordset[0].count}`);

    const schoolsResult = await sql.query`SELECT COUNT(*) as count FROM admin.Node_School`;
    console.log(`  School Assignments: ${schoolsResult.recordset[0].count}`);

    const accessResult = await sql.query`SELECT COUNT(*) as count FROM admin.User_Node_Access`;
    console.log(`  User Access Grants: ${accessResult.recordset[0].count}`);

    await sql.close();
    console.log('\n✅ Setup completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupNodes();
