# Quick Test Guide

## Step 1: Ensure Backend Server is Running

In one terminal:
```bash
cd backend
npm run dev
```

You should see:
```
✅ Server running on port 3001
✅ Database connection established
```

## Step 2: Run the Test Script

In another terminal:
```bash
cd backend
npx tsx src/test/managebac.test.ts
```

This will:
1. Test authentication
2. Fetch school details (and save to database)
3. Fetch academic years
4. Fetch grades
5. Fetch subjects
6. Fetch teachers
7. Fetch students (and save to database)
8. Fetch classes
9. Fetch year groups

## Step 3: Test API Endpoints Manually

### Quick Health Check
```bash
curl http://localhost:3001/api/health
```

### Test Authentication
```bash
curl -X POST http://localhost:3001/api/managebac/authenticate \
  -H "auth-token: YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

### Test School Fetch (saves to database)
```bash
curl http://localhost:3001/api/managebac/school \
  -H "auth-token: YOUR_API_KEY"
```

### Test Students Fetch (saves to database)
```bash
curl "http://localhost:3001/api/managebac/students?active_only=true" \
  -H "auth-token: YOUR_API_KEY"
```

### Test Analytics
```bash
curl http://localhost:3001/api/analytics/metrics
```

## Step 4: Verify Database

Check your Azure SQL Database to confirm:
- School was saved to `MB.schools` table
- Students were saved to `MB.students` table

## What to Look For

✅ **Success indicators:**
- Test script completes without errors
- API endpoints return 200 status codes
- Data appears in Azure SQL Database
- No error messages in server logs

❌ **Common issues:**
- Authentication fails → Check API key
- Database errors → Check Azure SQL connection
- No data returned → Check ManageBac API permissions

