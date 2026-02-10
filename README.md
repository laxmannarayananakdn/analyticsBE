# Backend API Server

Express.js backend API server for Data Analytics application with Azure SQL Database integration.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Create a `.env` file in the backend directory:
   ```env
   AZURE_SQL_SERVER=your-server.database.windows.net
   AZURE_SQL_DATABASE=your-database-name
   AZURE_SQL_USER=your-username
   AZURE_SQL_PASSWORD=your-password
   PORT=3001
   NODE_ENV=development
   CORS_ORIGIN=http://localhost:5173
   ```

3. **Run database setup:**
   Execute the `create_table_scripts.sql` file in your Azure SQL Database to create the schema.

4. **Start the server:**
   ```bash
   # Development mode (with hot reload)
   npm run dev

   # Production mode
   npm run build
   npm start
   ```

## API Endpoints

### Health Check
- `GET /api/health` - Check API and database connection status

### Schools
- `GET /api/schools/:id` - Get school by ID
- `POST /api/schools` - Create or update school

### Students
- `GET /api/students` - Get all students (with optional filters: `?archived=true&grade_id=1`)
- `POST /api/students` - Create or update students (bulk)

### Term Grades
- `POST /api/term-grades` - Create or update term grades (bulk)

### Analytics
- `GET /api/analytics/metrics` - Get student metrics
- `GET /api/analytics/subject-performance` - Get subject performance data
- `GET /api/analytics/student-vs-class-average` - Get student vs class average data

## Development

The server runs on port 3001 by default. Make sure your Azure SQL Database firewall allows connections from your IP address.

## Production Deployment

For Azure deployment:
1. Set environment variables in Azure App Service configuration
2. Ensure Azure SQL Database firewall allows App Service IPs
3. Build and deploy the application

