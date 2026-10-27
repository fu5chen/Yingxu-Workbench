import { database,bucket,runtime } from './server';
import { InputError } from './validation';
import { readLimited } from './server';
import { ossConfigured,signOssUrl } from './oss-storage';
import { detectMedia,httpsUrl,MIB } from './validation';
import type {ChatAttachment,ChatCreationContext,ChatReference} from './chat-creation';

export async function chatCreationReferences(value:unknown,owner:string,materialize=false):Promise<{context:ChatCreationContext;references:ChatReference[]}>{
 const context:ChatCreationContext=value&&typeof value==='object'&&!Array.isArray(value)?value as ChatCreationContext:{};
 const input=context.references??[];
 if(!Array.isArray(input)||input.length>11)throw new InputError('对话最多使用10张参考图片。');
 const references:ChatReference[]=[];
 for(const item of input){
  if(!item||typeof item!=='object')throw new InputError('参考图片格式不正确。');
  const dimensions=(x:ChatAttachment)=>({...(Number.isInteger(x.width)&&x.width!>0&&x.width!<=32000?{width:x.width}:{}),...(Number.isInteger(x.height)&&x.height!>0&&x.height!<=32000?{height:x.height}:{})});
  if(item.id){
   if(typeof item.id!=='string'||!/^[\w-]{8,128}$/.test(item.id))throw new InputError('参考图片编号不正确。');
   const asset=await database().prepare('SELECT id,name,mime FROM assets WHERE id=? AND owner=? AND kind=\'image\'').bind(item.id,owner).first<{id:string;name:string;mime:string}>();
   if(!asset||asset.mime==='image/remote')throw new InputError('参考图片不存在，请重新上传。',404);
   references.push({id:asset.id,name:asset.name,preview:'/api/studio/media/'+asset.id,...dimensions(item)});continue;
  }
  if(item.jobId){
   if(typeof item.jobId!=='string'||!/^[\w-]{8,128}$/.test(item.jobId))throw new InputError('参考作品编号不正确。');
   const job=await database().prepare('SELECT id,request,result,status FROM jobs WHERE id=? AND owner=? AND deleted_at IS NULL').bind(item.jobId,owner).first<{id:string;request:string;result:string;status:string}>();
   if(!job||job.status!=='completed'||JSON.parse(job.request).kind!=='image')throw new InputError('参考作品尚未完成或已删除。',404);
   const result=JSON.parse(job.result),id='chat-ref-'+job.id,existing=await database().prepare('SELECT id FROM assets WHERE id=? AND owner=?').bind(id,owner).first();
   if(!existing&&materialize){
    let bytes:Uint8Array;
    if(result.archived){const object=await bucket().get('generated-images/'+job.id);if(!object||object.size>10*MIB)throw new InputError('参考作品无法读取或超过10MiB。');bytes=new Uint8Array(await object.arrayBuffer());}
    else{const url=result.ossKey&&ossConfigured(runtime)?signOssUrl(runtime,result.ossKey,'GET',300):httpsUrl(result.url);const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new InputError('参考作品链接暂不可用，请刷新图片后重试。',502);bytes=await readLimited(response.body,10*MIB);}
    const mime=detectMedia(bytes,'image','reference.png');await bucket().put('assets/'+id,bytes,{httpMetadata:{contentType:mime}});
    await database().prepare('INSERT OR IGNORE INTO assets(id,owner,kind,name,mime,size,url,created) VALUES(?,?,\'image\',?,?,?,\'\',?)').bind(id,owner,'生成图 '+job.id.slice(0,8),mime,bytes.byteLength,Date.now()).run();
   }
   const saved=JSON.parse(job.request),ratio=saved.aspect_ratio?.match(/^(\d+):(\d+)$/);
   references.push({id,jobId:job.id,name:'刚才生成的图片',preview:'/api/studio/media/'+id,automatic:(item as any).automatic===true,...(ratio?{width:Number(ratio[1]),height:Number(ratio[2])}:{}),...dimensions(item)});continue;
  }
  throw new InputError('请选择已上传的参考图片。');
 }
 return{context,references};
}
