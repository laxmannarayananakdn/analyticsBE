# Attendance Bulk Insert Optimization Guide

## Current Implementation

We've optimized attendance record processing with **bulk insert methods** that:
- Collect all records first
- Bulk fetch student IDs (1-2 queries instead of thousands)
- Use batched parameterized inserts (100 records per batch)
- Use transactions for atomicity

## Performance Comparison

### Current Approach (Optimized Bulk Insert)
- **Method**: JSON → Transform → Batched Parameterized Inserts
- **Speed**: ~1,000-5,000 records/second (depending on data size)
- **Pros**: 
  - Safe (parameterized queries)
  - No additional infrastructure needed
  - Already implemented and tested
- **Cons**: 
  - Limited by SQL Server's 2100 parameter limit per query
  - Requires batching

### CSV + Temporary Table Approach
- **Method**: JSON → CSV-like structure → Temp Table → Single INSERT SELECT
- **Speed**: ~2,000-8,000 records/second
- **Pros**:
  - Faster for very large datasets (>10,000 records)
  - SQL Server can optimize the final insert
  - Still uses parameterized queries (safe)
- **Cons**:
  - Slightly more complex
  - Uses temporary table space

### CSV + Azure Blob Storage + BULK INSERT (Fastest)
- **Method**: JSON → CSV → Azure Blob → SQL Server BULK INSERT
- **Speed**: ~10,000-50,000 records/second
- **Pros**:
  - Fastest method
  - SQL Server native bulk operations
  - Can handle millions of records efficiently
- **Cons**:
  - Requires Azure Blob Storage setup
  - Requires file upload step
  - More complex error handling

## Recommendation

**For most use cases (< 50,000 records)**: The current optimized bulk insert is sufficient and fast enough.

**For large datasets (> 50,000 records)**: Consider using the temporary table approach (already implemented as `bulkInsertDailyAttendanceViaTempTable`).

**For very large datasets (> 500,000 records)**: Set up Azure Blob Storage and use BULK INSERT.

## How to Switch Methods

In `NexquareService.ts`, you can switch between methods:

```typescript
// Current method (already in use)
const { inserted, error } = await databaseService.bulkInsertDailyAttendance(recordsToInsert);

// Alternative: Temp table method (slightly faster for large datasets)
const { inserted, error } = await databaseService.bulkInsertDailyAttendanceViaTempTable(recordsToInsert);
```

## Testing Performance

To test which method is faster for your data:

1. Run the same dataset with both methods
2. Compare execution times
3. Monitor SQL Server query execution plans
4. Check transaction log growth

## Future Optimization: Azure Blob Storage + BULK INSERT

If you want to implement the fastest method, you'll need:

1. **Azure Blob Storage Account**
2. **SAS Token or Managed Identity** for SQL Server to access blob
3. **Modify the code** to:
   - Convert JSON to CSV
   - Upload CSV to Azure Blob
   - Execute BULK INSERT command

Example SQL:
```sql
BULK INSERT NEX.daily_attendance
FROM 'https://yourstorageaccount.blob.core.windows.net/container/attendance.csv'
WITH (
    FORMAT = 'CSV',
    FIRSTROW = 2,
    FIELDTERMINATOR = ',',
    ROWTERMINATOR = '\n',
    BATCHSIZE = 10000
);
```

