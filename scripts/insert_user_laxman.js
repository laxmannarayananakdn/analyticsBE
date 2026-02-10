/**
 * Script to insert user with hashed password
 * Run with: node scripts/insert_user_laxman.js
 */

import bcrypt from 'bcrypt';
import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const BCRYPT_SALT_ROUNDS = 12;
const USER_EMAIL = 'laxman.narayanan-ext@akdn.org';
const USER_PASSWORD = 'FractalHive1!';
const DISPLAY_NAME = 'Laxman Narayanan';

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

async function insertUser() {
  try {
    console.log('🔐 Hashing password...');
    const passwordHash = await bcrypt.hash(USER_PASSWORD, BCRYPT_SALT_ROUNDS);
    console.log('✅ Password hashed');

    console.log('🔌 Connecting to database...');
    await sql.connect(config);
    console.log('✅ Connected to database');

    // Check if user already exists
    const checkResult = await sql.query`
      SELECT User_ID FROM admin.[User] WHERE User_ID = ${USER_EMAIL}
    `;

    if (checkResult.recordset.length > 0) {
      console.log('⚠️  User already exists. Updating password...');
      
      // Update existing user
      await sql.query`
        UPDATE admin.[User]
        SET Password_Hash = ${passwordHash},
            Display_Name = ${DISPLAY_NAME},
            Is_Temporary_Password = 0,
            Is_Active = 1,
            Modified_Date = GETDATE()
        WHERE User_ID = ${USER_EMAIL}
      `;
      console.log('✅ User password updated');
    } else {
      console.log('📝 Inserting new user...');
      
      // Insert new user
      await sql.query`
        INSERT INTO admin.[User] (
          User_ID,
          Email,
          Display_Name,
          Auth_Type,
          Password_Hash,
          Is_Temporary_Password,
          Is_Active,
          Created_By
        )
        VALUES (
          ${USER_EMAIL},
          ${USER_EMAIL},
          ${DISPLAY_NAME},
          'Password',
          ${passwordHash},
          0,
          1,
          'system'
        )
      `;
      console.log('✅ User inserted successfully');
    }

    console.log('\n📋 User Details:');
    console.log(`   Email: ${USER_EMAIL}`);
    console.log(`   Display Name: ${DISPLAY_NAME}`);
    console.log(`   Auth Type: Password`);
    console.log(`   Temporary Password: No`);
    console.log(`   Active: Yes`);
    console.log(`   Password: ${USER_PASSWORD}`);

    await sql.close();
    console.log('\n✅ Script completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

insertUser();
