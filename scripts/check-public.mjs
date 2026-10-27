// Scan the Git index, not ignored local runtime data. Run after git add.
// This catches common accidental disclosures; it is not a full secret audit.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const git = args => execFileSync('git', args, { cwd, maxBuffer: 20 * 1024 * 1024 });
const files = git(['ls-files', '-z']).toString('utf8').split('\0').filter(Boolean);
const issues = [];
for (const file of files) {
  if (/(^|\/)(?:node_modules|\.sites-runtime|\.wrangler|opout|backups|releases|dist)(\/|$)/.test(file)
      || /(^|\/)(?:confiykey\.json|key\.json|\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/.test(file) && !file.endsWith('.env.example')
      || /\.(?:pem|key|dpapi|pfx|p12|db|sqlite|zip|tar|gz|7z)$/i.test(file)) {
    issues.push(`${file}: private/runtime file is tracked`);
    continue;
  }
  const text = git(['show', `:${file}`]).toString('utf8');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) issues.push(`${file}: private key`);
  if (/\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}|LTAI[A-Za-z0-9]{16,})\b/.test(text)) issues.push(`${file}: credential pattern`);
  const fixtureUrl = ['https://', 'u:p', '@example.com/a'].join('');
  const urlText = file === 'tests/validation.test.ts' ? text.replaceAll(fixtureUrl, '') : text;
  if (/https?:\/\/[^\s/@:]+:[^\s/@]+@/.test(urlText)) issues.push(`${file}: credential in URL`);
  if (!file.startsWith('tests/') && /\b(?:sk|hy)-[A-Za-z0-9_-]{20,}\b/.test(text)) issues.push(`${file}: provider credential pattern`);
  if (file === 'confiykey.example.json') {
    const config = JSON.parse(text);
    for (const [group, fields] of Object.entries(config)) {
      for (const [field, value] of Object.entries(fields)) if (value !== '') issues.push(`${file}: ${group}.${field} must be blank`);
    }
  }
  if (file === '.env.example') {
    for (const line of text.split('\n')) {
      if (/^(?:STUDIO_RUNNER_TOKEN|JOB_ENCRYPTION_KEY)=\s*\S/.test(line)) issues.push(`${file}: populated internal secret`);
    }
  }
}
if (issues.length) {
  console.error(issues.join('\n')); // Never print matched credential values.
  process.exitCode = 1;
} else console.log(`Public source checks passed (${files.length} indexed files).`);
