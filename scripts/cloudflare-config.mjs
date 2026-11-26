import { writeFileSync } from 'node:fs';
const pr = process.env.PR_NUMBER || '';
if (pr && !/^[1-9]\d*$/.test(pr)) throw new Error('Invalid PR number');
const name = pr ? 'rodsandbox-pr-' + pr : 'rodsandbox';
const hostname = pr ? 'pr-' + pr + '.sandbox.migos.club' : 'sandbox.migos.club';
writeFileSync('wrangler.generated.json', JSON.stringify({
  name, compatibility_date: '2026-11-26', workers_dev: false,
  routes: [{ pattern: hostname, custom_domain: true }],
  assets: { directory: './dist', not_found_handling: 'single-page-application' }
}, null, 2));
