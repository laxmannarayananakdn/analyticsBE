# FIS SFTP poller

Polls the FIS development SFTP server for new files, runs a processing stub (real parsers TBD), then moves files from the unprocessed folder to the processed folder.

## Folders

| Purpose | Default path |
|--------|----------------|
| Incoming | `/aksfisreports/FIS/UnprocessedFilesNew` |
| Success | `/aksfisreports/FIS/ProcessedFilesNew` |
| Errors | `/aksfisreports/FIS/ErrorFilesNew` |

Step 1 only moves successful runs to **Processed**; failures are left in **Unprocessed** and logged.

## Processing behaviour

Each poll cycle:

1. List files in `UnprocessedFilesNew`
2. **Dic\*** files first (alphabetical), then **TB\*** files
3. Unknown names → `ErrorFilesNew` (no DB insert)
4. For each finance file:
   - Resolve type from filename (e.g. `Dic_Account_202604.xlsx` → `FIN_DIC_ACCOUNT`)
   - Parse + load via same pipeline as `/api/ef` upload
   - `uploaded_by` = `sftp@aks` (override with `FIS_SFTP_UPLOADED_BY`)
   - Success → `ProcessedFilesNew`
   - Failure → `EF.Uploads` status `FAILED` + `ErrorFilesNew`
5. Report instances are created manually in FIS Report Processing (unchanged)

### Trial balance → FIN.TrialBalance only

SFTP / EF upload loads **TB\*** files into `FIN.TrialBalance` only. Report instances and
`admin.fis_report_columns` are **not** created automatically — use **FIS Report Processing**
in the admin UI to create an instance and generate the report.

**Budget fallback:** Budget files are optional after January. If no budget file exists for a
month, report generation uses the latest budget on or before that month in the fiscal year
(typically January). Actual files are required every month.

**Schema:** Before first TB load, run `SQL scripts/align_fin_trial_balance_schema.sql` on the database (adds `last_updated_by_raw`, `entity_code`, `period`, etc.).

## Environment variables

Add to `backend/.env` (do not commit credentials):

```env
ENABLE_FIS_SFTP_POLLER=true
FIS_SFTP_HOST=92.205.106.117
FIS_SFTP_PORT=22
FIS_SFTP_USERNAME=aks_sftp
FIS_SFTP_PASSWORD=your-password-here

# Optional overrides
# FIS_SFTP_UNPROCESSED_DIR=/aksfisreports/FIS/UnprocessedFilesNew
# FIS_SFTP_PROCESSED_DIR=/aksfisreports/FIS/ProcessedFilesNew
# FIS_SFTP_ERROR_DIR=/aksfisreports/FIS/ErrorFilesNew
# FIS_SFTP_CRON=*/5 * * * *
# FIS_SFTP_RUN_ON_STARTUP=false
# FIS_SFTP_UPLOADED_BY=sftp@aks
```

### Authentication

**Password (recommended):** set `FIS_SFTP_PASSWORD`. On Azure, store it in Key Vault and reference it from app settings.

**Private key (legacy):** set `FIS_SFTP_PRIVATE_KEY` or `FIS_SFTP_PRIVATE_KEY_PATH` instead. If both password and key are set, password is used.

`ENABLE_FIS_SFTP_POLLER` defaults to off unless set to `true`.

## Run once (manual)

```bash
cd backend
npm run fis-sftp:poll
```

## With the API server

When the backend starts and the poller is enabled, it registers a cron job (default every 5 minutes) and runs one poll on startup unless `FIS_SFTP_RUN_ON_STARTUP=false`.

## Azure deployment

**If you still see `MPR – {entity} (auto)` instances with `created_by = sftp@aks` and
`admin.fis_report_columns.source_file_name` set to the TB filename, AnalyticsBE is running an
older build that auto-synced FIS columns.** Redeploy from `main` (workflow
`.github/workflows/azure-webapp-backend.yml`) and confirm startup logs include:

- `FIS reporting: manual instance creation only`
- `FIS SFTP: loads FIN.TrialBalance only`

Until redeployed, set `ENABLE_FIS_SFTP_POLLER=false` on AnalyticsBE to stop new auto instances.

- **Scale out:** Only one instance should poll at a time. The app uses a SQL `sp_getapplock` cluster lock so duplicate uploads do not occur when multiple instances are running. For lowest cost and simpler ops, you can also set AnalyticsBE **Instance count = 1** under Scale out.

- Store `FIS_SFTP_PASSWORD` in Key Vault and reference it from AnalyticsBE app settings (recommended).
- For legacy key-based auth: store the private key in Key Vault as a secret with **real line breaks** (multi-line PEM) and reference `FIS_SFTP_PRIVATE_KEY`.
- Never commit passwords or `.pem` files to git.
