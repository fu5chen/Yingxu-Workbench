import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {parseEnv}from'node:util';import{importRequestedDefaults}from'../scripts/import-default-keys.mjs';
test('explicit migration imports selected current keys once, preserving existing defaults and unrelated configuration',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yingxu-key-import-'));
 try{
  const files={envFile:path.join(directory,'.env'),requestFile:path.join(directory,'request.json')};
  fs.writeFileSync(files.envFile,'# preserved\nOSS_BUCKET=test-bucket\nBYTEPLUS_API_KEY="existing-video-key-1234567890"\nBYTEPLUS_IMAGE_API_KEY=\n');
  const header='__Host-byteplus_api_key=override-video-key-1234567890; __Host-byteplus_image_api_key=image-key-1234567890123456; __Host-paipu_chat_api_key=sk-chat-key-1234567890123456; __Host-hyaloria_api_key=hy-unrequested-key-1234567890';
  assert.deepEqual(importRequestedDefaults(header,files),[]);
  fs.writeFileSync(files.requestFile,JSON.stringify({providers:['byteplus','byteplus_image','paipu_chat'],captured:[]}));
  assert.deepEqual(importRequestedDefaults(header,files),['byteplus_image','paipu_chat']);
  const env=parseEnv(fs.readFileSync(files.envFile,'utf8'));assert.equal(env.BYTEPLUS_API_KEY,'existing-video-key-1234567890');assert.equal(env.BYTEPLUS_IMAGE_API_KEY,'image-key-1234567890123456');assert.equal(env.PAIPU_CHAT_API_KEY,'sk-chat-key-1234567890123456');assert.equal(env.OSS_BUCKET,'test-bucket');assert.equal(env.HYALORIA_API_KEY,undefined);
  assert.equal(JSON.parse(fs.readFileSync(files.requestFile,'utf8')).done,true);
  assert.deepEqual(importRequestedDefaults(header.replace('image-key-1234567890123456','replacement-key-1234567890'),files),[]);
  assert.ok(!fs.readFileSync(files.requestFile,'utf8').includes('sk-chat'));
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
