import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {readKeyConfiguration,configuredKey,keyConfigurationEnv}from'../scripts/key-configuration.mjs';
test('file configuration keeps H3 and Krea2 keys independent and reads saved changes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yingxu-config-'));try{
  const file=path.join(dir,'confiykey.json'),config={apiKeys:{h3:'hy-h3-fixture-1234567890123',krea2:'hy-krea-fixture-1234567890',chat:'sk-chat-fixture-1234567890'},oss:{bucket:'fixture-bucket'}};
  fs.writeFileSync(file,JSON.stringify(config));assert.equal(configuredKey(readKeyConfiguration(file),'hyaloria'),config.apiKeys.h3);assert.equal(configuredKey(readKeyConfiguration(file),'krea2'),config.apiKeys.krea2);assert.equal(configuredKey(config,'__proto__'),'');assert.equal(keyConfigurationEnv(config).OSS_BUCKET,'fixture-bucket');
  config.apiKeys.krea2='hy-replaced-fixture-12345678';fs.writeFileSync(file,JSON.stringify(config));assert.equal(configuredKey(readKeyConfiguration(file),'krea2'),config.apiKeys.krea2);
  fs.writeFileSync(file,'{"apiKeys":{"h3":42}}');assert.throws(()=>readKeyConfiguration(file));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
