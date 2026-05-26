# FIS SFTP poller

Polls the FIS development SFTP server for new files, runs a processing stub (real parsers TBD), then moves files from the unprocessed folder to the processed folder.

## Folders

| Purpose | Default path |
|--------|----------------|
| Incoming | `/FIS/Development/UnprocessedFilesNew` |
| Success | `/FIS/Development/ProcessedFilesNew` |
| Errors (later) | `/FIS/Development/ErrorFilesNew` |

Step 1 only moves successful runs to **Processed**; failures are left in **Unprocessed** and logged.

## Environment variables

Add to `backend/.env` (do not commit the `.pem` key):

```env
ENABLE_FIS_SFTP_POLLER=true
FIS_SFTP_HOST=92.205.106.117
FIS_SFTP_PORT=22
FIS_SFTP_USERNAME=aks_sftp
FIS_SFTP_PRIVATE_KEY_PATH=/absolute/path/to/akssftp_key.pem

# Optional overrides
# FIS_SFTP_UNPROCESSED_DIR=/FIS/Development/UnprocessedFilesNew
# FIS_SFTP_PROCESSED_DIR=/FIS/Development/ProcessedFilesNew
# FIS_SFTP_ERROR_DIR=/FIS/Development/ErrorFilesNew
# FIS_SFTP_CRON=*/5 * * * *
# FIS_SFTP_RUN_ON_STARTUP=false
# CRON_TIMEZONE=Asia/Kolkata
```

`ENABLE_FIS_SFTP_POLLER` defaults to off unless set to `true`.

## Run once (manual)

```bash
cd backend
npm run fis-sftp:poll
```

## With the API server

When the backend starts and the poller is enabled, it registers a cron job (default every 5 minutes) and runs one poll on startup unless `FIS_SFTP_RUN_ON_STARTUP=false`.

## Azure deployment

- Store the private key in App Settings / Key Vault and mount or write to a path the app can read.
- Set `FIS_SFTP_PRIVATE_KEY_PATH` to that path.
- Never commit `.pem` files to git.
