# Database Scripts

## insert_user_laxman.js

Script to insert a user with properly hashed password.

### Usage

```bash
cd backend
node scripts/insert_user_laxman.js
```

### Requirements

- Node.js installed
- Dependencies installed (`npm install`)
- `.env` file configured with database credentials

### What it does

1. Hashes the password using bcrypt (12 salt rounds)
2. Connects to Azure SQL Database
3. Checks if user exists
4. Inserts new user or updates existing user's password
5. Sets all required fields correctly

### User Created

- **Email**: laxman.narayanan-ext@akgn.org
- **Display Name**: Laxman Narayanan
- **Password**: FractalHive1!
- **Auth Type**: Password
- **Temporary Password**: No
- **Active**: Yes
