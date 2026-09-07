#!/usr/bin/env node
/**
 * Coverage ratchet.
 *
 * Mirrors the mechanic that makes authz/UNDECLARED.js work: a committed floor
 * that may only rise. A file whose statement or branch coverage drops below its
 * recorded value fails; a file that improves prints how far, and
 * `--update` rewrites the floor so the gain is locked in.
 *
 *   npm run test:coverage        # jest --coverage, then this check
 *   node scripts/check-coverage.js --update
 *
 * Deliberately per-file rather than one global percentage: a global number lets
 * a well-tested new file hide a regression in an old one.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SUMMARY = path.join(ROOT, 'coverage', 'coverage-summary.json');
const FLOOR = path.join(ROOT, '__tests__', 'support', 'COVERAGE_FLOOR.json');

// Referenced by nothing in the application; it should be deleted, not tested.
const EXCLUDED = ['services/whatsapp.js'];

// Below this many statements, percentages swing too much to ratchet usefully.
const MIN_STATEMENTS = 8;

function readSummary() {
  if (!fs.existsSync(SUMMARY)) {
    console.error('No coverage/coverage-summary.json. Run: npm run test:coverage');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(SUMMARY, 'utf8'));
  const out = {};
  for (const [key, v] of Object.entries(raw)) {
    if (key === 'total') continue;
    const rel = key.replace(`${ROOT}/`, '');
    if (EXCLUDED.includes(rel)) continue;
    if (v.statements.total < MIN_STATEMENTS) continue;
    out[rel] = { statements: v.statements.pct, branches: v.branches.pct };
  }
  return { files: out, total: raw.total };
}

function main() {
  const update = process.argv.includes('--update');
  const { files, total } = readSummary();

  if (update || !fs.existsSync(FLOOR)) {
    const payload = {
      _comment: 'A RATCHET, not a target. Regenerate with: node scripts/check-coverage.js --update. '
        + 'Values may only rise; a drop fails npm run test:coverage.',
      _recorded: new Date().toISOString().slice(0, 10),
      _total: { statements: total.statements.pct, branches: total.branches.pct },
      files
    };
    fs.writeFileSync(FLOOR, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`Floor written for ${Object.keys(files).length} files `
      + `(total ${total.statements.pct}% statements, ${total.branches.pct}% branches).`);
    return;
  }

  const floor = JSON.parse(fs.readFileSync(FLOOR, 'utf8'));
  const regressions = [];
  const gains = [];
  const untracked = [];

  for (const [file, now] of Object.entries(files)) {
    const was = floor.files[file];
    if (!was) { untracked.push(file); continue; }
    // A one-point tolerance absorbs istanbul's rounding without letting a real
    // regression through.
    if (now.statements < was.statements - 1) {
      regressions.push(`${file}: statements ${was.statements}% -> ${now.statements}%`);
    }
    if (now.branches < was.branches - 1) {
      regressions.push(`${file}: branches ${was.branches}% -> ${now.branches}%`);
    }
    if (now.statements > was.statements + 1) {
      gains.push(`${file}: statements ${was.statements}% -> ${now.statements}%`);
    }
  }

  if (untracked.length) {
    console.log(`\n${untracked.length} file(s) not yet in the floor:`);
    for (const f of untracked) console.log(`  + ${f} (${files[f].statements}% statements)`);
  }
  if (gains.length) {
    console.log(`\n${gains.length} file(s) improved — run with --update to lock these in:`);
    for (const g of gains.slice(0, 20)) console.log(`  ^ ${g}`);
  }

  console.log(`\ntotal: ${total.statements.pct}% statements, ${total.branches.pct}% branches `
    + `(floor recorded ${floor._total.statements}% / ${floor._total.branches}%)`);

  if (regressions.length) {
    console.error(`\nCOVERAGE REGRESSION in ${regressions.length} place(s):`);
    for (const r of regressions) console.error(`  ! ${r}`);
    console.error('\nAdd tests for the code you changed, or justify the drop and re-record the floor.');
    process.exit(1);
  }
  console.log('\nNo coverage regression.');
}

main();
