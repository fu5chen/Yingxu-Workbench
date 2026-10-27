import fs from 'node:fs';
import { parseEnv } from 'node:util';

const providers={
  byteplus:{cookie:'__Host-byteplus_api_key',env:'BYTEPLUS_API_KEY',valid:/^[A-Za-z0-9._~-]{20,512}$/},
  byteplus_image:{cookie:'__Host-byteplus_image_api_key',env:'BYTEPLUS_IMAGE_API_KEY',valid:/^[A-Za-z0-9._~-]{20,512}$/},
  paipu_chat:{cookie:'__Host-paipu_chat_api_key',env:'PAIPU_CHAT_API_KEY',valid:/^sk-[A-Za-z0-9_-]{20,200}$/},
};

// A local, explicit one-time migration request is required. Call only after
// gateway session validation. Keys never pass through a browser response.
export function importRequestedDefaults(cookieHeader,{envFile,requestFile}){
  if(!fs.existsSync(requestFile))return [];
  const request=JSON.parse(fs.readFileSync(requestFile,'utf8'));
  if(request.done||!Array.isArray(request.providers))return [];
  const cookies=new Map();
  for(const part of (cookieHeader??'').split(';')){const at=part.indexOf('=');if(at<0)continue;try{cookies.set(part.slice(0,at).trim(),decodeURIComponent(part.slice(at+1).trim()));}catch{}}
  let source=fs.readFileSync(envFile,'utf8');const env=parseEnv(source),captured=new Set(request.captured??[]),imported=[];
  for(const name of request.providers){
    const provider=providers[name];if(!provider||captured.has(name))continue;
    if(provider.valid.test(env[provider.env]??'')){captured.add(name);continue;}
    const key=cookies.get(provider.cookie);if(!key||!provider.valid.test(key))continue;
    const line=provider.env+'='+JSON.stringify(key),pattern=new RegExp('^'+provider.env+'=.*$','gm');
    source=pattern.test(source)?source.replace(pattern,()=>line):source+'\n'+line+'\n';
    captured.add(name);imported.push(name);
  }
  if(imported.length){fs.writeFileSync(envFile+'.import-tmp',source,{mode:0o600});fs.renameSync(envFile+'.import-tmp',envFile);}
  if(captured.size!==(request.captured??[]).length){request.captured=[...captured];request.done=request.providers.every(name=>captured.has(name));fs.writeFileSync(requestFile,JSON.stringify(request),{mode:0o600});}
  return imported;
}
