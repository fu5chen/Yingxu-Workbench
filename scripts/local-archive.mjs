import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {generatedMediaFormat} from '../lib/generated-media.ts';
async function digest(file){const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);return hash.digest('hex');}
export async function archiveGeneratedMedia(root,source,{id,kind}){
 if(!/^[a-zA-Z0-9_-]{8,128}$/.test(id)||!['image','video'].includes(kind))throw Error('Invalid local archive identity');
 const handle=await fs.open(source,'r'),header=Buffer.alloc(32);try{await handle.read(header,0,32,0);}finally{await handle.close();}
 const format=generatedMediaFormat(header,kind),folder=path.join(root,kind==='image'?'images':'videos');await fs.mkdir(folder,{recursive:true});
 const target=path.join(folder,id+'.'+format.extension),temporary=path.join(folder,'.'+id+'.'+randomUUID()+'.partial');
 try{
  await fs.copyFile(source,temporary);
  try{await fs.link(temporary,target);}catch(error){if(error.code!=='EEXIST')throw error;if(await digest(source)!==await digest(target))throw Error('Existing local archive differs; preserved both source and archive');}
 }finally{await fs.rm(temporary,{force:true});}
 return {path:target,bytes:(await fs.stat(target)).size,...format};
}
