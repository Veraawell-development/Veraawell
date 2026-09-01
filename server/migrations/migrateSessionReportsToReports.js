/**
 * One-off migration for the C4 fix (server/controllers/report.controller.js
 * vs. the now-legacy server/controllers/sessionReport.controller.js).
 *
 * These were two fully independent, fully-built "post-session report"
 * systems. The live one going forward is Report (mounted at
 * /api/session-tools/reports, written to by PostSessionReportModal.tsx) —
 * SessionReport (mounted at /api/session-reports) was a separate, older(?)
 * system nothing in the current client writes to anymore, only reads from
 * (SessionReportsModal.tsx, already repointed at the Report-backed endpoint
 * as part of this same fix).
 *
 * If any real SessionReport documents exist in the database from before this
 * fix landed, this script copies them into the Report collection so they
 * aren't silently lost when the SessionReport model/controller/routes are
 * eventually deleted. Safe to run multiple times — it skips any SessionReport
 * whose sessionId+createdAt already has a matching Report (a simple, good-
 * enough de-dup key given both fields are required on both schemas).
 *
 * Field mapping notes:
 *  - reportType enums differ between the two models and don't map 1:1:
 *      SessionReport                Report
 *      'session-notes'         ->   'progress'        (closest conceptual match)
 *      'prescription'          ->   'treatment-plan'   (closest conceptual match)
 *      'progress-summary'      ->   'progress'
 *      'treatment-plan'        ->   'treatment-plan'   (exact match)
 *      'other'                 ->   'other'            (exact match)
 *    The original SessionReport type is preserved in the migrated content
 *    (prefixed) so no information is lost even where the mapping is lossy.
 *  - SessionReport.attachments is an array; Report only has a single
 *    fileUrl/fileName. Only the first attachment (if any) is carried over.
 *
 * Usage: node server/migrations/migrateSessionReportsToReports.js
 */
const mongoose = require('mongoose');
require('dotenv').config();
const Report = require('../models/report');
const SessionReport = require('../models/sessionReport');

const TYPE_MAP = {
  'session-notes': 'progress',
  prescription: 'treatment-plan',
  'progress-summary': 'progress',
  'treatment-plan': 'treatment-plan',
  other: 'other'
};

async function migrate() {
  try {
    console.log('Starting migration: SessionReport -> Report...\n');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/verocare');
    console.log('Connected to MongoDB\n');

    const legacyReports = await SessionReport.find({});
    console.log(`Found ${legacyReports.length} legacy SessionReport document(s) to check\n`);

    let migrated = 0;
    let skipped = 0;

    for (const legacy of legacyReports) {
      const alreadyMigrated = await Report.findOne({
        sessionId: legacy.sessionId,
        doctorId: legacy.doctorId,
        createdAt: legacy.createdAt
      });

      if (alreadyMigrated) {
        skipped++;
        continue;
      }

      const mappedType = TYPE_MAP[legacy.reportType] || 'other';
      const firstAttachment = legacy.attachments && legacy.attachments[0];

      await Report.create({
        sessionId: legacy.sessionId,
        doctorId: legacy.doctorId,
        patientId: legacy.patientId,
        title: legacy.title,
        reportType: mappedType,
        content: legacy.reportType !== mappedType
          ? `[Migrated from legacy type "${legacy.reportType}"]\n\n${legacy.content}`
          : legacy.content,
        fileUrl: firstAttachment ? firstAttachment.url : null,
        fileName: firstAttachment ? firstAttachment.filename : null,
        isSharedWithPatient: legacy.isSharedWithPatient,
        createdAt: legacy.createdAt,
        updatedAt: legacy.updatedAt
      });

      migrated++;
      if (migrated % 10 === 0) console.log(`   Migrated ${migrated}/${legacyReports.length}...`);
    }

    console.log(`\nMigration completed.`);
    console.log(`   Migrated: ${migrated}`);
    console.log(`   Already present (skipped): ${skipped}`);
    console.log(`\nNext step once you've verified the migrated data looks correct:`);
    console.log(`   Delete server/controllers/sessionReport.controller.js, server/routes/sessionReports.js,`);
    console.log(`   server/models/sessionReport.js, and the app.use('/api/session-reports', ...) mount in app.js.`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('\nMigration failed:', error);
    process.exit(1);
  }
}

migrate();
