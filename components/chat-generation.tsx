"use client";
import {useEffect,useRef,useState} from 'react';
import {AlertCircle,Download,ImagePlus,LoaderCircle,RefreshCw} from 'lucide-react';
import {IMAGE_MODELS,type ImageModel} from '@/lib/image-models';
import {MODELS,type ModelId} from '@/lib/validation';
import type {ChatAttachment,ChatGenerationJob,ChatGenerationRecord} from '@/lib/chat-creation';

export async function chatImageDimensions(preview:string):Promise<{width?:number;height?:number}>{
 return new Promise(resolve=>{const image=new Image(),timer=setTimeout(()=>{image.onload=null;image.onerror=null;resolve({});},8000);image.onload=()=>{clearTimeout(timer);resolve({width:image.naturalWidth,height:image.naturalHeight});};image.onerror=()=>{clearTimeout(timer);resolve({});};image.src=preview;});
}
export function ChatGeneration({record,job,api,onUpdate,onReference,onPreview}:{record:ChatGenerationRecord;job?:ChatGenerationJob;api:(path:string,init?:RequestInit)=>Promise<any>;onUpdate:(job:ChatGenerationJob)=>void;onReference:(image:ChatAttachment)=>void;onPreview:(job:ChatGenerationJob)=>void}){
 const [value,setValue]=useState<ChatGenerationJob>(job??record),[refresh,setRefresh]=useState(0),[loadError,setLoadError]=useState('');
 const update=useRef(onUpdate);update.current=onUpdate;
 useEffect(()=>{if(job)setValue(job);},[job]);
 useEffect(()=>{
  let active=true,timer:ReturnType<typeof setTimeout>;let misses=0;
  const poll=async()=>{
   try{const result=await api('jobs/'+record.id);if(!active)return;const next={...result,kind:record.kind};setValue(next);update.current(next);setLoadError('');misses=0;if(next.status==='failed'||next.status==='completed'&&next.url&&(!next.mediaStatus||next.mediaStatus==='ready'))return;}
   catch(error){if(!active)return;misses++;if((error as any).status!==404||misses>12)setLoadError('状态暂未取得，可以稍后刷新；请勿重复生成。');if([401,403,410].includes((error as any).status)||(error as any).status===404&&misses>12)return;}
   if(active)timer=setTimeout(poll,Math.min(60000,4000*2**Math.min(misses,4)));
  };timer=setTimeout(poll,600);return()=>{active=false;clearTimeout(timer);};
 },[record.id,record.kind,api,refresh]);
 const pending=['submitting','queued','in_progress'].includes(value.status),completed=value.status==='completed'&&Boolean(value.url);
 const model=value.request.model,name=record.kind==='image'?IMAGE_MODELS[model as ImageModel]?.name:MODELS[model as ModelId]?.name;
 const status=value.contentPending?'准备文件中':({submitting:'正在提交',queued:'排队中',in_progress:'生成中',completed:'已完成',failed:'生成失败',unknown:'结果待确认'} as Record<string,string>)[value.status]??'正在处理';
 return <section className={`chat-generation ${record.kind}`} aria-label={record.kind==='image'?'聊天生成图片':'聊天生成视频'} data-job-id={record.id}>
  <header><strong>{record.kind==='image'?'图片生成':'视频生成'}</strong><span>{status}</span></header>
  {completed?(record.kind==='image'?<button className="chat-generation-image" onClick={()=>onPreview(value)} aria-label="放大生成图片"><img src={value.previewUrl??value.url} alt={value.request.prompt} loading="lazy" decoding="async" onError={()=>setLoadError('图片暂未加载，可点击刷新重新获取。')}/></button>:<video controls playsInline preload="none" src={value.url} poster={value.previewUrl??value.poster} style={{aspectRatio:(value.request.aspect_ratio??'16:9').replace(':',' / ')}}/>):<div className="chat-generation-pending">{pending?<LoaderCircle size={25} className="spin"/>:<AlertCircle size={25}/>}<strong>{status}</strong><p>{value.error??(value.contentPending?'作品已生成，正在准备文件。':'任务已交给生成队列，可以继续聊天。')}</p>{pending&&typeof value.progress==='number'&&<progress max={100} value={value.progress} aria-label="作品生成进度"/>}</div>}
  <footer><span>{name??model} · {value.request.aspect_ratio}{record.kind==='video'?` · ${value.request.duration}秒`:''}</span><div>{completed&&<a href={value.downloadUrl??'/api/studio/download/'+record.id} target="_blank" rel="noopener noreferrer" download><Download size={14}/>下载</a>}{completed&&record.kind==='image'&&<button onClick={async()=>onReference({jobId:value.id,name:'生成图片',preview:value.previewUrl??value.url!,...await chatImageDimensions(value.url!)})}><ImagePlus size={14}/>用作参考</button>}<button aria-label="刷新作品状态" onClick={()=>{setLoadError('');setRefresh(x=>x+1);}}><RefreshCw size={14}/></button></div></footer>
  {loadError&&<p className="chat-generation-error">{loadError}</p>}
 </section>;
}
