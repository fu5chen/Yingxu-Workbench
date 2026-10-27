import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {downloadMedia} from "../scripts/download-media.mjs";
test("parallel media cache downloads complete exact ranges, supports fallback and rejects truncated bodies",async()=>{
 const bytes=Buffer.alloc(1050000);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
 let active=0,maxActive=0;
 const server=http.createServer((req,res)=>{
  if(req.url==="/plain"){res.writeHead(200,{"Content-Length":bytes.length});res.end(bytes);return;}
  const match=req.headers.range?.match(/^bytes=(\d+)-(\d+)$/);const start=Number(match?.[1]??0),end=Math.min(bytes.length-1,Number(match?.[2]??bytes.length-1));
  res.writeHead(206,{"Content-Range":`bytes ${start}-${end}/${bytes.length}`,ETag:'"same-object"'});
  active++;maxActive=Math.max(active,maxActive);
  setTimeout(()=>{res.end(req.url==="/broken"&&end>start?bytes.subarray(start,end):bytes.subarray(start,end+1));active--;},15);
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const origin=`http://127.0.0.1:${server.address().port}`,dir=await fs.mkdtemp(path.join(os.tmpdir(),"yingxu-cache-test-"));
 try{
  const ranged=path.join(dir,"ranged"),result=await downloadMedia(origin+"/range",ranged,{local:true,chunkSize:128000});
  assert.equal(result.bytes,bytes.length);assert.equal(result.parallel,true);assert.deepEqual(await fs.readFile(ranged),bytes);assert.ok(maxActive>1);
  const plain=path.join(dir,"plain");assert.equal((await downloadMedia(origin+"/plain",plain,{local:true})).parallel,false);assert.deepEqual(await fs.readFile(plain),bytes);
  await assert.rejects(()=>downloadMedia(origin+"/broken",path.join(dir,"broken"),{local:true}),/Incomplete media range/);
  await assert.rejects(()=>downloadMedia(origin+"/range",path.join(dir,"large"),{local:true,maximum:1000}),/size limit/);
 }finally{await new Promise(resolve=>server.close(resolve));for(const name of await fs.readdir(dir))await fs.unlink(path.join(dir,name));await fs.rmdir(dir);}
});
