import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {archiveGeneratedMedia} from '../scripts/local-archive.mjs';
test('original image and video archives preserve bytes, survive cache deletion and do not overwrite collisions',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-archive-test-'));
 try{
 const root=path.join(dir,'opout'),source=path.join(dir,'download');
 const png=Buffer.from('89504e470d0a1a0a0000000000000000','hex');await fs.writeFile(source,png);
 const image=await archiveGeneratedMedia(root,source,{id:'image-test-0001',kind:'image'});assert.equal(image.path,path.join(root,'images','image-test-0001.png'));assert.deepEqual(await fs.readFile(image.path),png);
 await archiveGeneratedMedia(root,source,{id:'image-test-0001',kind:'image'});assert.deepEqual(await fs.readdir(path.join(root,'images')),['image-test-0001.png']);
 await fs.writeFile(source,Buffer.concat([png,Buffer.from('changed')]));await assert.rejects(archiveGeneratedMedia(root,source,{id:'image-test-0001',kind:'image'}),/differs/);assert.deepEqual(await fs.readFile(image.path),png);
 const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(64)]);await fs.writeFile(source,mp4);const video=await archiveGeneratedMedia(root,source,{id:'video-test-0001',kind:'video'});await fs.rm(source);assert.deepEqual(await fs.readFile(video.path),mp4);
 await assert.rejects(archiveGeneratedMedia(root,video.path,{id:'../../escape',kind:'video'}),/identity/);
 await assert.rejects(archiveGeneratedMedia(root,video.path,{id:'wrong-kind-0001',kind:'image'}));
 }finally{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'studio-archive-test-'));await fs.rm(dir,{recursive:true,force:true});}
});
