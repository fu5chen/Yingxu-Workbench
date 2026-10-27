import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
for (const [source, target] of [['.env.example', '.env'], ['confiykey.example.json', 'confiykey.json']]) {
  if (!fs.existsSync(target)) fs.writeFileSync(target, fs.readFileSync(source), { mode: 0o600, flag: 'wx' });
}
for (const args of [['scripts/run-framework.mjs', 'build'], ['scripts/prepare-external.mjs'], ['scripts/migrate-local.mjs']]) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Setup complete. Configure confiykey.json, then run npm run start:local.');
console.log('Login credentials are stored privately in .sites-runtime/external-access/登录信息.json.');
