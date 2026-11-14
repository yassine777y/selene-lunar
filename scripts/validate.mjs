#!/usr/bin/env node
/**
 * npm run validate — prints the published-data cross-check in the terminal.
 * Same numbers the in-app "Data & validation" view shows.
 */
import { runValidation, runSkyChecks, VALIDATION_DAYS } from '../src/lib/validation.js';

const line = (c = '─') => c.repeat(78);
const report = runValidation();
const sky = runSkyChecks();

console.log('\nSELENE · published-data cross-check');
console.log(line());
console.log(`Window: ${VALIDATION_DAYS} days, 6 h sampling\n`);

for (const row of report.rows) {
  const mark = row.pass ? 'PASS' : 'FAIL';
  const tag = row.confidence === 'published' ? 'published' : 'derived  ';
  console.log(
    `  [${mark}] ${row.site.name.padEnd(18)} ${row.label.padEnd(16)}` +
    `${row.value.toFixed(1).padStart(5)}%   published ${(`[${row.min}–${row.max}]`).padEnd(9)} ${tag}`
  );
}

console.log(`\n  ${report.passed}/${report.total} checks inside the published range ` +
            `(${report.published} of them cite a published value)`);

console.log(`\nEarth in the polar sky`);
console.log(line());
console.log(`  elevation swing        ${sky.earthAltMin.toFixed(1)}° … +${sky.earthAltMax.toFixed(1)}°   (published ±6.5°)`);
console.log(`  time above the limb    ${sky.earthAboveLimbShare.toFixed(0)}%                 (published ≈50%)`);

console.log(`\n${report.passed === report.total ? '✔ All checks pass.' : '✗ Some checks are outside tolerance.'}\n`);
process.exit(report.passed === report.total ? 0 : 1);
