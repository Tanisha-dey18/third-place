// Runs tests/*.test.ts with Node's built-in test runner (via tsx).
//   npm test        → everything except the database suite
//   npm run test:db → the database (migrations + RLS) suite only
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const db = process.argv.includes('--db');
const files = readdirSync('tests')
  .filter((f) => f.endsWith('.test.ts') && (db ? f.startsWith('db.') : !f.startsWith('db.')))
  .map((f) => `tests/${f}`);
const r = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=spec', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
