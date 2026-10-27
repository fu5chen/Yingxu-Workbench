import { hyaloriaTask } from '@/lib/hyaloria-content';
import {parsePromptOptimization,promptOptimizationSystem,resolvePromptOptimization,PromptOptimizationError} from '@/lib/prompt-optimization';
import { CHAT_CREATION_TOOLS,chatCreationSystem,compileChatActions } from '@/lib/chat-creation';
import { chatCreationReferences } from '@/lib/chat-creation-server';
import { GENERATED_FORMATS } from '@/lib/generated-media';
import { LIMITED_VIDEO_MODEL, VIDEO_QUOTA_SQL, INSERT_VIDEO_WITH_QUOTA_SQL, videoQuota, assertVideoQuota } from "@/lib/video-quota";
import { sealTaskKey, openTaskKey, runnerAuthorized } from "@/lib/task-key";
import { ossConfigured, signOssUrl, uploadOssReference } from "@/lib/oss-storage";
import { readUpload } from "@/lib/upload";
import { providerNames } from "@/lib/provider-labels";
import { portraitConfig, importPortrait, refreshPortrait, portraitReference } from "@/lib/portrait-library";
import { publicPortrait, type PortraitFields } from "@/lib/portrait-state";
import { DELETE_RECORD_SQL, RESTORE_RECORD_SQL, recordKind } from "@/lib/record-deletion";
import { parseChat, chatReplyWithoutCreation, CHAT_NO_TASK_NOTICE, CHAT_MODEL } from "@/lib/chat";
import { isActiveImageModel, isActiveVideoModel } from "@/lib/active-models";
import { parseImageGeneration, imagePayload, krea2Payload } from "@/lib/image-models";
import { h3Payload, validateH3References, prepareH3References, publicMediaUrl, normalizeH3 } from "@/lib/hyaloria";
import { hyaloriaCatalog, assertHyaloriaMode } from '@/lib/hyaloria-options';
import { Buffer } from "node:buffer";
import { bytePlusPayload, validateBytePlusAssets, prepareBytePlusReferences, assertBytePlusPortraits } from "@/lib/byteplus";
import { paipuChat, authorize, database, bucket, apiKey, hasFallbackApiKey, personalApiKeyCookie, krea2, bytePlusImage, bytePlus, hyaloria, upstream, modelFlare, linkoMobile, type Provider, runtime, json, failure, readLimited } from "@/lib/server";
import { InputError, MIB, MODELS, detectMedia, httpsUrl, linkoDurationFields, normalizeTask, parseGeneration, type ModelId } from "@/lib/validation";
export const dynamic="force-dynamic";
type Context={params:Promise<{path:string[]}>};
type Asset=PortraitFields & {id:string;owner:string;name:string;kind:string;mime:string;size:number;url:string;expires:string|null;created:number};
type Job={id:string;owner:string;upstream:string|null;status:string;request:string;result:string;created:number;updated:number};
const publicAsset=(a:Asset)=>({id:a.id,name:a.name,kind:a.kind,size:a.size,expires:a.expires,portrait:publicPortrait(a),providerReady:Boolean(a.url),remoteImage:a.mime==="image/remote",preview:a.url.startsWith("https://")&&(a.mime==="video/remote"||a.mime==="image/remote")?a.url:`/api/studio/media/${a.id}`});
const publicJob=(j:Job)=>{
 const result=JSON.parse(j.result||"{}"),saved=JSON.parse(j.request),issued=new Date(Math.floor(Date.now()/3600000)*3600000);
 const url=result.ossKey&&ossConfigured(runtime)?signOssUrl(runtime,result.ossKey,"GET",7200,{},issued):result.url;
 const previewUrl=result.previewKey&&ossConfigured(runtime)?signOssUrl(runtime,result.previewKey,"GET",7200,{},issued):undefined;
 return {id:j.id,upstream:j.upstream,status:j.status,request:saved,...result,url,previewUrl,poster:saved.kind==="video"?previewUrl:undefined,mediaStatus:result.mediaStatus??(j.status==="completed"&&saved.kind!=="chat"?"pending":undefined),downloadUrl:j.status==="completed"?(result.ossKey&&ossConfigured(runtime)?signOssUrl(runtime,result.ossKey,"GET",7200,{},issued,{"response-content-disposition":`attachment; filename="${saved.kind??"video"}-${j.id}.${typeof result.extension==="string"&&/^(png|jpg|webp|mp4|mov|webm)$/.test(result.extension)?result.extension:saved.kind==="image"?"png":"mp4"}"`}):`/api/studio/download/${j.id}`):undefined,created:j.created,updated:j.updated};
};
function identifier(id:string){if(!/^[a-zA-Z0-9_-]{8,128}$/.test(id))throw new InputError("编号格式错误。");return id;}
function providerOf(model:string):Provider{return (MODELS[model as ModelId]?.provider??"paipu") as Provider;}
async function currentVideoQuota(){const row=await database().prepare(VIDEO_QUOTA_SQL).first<{used:number;reserved:number}>();return videoQuota(row??{used:0,reserved:0});}
async function ownedJob(id:string,owner:string,includeDeleted=false){const job=await database().prepare("SELECT * FROM jobs WHERE id=? AND owner=?").bind(identifier(id),owner).first<Job>();if(!job||(!includeDeleted&&(job as Job & {deleted_at?:number}).deleted_at!=null))throw new InputError("找不到这个任务。",404);return job;}
async function r2Asset(a:Asset){const object=await bucket().get(`assets/${a.id}`);if(!object)throw new InputError(`素材「${a.name}」不存在，请重新上传。`,404);return new Uint8Array(await object.arrayBuffer());}
async function task(provider:Provider,id:string,request:Request){if(provider==="hyaloria"||provider==="krea2"){const invoke=provider==="krea2"?krea2:hyaloria;return hyaloriaTask(path=>invoke(path,{},request),id);}return provider==="byteplus"?bytePlus(`/contents/generations/tasks/${encodeURIComponent(id)}`,{},request):provider==="paipu"?upstream(`/videos/${encodeURIComponent(id)}`,{},request):provider==="modelflare"?modelFlare(`/v1/videos/${encodeURIComponent(id)}`,{},request):linkoMobile(`/v1/video/generations/${encodeURIComponent(id)}`,{},request);}
async function paipuAsset(a:Asset,id:string,index:number,request:Request){const bytes=await r2Asset(a),form=new FormData();form.set("file",new File([bytes],a.name,{type:a.mime}));const raw=await upstream(a.kind==="image"?"/media/upload":"/media/temporary-assets",{method:"POST",headers:{"Idempotency-Key":`${id}-${a.kind}-${index}`},body:form},request,{timeoutMs:40000,timeoutMessage:`${a.name} 上传超时`});const record=raw.data??raw;return {url:httpsUrl(record.url??raw.url),expires:record.expires_at??new Date(Date.now()+3600000).toISOString()};}
async function flareAsset(a:Asset,id:string,index:number,request:Request){if(a.url.startsWith("asset://"))return a.url;const group=await modelFlare("/volc/asset/CreateAssetGroup",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":`${id}-g-${index}`},body:JSON.stringify({Name:`studio-${a.id.slice(0,12)}`,model:"volc-asset"})},request),groupId=group?.data?.Id??group?.Id;if(typeof groupId!=="string")throw new InputError("素材服务未返回素材分组编号。",502);const bytes=await r2Asset(a),form=new FormData();form.set("GroupId",groupId);form.set("file",new File([bytes],a.name,{type:a.mime}));form.set("model",a.kind==="image"?"volc-asset-nsfw":a.kind==="video"?"volc-asset-video-nsfw":"volc-asset-audio-nsfw");form.set("AssetType",a.kind==="image"?"Image":a.kind==="video"?"Video":"Audio");form.set("Name",a.name);const created=await modelFlare("/volc/asset/CreateAsset",{method:"POST",headers:{"Idempotency-Key":`${id}-a-${index}`},body:form},request,{timeoutMs:90000}),assetId=created?.data?.Id??created?.Id;if(typeof assetId!=="string")throw new InputError("素材服务未返回素材编号。",502);for(let i=0;i<20;i++){const check=await modelFlare("/volc/asset/GetAsset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({Id:assetId})},request),record=check?.data??check,status=String(record?.Status).toLowerCase();if(status==="active")return `asset://${assetId}`;if(status==="failed"||status==="error")throw new InputError(`素材「${a.name}」处理失败。`,422);await new Promise(r=>setTimeout(r,1000));}throw new InputError(`素材「${a.name}」仍在处理，请稍后重试。`,504);}
function mentions(s:string){return s.replace(/@图片(\d+)/g,"@image$1").replace(/@视频(\d+)/g,"@video$1").replace(/@音频(\d+)/g,"@audio$1");}
async function linkoReferences(assets:Asset[],owner:string,request:Request){const origin=new URL(request.url).origin,expires=new Date(Date.now()+2*3600000).toISOString(),result:string[]=[];for(const asset of assets){const token=crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");await database().prepare("UPDATE assets SET url=?,expires=? WHERE id=? AND owner=?").bind(`linko:${token}`,expires,asset.id,owner).run();result.push(`${origin}/api/studio/provider-media/${encodeURIComponent(asset.id)}?token=${token}`);}return result;}
async function serve(key:string,mime:string,request:Request){const o=await bucket().get(key,{range:request.headers});if(!o)throw new InputError("文件暂时不可用。",404);const h=new Headers({"Content-Type":mime,"Cache-Control":"private, max-age=3600","X-Content-Type-Options":"nosniff","Accept-Ranges":"bytes"}),range=o.range as {offset?:number;length?:number}|undefined;if(request.headers.has("range")&&range?.offset!==undefined&&range.length!==undefined){h.set("Content-Range",`bytes ${range.offset}-${range.offset+range.length-1}/${o.size}`);h.set("Content-Length",String(range.length));}else h.set("Content-Length",String(o.size));return new Response(o.body,{status:request.headers.has("range")&&range?206:200,headers:h});}


async function executeVideoJob(job:Job,request:Request){
 const saved=JSON.parse(job.request),id=job.id,owner=job.owner,db=database();
 const idsOf=(items:any[]=[])=>items.map(a=>typeof a==="string"?a:a.id);
 const parsed=parseGeneration({...saved,images:idsOf(saved.images),videos:idsOf(saved.videos),audios:idsOf(saved.audios)}),provider=providerOf(parsed.model);
 const ids=[...parsed.images,...parsed.videos,...parsed.audios],assets:Asset[]=[];for(const assetId of ids){const a=await db.prepare("SELECT * FROM assets WHERE id=? AND owner=?").bind(identifier(assetId),owner).first<Asset>();if(!a)throw new InputError("部分参考素材不存在，请重新上传。");if(a.mime==="video/remote"&&provider!=="byteplus"&&provider!=="hyaloria")throw new InputError("视频链接素材仅用于当前支持视频参考的模型。");if(a.mime==="image/remote"&&provider!=="hyaloria")throw new InputError("公网图片链接仅用于 H3，请为当前模型重新上传本地图片。");assets.push(a);}const images=assets.slice(0,parsed.images.length),videos=assets.slice(parsed.images.length,parsed.images.length+parsed.videos.length),audios=assets.slice(parsed.images.length+parsed.videos.length);let imageUrls:string[]=[],videoUrls:string[]=[],audioUrls:string[]=[];if(provider==="hyaloria"){
 assertHyaloriaMode(hyaloriaCatalog(await hyaloria('/models',{},request)),'h3',parsed.h3_mode??'hd');
 const prepared=await prepareH3References(assets,async a=>uploadOssReference(runtime,a.id,a.mime,await r2Asset(a)));imageUrls=prepared.images;videoUrls=prepared.videos;audioUrls=prepared.audios;
 }else if(provider==="byteplus"){
 const library=portraitConfig();
 const prepared=await prepareBytePlusReferences(assets,r2Asset,library.configured&&library.groupId ? {
  project:library.project,group:library.groupId,reference:a=>portraitReference(a.id,owner),
 } : undefined);
 imageUrls=prepared.images;videoUrls=prepared.videos;audioUrls=prepared.audios;
 }else if(provider==="paipu"){const prepared=await Promise.all(assets.map((a,i)=>paipuAsset(a,id,i,request)));imageUrls=prepared.slice(0,images.length).map(x=>x.url);videoUrls=prepared.slice(images.length,images.length+videos.length).map(x=>x.url);audioUrls=prepared.slice(images.length+videos.length).map(x=>x.url);}else if(provider==="modelflare"){const prepared=await Promise.all(assets.map((a,i)=>flareAsset(a,id,i,request)));imageUrls=prepared.slice(0,images.length);videoUrls=prepared.slice(images.length,images.length+videos.length);audioUrls=prepared.slice(images.length+videos.length);}else{const prepared=await linkoReferences(assets,owner,request);imageUrls=prepared.slice(0,images.length);videoUrls=prepared.slice(images.length,images.length+videos.length);audioUrls=prepared.slice(images.length+videos.length);}
 let result:ReturnType<typeof normalizeTask>;try{let raw:any;if(provider==="hyaloria"){raw=await hyaloria("/jobs",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":id},body:JSON.stringify(h3Payload(parsed,imageUrls,videoUrls,audioUrls))},request);}else if(provider==="byteplus"){raw=await bytePlus("/contents/generations/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(bytePlusPayload(parsed,imageUrls,videoUrls,audioUrls))},request);}else if(provider==="paipu"){const spec=MODELS[parsed.model],payload:any={...parsed,images:imageUrls,videos:videoUrls,audios:audioUrls};if(!spec.maxAudios)delete payload.audios;if(!spec.maxVideos)delete payload.videos;if(spec.fixedDuration!==null)delete payload.duration;if(spec.resolutions.length===1)delete payload.resolution;raw=await upstream("/videos",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":id},body:JSON.stringify(payload)},request);}else if(provider==="modelflare"){const content:any[]=[{type:"text",text:mentions(parsed.prompt)},...imageUrls.map(url=>({type:"image_url",image_url:{url},role:"reference_image"})),...videoUrls.map(url=>({type:"video_url",video_url:{url},role:"reference_video"})),...audioUrls.map(url=>({type:"audio_url",audio_url:{url},role:"reference_audio"}))];raw=await modelFlare("/v1/videos",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":id},body:JSON.stringify({model:parsed.model,content,resolution:parsed.resolution,ratio:parsed.aspect_ratio,duration:parsed.duration,generate_audio:false,watermark:false,output_format:"mp4",omni_reference_task_type:assets.length?"reference":undefined})},request);}else{const content=[...videoUrls.map(url=>({type:"video_url",video_url:{url,is_asset:true}})),...audioUrls.map(url=>({type:"audio_url",audio_url:{url,is_asset:false}})),...imageUrls.map(url=>({type:"image_url",image_url:{url,is_asset:false}}))],timing=linkoDurationFields(parsed.duration);raw=await linkoMobile("/v1/video/generations",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":id},body:JSON.stringify({model:parsed.model,prompt:parsed.prompt,resolution:parsed.resolution,ratio:parsed.aspect_ratio,duration:timing.duration,seconds:timing.seconds,return_last_frame:true,watermark:false,metadata:{content,duration:timing.metadata.duration,generate_audio:true,bitrate_mode:"high"}})},request);}result=provider==="hyaloria"?normalizeH3(raw):normalizeTask(raw);if(result.upstream&&result.status==="unknown")result.status="queued";if(provider==='hyaloria'&&result.upstream&&result.status==='completed'&&!result.url)result.status='in_progress';if(!result.upstream){result.status="unknown";result.error=`${providerNames[provider]} 未返回任务编号，请先到服务商控制台核对。`;}}catch(e){const known=e instanceof InputError&&e.status>=400&&e.status<500;result={status:known?"failed":"unknown",upstream:undefined,progress:null,url:undefined,error:e instanceof Error?e.message:"提交结果不确定"};}await db.prepare("UPDATE jobs SET upstream=?,status=?,result=?,updated=? WHERE id=? AND owner=?").bind(result.upstream??null,result.status,JSON.stringify(result),Date.now(),id,owner).run();
}

type QueueRow={job_id:string;owner:string;provider:Provider;sealed_key:string;state:string};
const taskScope=(id:string,owner:string,provider:string)=>JSON.stringify([id,owner,provider]);
async function executeImageJob(job:Job,request:Request){
 const saved=parseImageGeneration(JSON.parse(job.request)),db=database(),owner=job.owner,id=job.id;
 try{
  if(saved.model==='krea2'){
   assertHyaloriaMode(hyaloriaCatalog(await krea2('/models',{},request)),'krea2','story');
   const raw=await krea2('/jobs',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify(krea2Payload(saved))},request),result=normalizeH3(raw);
   if(!result.upstream){result.status='unknown';result.error='Krea2 未返回任务编号，请保留当前记录，避免重复提交。';}
   else if(result.status==='unknown')result.status='queued';
   else if(result.status==='completed'&&!result.url)result.status='in_progress';
   await db.prepare('UPDATE jobs SET upstream=?,status=?,result=?,updated=? WHERE id=? AND owner=?').bind(result.upstream??null,result.status,JSON.stringify({...result,mime:'image/png',mediaStatus:'pending'}),Date.now(),id,owner).run();return;
  }
  const references:string[]=[];
  for(const assetId of saved.images){const asset=await db.prepare("SELECT * FROM assets WHERE id=? AND owner=?").bind(assetId,owner).first<Asset>();if(!asset)throw new InputError("参考图片不存在，请重新上传。",404);references.push(`data:${asset.mime};base64,${Buffer.from(await r2Asset(asset)).toString("base64")}`);}
  const raw=await bytePlusImage("/images/generations",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":id},body:JSON.stringify(imagePayload(saved,references))},request);
  const item=raw?.data?.[0]??raw?.data??raw;
  if(item?.error)throw new InputError(String(item.error.message??"图片生成失败。"),422);
  let url:string|undefined,mime="image/png",archived=false;
  if(typeof item?.url==="string")url=httpsUrl(item.url);
  else if(typeof item?.b64_json==="string"){const bytes=Buffer.from(item.b64_json,"base64");if(bytes.length>30*MIB)throw new InputError("生成图片超过存储限制。",502);await bucket().put(`generated-images/${id}`,bytes,{httpMetadata:{contentType:mime}});url=`/api/studio/generated/${id}`;archived=true;}
  if(!url)throw new InputError("生图服务没有返回可用图片。",502);
  const result={status:"completed",url,mime,archived,usage:raw.usage,size:item.size,mediaStatus:"pending"};
  await db.prepare("UPDATE jobs SET status='completed',result=?,updated=? WHERE id=? AND owner=?").bind(JSON.stringify(result),Date.now(),id,owner).run();
 }catch(error){
  const status=error instanceof InputError&&error.status>=400&&error.status<500?"failed":"unknown";
  await db.prepare("UPDATE jobs SET status=?,result=?,updated=? WHERE id=? AND owner=?").bind(status,JSON.stringify({status,error:error instanceof InputError?error.message:"图片请求中断，结果待确认，请勿重复提交。"}),Date.now(),id,owner).run();
 }
}
async function finishQueue(row:QueueRow){
 const job=await ownedJob(row.job_id,row.owner,true);
 const state=job.upstream&&!["completed","failed"].includes(job.status)?"tracking":job.status==="unknown"?"unknown":"done";
 await database().prepare("UPDATE generation_queue SET state=?,sealed_key=CASE WHEN ?='tracking' THEN sealed_key ELSE '' END,updated=?,next_poll=? WHERE job_id=?").bind(state,state,Date.now(),Date.now()+8000,row.job_id).run();
}
function executionRequest(row:QueueRow){
 const key=openTaskKey(row.sealed_key,taskScope(row.job_id,row.owner,row.provider),runtime.JOB_ENCRYPTION_KEY);
 return new Request("http://localhost/internal-generation",{headers:{Cookie:personalApiKeyCookie(key,row.provider).split(";")[0],"x-studio-runner":runtime.STUDIO_RUNNER_TOKEN??""}});
}
async function runnerRoute(request:Request,path:string[]):Promise<Response>{
 // Drain control request bodies before returning: the local Worker proxy aborts
 // a reused POST connection when its previous body was left unread.
 const controlBytes=request.method==="POST"&&request.body?await readLimited(request.body,4096):null;
 if(!runnerAuthorized(request.headers.get("x-studio-runner"),runtime.STUDIO_RUNNER_TOKEN))throw new InputError("访问无效。",403);
 const db=database(),now=Date.now();
 if(path[1]==="media-source"&&path[2]&&request.method==="GET"){
  const job=await db.prepare("SELECT * FROM jobs WHERE id=?").bind(identifier(path[2])).first<Job>();if(!job||job.status!=="completed")throw new InputError("文件不存在。",404);
  const result=JSON.parse(job.result);if(!result.archived)throw new InputError("文件未保存在本地。",404);return serve(`generated-images/${job.id}`,result.mime??"image/png",request);
 }
 if(request.method!=="POST")throw new InputError("页面不存在。",404);
 if(path[1]==="media-recover"){
  // Cache transfers are safe to repeat; inference submissions remain untouched.
  const recovered=await db.prepare("UPDATE media_cache SET state='failed',attempts=MAX(0,attempts-1),updated=0 WHERE state='processing'").run();
  await db.prepare("UPDATE jobs SET result=json_set(result,'$.mediaStatus','retrying') WHERE id IN (SELECT job_id FROM media_cache WHERE state='failed' AND updated=0)").run();
  return json({recovered:recovered.meta.changes});
 }
 if(path[1]==="next"){
  // Never resend an ambiguous paid request after a crash. Known upstream IDs
  // can be polled safely; otherwise retain an explicit unknown result.
  await db.prepare("UPDATE generation_queue SET state='done',sealed_key='',updated=? WHERE state IN ('running','tracking') AND job_id IN (SELECT id FROM jobs WHERE status IN ('completed','failed'))").bind(now).run();
  await db.prepare("UPDATE generation_queue SET state=CASE WHEN job_id IN (SELECT id FROM jobs WHERE upstream IS NOT NULL) THEN 'tracking' ELSE 'unknown' END,updated=? WHERE state='running' AND updated<?").bind(now,now-600000).run();
  await db.prepare("UPDATE jobs SET status='unknown',result=json_set(result,'$.status','unknown','$.error','后台任务连接中断，结果待确认，请勿重复提交。') WHERE id IN (SELECT job_id FROM generation_queue WHERE state='unknown') AND status IN ('queued','submitting','in_progress')").run();
  await db.prepare("UPDATE generation_queue SET sealed_key='' WHERE state='unknown' AND sealed_key<>''").run();
  const row=await db.prepare("UPDATE generation_queue SET state='running',updated=? WHERE job_id=(SELECT job_id FROM generation_queue WHERE state='pending' ORDER BY created LIMIT 1) AND state='pending' RETURNING *").bind(now).first<QueueRow>();
  if(!row)return json({idle:true});
  try{
   const job=await ownedJob(row.job_id,row.owner,true),execution=executionRequest(row);
   await db.prepare("UPDATE jobs SET status='in_progress',updated=? WHERE id=?").bind(now,job.id).run();
   if(JSON.parse(job.request).kind==="image")await executeImageJob(job,execution);else await executeVideoJob(job,execution);
   await finishQueue(row);return json({id:row.job_id});
  }catch(error){
   const known=error instanceof InputError&&error.status>=400&&error.status<500,status=known?"failed":"unknown";
   await db.prepare("UPDATE jobs SET status=?,result=json_set(result,'$.status',?,'$.error',?),updated=? WHERE id=? AND status NOT IN ('completed','failed')").bind(status,status,known?error.message:"后台任务结果待确认，请联系管理员，避免重复提交。",Date.now(),row.job_id).run();
   await finishQueue(row);return json({id:row.job_id,unconfirmed:true});
  }
 }
 if(path[1]==="poll"){
  const row=await db.prepare("UPDATE generation_queue SET next_poll=? WHERE job_id=(SELECT job_id FROM generation_queue WHERE state='tracking' AND next_poll<=? ORDER BY next_poll LIMIT 1) AND state='tracking' RETURNING *").bind(now+15000,now).first<QueueRow>();
  if(!row)return json({idle:true});
  try{
   const job=await ownedJob(row.job_id,row.owner,true),request=executionRequest(row),saved=JSON.parse(job.request),raw=await task(row.provider,job.upstream!,request);
   const result={...JSON.parse(job.result||"{}"),...(["hyaloria","krea2"].includes(row.provider)?normalizeH3(raw):normalizeTask(raw))};if(result.status==="unknown")result.status="in_progress";
   await db.prepare("UPDATE jobs SET status=?,result=?,updated=? WHERE id=?").bind(result.status,JSON.stringify(result),Date.now(),job.id).run();await finishQueue(row);
  }catch{}
  return json({id:row.job_id});
 }
 if(path[1]==="media-next"){
  if(!ossConfigured(runtime))return json({idle:true});
  await db.prepare("UPDATE media_cache SET state='failed',updated=? WHERE state='processing' AND updated<?").bind(now,now-1200000).run();
  const jobs=await db.prepare("SELECT j.* FROM jobs j LEFT JOIN media_cache m ON m.job_id=j.id WHERE j.status='completed' AND j.deleted_at IS NULL AND COALESCE(json_extract(j.request,'$.kind'),'video') IN ('image','video') AND json_extract(j.result,'$.url') IS NOT NULL AND (m.job_id IS NULL OR (m.state='failed' AND m.attempts<3 AND m.updated<?)) ORDER BY j.created DESC LIMIT 10").bind(now-60000).all<Job>();
  for(const job of jobs.results){
   const claim=await db.prepare("INSERT INTO media_cache(job_id,state,created,updated,attempts) VALUES(?,'processing',?,?,1) ON CONFLICT(job_id) DO UPDATE SET state='processing',updated=excluded.updated,attempts=media_cache.attempts+1 WHERE media_cache.state='failed' AND media_cache.attempts<3 AND media_cache.updated<excluded.updated-60000").bind(job.id,now,now).run();if(!claim.meta.changes)continue;
   const saved=JSON.parse(job.request),result=JSON.parse(job.result),kind=saved.kind??"video",mime=kind==="image"?result.mime??"image/png":"video/mp4";
   const key=`yingxu-results/${job.id}/original`,previewKey=`yingxu-results/${job.id}/preview.webp`;
   await db.prepare("UPDATE jobs SET result=json_set(result,'$.mediaStatus','processing') WHERE id=?").bind(job.id).run();
   const headers={"content-type":mime,"x-oss-object-acl":"private"},previewHeaders={"content-type":"image/webp","x-oss-object-acl":"private"};
   return json({id:job.id,kind,mime,source:result.archived?`http://127.0.0.1:5181/api/studio/internal/media-source/${job.id}`:httpsUrl(result.url),local:Boolean(result.archived),put:signOssUrl(runtime,key,"PUT",3600,headers),headers,previewPut:signOssUrl(runtime,previewKey,"PUT",3600,previewHeaders),previewHeaders});
  }
  return json({idle:true});
 }
 if(path[1]==='media-upload'&&path[2]){
  const id=identifier(path[2]),body=JSON.parse(new TextDecoder().decode(controlBytes??new Uint8Array())) as {mime?:string;extension?:string};
  const row=await db.prepare("SELECT j.request FROM jobs j JOIN media_cache m ON m.job_id=j.id WHERE j.id=? AND j.status='completed' AND m.state='processing'").bind(id).first<{request:string}>();if(!row)throw new InputError('缓存任务不存在。',404);
  const kind=JSON.parse(row.request).kind??'video',mime=body.mime as keyof typeof GENERATED_FORMATS;
  if(!Object.hasOwn(GENERATED_FORMATS,mime)||GENERATED_FORMATS[mime]!==body.extension||!mime.startsWith(kind+'/'))throw new InputError('生成文件格式不匹配。');
  const headers={'content-type':mime,'x-oss-object-acl':'private'},previewHeaders={'content-type':'image/webp','x-oss-object-acl':'private'};
  return json({put:signOssUrl(runtime,`yingxu-results/${id}/original`,'PUT',3600,headers),headers,previewPut:signOssUrl(runtime,`yingxu-results/${id}/preview.webp`,'PUT',3600,previewHeaders),previewHeaders});
 }
 if(path[1]==="media-preview"&&path[2]){
  const id=identifier(path[2]);
  await db.prepare("UPDATE jobs SET result=json_set(result,'$.previewKey',?),updated=? WHERE id=? AND status='completed' AND id IN (SELECT job_id FROM media_cache WHERE state='processing')").bind(`yingxu-results/${id}/preview.webp`,now,id).run();
  return json({ok:true});
 }
 if(path[1]==="media-complete"&&path[2]){
  const id=identifier(path[2]),body=JSON.parse(new TextDecoder().decode(controlBytes??new Uint8Array())) as {ok?:boolean;preview?:boolean;bytes?:number;mime?:string;extension?:string};
  const entry=await db.prepare("SELECT m.job_id,m.attempts,m.state,j.request FROM media_cache m JOIN jobs j ON j.id=m.job_id WHERE m.job_id=? AND m.state IN ('processing','ready')").bind(id).first<{job_id:string;attempts:number;state:string;request:string}>();if(!entry)throw new InputError("缓存任务不存在。",404);
  if(entry.state==='ready'&&!body.ok)return json({ok:true});
  if(body.ok&&Number.isSafeInteger(body.bytes)&&(body.bytes??0)>0){
   const mime=body.mime as keyof typeof GENERATED_FORMATS,kind=JSON.parse(entry.request).kind??'video';
   if(!Object.hasOwn(GENERATED_FORMATS,mime)||GENERATED_FORMATS[mime]!==body.extension||!mime.startsWith(kind+'/'))throw new InputError('生成文件格式不匹配。');
   await db.batch([db.prepare("UPDATE media_cache SET state='ready',updated=? WHERE job_id=?").bind(now,id),db.prepare("UPDATE jobs SET result=json_set(result,'$.ossKey',?,'$.previewKey',?,'$.mediaStatus','ready','$.bytes',?,'$.mime',?,'$.extension',?),updated=? WHERE id=?").bind(`yingxu-results/${id}/original`,body.preview?`yingxu-results/${id}/preview.webp`:null,body.bytes,mime,body.extension,now,id)]);
  }else await db.batch([db.prepare("UPDATE media_cache SET state='failed',error='媒体转存未完成',updated=? WHERE job_id=?").bind(now,id),db.prepare("UPDATE jobs SET result=json_set(result,'$.mediaStatus',?) WHERE id=?").bind(entry.attempts<3?'retrying':'failed',id)]);
  return json({ok:true});
 }
 throw new InputError("页面不存在。",404);
}

export async function GET(request:Request,context:Context){try{const {path}=await context.params;
 if(path[0]==="provider-media"&&path[1]){const token=new URL(request.url).searchParams.get("token")??"",a=/^[a-f0-9]{64}$/.test(token)?await database().prepare("SELECT * FROM assets WHERE id=?").bind(identifier(path[1])).first<Asset>():null;if(!a||a.url!==`linko:${token}`||!a.expires||Date.parse(a.expires)<Date.now())throw new InputError("临时素材链接无效或已过期。",404);return serve(`assets/${a.id}`,a.mime,request);}
 if(path[0]==="internal")return await runnerRoute(request,path);
 const owner=await authorize(request);
 if(path[0]==="video-quota"&&!path[1])return json(await currentVideoQuota());
 if(path[0]==="portrait-library"&&!path[1])return json(portraitConfig());
 if(path[0]==="portrait-assets"&&path[1]&&path.length===2)return json(publicPortrait(await refreshPortrait(identifier(path[1]),owner)));
 if(path[0]==="h3-account"){const [account,models]=await Promise.all([hyaloria("/account",{},request),hyaloria("/models",{},request)]);const model=hyaloriaCatalog(models).h3;return json({balance_usd:account.balance_usd,unit_price_usd:model?.unit_price_usd,currency:account.currency});}
 if(path[0]==='hyaloria-models'){
  const provider=new URL(request.url).searchParams.get('provider')==='krea2'?'krea2':'hyaloria';return json({models:hyaloriaCatalog(await(provider==='krea2'?krea2:hyaloria)('/models',{},request))});
 }
 if(path[0]==="config"){const providers=Object.fromEntries(await Promise.all((Object.keys(providerNames) as Provider[]).map(async p=>{let configured=false;try{configured=await hasFallbackApiKey(p);}catch{}return [p,{configured,personalKey:false,defaultKey:configured}];})));return json({providers,videoQuota:await currentVideoQuota(),keySource:'confiykey.json',editableKeys:false});}
 if(path[0]==="assets"&&!path[1]){const rows=await database().prepare("SELECT * FROM assets WHERE owner=? ORDER BY created DESC LIMIT 500").bind(owner).all<Asset>();return json({assets:rows.results.map(publicAsset)});}
 if(path[0]==='chat-generations'&&!path[1]){
  const rows=await database().prepare("SELECT * FROM jobs WHERE owner=? AND deleted_at IS NULL AND json_extract(request,'$.kind')='chat' AND (json_array_length(result,'$.actions')>0 OR json_extract(result,'$.creationNotice')=1) ORDER BY created DESC LIMIT 100").bind(owner).all<Job>();
  const entries=[];for(const row of rows.results){const result=JSON.parse(row.result),generations=[];for(const action of result.actions??[]){const child=await database().prepare('SELECT * FROM jobs WHERE id=? AND owner=? AND deleted_at IS NULL').bind(action.id,owner).first<Job>();if(child)generations.push({...publicJob(child),kind:action.kind});else{const failed=result.generations?.find((g:any)=>g.id===action.id&&g.status==='failed');if(failed)generations.push(failed);}}entries.push({id:row.id,message:result.message,matchContent:result.originalMessage??result.message?.content,notice:result.creationNotice===true,generations,created:row.created});}return json({entries});
 }
 if(path[0]==="jobs"&&!path[1]){const rows=await database().prepare("SELECT * FROM jobs WHERE owner=? AND deleted_at IS NULL AND (json_extract(request,'$.kind') IS NULL OR json_extract(request,'$.kind')='video') ORDER BY created DESC LIMIT 100").bind(owner).all<Job>();return json({jobs:rows.results.map(publicJob)});}
 if(path[0]==="images"&&!path[1]){const rows=await database().prepare("SELECT * FROM jobs WHERE owner=? AND deleted_at IS NULL AND json_extract(request,'$.kind')='image' ORDER BY created DESC LIMIT 100").bind(owner).all<Job>();return json({images:rows.results.map(publicJob)});}
 if(path[0]==="jobs"&&path[1]){let job=await ownedJob(path[1],owner),saved=JSON.parse(job.request);if(job.upstream&&job.status!=="failed"&&!JSON.parse(job.result||"{}").ossKey&&!(await database().prepare("SELECT job_id FROM generation_queue WHERE job_id=?").bind(job.id).first())){if(job.status==="unknown"){job={...job,status:"queued"};await database().prepare("UPDATE jobs SET status=?,updated=? WHERE id=? AND owner=?").bind("queued",Date.now(),job.id,owner).run();}try{const raw=await task(providerOf(saved.model),job.upstream!,request),result={...JSON.parse(job.result||"{}"),...(providerOf(saved.model)==="hyaloria"?normalizeH3(raw):normalizeTask(raw))};if(result.status==="unknown")result.status="in_progress";await database().prepare("UPDATE jobs SET status=?,result=?,updated=? WHERE id=? AND owner=?").bind(result.status,JSON.stringify(result),Date.now(),job.id,owner).run();job={...job,status:result.status,result:JSON.stringify(result),updated:Date.now()};}catch(e){const message=e instanceof Error?e.message:"状态查询暂时不可用";return json({...publicJob(job),pollError:`状态查询失败：${message}。任务已经创建，请稍后刷新。`});}}return json(publicJob(job));}
 if(path[0]==="media"&&path[1]){const a=await database().prepare("SELECT * FROM assets WHERE id=? AND owner=?").bind(identifier(path[1]),owner).first<Asset>();if(!a)throw new InputError("素材不存在。",404);return serve(`assets/${a.id}`,a.mime,request);}
 if(path[0]==="download"&&path[1]){const job=await ownedJob(path[1],owner),result=JSON.parse(job.result||"{}"),saved=JSON.parse(job.request);if(job.status!=="completed"||!result.url)throw new InputError("文件尚未生成。",404);const extension=typeof result.extension==='string'&&/^(png|jpg|webp|mp4|mov|webm)$/.test(result.extension)?result.extension:saved.kind==="image"?"png":"mp4";if(result.ossKey&&ossConfigured(runtime))return Response.redirect(signOssUrl(runtime,result.ossKey,"GET",900,{},new Date(),{"response-content-disposition":`attachment; filename="${saved.kind}-${job.id}.${extension}"`}),302);if(result.archived){const response=await serve(`generated-images/${job.id}`,result.mime??"image/png",request);response.headers.set("Content-Disposition",`attachment; filename="image-${job.id}.png"`);return response;}return Response.redirect(httpsUrl(result.url),302);}
 if(path[0]==="generated"&&path[1]){const job=await ownedJob(path[1],owner),saved=JSON.parse(job.request),result=JSON.parse(job.result||"{}");if(saved.kind!=="image"||!result.archived)throw new InputError("图片不存在。",404);return serve(`generated-images/${job.id}`,result.mime??"image/png",request);}
 throw new InputError("页面不存在。",404);}catch(e){return failure(e);}}

async function enqueueGeneration(request:Request,owner:string,id:string,body:unknown,image:boolean){
 const db=database(),prior=await db.prepare("SELECT * FROM jobs WHERE id=? AND owner=?").bind(id,owner).first<Job>();
 if(prior){const kind=JSON.parse(prior.request).kind??'video';if(kind!==(image?'image':'video'))throw new InputError('请求编号已被使用。',409);return {job:publicJob(prior),created:false};}
 const parsed=image?parseImageGeneration(body):parseGeneration(body);
  if(image?!isActiveImageModel(parsed.model):!isActiveVideoModel(parsed.model))throw new InputError("请选择当前支持的模型。");
  if(!image&&parsed.model===LIMITED_VIDEO_MODEL)assertVideoQuota(await currentVideoQuota(),(parsed as ReturnType<typeof parseGeneration>).duration);
  const provider=(image?(parsed as ReturnType<typeof parseImageGeneration>).provider:providerOf(parsed.model)) as Provider;
  const key=await apiKey(request,provider),allIds=image?(parsed as ReturnType<typeof parseImageGeneration>).images:[...(parsed as ReturnType<typeof parseGeneration>).images,...(parsed as ReturnType<typeof parseGeneration>).videos,...(parsed as ReturnType<typeof parseGeneration>).audios];
  const assets:Asset[]=[];for(const assetId of allIds){const asset=await db.prepare("SELECT * FROM assets WHERE id=? AND owner=?").bind(identifier(assetId),owner).first<Asset>();if(!asset)throw new InputError("部分参考素材不存在，请重新上传。",404);assets.push(asset);}
  if(image&&assets.some(a=>a.kind!=="image"||a.mime==="image/remote"))throw new InputError("请使用已上传的本地参考图片。");
  if(provider==="byteplus"||image)validateBytePlusAssets(assets,provider==='byteplus');
  if(provider==='byteplus'){const library=portraitConfig();assertBytePlusPortraits(assets,library.configured&&library.groupId?{project:library.project,group:library.groupId}:undefined);}
  if(provider==="hyaloria")validateH3References(assets);
  const saved=image?parsed:{kind:"video",...parsed,images:assets.filter(a=>a.kind==="image").map(publicAsset),videos:assets.filter(a=>a.kind==="video").map(publicAsset),audios:assets.filter(a=>a.kind==="audio").map(publicAsset)};
  const now=Date.now(),sealed=sealTaskKey(key,taskScope(id,owner,provider),runtime.JOB_ENCRYPTION_KEY);
  const claim=image?db.prepare("INSERT OR IGNORE INTO jobs(id,owner,status,request,result,created,updated) VALUES(?,?,?,?,?,?,?)").bind(id,owner,"queued",JSON.stringify(saved),"{}",now,now):db.prepare(INSERT_VIDEO_WITH_QUOTA_SQL.replace("INSERT INTO","INSERT OR IGNORE INTO")).bind(id,owner,"queued",JSON.stringify(saved),"{}",now,now,parsed.model,(parsed as ReturnType<typeof parseGeneration>).duration);
  await db.batch([claim,db.prepare("INSERT OR IGNORE INTO generation_queue(job_id,owner,provider,sealed_key,state,created,updated,next_poll) SELECT id,owner,?,?,'pending',?,?,0 FROM jobs WHERE id=? AND owner=? AND created=? AND status='queued'").bind(provider,sealed,now,now,id,owner,now)]);
  const job=await db.prepare("SELECT * FROM jobs WHERE id=? AND owner=?").bind(id,owner).first<Job>();
  if(!job){if(!image)assertVideoQuota(await currentVideoQuota(),(parsed as ReturnType<typeof parseGeneration>).duration);throw new InputError("模型额度已被其他任务预占，请刷新后重试。",409);}

 return {job:publicJob(job),created:true};
}

async function submitChatActions(request:Request,owner:string,turn:Job,result:any){
 const actions=result.actions??[],generations=[];
 if(!Array.isArray(actions)||actions.length>2)throw new InputError('聊天创作记录异常。',500);
 for(const action of actions){
  if(!['image','video'].includes(action.kind)||action.id!==turn.id+'-'+action.kind)throw new InputError('聊天任务编号异常。',500);
  try{const saved=await enqueueGeneration(request,owner,action.id,action.request,action.kind==='image');generations.push({...saved.job,kind:action.kind});}
  catch(error){generations.push({id:action.id,kind:action.kind,status:'failed',request:action.request,created:Date.now(),error:error instanceof Error?error.message:'任务未能提交。'});}
 }
 const accepted=generations.filter(g=>g.status!=='failed');
 const content=accepted.length?'已将'+accepted.map(g=>g.kind==='image'?'图片':'视频').join('和')+'任务加入生成队列，进度和作品会显示在下方。'+(accepted.length<generations.length?'部分任务未能提交，请查看对应提示。':''):'本次生成未能提交，请查看下方任务中的原因。';
 const next={...result,id:turn.id,originalMessage:result.originalMessage??result.message?.content,message:{role:'assistant',content},generations};
 await database().prepare("UPDATE jobs SET status='completed',result=?,updated=? WHERE id=? AND owner=?").bind(JSON.stringify(next),Date.now(),turn.id,owner).run();
 return next;
}

export async function POST(request:Request,context:Context){try{const {path}=await context.params;if(path[0]==="internal")return await runnerRoute(request,path);const owner=await authorize(request);
 if(path[0]==='chat-optimize'&&path.length===1){
  const id=identifier(request.headers.get('Idempotency-Key')??''),db=database(),body=JSON.parse(new TextDecoder().decode(await readLimited(request.body,100000))),parsed=parsePromptOptimization(body);
  await apiKey(request,'paipu_chat');const now=Date.now(),claim=await db.prepare("INSERT OR IGNORE INTO jobs(id,owner,status,request,result,created,updated) VALUES(?,?,'submitting',?,'{}',?,?)").bind(id,owner,JSON.stringify({kind:'prompt_optimization',model:CHAT_MODEL}),now,now).run();
  if(!claim.meta.changes){const prior=await ownedJob(id,owner);if(JSON.parse(prior.request).kind!=='prompt_optimization')throw new InputError('请求编号已被使用。',409);if(prior.status==='completed')return json(JSON.parse(prior.result));throw new InputError('这次优化正在处理，请稍后再试。',409);}
  try{const {references}=await chatCreationReferences({references:body.references??[]},owner);const raw=await paipuChat({method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({model:CHAT_MODEL,stream:false,messages:[{role:'system',content:promptOptimizationSystem(parsed.target)},{role:'user',content:JSON.stringify({...parsed,references:references.map((ref,index)=>({picture:index+1,name:ref.name,width:ref.width,height:ref.height}))})}]})},request);const result=resolvePromptOptimization(raw,parsed.target);await db.prepare("UPDATE jobs SET status='completed',result=?,updated=? WHERE id=? AND owner=?").bind(JSON.stringify(result),Date.now(),id,owner).run();return json(result);}
  catch(error){const result={error:error instanceof Error?error.message:'提示词优化失败。',code:error instanceof PromptOptimizationError?error.code:'optimization_upstream_error'};await db.prepare("UPDATE jobs SET status='failed',result=?,updated=? WHERE id=? AND owner=?").bind(JSON.stringify(result),Date.now(),id,owner).run();if(error instanceof PromptOptimizationError)return json(result,error.status);throw error;}
 }
 if(path[0]==='chat'&&path[1]&&path[2]==='resume'&&path.length===3){
  const turn=await ownedJob(path[1],owner),saved=JSON.parse(turn.request),result=JSON.parse(turn.result);if(saved.kind!=='chat'||!Array.isArray(result.actions)||!result.actions.length)throw new InputError('这条聊天没有待处理的生成任务。',400);return json(await submitChatActions(request,owner,turn,result));
 }
 if(path[0]==="portrait-assets"&&path[1]&&path.length===2)return json(await importPortrait(identifier(path[1]),owner));

 if((path[0]==="jobs"||path[0]==="images")&&path[1]&&path[2]==="restore"&&path.length===3){
  const id=identifier(path[1]),result=await database().prepare(RESTORE_RECORD_SQL).bind(id,owner,recordKind(path[0])).run();
  if(!result.meta.changes)throw new InputError("找不到这条记录。",404);
  return json(publicJob(await ownedJob(id,owner)));
 }
 if(path[0]==="chat"){

  const id=identifier(request.headers.get("Idempotency-Key")??""), db=database();
  const body=JSON.parse(new TextDecoder().decode(await readLimited(request.body,420000))), parsed=parseChat(body);
  await apiKey(request,"paipu_chat");
  const now=Date.now(), inserted=await db.prepare("INSERT OR IGNORE INTO jobs (id,owner,status,request,result,created,updated) VALUES (?,?,?,?,?,?,?)").bind(id,owner,"submitting",JSON.stringify({kind:"chat",model:CHAT_MODEL}),"{}",now,now).run();
  if(!inserted.meta.changes){const prior=await ownedJob(id,owner);if(JSON.parse(prior.request).kind!=="chat")throw new InputError("请求编号已被使用。",409);const result=JSON.parse(prior.result);if(prior.status==="completed")return json(result.actions?.length&&!result.generations?await submitChatActions(request,owner,prior,result):result);throw new InputError("这条消息已经提交，请勿重复发送。",409);}
  try{
   const creation=await chatCreationReferences(body.creationContext,owner);
   const raw=await paipuChat({method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":id},body:JSON.stringify({...parsed,messages:[{role:'system',content:chatCreationSystem(creation.context,creation.references)},...parsed.messages],tools:CHAT_CREATION_TOOLS,tool_choice:'auto',parallel_tool_calls:true})},request);
   const actions=compileChatActions(raw,parsed.messages,creation.context,creation.references,id);
   const used=new Set(actions.flatMap(action=>action.request.images??[]));
   const sources=(creation.context.references??[]).filter(source=>source.jobId&&creation.references.some(ref=>ref.jobId===source.jobId&&used.has(ref.id)));
   if(sources.length)await chatCreationReferences({references:sources},owner,true);
   const message=actions.length?{role:'assistant' as const,content:'正在提交'+actions.map(action=>`${action.kind==='image'?'图片':'视频'}生成任务（${action.request.aspect_ratio}${action.kind==='video'?` · ${action.request.duration}秒`:''}）`).join('和')+'，进度和作品会直接显示在下方。'}:chatReplyWithoutCreation(raw);
   const result={id,message,actions,creationNotice:!actions.length&&message.content===CHAT_NO_TASK_NOTICE,model:CHAT_MODEL,usage:raw.usage};
   if(actions.length){await db.prepare('UPDATE jobs SET result=?,updated=? WHERE id=? AND owner=?').bind(JSON.stringify(result),Date.now(),id,owner).run();return json(await submitChatActions(request,owner,await ownedJob(id,owner),result));}
   await db.prepare("UPDATE jobs SET status='completed',result=?,updated=? WHERE id=? AND owner=?").bind(JSON.stringify(result),Date.now(),id,owner).run();
   return json(result);
  }catch(e){await db.prepare("UPDATE jobs SET status='failed',result=?,updated=? WHERE id=? AND owner=?").bind(JSON.stringify({error:e instanceof Error?e.message:"对话失败。"}),Date.now(),id,owner).run();throw e;}
 }
 if(path[0]==="h3-account"){throw new InputError("请使用 GET 查询账户。",405);}
 if(path[0]==="reference-image-url"){
  const body=JSON.parse(new TextDecoder().decode(await readLimited(request.body,12000))),url=publicMediaUrl(body.url),id=crypto.randomUUID(),now=Date.now();
  const a:Asset={id,owner,name:"H3 公网参考图",kind:"image",mime:"image/remote",size:0,url,expires:null,created:now};
  await database().prepare("INSERT INTO assets (id,owner,kind,name,mime,size,url,expires,created) VALUES (?,?,?,?,?,?,?,?,?)").bind(id,owner,a.kind,a.name,a.mime,0,url,null,now).run();
  return json(publicAsset(a),201);
 }
 if(path[0]==="reference-url"){
  const body=JSON.parse(new TextDecoder().decode(await readLimited(request.body,12000)));
  const url=publicMediaUrl(body.url),id=crypto.randomUUID(),now=Date.now();
  const a:Asset={id,owner,name:"视频链接",kind:"video",mime:"video/remote",size:0,url,expires:null,created:now};
  await database().prepare("INSERT INTO assets (id,owner,kind,name,mime,size,url,expires,created) VALUES (?,?,?,?,?,?,?,?,?)").bind(id,owner,a.kind,a.name,a.mime,0,url,null,now).run();
  return json(publicAsset(a),201);
 }
 if(path[0]==="upload"){
  const id=identifier(request.headers.get("Idempotency-Key")??""),db=database();
  const prior=await db.prepare("SELECT * FROM assets WHERE id=? AND owner=?").bind(id,owner).first<Asset>();
  if(prior)return json(publicAsset(prior));
  const uploaded=await readUpload(request,new URL(request.url).searchParams.get("kind"));
  await bucket().put(`assets/${id}`,uploaded.content,{httpMetadata:{contentType:uploaded.mime}});
  const a:Asset={id,owner,name:uploaded.name,kind:uploaded.kind,mime:uploaded.mime,size:uploaded.size,url:"",expires:null,created:Date.now()};
  await db.prepare("INSERT OR IGNORE INTO assets (id,owner,kind,name,mime,size,url,expires,created) VALUES (?,?,?,?,?,?,?,?,?)").bind(a.id,owner,a.kind,a.name,a.mime,a.size,"",null,a.created).run();
  return json(publicAsset(a),201);
 }
 if(path[0]==="key"){if(request.body)await readLimited(request.body,1024);throw new InputError('Key 统一由 confiykey.json 管理，网页不支持写入。',405);}
 if(path[0]==="images"||path[0]==="jobs"){
  const id=identifier(request.headers.get("Idempotency-Key")??""),body=JSON.parse(new TextDecoder().decode(await readLimited(request.body,80000)));
  const saved=await enqueueGeneration(request,owner,id,body,path[0]==='images');return json(saved.job,saved.created?202:200);
 }
 throw new InputError("页面不存在。",404);}catch(e){if(e instanceof SyntaxError)return failure(new InputError("请求格式错误。"));return failure(e);}}

export async function DELETE(request:Request,context:Context){try{
 const owner=await authorize(request),{path}=await context.params;
 if((path[0]==="jobs"||path[0]==="images")&&path[1]&&path.length===2){
  const id=identifier(path[1]),result=await database().prepare(DELETE_RECORD_SQL).bind(Date.now(),id,owner,recordKind(path[0])).run();
  if(!result.meta.changes)throw new InputError("找不到这条记录。",404);
  return json({id,deleted:true});
 }
 if(path[0]!=="key"||path.length!==1)throw new InputError("页面不存在。",404);
 throw new InputError('Key 统一由 confiykey.json 管理，网页不支持清除。',405);
}catch(e){return failure(e);}}
