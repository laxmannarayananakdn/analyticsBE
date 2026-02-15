/**
 * Migrate user_sidebar_access to User Groups + Report Groups
 * Run with: node scripts/migrate_user_sidebar_access_to_groups.js
 *
 * For each user with rows in user_sidebar_access:
 * - Creates Access Group MIGRATED_PAGES_{sanitized_email} with their page items
 * - Creates Report Group MIGRATED_REPORTS_{sanitized_email} with their report UUIDs
 * - Assigns user to both groups
 * - Optionally clears user_sidebar_access (dry run by default)
 *
 * Usage: node scripts/migrate_user_sidebar_access_to_groups.js [--execute]
 *        --execute = actually clear user_sidebar_access after migration (default: dry run)
 */

import sql from 'mssql';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

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

const EXECUTE = process.argv.includes('--execute');

function sanitizeForGroupId(email) {
  return email.replace(/[@.]/g, '_').replace(/[^a-zA-Z0-9_]/g, '').substring(0, 50);
}

async function run() {
  let pool;
  try {
    console.log('🔌 Connecting to database...');
    pool = await sql.connect(config);
    console.log('✅ Connected\n');

    const rows = await pool.request().query(`
      SELECT User_ID, Item_ID FROM admin.user_sidebar_access ORDER BY User_ID, Item_ID
    `);

    if (!rows.recordset || rows.recordset.length === 0) {
      console.log('No rows in user_sidebar_access. Nothing to migrate.');
      return;
    }

    const byUser = new Map();
    for (const r of rows.recordset) {
      if (!byUser.has(r.User_ID)) byUser.set(r.User_ID, { pages: [], reports: [] });
      if (r.Item_ID.startsWith('report:')) {
        byUser.get(r.User_ID).reports.push(r.Item_ID.replace('report:', ''));
      } else {
        byUser.get(r.User_ID).pages.push(r.Item_ID);
      }
    }

    console.log(`Found ${byUser.size} users with direct sidebar access to migrate.\n`);

    for (const [email, { pages, reports }] of byUser) {
      const suffix = sanitizeForGroupId(email);
      const pageGroupId = `MIGRATED_PAGES_${suffix}`;
      const reportGroupId = `MIGRATED_REPORTS_${suffix}`;

      try {
        if (pages.length > 0) {
          await pool.request()
            .input('groupId', sql.VarChar(50), pageGroupId)
            .input('groupName', sql.VarChar(100), `Migrated pages for ${email}`)
            .input('createdBy', sql.VarChar(255), 'migration_script')
            .query(`
              IF NOT EXISTS (SELECT 1 FROM admin.Access_Group WHERE Group_ID = @groupId)
              INSERT INTO admin.Access_Group (Group_ID, Group_Name, Group_Description, Created_By)
              VALUES (@groupId, @groupName, 'Migrated from user_sidebar_access', @createdBy)
            `);

          for (const itemId of pages) {
            await pool.request()
              .input('groupId', sql.VarChar(50), pageGroupId)
              .input('itemId', sql.VarChar(255), itemId)
              .input('createdBy', sql.VarChar(255), 'migration_script')
              .query(`
                IF NOT EXISTS (SELECT 1 FROM admin.Group_Page_Access WHERE Group_ID = @groupId AND Item_ID = @itemId)
                INSERT INTO admin.Group_Page_Access (Group_ID, Item_ID, Created_By)
                VALUES (@groupId, @itemId, @createdBy)
              `);
          }

          await pool.request()
            .input('email', sql.VarChar(255), email)
            .input('groupId', sql.VarChar(50), pageGroupId)
            .input('createdBy', sql.VarChar(255), 'migration_script')
            .query(`
              IF NOT EXISTS (SELECT 1 FROM admin.User_Group WHERE User_ID = @email AND Group_ID = @groupId)
              INSERT INTO admin.User_Group (User_ID, Group_ID, Created_By)
              VALUES (@email, @groupId, @createdBy)
            `);

          console.log(`  ${email}: pages group ${pageGroupId} (${pages.length} items), assigned`);
        }

        if (reports.length > 0) {
          await pool.request()
            .input('groupId', sql.VarChar(50), reportGroupId)
            .input('groupName', sql.VarChar(100), `Migrated reports for ${email}`)
            .input('createdBy', sql.VarChar(255), 'migration_script')
            .query(`
              IF NOT EXISTS (SELECT 1 FROM admin.Report_Group WHERE Report_Group_ID = @groupId)
              INSERT INTO admin.Report_Group (Report_Group_ID, Group_Name, Group_Description, Created_By)
              VALUES (@groupId, @groupName, 'Migrated from user_sidebar_access', @createdBy)
            `);

          for (const uuid of reports) {
            await pool.request()
              .input('groupId', sql.VarChar(50), reportGroupId)
              .input('uuid', sql.VarChar(50), uuid)
              .input('createdBy', sql.VarChar(255), 'migration_script')
              .query(`
                IF NOT EXISTS (SELECT 1 FROM admin.Report_Group_Report WHERE Report_Group_ID = @groupId AND Dashboard_UUID = @uuid)
                INSERT INTO admin.Report_Group_Report (Report_Group_ID, Dashboard_UUID, Created_By)
                VALUES (@groupId, @uuid, @createdBy)
              `);
          }

          await pool.request()
            .input('email', sql.VarChar(255), email)
            .input('groupId', sql.VarChar(50), reportGroupId)
            .input('createdBy', sql.VarChar(255), 'migration_script')
            .query(`
              IF NOT EXISTS (SELECT 1 FROM admin.User_Report_Group WHERE User_ID = @email AND Report_Group_ID = @groupId)
              INSERT INTO admin.User_Report_Group (User_ID, Report_Group_ID, Created_By)
              VALUES (@email, @groupId, @createdBy)
            `);

          console.log(`  ${email}: reports group ${reportGroupId} (${reports.length} reports), assigned`);
        }
      } catch (err) {
        console.error(`  ERROR for ${email}:`, err.message);
      }
    }

    if (EXECUTE) {
      const del = await pool.request().query(`DELETE FROM admin.user_sidebar_access`);
      console.log(`\n✅ Cleared user_sidebar_access (${rows.recordset.length} rows removed).`);
    } else {
      console.log('\n⚠️  DRY RUN - user_sidebar_access NOT cleared. Run with --execute to clear after migration.');
    }
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    if (pool) await pool.close();
  }
}

run();
