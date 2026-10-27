import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(process.execPath, [
  '--import', './scripts/sites-env.mjs',
  './node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'DB',
  '--config', '.sites-runtime/external-access/wrangler.json', '--local',
  '--persist-to', path.join(root, '.wrangler/state'),
], { cwd: root, stdio: 'inherit', env: { ...process.env, CI: 'true' } });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
