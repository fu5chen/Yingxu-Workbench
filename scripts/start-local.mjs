import fs from 'node:fs';
import net from 'node:net';
import { parseEnv } from 'node:util';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (!fs.existsSync('dist/server/wrangler.json') || !fs.existsSync('.env') || !fs.existsSync('confiykey.json')) {
  throw new Error('Run npm run setup first.');
}
// Never attach a second runner to another checkout's worker.
for (const port of [5181, 5191]) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(new Error(`Port ${port} is occupied; stop the existing instance first.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
const prepared = spawnSync(process.execPath, ['scripts/prepare-external.mjs'], { stdio: 'inherit' });
if (prepared.error) throw prepared.error;
if (prepared.status !== 0) process.exit(prepared.status ?? 1);
const env = { ...process.env, ...parseEnv(fs.readFileSync('.env', 'utf8')) };
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  // Wrangler can have a platform-specific child process tree.
  if (process.platform === 'win32') {
    for (const child of children) {
      if (child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    }
  } else for (const child of children) child.kill('SIGTERM');
}
function start(name, args) {
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', error => { console.error(`${name}: ${error.message}`); stop(1); });
  child.on('exit', code => { if (!stopping) { console.error(`${name} stopped (${code}).`); stop(code || 1); } });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
start('worker', ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js',
  'dev', '--config', '.sites-runtime/external-access/wrangler.json', '--local',
  '--persist-to', '.wrangler/state', '--ip', '127.0.0.1', '--port', '5181',
  '--inspector-port', '0', '--show-interactive-dev-session=false']);
start('gateway', ['scripts/external-gateway.mjs']);
start('runner', ['scripts/background-runner.mjs']);
console.log('Local workbench: http://127.0.0.1:5181 (trusted local access only).');
console.log('Authenticated gateway: port 5191. Use HTTPS and origin.txt for public access; see docs/deployment.md.');
