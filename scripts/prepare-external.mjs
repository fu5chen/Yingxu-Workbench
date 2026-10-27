import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readKeyConfiguration, keyConfigurationEnv, API_KEY_ENV } from './key-configuration.mjs';

const root=fileURLToPath(new URL("../",import.meta.url));
const directory=path.join(root,".sites-runtime/external-access");
fs.mkdirSync(directory,{recursive:true});
const loginFile=path.join(directory,"登录信息.json");
if(!fs.existsSync(loginFile)){
  const prior=process.argv[2];
  const old=prior?JSON.parse(fs.readFileSync(prior,"utf8").replace(/^\uFEFF/,"")):null;
  const username=old?.username??"admin",password=old?.password??randomBytes(20).toString("base64url");
  if(typeof username!=="string"||typeof password!=="string"||password.length<12)throw new Error("管理员配置无效。");
  fs.writeFileSync(loginFile,JSON.stringify({username,password},null,2),{mode:0o600});
}
const login=JSON.parse(fs.readFileSync(loginFile,"utf8"));
let previous;
try{previous=JSON.parse(fs.readFileSync(path.join(directory,"gateway.json"),"utf8"));}catch{}
const salt=previous?.salt??randomBytes(16).toString("hex");
fs.writeFileSync(path.join(directory,"gateway.json"),JSON.stringify({
  username:login.username,salt,passwordHash:pbkdf2Sync(login.password,salt,100000,32,"sha256").toString("hex"),
  sessionSecret:previous?.sessionSecret??randomBytes(32).toString("hex"),
  port:5191,upstream:"http://127.0.0.1:5181",
}),{mode:0o600});
const built=path.join(root,"dist/server/wrangler.json");
const config=JSON.parse(fs.readFileSync(built,"utf8"));
config.main=path.resolve(path.dirname(built),config.main);
config.assets.directory=path.resolve(path.dirname(built),config.assets.directory);
for (const database of config.d1_databases ?? []) database.migrations_dir=path.join(root,"drizzle");
config.dev={...config.dev,ip:"127.0.0.1",port:5181,inspector_ip:"127.0.0.1"};
fs.writeFileSync(path.join(directory,"wrangler.json"),JSON.stringify(config,null,2));
const envFile=path.join(root,".env"),env=parseEnv(fs.readFileSync(envFile,"utf8"));
for(const name of ["STUDIO_RUNNER_TOKEN","JOB_ENCRYPTION_KEY"]){if(!env[name]){env[name]=randomBytes(32).toString("hex");fs.appendFileSync(envFile,`\n${name}=${env[name]}\n`);}}
const fileSettings=keyConfigurationEnv(readKeyConfiguration(path.join(root,'confiykey.json')));
for(const name of Object.values(API_KEY_ENV)){delete env[name];delete fileSettings[name];}
Object.assign(env,fileSettings);
env.KEY_CONFIG_URL='http://127.0.0.1:5191/_runtime/keys';
fs.writeFileSync(path.join(directory,".dev.vars"),Object.entries(env).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join("\n")+"\n",{mode:0o600});
fs.writeFileSync(path.join(directory,"quick-tunnel.yml"),"{}");
console.log("External production runtime and login prepared; credentials were not printed.");
