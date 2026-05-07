# Pre-Refactor Structure Snapshot

> Captured on: 2026-05-07 before `refactor/production-architecture` branch work began.
> Git commit baseline: `d3d8156`

## Root-Level Noise (to be organized)

### Loose Debug Scripts (→ server/scripts/)
- check-doctor-status.js
- fix-macos-security.js
- list_colls.js
- query_avail.js
- query_db.js
- query_raw.js
- query_specific.js
- test_db.js
- test_save.js
- test_twilio_manual.js

### Loose Documentation (→ server/docs/)
- ARCHITECTURE.md
- doctor-approval-investigation.txt
- fix-progress.txt
- issue-2-3-completion-report.txt
- issue-2-3-plan.txt
- issues.txt

### Redundant Files
- index.js (legacy wrapper → to be removed)
- videocall/ (standalone sub-project with own node_modules → to be removed)

## Route Files With Embedded Logic (to be refactored into controllers)
- routes/sessions.js — 1,468 lines (booking, pricing, history, stats, slots, feedback)
- routes/sessionTools.js — 586 lines (notes, tasks, reports, journals)
- routes/admin/approvals.js — 15,540 bytes
- routes/admin/auth.js — 13,054 bytes
- routes/chat.js — 10,121 bytes
- routes/reviews.js — 11,948 bytes
- routes/otp.js — 8,631 bytes
- routes/availability.js — 6,720 bytes
- routes/patients.js — 5,292 bytes
- routes/ratings.js — 5,205 bytes
- routes/sessionReports.js — 4,588 bytes
- routes/mentalHealthAssessment.js — 6,341 bytes
- routes/articles.js — 3,999 bytes
- routes/doctor-status.js — 3,241 bytes
- routes/upload.js — 6,904 bytes

## Already-Refactored (keep as-is)
- controllers/auth.controller.js ✅
- controllers/profile.controller.js ✅
- controllers/admin.controller.js ✅
- controllers/article.controller.js ✅
- services/auth.service.js ✅
- services/email.service.js ✅
- services/oauth.service.js ✅
- services/scheduler.js ✅
- services/twilioService.js ✅
- services/whatsapp.js ✅
- middleware/auth.middleware.js ✅
- middleware/error.middleware.js ✅
- middleware/validation.middleware.js ✅
- middleware/rateLimit.middleware.js ✅
- utils/errors.js ✅
- utils/logger.js ✅
- config/* ✅
- models/* ✅
