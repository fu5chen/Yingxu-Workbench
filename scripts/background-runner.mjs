import fs from "node:fs";
import {diskCapacityAvailable} from "./disk-capacity.mjs";
import path from "node:path";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {archiveGeneratedMedia} from "./local-archive.mjs";
import { downloadMedia } from "./download-media.mjs";
import { generatedMediaFormat } from '../lib/generated-media.ts';

const root=fileURLToPath(new URL("../",import.meta.url));
const env=parseEnv(fs.readFileSync(path.join(root,".env"),"utf8"));
if(!env.STUDIO_RUNNER_TOKEN)throw Error("Background worker configuration missing");
const directory=path.join(root,".sites-runtime/media-cache");fs.mkdirSync(directory,{recursive:true});
const archiveEnabled=(process.env.STUDIO_LOCAL_ARCHIVE??env.STUDIO_LOCAL_ARCHIVE??"true")!=="false";
const archiveRoot=path.join(root,"opout");if(archiveEnabled){fs.mkdirSync(path.join(archiveRoot,"images"),{recursive:true});fs.mkdirSync(path.join(archiveRoot,"videos"),{recursive:true});}
const archiving=new Set(),activeMedia=new Set();
const endpoint="http://127.0.0.1:5181/api/studio/internal/";
let stopped=false;
const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const log=(type,id,message)=>console.log(JSON.stringify({time:new Date().toISOString(),type,id,message}));
async function control(action,body={}){
  const response=await fetch(endpoint+action,{method:"POST",headers:{"x-studio-runner":env.STUDIO_RUNNER_TOKEN,"Content-Type":"application/json"},body:/^media-(complete|upload)\//.test(action)?JSON.stringify(body):undefined,signal:AbortSignal.timeout(420000)});
  if(!response.ok){const detail=(await response.text()).replace(/https?:\/\/\S+/g,"[url]").slice(0,160);throw Error(`Worker HTTP ${response.status} (${action.split('/')[0]}): ${detail}`);}return response.json();
}
async function upload(url,headers,file){
  const response=await fetch(url,{method:"PUT",headers:{...headers,"Content-Length":String(fs.statSync(file).size)},body:fs.createReadStream(file),duplex:"half",redirect:"manual",signal:AbortSignal.timeout(180000)});
  if(!response.ok){await response.body?.cancel();throw Error(`Storage HTTP ${response.status}`);}await response.body?.cancel();
}
async function preview(kind,file,target){
  if(kind==="image"){const {default:sharp}=await import("sharp");await sharp(file,{limitInputPixels:40000000}).rotate().resize({width:640,height:640,fit:"inside",withoutEnlargement:true}).webp({quality:78}).toFile(target);return true;}
  return new Promise(resolve=>{
    const child=spawn(env.FFMPEG_PATH||"ffmpeg",["-hide_banner","-loglevel","error","-y","-ss","0.2","-i",file,"-frames:v","1","-vf","scale=640:-2","-quality","75",target],{windowsHide:true,stdio:"ignore"});
    const timer=setTimeout(()=>{child.kill();resolve(false);},30000);child.on("error",()=>{clearTimeout(timer);resolve(false);});child.on("exit",code=>{clearTimeout(timer);resolve(code===0&&fs.existsSync(target));});
  });
}
async function saveLocal(ticket,file){
 if(!archiveEnabled)return true; // Once OSS succeeds, the temporary original can be removed.
 const marker=path.join(directory,ticket.id+'.archive.json');
 fs.writeFileSync(marker,JSON.stringify({id:ticket.id,kind:ticket.kind}));
 if(archiving.has(ticket.id))return false;archiving.add(ticket.id);
 try{const saved=await archiveGeneratedMedia(archiveRoot,file,ticket);fs.rmSync(marker,{force:true});log('local-archive-ready',ticket.id,{bytes:saved.bytes,kind:ticket.kind});return true;}
 catch(error){log('local-archive-retry',ticket.id,String(error.message));return false;}
 finally{archiving.delete(ticket.id);}
}
async function archiveRetryLoop(){if(!archiveEnabled)return;while(!stopped){
 for(const name of fs.readdirSync(directory).filter(name=>name.endsWith('.archive.json'))){
  try{const ticket=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));if(!/^[a-zA-Z0-9_-]{8,128}$/.test(ticket.id)||name!==ticket.id+'.archive.json')continue;
   const file=path.join(directory,ticket.id+'.original');if(!activeMedia.has(ticket.id)&&fs.existsSync(file)&&await saveLocal(ticket,file))fs.rmSync(file,{force:true});
  }catch(error){log('local-archive-retry','pending',String(error.message));}
 }
 await sleep(30000);
}}
async function mediaLoop(){while(!stopped){let ticket;
  if(!diskCapacityAvailable(root,process.env.STUDIO_MEDIA_RESERVE_MIB)){await sleep(10000);continue;}
  try{
    ticket=await control("media-next");if(ticket.idle){await sleep(2000);continue;}
    if(!/^[a-zA-Z0-9_-]{8,128}$/.test(ticket.id))throw Error("Invalid cache job ID");
    activeMedia.add(ticket.id);
    const file=path.join(directory,ticket.id+".original"),thumbnail=path.join(directory,ticket.id+".webp");
    const metrics=await downloadMedia(ticket.source,file,{local:ticket.local,headers:ticket.local?{"x-studio-runner":env.STUDIO_RUNNER_TOKEN}:{},maximum:ticket.kind==="image"?40*1024*1024:512*1024*1024});
    const header=Buffer.alloc(32),descriptor=fs.openSync(file,'r');try{fs.readSync(descriptor,header,0,header.length,0);}finally{fs.closeSync(descriptor);}
    const format=generatedMediaFormat(header,ticket.kind);
    const archived=await saveLocal(ticket,file);
    const destination=await control('media-upload/'+ticket.id,format);
    // Publish the small preview while the original is still transferring.
    let hasPreview=false;
    const transfers=await Promise.allSettled([
      upload(destination.put,destination.headers,file),
      (async()=>{try{hasPreview=await preview(ticket.kind,file,thumbnail);if(hasPreview){await upload(destination.previewPut,destination.previewHeaders,thumbnail);await control("media-preview/"+ticket.id);}}catch{hasPreview=false;}})()
    ]);
    if(transfers[0].status==='rejected')throw transfers[0].reason;
    await control("media-complete/"+ticket.id,{ok:true,bytes:metrics.bytes,preview:hasPreview,...format});
    for(const temporary of archived?[file,thumbnail]:[thumbnail]){try{fs.rmSync(temporary,{force:true});}catch{}}
    log("media-ready",ticket.id,{bytes:metrics.bytes,sourceMilliseconds:metrics.milliseconds,parallel:metrics.parallel,preview:hasPreview});
  }catch(error){if(ticket?.id){try{await control("media-complete/"+ticket.id,{ok:false});}catch{}log("media-error",ticket.id,String(error.message).replace(/https?:\/\/\S+/g,"[url]"));}await sleep(3000);}finally{if(ticket?.id)activeMedia.delete(ticket.id);}
}}
async function taskLoop(action){while(!stopped){try{if(action==="next"&&!diskCapacityAvailable(root,process.env.STUDIO_SUBMIT_RESERVE_MIB)){await sleep(10000);continue;}const result=await control(action);if(result.idle)await sleep(action==="poll"?1000:750);else if(action==="next")log("generation-dispatched",result.id,result.unconfirmed?"unconfirmed":"accepted");}catch{await sleep(2000);}}}
process.on("SIGTERM",()=>{stopped=true;});process.on("SIGINT",()=>{stopped=true;});
console.log("Background generation and media cache worker started (2 generation slots, 2 cache slots).");
console.log("Local output archive: "+(archiveEnabled?"enabled":"disabled"));
while(!stopped){try{await control('media-recover');break;}catch{await sleep(2000);}}
await Promise.all([taskLoop("next"),taskLoop("next"),taskLoop("poll"),mediaLoop(),mediaLoop(),archiveRetryLoop()]);
