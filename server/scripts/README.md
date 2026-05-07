# /server/scripts

This directory contains development-only utility scripts.
**None of these run in production.**

| File | Purpose |
|---|---|
| `test_db.js` | Quick MongoDB connection sanity check |
| `test_save.js` | Test saving a document to DB |
| `test_twilio_manual.js` | Manually trigger a Twilio SMS to verify credentials |
| `check_doctor_status.js` | Print current online/offline status of all doctors |
| `fix_macos_security.js` | Fix macOS quarantine flags on binaries (local dev only) |
| `list_colls.js` | List all MongoDB collections |
| `query_db.js` | Ad-hoc query runner |
| `query_raw.js` | Raw MongoDB query utility |
| `query_avail.js` | Query doctor availability records |
| `query_specific.js` | Query a specific document by ID |
| `migrateArticles.js` | One-time data migration for articles |

## Usage

Run any script directly with node from the `server/` directory:
```bash
node scripts/test_db.js
node scripts/check_doctor_status.js
```
