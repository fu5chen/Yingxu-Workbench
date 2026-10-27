"use client";
import { ReferencePrompt, type ReferencePromptHandle } from '@/components/reference-prompt';
import { ReferenceMentionMenu, type ReferenceMentionHandle } from '@/components/reference-mention-menu';
import { referenceMention, remapImageReferences, type PromptReference } from '@/lib/reference-prompt';
import { CreationControl, RatioChoice } from "@/components/creation-controls";
import { H3_MODES, type H3Mode, type HyaloriaModel } from '@/lib/hyaloria-options';
import { useEffect, useRef, useState } from "react";
import { uploadRequest } from "@/lib/upload";
import {rememberMediaPreview,mediaPreview,fallbackMediaPreview} from '@/lib/local-media-preview';
import { studioRequest } from "@/lib/studio-api";
import { providerNames } from "@/lib/provider-labels";
import { ChevronDown, SlidersHorizontal, Box, CopyPlus, ArrowUp, Trash2, MessageSquare, Film, ImagePlus, AudioLines, ArrowUpRight, Sparkles, LockKeyhole, KeyRound, History, Monitor, Smartphone, Square, Plus, Play, CircleHelp, X, LoaderCircle, AtSign, RefreshCw, Download, AlertCircle, Check, Images, Maximize2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { DEFAULT_MODEL, MIB, REFERENCE_IMAGE_MAX_BYTES, MODELS, type ModelId, parseGeneration } from "@/lib/validation";

import { IMAGE_MODELS, DEFAULT_IMAGE_MODEL, type ImageModel, imageReferenceLimit, IMAGE_ASPECT_RATIOS, type ImageAspectRatio, imageOutputSize, imageRatios, defaultImageSize } from "@/lib/image-models";

import { ImageReferences, type ImageReference } from "@/components/image-references";
import { imagePending, imageStatusMessage } from "@/lib/image-status";
import { LIMITED_VIDEO_MODEL, videoQuotaMessage, type VideoQuota } from "@/lib/video-quota";

import { PortraitLibraryNotice, PortraitStatus, usePortraitLibrary, type Portrait } from "@/components/portrait-library";
import { ChatStudio } from "@/components/chat-studio";
import type {ChatGenerationJob} from '@/lib/chat-creation';
import {INITIAL_IMAGE_MODEL,INITIAL_VIDEO_MODEL,INITIAL_VIDEO_MODE,imageDraftFor,saveImageDraft} from '@/lib/studio-preferences';
import { ACTIVE_VIDEO_MODELS, ACTIVE_IMAGE_MODELS, isActiveVideoModel } from "@/lib/active-models";

import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";

type Kind="image"|"video"|"audio";
type Provider="paipu_chat"|"hyaloria"|"krea2"|"paipu"|"modelflare"|"linkomobile"|"byteplus"|"byteplus_image";
type Asset={portrait?:Portrait;id:string;kind:Kind;name:string;size:number;preview:string;expires?:string;providerReady?:boolean;remoteImage?:boolean;file?:File;state?:"uploading"|"failed"|"ready";error?:string};
type Job={id:string;upstream?:string;status:string;progress?:number|null;url?:string;previewUrl?:string;poster?:string;downloadUrl?:string;mediaStatus?:string;contentPending?:boolean;error?:string;pollError?:string;created:number;request:{h3_mode?:H3Mode;model:ModelId;prompt:string;duration:number;resolution?:"480p"|"720p"|"1080p"|"4k"|"3MP"|"768P"|"480P";aspect_ratio:string;images:Asset[];videos?:Asset[];audios:Asset[]}};
type ImageSize=string;

type ImageJob={id:string;status:string;url?:string;previewUrl?:string;downloadUrl?:string;mediaStatus?:string;contentPending?:boolean;error?:string;created:number;request:{kind:"image";model:string;prompt:string;size?:ImageSize;aspect_ratio?:ImageAspectRatio;images?:string[]}};
const statusText:Record<string,string>={submitting:"正在提交",queued:"排队中",in_progress:"生成中",completed:"已完成",failed:"生成失败",unknown:"待确认"};
const example="以 @图片1 为视觉参考，生成电影感城市长镜头。镜头沿街道缓缓向前推进，暖色阳光穿过建筑间隙，保持主体与画面风格一致。";
function ensureStudioClient(){
 if(typeof document==="undefined")return;
 if(document.cookie.split(";").some(part=>part.trim().startsWith("studio_client=")))return;
 let id="";
 try{
  id=localStorage.getItem("studio-client-id")??"";
  if(!/^[0-9a-f-]{36}$/i.test(id)){id=crypto.randomUUID();localStorage.setItem("studio-client-id",id);}
 }catch{id=crypto.randomUUID();}
 document.cookie=`studio_client=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; Secure; SameSite=Strict`;
}
async function api(path:string,init?:RequestInit){
 ensureStudioClient();
 return studioRequest(path,init);
}
export default function Studio(){
 const [deleteTarget,setDeleteTarget]=useState<{id:string;kind:"image"|"video";status:string}|null>(null),[deleting,setDeleting]=useState(false),[deleteError,setDeleteError]=useState("");
 const deletedIds=useRef(new Set<string>()),deleteLock=useRef(false);
 async function restoreRecord(target:{id:string;kind:"image"|"video"}){
  try{const restored=await api(`${target.kind==="image"?"images":"jobs"}/${target.id}/restore`,{method:"POST"});deletedIds.current.delete(target.id);if(target.kind==="image")setImageJobs(p=>[restored,...p.filter(j=>j.id!==target.id)].sort((a,b)=>b.created-a.created));else{mergeJob(restored);setSelected(restored.id);}toast.success("已恢复记录");}catch(e){toast.error((e as Error).message,{action:{label:"重试恢复",onClick:()=>void restoreRecord(target)}});}
 }
 async function deleteRecord(){
  if(!deleteTarget||deleteLock.current)return;const target=deleteTarget;deleteLock.current=true;setDeleting(true);setDeleteError("");deletedIds.current.add(target.id);
  try{await api(`${target.kind==="image"?"images":"jobs"}/${target.id}`,{method:"DELETE"});if(target.kind==="image"){setImageJobs(p=>p.filter(j=>j.id!==target.id));setImagePreview(p=>p?.id===target.id?null:p);}else{setJobs(p=>p.filter(j=>j.id!==target.id));setSelected(p=>p===target.id?null:p);setPollError("");}setDeleteTarget(null);toast.success(target.kind==="image"?"图片记录已删除":"视频记录已删除",{action:{label:"撤销",onClick:()=>void restoreRecord(target)}});}catch(e){deletedIds.current.delete(target.id);setDeleteError((e as Error).message);}finally{deleteLock.current=false;setDeleting(false);}
 }
 function askDelete(id:string,kind:"image"|"video",status:string){setDeleteError("");setDeleteTarget({id,kind,status});}
 const [h3ImageUrl,setH3ImageUrl]=useState("");
 const [generateAudio,setGenerateAudio]=useState(true),[videoUrl,setVideoUrl]=useState("");
 const [model,setModel]=useState<ModelId>(INITIAL_VIDEO_MODEL),[duration,setDuration]=useState(5),[resolution,setResolution]=useState<"480p"|"720p"|"1080p"|"4k"|"3MP"|"768P"|"480P">("768P"),[ratio,setRatio]=useState("16:9"),[prompt,setPrompt]=useState("");
 const [assets,setAssets]=useState<Asset[]>([]),[uploading,setUploading]=useState(false),[submitting,setSubmitting]=useState(false);
 const [quota,setQuota]=useState<VideoQuota|null>(null);
 const [jobs,setJobs]=useState<Job[]>([]),[selected,setSelected]=useState<string|null>(null),[error,setError]=useState(""),[pollError,setPollError]=useState("");
 const [providerConfig,setProviderConfig]=useState<Record<Provider,{configured:boolean;personalKey:boolean;defaultKey?:boolean}>>({paipu_chat:{configured:false,personalKey:false},hyaloria:{configured:false,personalKey:false},krea2:{configured:false,personalKey:false},byteplus_image:{configured:false,personalKey:false},byteplus:{configured:false,personalKey:false},paipu:{configured:false,personalKey:false},modelflare:{configured:false,personalKey:false},linkomobile:{configured:false,personalKey:false}}),[historyReady,setHistoryReady]=useState(false),[mention,setMention]=useState<{start:number;end:number;query:string}|null>(null);
 const [keyOpen,setKeyOpen]=useState(false),[keyProvider,setKeyProvider]=useState<Provider>("byteplus"),[historyOpen,setHistoryOpen]=useState(false),[loadingHistory,setLoadingHistory]=useState(false);
 const [mode,setMode]=useState<"video"|"image"|"chat">("image"),[imagePrompt,setImagePrompt]=useState(""),[imageModel,setImageModel]=useState<ImageModel>(INITIAL_IMAGE_MODEL),[imageSize,setImageSize]=useState<ImageSize>("6MP"),[imageRatio,setImageRatio]=useState<ImageAspectRatio>("1:1"),[imageJobs,setImageJobs]=useState<ImageJob[]>([]),[imageSubmitting,setImageSubmitting]=useState(false);
 const [imageReferences,setImageReferences]=useState<ImageReference[]>([]),[imageUploading,setImageUploading]=useState(false);
 const [imagePreview,setImagePreview]=useState<{url:string;downloadUrl?:string;prompt:string;id:string}|null>(null);
 const imageInput=useRef<HTMLInputElement>(null),videoInput=useRef<HTMLInputElement>(null),audioInput=useRef<HTMLInputElement>(null),textarea=useRef<ReferencePromptHandle>(null),mentionMenu=useRef<ReferenceMentionHandle>(null);
 const uploadLock=useRef(false),submitLock=useRef(false),pollLock=useRef(false),draftLoaded=useRef(false);
 const assetsRef=useRef(assets),mediaLibrary=useRef<Asset[]>([]);assetsRef.current=assets;
 const images=assets.filter(a=>a.kind==="image"),videos=assets.filter(a=>a.kind==="video"),audios=assets.filter(a=>a.kind==="audio");
 const [h3Mode,setH3Mode]=useState<H3Mode>(INITIAL_VIDEO_MODE),[hyaloriaModels,setHyaloriaModels]=useState<Record<string,HyaloriaModel>>({}),[modelsError,setModelsError]=useState('');
 const modelSpec={...MODELS[model],...(model==='h3'?H3_MODES[h3Mode]:{}),name:MODELS[model].name};
 const h3Modes=(hyaloriaModels.h3?.modes??Object.keys(H3_MODES)).filter(value=>Object.hasOwn(H3_MODES,value)) as H3Mode[];
 const quotaReason=model===LIMITED_VIDEO_MODEL?quota?videoQuotaMessage(quota,duration):"正在读取模型额度，请稍候。":"";
 const imageSpec=IMAGE_MODELS[imageModel],imageProvider=imageSpec.provider;
 const currentProvider=modelSpec.provider as Provider,configured=providerConfig[currentProvider].configured,personalKey=providerConfig[currentProvider].personalKey;
 const portraits=usePortraitLibrary(assets,setAssets,currentProvider==="byteplus",api);
 const imagesPending=imageJobs.some(j=>imagePending(j.status));
 const pendingMedia=(j:{status:string;mediaStatus?:string})=>j.status==="completed"&&["pending","processing","retrying"].includes(j.mediaStatus??"");
 const imageMediaPending=imageJobs.some(pendingMedia);
 const lastSubmission=useRef({fingerprint:"",time:0});
 useEffect(()=>{
  let alive=true;
  const refresh=()=>{for(const [provider,target]of [['hyaloria','h3'],['krea2','krea2']] as const){if(!providerConfig[provider].configured)continue;void api(`hyaloria-models?provider=${provider}`).then(result=>{if(alive){setHyaloriaModels(previous=>({...previous,[target]:result.models[target]??{}}));setModelsError('');}}).catch(()=>{if(alive)setModelsError('模式列表暂未读取，提交时会再次校验。');});}};
  refresh();window.addEventListener('focus',refresh);return()=>{alive=false;window.removeEventListener('focus',refresh);};
 },[providerConfig.hyaloria.configured,providerConfig.krea2.configured]);
 useEffect(()=>{const available=hyaloriaModels.h3?.modes;if(available?.length&&!available.includes(h3Mode)){const next=(hyaloriaModels.h3.default_mode??available[0]) as H3Mode;chooseH3Mode(next);}},[hyaloriaModels.h3]);
 const latestJobs=useRef(jobs);latestJobs.current=jobs;
 const job=jobs.find(j=>j.id===selected)??null;
 const active=jobs.some(j=>["submitting","queued","in_progress"].includes(j.status));
 function mergeJob(j:Job){if(deletedIds.current.has(j.id))return;setJobs(previous=>[j,...previous.filter(x=>x.id!==j.id)].sort((a,b)=>b.created-a.created));}
 useEffect(()=>{
  let alive=true,timer:ReturnType<typeof setTimeout>;let startupError="";
  const initialize=()=>Promise.all([api("config"),api("jobs"),api("assets"),api("images")]).then(([config,history,media,pictures])=>{
   if(!alive)return;setProviderConfig(config.providers);setQuota(config.videoQuota);setJobs(history.jobs.filter((j:Job)=>!deletedIds.current.has(j.id)));setImageJobs(pictures.images);setSelected(history.jobs[0]?.id??null);setHistoryReady(true);
   mediaLibrary.current=media.assets;
   try{const draft=JSON.parse(localStorage.getItem('seedance-draft')??'null');if(draft){const same=draft.model===INITIAL_VIDEO_MODEL,restoredMode=same&&Object.hasOwn(H3_MODES,draft.h3_mode)?draft.h3_mode as H3Mode:INITIAL_VIDEO_MODE,spec=H3_MODES[restoredMode];setModel(INITIAL_VIDEO_MODEL);setH3Mode(restoredMode);setPrompt(typeof draft.prompt==='string'?Array.from(draft.prompt).slice(0,8000).join(''):'');setDuration(same&&Number.isInteger(draft.duration)&&draft.duration>=spec.minDuration&&draft.duration<=spec.maxDuration?draft.duration:5);setResolution(same&&(spec.resolutions as readonly string[]).includes(draft.resolution)?draft.resolution:spec.resolution);setRatio((MODELS[INITIAL_VIDEO_MODEL].ratios as readonly string[]).includes(draft.ratio)?draft.ratio:'16:9');setAssets((Array.isArray(draft.ids)?draft.ids:[]).map((id:string)=>media.assets.find((a:Asset)=>a.id===id)).filter(Boolean));}}catch{}
   try{const savedMode=localStorage.getItem('studio-active-mode');if(savedMode==='image'||savedMode==='video'||savedMode==='chat')setMode(savedMode);const draft=imageDraftFor(localStorage,INITIAL_IMAGE_MODEL);if(draft){setImagePrompt(typeof draft.prompt==='string'?Array.from(draft.prompt).slice(0,8000).join(''):'');setImageSize((IMAGE_MODELS[INITIAL_IMAGE_MODEL].sizes as readonly string[]).includes(draft.size)?draft.size:defaultImageSize(INITIAL_IMAGE_MODEL));setImageRatio((imageRatios(INITIAL_IMAGE_MODEL) as readonly string[]).includes(draft.ratio)?draft.ratio as ImageAspectRatio:'1:1');}}catch{}
   draftLoaded.current=true;setError(previous=>previous===startupError?"":previous);
  }).catch(e=>{if(alive){startupError=e.message;setError(startupError);timer=setTimeout(initialize,15000);}});
  void initialize();
  return()=>{alive=false;clearTimeout(timer);};
 },[]);
 useEffect(()=>{
  if(!historyReady)return;
  let canceled=false;let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{
   try{const data=await api("images");if(!canceled)setImageJobs(previous=>{
    const incoming=data.images.filter((j:ImageJob)=>!deletedIds.current.has(j.id));
    const ids=new Set(incoming.map((j:ImageJob)=>j.id));
    return [...incoming,...previous.filter(j=>imagePending(j.status)&&!ids.has(j.id)&&!deletedIds.current.has(j.id))].sort((a,b)=>b.created-a.created);
   });}catch{}
   if(!canceled)timer=setTimeout(poll,imageSubmitting||imagesPending||imageMediaPending?5000:15000);
  };
  timer=setTimeout(poll,3000);return()=>{canceled=true;clearTimeout(timer);};
 },[historyReady,imageSubmitting,imagesPending,imageMediaPending]);
 useEffect(()=>{
  if(!historyReady)return;let canceled=false;let timer:ReturnType<typeof setTimeout>;
  const refreshQuota=async()=>{try{const next=await api("video-quota");if(!canceled)setQuota(next);}catch{if(!canceled)setQuota(null);}};
  const tick=async()=>{await refreshQuota();if(!canceled)timer=setTimeout(tick,10000);};
  const onFocus=()=>{void refreshQuota();};
  timer=setTimeout(tick,10000);window.addEventListener("focus",onFocus);
  return()=>{canceled=true;clearTimeout(timer);window.removeEventListener("focus",onFocus);};
 },[historyReady]);
 useEffect(()=>{if(draftLoaded.current){try{localStorage.setItem("seedance-draft",JSON.stringify({model,h3_mode:h3Mode,prompt,duration,resolution,ratio,ids:assets.filter(a=>!a.state||a.state==="ready").map(a=>a.id)}));}catch{}}},[model,h3Mode,prompt,duration,resolution,ratio,assets]);
 function chooseModel(next:ModelId){if(!isActiveVideoModel(next))return;if(next===LIMITED_VIDEO_MODEL&&(!quota||quota.unavailable)){setError(quota?videoQuotaMessage(quota):"模型额度暂未就绪，请稍候。");return;}const spec={...MODELS[next],...(next==='h3'?H3_MODES[h3Mode]:{})};setModel(next);if(!(spec.ratios as readonly string[]).includes(ratio))setRatio("16:9");if(!(spec.resolutions as readonly string[]).includes(resolution))setResolution(spec.resolution);if(spec.fixedDuration!==null)setDuration(spec.fixedDuration);else setDuration(d=>Math.max(spec.minDuration,Math.min(spec.maxDuration,d)));setError(spec.maxAudios===0&&audios.length?`${spec.name} 不支持音频参考，请移除音频素材后生成。`:spec.maxVideos===0&&videos.length?`${spec.name} 不支持视频参考，请移除视频素材后生成。`:"");}
 function chooseH3Mode(next:H3Mode){const spec=H3_MODES[next];setH3Mode(next);setResolution(spec.resolution);setDuration(value=>Math.max(spec.minDuration,Math.min(spec.maxDuration,value)));}
 function chooseImageModel(next:ImageModel){
  let remembered=null;try{saveImageDraft(localStorage,{model:imageModel,prompt:imagePrompt,size:imageSize,ratio:imageRatio,ids:imageReferences.map(a=>a.id)});if(next!==imageModel&&!imagePrompt.trim())remembered=imageDraftFor(localStorage,next);}catch{}
  setImageModel(next);const spec=IMAGE_MODELS[next];if(remembered){setImagePrompt(typeof remembered.prompt==='string'?remembered.prompt:'');setImageSize((spec.sizes as readonly string[]).includes(remembered.size)?remembered.size:defaultImageSize(next));setImageRatio((imageRatios(next) as readonly string[]).includes(remembered.ratio)?remembered.ratio as ImageAspectRatio:next==='krea2'?'1:1':'adaptive');const available=[...imageReferences,...mediaLibrary.current];setImageReferences(imageReferenceLimit(next)?(Array.isArray(remembered.ids)?remembered.ids:[]).map(id=>available.find(a=>a.id===id)).filter((a):a is ImageReference=>Boolean(a)):[]);return;}
  if(next!==imageModel||!(spec.sizes as readonly string[]).includes(imageSize))setImageSize(defaultImageSize(next));if(!(imageRatios(next) as readonly string[]).includes(imageRatio))setImageRatio(next==='krea2'?'2:3':'adaptive');if(imageReferenceLimit(next)===0&&imageReferences.length){setImageReferences([]);toast.info('当前模型仅支持纯文字生图，已移除本次参考图。');}
 }
 useEffect(()=>{
  if(!historyReady)return;let canceled=false;let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{
   if(pollLock.current){timer=setTimeout(poll,8000);return;}pollLock.current=true;let wait=8000;
   try{const listing=await api("jobs");if(canceled)return;setPollError("");setJobs(previous=>{const incoming=listing.jobs.filter((j:Job)=>!deletedIds.current.has(j.id)),ids=new Set(incoming.map((j:Job)=>j.id));return [...incoming,...previous.filter(j=>["submitting","unknown"].includes(j.status)&&!ids.has(j.id)&&!deletedIds.current.has(j.id))].sort((a,b)=>b.created-a.created);});for(const current of latestJobs.current.filter(j=>j.upstream&&!['completed','failed'].includes(j.status))){const next=await api(`jobs/${current.id}`);if(canceled)return;mergeJob(next);setPollError(next.pollError??"");if(next.status==="completed")toast.success("视频生成完成");}}
   catch(e){if(!canceled){setPollError((e as Error).message);wait=Math.max(15000,((e as any).retryAfter??0)*1000);}}
   finally{pollLock.current=false;if(!canceled)timer=setTimeout(poll,wait);}
  };timer=setTimeout(poll,8000);return()=>{canceled=true;clearTimeout(timer)};
 },[historyReady]);
 useEffect(()=>()=>{for(const a of assetsRef.current)if(a.preview.startsWith("blob:"))URL.revokeObjectURL(a.preview);},[]);
 useEffect(()=>{if(!imagePreview)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setImagePreview(null);};window.addEventListener("keydown",close);return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",close);};},[imagePreview]);
 function token(a:Asset){const group=assets.filter(x=>x.kind===a.kind);return `@${a.kind==="image"?"图片":a.kind==="video"?"视频":"音频"}${group.findIndex(x=>x.id===a.id)+1}`;}
 function insertReference(asset:Asset|PromptReference){
  const reference='token'in asset?asset:{...asset,token:token(asset)},editor=mode==='image'?imageTextarea.current:textarea.current,value=mode==='image'?imagePrompt:prompt;
  const text=reference.token+' ',start=mention?.start??editor?.selectionStart??value.length,end=mention?.end??editor?.selectionEnd??start;
  if(Array.from(value.slice(0,start)+text+value.slice(end)).length>8000){toast.error('提示词最多 8000 个字符');return;}
  editor?.replaceRange(start,end,text);setMention(null);
 }
 function changePrompt(value:string,cursor:number){const next=Array.from(value).slice(0,8000).join('');mode==='image'?setImagePrompt(next):setPrompt(next);setMention(mode==='image'&&imageReferenceLimit(imageModel)===0?null:referenceMention(next,cursor));}
 function changeImageReferences(next:ImageReference[]){setImagePrompt(value=>remapImageReferences(value,imageReferences,next));setImageReferences(next);setMention(null);}
 function createMentionSubject(){setMention(null);if(mode==='image')document.querySelector<HTMLInputElement>('input[aria-label="上传参考图片"]')?.click();else imageInput.current?.click();}
 function useExample(){if(model==="lec-seedance-2-5-30s")setPrompt(images.length?"根据 @图片1 的人物和场景参考，生成连贯的电影感短片。":"根据人物和场景参考生成连贯的电影感短片。");else if(model==="lec-ac-seedance-2-5-all-reference"&&images.length>=3)setPrompt("根据 @图片1、@图片2 和 @图片3 的正面、侧面与背面参考，生成连贯的电影感视频。");else setPrompt(images.length?example:example.replace("以 @图片1 为视觉参考，",""));}
 function removeAsset(a:Asset){
  const index=assets.filter(x=>x.kind===a.kind).findIndex(x=>x.id===a.id)+1;const label=a.kind==="image"?"图片":a.kind==="video"?"视频":"音频";
  setPrompt(p=>p.replace(new RegExp(`@${label}(\\d+)`,"g"),(full,n)=>Number(n)===index?`[已移除${label}]`:Number(n)>index?`@${label}${Number(n)-1}`:full));
  setAssets(p=>p.filter(x=>x.id!==a.id));if(a.preview.startsWith("blob:"))URL.revokeObjectURL(a.preview);setMention(null);
 }
 async function uploadAsset(asset:Asset){
  setAssets(p=>p.map(a=>a.id===asset.id?{...a,state:"uploading",error:undefined}:a));
  try{const saved=await api(`upload?kind=${asset.kind}`,uploadRequest(asset.file!,asset.id));rememberMediaPreview(saved.id,asset.file!);setAssets(p=>p.map(a=>a.id===asset.id?{...saved,state:"ready"}:a));setError("");URL.revokeObjectURL(asset.preview);}
  catch(e){const message=(e as Error).message;try{const media=await api("assets");const existing=media.assets.find((a:Asset)=>a.id===asset.id);if(existing){setAssets(p=>p.map(a=>a.id===asset.id?{...existing,state:"ready"}:a));setError("");URL.revokeObjectURL(asset.preview);toast.success(`已恢复刚才上传的「${asset.name}」`);return;}}catch{}setAssets(p=>p.map(a=>a.id===asset.id?{...a,state:"failed",error:message}:a));setError(message);if(message.includes("API 密钥")||message.includes("API Key"))setKeyOpen(true);}
 }
 async function chooseFiles(list:FileList|File[],kind:Kind){
  if(uploadLock.current||submitting)return;const files=Array.from(list);if(!files.length)return;setError("");
  const count=assetsRef.current.filter(a=>a.kind===kind).length;const max=kind==="image"?modelSpec.maxImages:kind==="video"?modelSpec.maxVideos:modelSpec.maxAudios;
  if(kind==="audio"&&max===0){setError(`${modelSpec.name} 不支持音频参考。`);return;}
  if(kind==="video"&&max===0){setError(`${modelSpec.name} 不支持视频参考。`);return;}
  if(currentProvider==="byteplus"){
   if(kind==="video"){setError("视频参考请在下方添加 MP4 / MOV HTTPS 链接。");return;}
   if(kind==="audio"&&files.some(f=>!/\.(mp3|wav)$/i.test(f.name))){setError("音频参考仅支持 MP3 / WAV。");return;}
   if(kind==="audio"&&assetsRef.current.filter(a=>a.kind==="audio").reduce((n,a)=>n+a.size,0)+files.reduce((n,f)=>n+f.size,0)>12*MIB){setError("本地音频参考合计最多 12 MiB，请压缩后重试。");return;}
  }
  const limit=kind==="image"?30:kind==="video"?100:30;
  const extension=kind==="image"?/\.(png|jpe?g|webp)$/i:kind==="video"?/\.(mp4|mov|webm)$/i:/\.(mp3|wav|ogg|m4a)$/i;
  for(const f of files){if(!f.size||(kind==="image"?f.size>=REFERENCE_IMAGE_MAX_BYTES:f.size>limit*MIB)){setError(`「${f.name}」${!f.size?"是空文件":kind==="image"?"须小于 30 MB":`超过 ${limit} MiB 限制`}。`);return;}if(!extension.test(f.name)){setError(kind==="image"?"请上传 JPG、PNG 或 WebP 图片。":kind==="video"?"请上传 MP4、MOV 或 WebM 视频。":"请上传 MP3、WAV、Ogg 或 M4A 音频。");return;}}
  const fresh:Asset[]=[];
  for(const file of files){const duplicate=assetsRef.current.some(a=>a.kind===kind&&a.name===file.name&&a.size===file.size)||fresh.some(a=>a.name===file.name&&a.size===file.size);if(!duplicate)fresh.push({id:crypto.randomUUID(),kind,name:file.name,size:file.size,preview:URL.createObjectURL(file),file,state:"uploading"});}
  const additions=fresh.length;if(!additions){toast.success("这些素材已经在当前草稿中");return;}
  const totalMax=modelSpec.maxImages+modelSpec.maxVideos+modelSpec.maxAudios;
  if(count+additions>max||assetsRef.current.length+additions>totalMax){for(const a of fresh)URL.revokeObjectURL(a.preview);const label=kind==="image"?"图片":kind==="video"?"视频":"音频";setError(`${label}最多 ${max} 个，素材合计最多 ${totalMax} 个。`);return;}
  uploadLock.current=true;setUploading(true);
  setAssets(p=>[...p,...fresh]);try{let next=0;await Promise.all(Array.from({length:Math.min(2,fresh.length)},async()=>{while(next<fresh.length)await uploadAsset(fresh[next++]);}));}finally{uploadLock.current=false;setUploading(false);}
 }
 async function retryAsset(a:Asset){if(uploadLock.current)return;uploadLock.current=true;setUploading(true);await uploadAsset(a);uploadLock.current=false;setUploading(false);}
 async function generate(){
  if(uploadLock.current||quotaReason||portraitReason){if(quotaReason||portraitReason)setError(quotaReason||portraitReason);return;}
  setError("");let body;
  try{const request:{h3_mode?:H3Mode;generate_audio:boolean;model:ModelId;prompt:string;duration:number;resolution:string;aspect_ratio:string;images:string[];audios:string[];videos?:string[]}={generate_audio:generateAudio,model,prompt,duration,resolution,aspect_ratio:ratio,images:images.map(a=>a.id),audios:audios.map(a=>a.id)};if(model==='h3')request.h3_mode=h3Mode;if(modelSpec.maxVideos>0)request.videos=videos.map(a=>a.id);body=parseGeneration(request);if(assets.some(a=>a.state&&a.state!=="ready"))throw new Error("请先完成全部素材上传，或移除失败素材。");for(const match of prompt.matchAll(/@(图片|视频|音频)(\d+)/g)){const group=match[1]==="图片"?images:match[1]==="视频"?videos:audios;if(Number(match[2])<1||Number(match[2])>group.length)throw new Error(`「${match[0]}」没有对应素材，请重新选择引用。`);}if(prompt.includes("[已移除"))throw new Error("请修改描述中已移除的素材引用。");}
  catch(e){setError((e as Error).message);return;}

  const fingerprint=JSON.stringify({kind:"video",...body});if(lastSubmission.current.fingerprint===fingerprint&&Date.now()-lastSubmission.current.time<800)return;lastSubmission.current={fingerprint,time:Date.now()};
  const id=crypto.randomUUID(),snapshot={...body,images:images.map(a=>({...a})),videos:videos.map(a=>({...a})),audios:audios.map(a=>({...a}))};
  mergeJob({id,status:"submitting",created:Date.now(),request:snapshot});setSelected(id);setResultFilter("all");setPrompt("");
  if(model===LIMITED_VIDEO_MODEL)setQuota(q=>q?{...q,reserved:q.reserved+body.duration,remaining:Math.max(0,q.remaining-body.duration),unavailable:q.remaining-body.duration<4}:q);
  void api("jobs",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":id},body:JSON.stringify(body)}).then(next=>{mergeJob(next);toast.success("已加入任务列表，可以继续下一次创作");}).catch(e=>{mergeJob({id,status:(e as any).status>=400&&(e as any).status<500?"failed":"unknown",created:Date.now(),request:snapshot,error:(e as Error).message});toast.error((e as Error).message);}).finally(()=>{void api("video-quota").then(setQuota).catch(()=>{});});
 }

 async function refresh(j:Job){if(pollLock.current)return;pollLock.current=true;try{const next=await api(`jobs/${j.id}`);mergeJob(next);setPollError(next.pollError??"");}catch(e){setPollError((e as Error).message);}finally{pollLock.current=false;}}
 async function openHistory(){setHistoryOpen(true);setLoadingHistory(true);try{const result=await api("jobs");result.jobs=result.jobs.filter((j:Job)=>!deletedIds.current.has(j.id));setJobs(result.jobs);const target=result.jobs.find((j:Job)=>j.id===selected)??result.jobs[0];setSelected(target?.id??null);if(target?.upstream&&target.status==="completed")void refresh(target);}catch(e){setError((e as Error).message);}finally{setLoadingHistory(false);}}
 async function generateImage(){
  if(imageUploading||!imagePrompt.trim())return;if(imageReferences.length>imageReferenceLimit(imageModel)){setError("参考图数量超出当前模型限制。");return;}
  if(imagePrompt.includes('[已移除')||Array.from(imagePrompt.matchAll(/@图片(\d+)/g)).some(match=>Number(match[1])<1||Number(match[1])>imageReferences.length)){setError('请修改描述中不存在或已移除的素材引用。');return;}
  const body={model:imageModel,prompt:imagePrompt,size:imageSize,aspect_ratio:imageRatio,images:imageReferences.map(x=>x.id)},fingerprint=JSON.stringify({kind:"image",...body});
  if(lastSubmission.current.fingerprint===fingerprint&&Date.now()-lastSubmission.current.time<800)return;lastSubmission.current={fingerprint,time:Date.now()};
  const id=crypto.randomUUID(),snapshot={id,status:"submitting",created:Date.now(),request:{kind:"image" as const,...body}};
  setImageJobs(previous=>[snapshot,...previous]);setImagePrompt("");setResultFilter("all");setError("");
  void api("images",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":id},body:JSON.stringify(body)}).then(next=>{if(!deletedIds.current.has(id))setImageJobs(previous=>[next,...previous.filter(j=>j.id!==id)].sort((a,b)=>b.created-a.created));toast.success("已加入任务列表，可以继续下一次创作");}).catch(e=>{setImageJobs(previous=>previous.map(j=>j.id===id?{...j,status:(e as any).status>=400&&(e as any).status<500?"failed":"unknown",error:(e as Error).message}:j));toast.error((e as Error).message);});
 }
 function updateChatGeneration(value:ChatGenerationJob){
  if(deletedIds.current.has(value.id))return;
  if(value.kind==='image')setImageJobs(previous=>[value as unknown as ImageJob,...previous.filter(job=>job.id!==value.id)].sort((a,b)=>b.created-a.created));
  else mergeJob(value as unknown as Job);
 }
 useEffect(()=>{
  const context=(document as any).modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();
  context.registerTool({name:"configure_video_draft",title:"设置视频草稿",description:"选择视频模型并设置提示词、时长、分辨率与画幅，仅修改草稿，不上传或提交付费任务。",inputSchema:{type:"object",properties:{model:{type:"string",enum:ACTIVE_VIDEO_MODELS},prompt:{type:"string",maxLength:8000},duration:{type:"integer",minimum:4,maximum:30},h3_mode:{type:"string",enum:["hd","fast","raw"]},resolution:{type:"string",enum:["480p","720p","1080p","4k","3MP","768P","480P"]},aspect_ratio:{type:"string",enum:["16:9","9:16","1:1","2:3","3:2","3:4","4:3","21:9","adaptive"]}},additionalProperties:false},execute:async(input:any)=>{const target=(input.model??DEFAULT_MODEL) as ModelId;if(!isActiveVideoModel(target))throw new Error("模型不支持");const selectedMode=(Object.hasOwn(H3_MODES,input.h3_mode)?input.h3_mode:'hd') as H3Mode,spec={...MODELS[target],...(target==='h3'?H3_MODES[selectedMode]:{})};if(target==='h3')setH3Mode(selectedMode);if(input.prompt!==undefined){if(typeof input.prompt!=="string"||Array.from(input.prompt).length>8000)throw new Error("提示词最多 8000 字符");setPrompt(input.prompt);}if(input.duration!==undefined&&(!Number.isInteger(input.duration)||input.duration<spec.minDuration||input.duration>spec.maxDuration||spec.fixedDuration!==null&&input.duration!==spec.fixedDuration))throw new Error(spec.fixedDuration!==null?`${spec.name} 固定 ${spec.fixedDuration} 秒`:`时长范围为 ${spec.minDuration}–${spec.maxDuration} 秒`);setDuration(spec.fixedDuration??input.duration??spec.maxDuration);setModel(target);if(input.resolution!==undefined){if(!(spec.resolutions as readonly string[]).includes(input.resolution))throw new Error("所选模型不支持这个分辨率");setResolution(input.resolution);}else setResolution(spec.resolution);if(input.aspect_ratio!==undefined){if(!(spec.ratios as readonly string[]).includes(input.aspect_ratio))throw new Error("所选模型不支持这个画幅");setRatio(input.aspect_ratio);}else if(!(spec.ratios as readonly string[]).includes(ratio))setRatio("16:9");await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));return{updated:true,submitted:false,model:target};}},{signal:lifecycle.signal});return()=>lifecycle.abort();
 },[]);
 const audioNeedsVisual=(model==="dreamina-seedance-2-0-260128"||model==="h3")&&audios.length>0&&!images.length&&!videos.length;
 const portraitReason=currentProvider==="byteplus"&&images.some(a=>a.portrait&&a.portrait.status!=="NotImported"&&a.portrait.status!=="Active")?"虚拟角色尚未入库成功，请点击参考图查看审核状态。":"";
 const ready=Boolean(!portraitReason&&!quotaReason&&(model!=="h3"||h3Modes.includes(h3Mode))&&!audioNeedsVisual&&configured&&images.length>=modelSpec.minImages&&prompt.trim()&&!uploading&&!submitting&&images.length<=modelSpec.maxImages&&audios.length<=modelSpec.maxAudios&&videos.length<=modelSpec.maxVideos&&assets.every(a=>!a.state||a.state==="ready"));
 const [resultFilter,setResultFilter]=useState<"all"|"completed"|"pending">("all");
 const [mediaFailures,setMediaFailures]=useState<Record<string,boolean>>({});
 const [videoPreview,setVideoPreview]=useState<Job|null>(null);
 const worksRef=useRef<HTMLElement>(null),imageTextarea=useRef<ReferencePromptHandle>(null);
 const currentPrompt=mode==="image"?imagePrompt:prompt;
 const promptReferences:PromptReference[]=mode==='image'?imageReferences.map((asset,index)=>({...asset,kind:'image' as const,token:'@图片'+(index+1)})):assets.filter(asset=>!asset.state||asset.state==='ready').map(asset=>({...asset,token:token(asset)}));
 const currentKeyConfigured=mode==="chat"?providerConfig.paipu_chat.configured:mode==="image"?providerConfig[imageProvider].configured:configured;
 const busyGenerating=mode==="image"?imageSubmitting:submitting;
 const canGenerate=mode==="image"?Boolean((imageModel!=='krea2'||!hyaloriaModels.krea2?.modes||hyaloriaModels.krea2.modes.includes('story'))&&providerConfig[imageProvider].configured&&imagePrompt.trim()&&!imageSubmitting&&!imageUploading&&imageReferences.length<=imageReferenceLimit(imageModel)):ready;
 const visibleImages=imageJobs.filter(j=>resultFilter==="all"||resultFilter==="completed"&&j.status==="completed"||resultFilter==="pending"&&imagePending(j.status));
 const visibleVideos=jobs.filter(j=>resultFilter==="all"||resultFilter==="completed"&&j.status==="completed"||resultFilter==="pending"&&["submitting","queued","in_progress","unknown"].includes(j.status));
 const promptIdeas=mode==="image"?[
  {name:"产品摄影",prompt:"一只蓝色陶瓷杯，放在浅米色桌面上。柔和的侧面自然光，干净背景，真实的材质细节，杂志产品摄影。"},
  {name:"电影感画面",prompt:"雨后的城市街角，一位撑伞的行人走过霓虹灯下。冷暖对比光，电影感构图，胶片质感，安静而有故事。"},
  {name:"海报设计",prompt:"设计一张秋日咖啡市集海报，咖啡杯、枫叶与手写元素，奶油色和焦糖色，留白舒适，标题为“秋日好时光”。"},
  {name:"参考图改色",prompt:"将图1中主体的颜色改成蓝色，保留原来的形状、材质、构图和光照，整体效果自然。"},
 ]:[
  {name:"电影运镜",prompt:"镜头从街道一侧缓慢向前推进，暖色阳光穿过建筑间隙。远处有人走过，画面自然连贯，电影质感。"},
  {name:"产品展示",prompt:"主体置于干净的摄影棚中，镜头缓缓环绕，柔和光线从一侧移动，展示材质与细节，动作平稳。"},
  {name:"人物动作",prompt:images.length?"以 @图片1 为参考，人物自然地转头看向镜头，露出轻微笑容。保持外观与场景一致，镜头缓慢靠近。":"一位穿浅色衬衫的人站在窗边，自然地转头看向镜头，露出轻微笑容，镜头缓慢靠近。"},
  {name:"自然风景",prompt:"清晨的山间湖泊，薄雾缓缓飘过水面，阳光照亮远处山峰。镜头向前缓慢飞行，画面宁静通透。"},
 ];
 function switchMode(next:"image"|"video"|"chat"){setMode(next);setError("");setMention(null);setResultFilter("all");}
 function openCurrentKey(){setKeyProvider(mode==="chat"?"paipu_chat":mode==="image"?imageProvider:currentProvider);setKeyOpen(true);}
 function focusPrompt(){requestAnimationFrame(()=>{(mode==="image"?imageTextarea:textarea).current?.focus();});}
 function scrollToWorks(){if(mode==="chat"){switchMode("image");setTimeout(()=>worksRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),50);}else worksRef.current?.scrollIntoView({behavior:"smooth",block:"start"});}
 function formatWorkDate(value:number){return new Date(value).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});}
 async function addReferenceLink(kind:"image"|"video"){
  if(uploading||submitting)return;const url=(kind==="image"?h3ImageUrl:videoUrl).trim();if(!url)return;
  setUploading(true);setError("");try{const asset=await api(kind==="image"?"reference-image-url":"reference-url",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});setAssets(previous=>[...previous,asset]);kind==="image"?setH3ImageUrl(""):setVideoUrl("");}catch(e){setError((e as Error).message);}finally{setUploading(false);}
 }
 function reuseVideo(value:Job){
  const next=isActiveVideoModel(value.request.model)?value.request.model:DEFAULT_MODEL,nextMode=value.request.h3_mode??'hd',spec={...MODELS[next],...(next==='h3'?H3_MODES[nextMode]:{})};if(next==='h3')setH3Mode(nextMode);
  switchMode("video");setModel(next);setPrompt(value.request.prompt);setResolution((spec.resolutions as readonly string[]).includes(value.request.resolution??"")?value.request.resolution!:spec.resolution);setRatio((spec.ratios as readonly string[]).includes(value.request.aspect_ratio)?value.request.aspect_ratio:"16:9");setDuration(Math.max(spec.minDuration,Math.min(spec.maxDuration,value.request.duration)));setAssets([...value.request.images,...(value.request.videos??[]),...value.request.audios]);
  window.scrollTo({top:0,behavior:"smooth"});requestAnimationFrame(()=>textarea.current?.focus());toast.success("已复用提示词、参数与参考素材");
 }
 async function reuseImage(value:ImageJob){
  const next=(ACTIVE_IMAGE_MODELS as readonly string[]).includes(value.request.model)?value.request.model as ImageModel:DEFAULT_IMAGE_MODEL,spec=IMAGE_MODELS[next];
  switchMode("image");setImageModel(next);setImagePrompt(value.request.prompt);setImageSize((spec.sizes as readonly string[]).includes(value.request.size??"")?value.request.size!:defaultImageSize(next));setImageRatio(value.request.aspect_ratio??(next==='krea2'?'2:3':"adaptive"));
  try{const media=await api("assets"),ids=value.request.images??[];const references=ids.map(id=>media.assets.find((a:Asset)=>a.id===id&&a.kind==="image")).filter(Boolean);setImageReferences(references);toast.success(references.length===ids.length?"已复用提示词、参数与参考图":"已复用设置，部分参考图需重新添加");}catch{setImageReferences([]);toast.success("已复用设置，请重新添加所需参考图");}
  window.scrollTo({top:0,behavior:"smooth"});requestAnimationFrame(()=>imageTextarea.current?.focus());
 }
 useEffect(()=>{
  if(!draftLoaded.current)return;
  try{saveImageDraft(localStorage,{prompt:imagePrompt,model:imageModel,size:imageSize,ratio:imageRatio,ids:imageReferences.map(a=>a.id)});}catch{}
 },[imagePrompt,imageModel,imageSize,imageRatio,imageReferences]);
 useEffect(()=>{if(draftLoaded.current){try{localStorage.setItem("studio-active-mode",mode);}catch{}}},[mode]);
 useEffect(()=>{if(!videoPreview)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";const close=(e:KeyboardEvent)=>{if(e.key==="Escape")setVideoPreview(null);};window.addEventListener("keydown",close);return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",close);};},[videoPreview]);

 const displayRatio=job?.request.aspect_ratio??ratio,displayDuration=job?.request.duration??duration,displayModel=job?.request.model??model,displaySpec=MODELS[displayModel]??MODELS[DEFAULT_MODEL],displayResolution=job?.request.resolution??displaySpec.resolution;
 return <div className="creative-shell">
  <Toaster theme="light" position="top-center"/><AlertDialog open={Boolean(deleteTarget)} onOpenChange={open=>{if(!open&&!deleting)setDeleteTarget(null);}}><AlertDialogContent className="delete-dialog"><AlertDialogHeader><AlertDialogTitle>删除这条{deleteTarget?.kind==="image"?"图片":"视频"}记录？</AlertDialogTitle><AlertDialogDescription>确认后将从作品列表和历史记录中移除。删除后可通过提示中的“撤销”恢复。{deleteTarget&&!["completed","failed"].includes(deleteTarget.status)&&"这只移除记录，不会取消服务商正在处理的任务。"}</AlertDialogDescription></AlertDialogHeader>{deleteError&&<p role="alert" className="delete-error">{deleteError}</p>}<AlertDialogFooter><AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel><button className="delete-confirm" disabled={deleting} onClick={()=>void deleteRecord()}>{deleting?<LoaderCircle size={16} className="spin"/>:<Trash2 size={16}/>} {deleting?"正在删除…":"确认删除"}</button></AlertDialogFooter></AlertDialogContent></AlertDialog>{imagePreview&&<div className="image-lightbox" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setImagePreview(null);}}><section role="dialog" aria-modal="true" aria-label="图片大图预览"><button className="image-lightbox-close" aria-label="关闭大图" onClick={()=>setImagePreview(null)}><X size={20}/></button><img src={imagePreview.url} alt={imagePreview.prompt}/><footer><p>{imagePreview.prompt}</p><a href={imagePreview.downloadUrl??imagePreview.url} target="_blank" rel="noopener noreferrer" download={`seedream-${imagePreview.id}.png`}><Download size={14}/>下载原图</a></footer></section></div>}{keyOpen&&<div className="key-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setKeyOpen(false);}}><section className="key-dialog" role="dialog" aria-modal="true" aria-labelledby="key-title"><button className="key-close" aria-label="关闭接口配置" onClick={()=>setKeyOpen(false)}><X size={17}/></button><span className="key-icon"><KeyRound size={21}/></span><h2 id="key-title">接口配置</h2><div className="provider-tabs">{(["byteplus","byteplus_image","hyaloria","krea2","paipu_chat"] as Provider[]).map(p=><button key={p} className={keyProvider===p?"active":""} onClick={()=>setKeyProvider(p)}>{providerNames[p]}<small>{providerConfig[p].configured?"已配置":"未配置"}</small></button>)}</div><div className="key-actions"><button className="key-cancel" onClick={()=>{void api('config').then(result=>setProviderConfig(result.providers));}}>重新读取</button><button className="key-save" onClick={()=>setKeyOpen(false)}>完成</button></div></section></div>}

 {historyOpen&&<div className="history-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setHistoryOpen(false);}}><section className="history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title"><header><div><span className="history-icon"><History size={18}/></span><div><h2 id="history-title">历史作品</h2><p>共 {jobs.length} 条生成记录</p></div></div><button aria-label="关闭历史作品" onClick={()=>setHistoryOpen(false)}><X size={18}/></button></header><div className="history-body"><aside>{loadingHistory?<p className="history-empty"><LoaderCircle size={17} className="spin"/>正在读取记录…</p>:!jobs.length?<p className="history-empty">还没有生成记录。</p>:jobs.map(j=><button key={j.id} className={`history-row ${selected===j.id?"selected":""}`} onClick={()=>{setSelected(j.id);if(j.upstream&&j.status==="completed")void refresh(j);}}><span className={`history-status ${j.status}`}>{j.status==="completed"?<Check size={14}/>:j.status==="failed"||j.status==="unknown"?<AlertCircle size={14}/>:<LoaderCircle size={14} className={["queued","in_progress","submitting"].includes(j.status)?"spin":""}/>}</span><span><strong>{j.request.prompt}</strong><small>{MODELS[j.request.model??DEFAULT_MODEL]?.shortName??"Seedance"} · {new Date(j.created).toLocaleString("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}</small></span><em>{j.contentPending?"准备文件中":statusText[j.status]??j.status}</em></button>)}</aside><article>{job?<><div className={`history-preview ${job.request.aspect_ratio==="9:16"?"portrait":job.request.aspect_ratio==="1:1"?"square":""}`} style={{aspectRatio:job.request.aspect_ratio==="adaptive"?"16 / 9":job.request.aspect_ratio.replace(":"," / ")}}>{job.status==="completed"&&job.url?<video key={job.url} controls playsInline preload="none" poster={job.poster} src={job.url}/>:<div className="history-placeholder"><span>{job.status==="completed"?<Play size={24}/>:job.status==="failed"||job.status==="unknown"?<AlertCircle size={24}/>:<LoaderCircle size={24} className="spin"/>}</span><strong>{job.contentPending?"准备文件中":statusText[job.status]??job.status}</strong><p>{job.error??"视频生成完成后可在这里预览。"}</p></div>}</div><div className="history-meta"><span>{MODELS[job.request.model??DEFAULT_MODEL]?.name??"Seedance 2.5"}</span><span>{job.request.resolution??MODELS[job.request.model??DEFAULT_MODEL]?.resolution??"720p"} · {job.request.aspect_ratio} · {job.request.duration} 秒</span></div><p className="history-prompt">{job.request.prompt}</p><div className="history-actions"><button disabled={!job.upstream} onClick={()=>refresh(job)}><RefreshCw size={14}/>刷新结果</button>{job.status==="completed"&&job.url&&<a href={job.downloadUrl??job.url} target="_blank" rel="noopener noreferrer" download={`seedance-${job.id}.mp4`}><Download size={14}/>下载视频</a>}<button onClick={()=>{setHistoryOpen(false);reuseVideo(job);}}>复用设置</button><button className="delete-record" onClick={()=>askDelete(job.id,"video",job.status)}><Trash2 size={14}/>删除视频</button></div></>:<p className="history-empty">从左侧选择一条记录查看。</p>}</article></div></section></div>}

  {videoPreview&&<div className="creative-lightbox" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setVideoPreview(null);}}><section role="dialog" aria-modal="true" aria-label="视频预览"><button className="creative-lightbox-close" aria-label="关闭视频预览" onClick={()=>setVideoPreview(null)}><X size={20}/></button><video controls autoPlay playsInline src={videoPreview.url}/><footer><p>{videoPreview.request.prompt}</p><button onClick={()=>{reuseVideo(videoPreview);setVideoPreview(null);}}><RefreshCw size={15}/>复用设置</button></footer></section></div>}
  <aside className="creative-sidebar" aria-label="工作台导航">
   <a className="creative-logo" href="/" aria-label="映序首页"><Sparkles size={25}/></a>
   <nav>{([{id:"image",name:"图片",icon:Images},{id:"video",name:"视频",icon:Film},{id:"chat",name:"对话",icon:MessageSquare}] as const).map(item=><button key={item.id} className={mode===item.id?"active":""} aria-pressed={mode===item.id} onClick={()=>switchMode(item.id)}><item.icon size={21}/><span>{item.name}</span></button>)}</nav>
   <div className="creative-sidebar-bottom"><button onClick={openCurrentKey} aria-label="管理 API 密钥"><KeyRound size={21}/><span>密钥</span></button><span className="private-space" title="私人创作空间"><LockKeyhole size={17}/></span></div>
  </aside>
  <div className="creative-content">
   <header className="creative-topbar"><div><strong>映序</strong><span className="topbar-divider"/><span>创作工作台</span></div><div className="creative-topbar-actions"><button onClick={scrollToWorks}><History size={16}/>我的作品</button><button className="creative-key-button" onClick={openCurrentKey}><span className={currentKeyConfigured?"connection-dot connected":"connection-dot"}/><KeyRound size={15}/>{currentKeyConfigured?"API 已配置":"查看接口配置"}</button></div></header>
   {mode==="chat"?<div className="creative-chat"><ChatStudio api={api} configured={providerConfig.paipu_chat?.configured??false} onKey={openCurrentKey} creationContext={{imageModel,videoModel:model,imageSize,imageRatio,videoRatio:ratio,videoDuration:duration,videoResolution:resolution,h3Mode,generateAudio}} referenceImages={imageReferences.length?imageReferences:images.filter(image=>!image.state||image.state==='ready')} generationJobs={[...imageJobs.map(job=>({...job,kind:'image' as const})),...jobs.map(job=>({...job,kind:'video' as const}))]} onGenerationUpdate={updateChatGeneration} onPreview={job=>job.url&&setImagePreview({url:job.url,downloadUrl:job.downloadUrl,prompt:job.request.prompt,id:job.id})}/></div>:<main className="creative-main">
    <section className="creative-intro"><span className="creative-eyebrow"><span/>灵感实验室</span><h1>{mode==="image"?"把脑海中的画面，变成眼前的作品。":"让每一个想法，都有自己的镜头。"}</h1><p>{mode==="image"?"写下想法，添加参考图，开始这一次创作。":"描述主体、动作与镜头，探索更多动态的可能。"}</p></section>
    <section className="creation-composer" aria-label={mode==="image"?"图片创作输入区":"视频创作输入区"}>
     <div className={`prompt-entry ${(mode==="image"?imageReferences.length:assets.length)>0?"with-references":""}`}>
      {mode==="image"?imageModel==='krea2'?null:<ImageReferences compact items={imageReferences} limit={imageReferenceLimit(imageModel)} busy={imageUploading} locked={imageSubmitting} onChange={changeImageReferences} onBusy={setImageUploading} onError={setError} upload={async file=>{const asset=await api("upload?kind=image",uploadRequest(file,crypto.randomUUID()));rememberMediaPreview(asset.id,file);return asset;}}/>:<div className="compact-references">
       <CreationControl reference label="添加视频参考素材" trigger={<><Plus size={24}/><span>参考素材</span></>}>
        <div className="popover-heading"><h2>添加参考素材</h2><span>{assets.length} 个已添加</span></div>
        <div className="reference-upload-options"><button disabled={uploading||images.length>=modelSpec.maxImages} onClick={()=>imageInput.current?.click()}><ImagePlus size={20}/><span>上传参考图片<small>JPG / PNG / WebP</small></span><Plus size={16}/></button>{modelSpec.maxAudios>0&&<button disabled={uploading||audios.length>=modelSpec.maxAudios} onClick={()=>audioInput.current?.click()}><AudioLines size={20}/><span>上传参考音频<small>MP3 / WAV</small></span><Plus size={16}/></button>}{model==='h3'&&<button disabled={uploading||videos.length>=3} onClick={()=>videoInput.current?.click()}><Film size={20}/><span>上传参考视频<small>MP4 / MOV / WebM</small></span><Plus size={16}/></button>}</div>
        {model==='h3'&&<div className="creative-link-field"><label htmlFor="creative-h3-url">图片参考链接</label><div><input id="creative-h3-url" type="url" value={h3ImageUrl} onChange={e=>setH3ImageUrl(e.target.value)} placeholder="https://…/image.jpg"/><button disabled={!h3ImageUrl.trim()||uploading||images.length>=9} onClick={()=>void addReferenceLink('image')}>添加</button></div></div>}
        {modelSpec.maxVideos>0&&<div className="creative-link-field"><label htmlFor="creative-video-url">视频参考链接</label><div><input id="creative-video-url" type="url" value={videoUrl} onChange={e=>setVideoUrl(e.target.value)} placeholder="https://…/video.mp4"/><button disabled={!videoUrl.trim()||uploading||videos.length>=modelSpec.maxVideos} onClick={()=>void addReferenceLink('video')}>添加</button></div></div>}
        <p className="popover-footnote">{model==='h3'?'参考素材可选：最多 9 张图片、3 段视频、3 段音频。音频需搭配图片或视频；视频参考按 2 倍计费。':'参考图片单张小于 30 MB，上传后自动入库。'}</p>
       </CreationControl>
       {assets.map(a=><div className={`reference-tile video-reference-tile ${a.state==="failed"?"failed":""}`} key={a.id}>
        <CreationControl label={`管理素材 ${a.name}`} reference trigger={<>{a.kind==="image"?<img src={mediaPreview(a.id,a.preview)} onError={e=>fallbackMediaPreview(e.currentTarget,a.preview)} alt={a.name}/>:a.kind==="audio"?<AudioLines size={23}/>:<Film size={23}/>}<span className="reference-token">{a.kind==='image'?`图${images.findIndex(image=>image.id===a.id)+1}`:token(a)}</span>{a.state==="uploading"&&<LoaderCircle className="reference-loading spin" size={20}/>}</>}>
         <div className="popover-heading"><h2>{token(a)}</h2><span>{(a.size/MIB).toFixed(2)} MiB</span></div><p className="reference-filename">{a.name}</p>
         {a.error&&<p className="creative-inline-error">{a.error}</p>}
         {a.state==="failed"?<button className="popover-action" onClick={()=>void retryAsset(a)}><RefreshCw size={15}/>重试上传</button>:<button className="popover-action" disabled={a.state==="uploading"} onClick={()=>insertReference(a)}><AtSign size={15}/>插入提示词</button>}
         {a.kind==="audio"&&<audio controls src={mediaPreview(a.id,a.preview)} onError={e=>fallbackMediaPreview(e.currentTarget,a.preview)} className="reference-audio"/>}
         {currentProvider==="byteplus"&&a.kind==="image"&&(!a.state||a.state==="ready")&&<div className="compact-library"><PortraitStatus value={a.portrait} retry={()=>void portraits.retry(a.id)} refresh={()=>void portraits.refresh(a.id)}/></div>}
        </CreationControl><button className="reference-remove" disabled={uploading||submitting} aria-label={`移除 ${a.name}`} onClick={()=>removeAsset(a)}><X size={12}/></button>
       </div>)}
      </div>}
      <div className="creative-prompt-wrap"><ReferencePrompt ref={mode==='video'?textarea:imageTextarea} value={currentPrompt} references={promptReferences} label={mode==='image'?'图片描述':'画面描述'} expanded={Boolean(mention)} placeholder={mode==='image'?"描述你想生成的画面，或添加参考图开始创作。\n主体、场景、光线与风格，都可以告诉我。":"描述你想生成的视频，试着写出主体动作与镜头运动。\n输入 @，引用你的图片、视频或音频素材。"} onChange={changePrompt} onCursor={(value,cursor)=>{if(mention)setMention(referenceMention(value,cursor));}} onFiles={files=>{if(mode==='video')void chooseFiles(files,'image');else if(imageReferenceLimit(imageModel)===0)setError('当前图片模型不支持参考图，请选择 Hyaloria-图像编辑。');}} onKeyDown={event=>{
       if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();if(canGenerate)void(mode==='image'?generateImage():generate());return;}
       if(mention&&mentionMenu.current?.handleKey(event.key)){event.preventDefault();return;}if(event.key==='Escape')setMention(null);
      }}/>{currentPrompt&&<button className="prompt-clear" onClick={()=>{mode==='image'?setImagePrompt(''):setPrompt('');setMention(null);}} aria-label="清空提示词"><X size={15}/></button>}
       {mention&&<ReferenceMentionMenu ref={mentionMenu} items={promptReferences} query={mention.query} canCreate={mode==='image'?!imageUploading&&imageReferences.length<imageReferenceLimit(imageModel):!uploading&&images.length<modelSpec.maxImages} anchor={()=>(mode==='image'?imageTextarea.current:textarea.current)?.getCaretRect(mention.start)} onSelect={insertReference} onCreate={createMentionSubject} onDismiss={()=>setMention(null)}/>}
      </div>
     </div>
     <div className="creation-toolbar"><div className="creation-toolbar-left">
      <CreationControl label="切换创作类型" trigger={<><span className="creation-type-icon">{mode==="image"?<Images size={17}/>:<Film size={17}/>}</span><span>{mode==="image"?"图片生成":"视频生成"}</span><ChevronDown size={13}/></>}><div className="popover-heading"><h2>创作类型</h2></div><div className="model-choice-list"><button onClick={()=>switchMode("image")}><Images size={19}/><span><strong>图片生成</strong><small>文字生图与参考图创作</small></span>{mode==="image"&&<Check size={17}/>}</button><button onClick={()=>switchMode("video")}><Film size={19}/><span><strong>视频生成</strong><small>从画面到动态故事</small></span>{mode==="video"&&<Check size={17}/>}</button></div></CreationControl>
      <span className="toolbar-separator"/>
      <CreationControl label="选择生成模型" trigger={<><Box size={16}/><span>{mode==="image"?imageSpec.name:modelSpec.name}</span><ChevronDown size={13}/></>}>
       <div className="popover-heading"><h2>选择模型</h2><span>{mode==="image"?"图片模型":"视频模型"}</span></div>
       <div className="model-choice-list">{mode==="image"?ACTIVE_IMAGE_MODELS.map(value=><button className={imageModel===value?"selected":""} key={value} onClick={()=>chooseImageModel(value)}><Images size={19}/><span><strong>{IMAGE_MODELS[value].name}</strong><small>{IMAGE_MODELS[value].note}</small></span>{imageModel===value&&<Check size={17}/>}</button>):ACTIVE_VIDEO_MODELS.map(value=>{const spec=MODELS[value],disabled=value===LIMITED_VIDEO_MODEL&&(!quota||quota.unavailable);return <button className={model===value?"selected":""} key={value} disabled={disabled} onClick={()=>chooseModel(value)}><Film size={19}/><span><strong>{spec.name}{value===LIMITED_VIDEO_MODEL&&quota?.disabled&&<em>已禁用</em>}</strong><small>{spec.resolutions.join(" / ")} · {spec.minDuration}–{spec.maxDuration} 秒</small>{value===LIMITED_VIDEO_MODEL&&<small>{quota?`已生成 ${quota.used} / ${quota.limit} 秒 · 剩余 ${quota.remaining} 秒`:"正在读取额度…"}</small>}</span>{model===value&&<Check size={17}/>}</button>})}</div>
      </CreationControl>
      <CreationControl wide label="画面参数" trigger={<><SlidersHorizontal size={16}/><span>{mode==="image"?`${imageRatio==="adaptive"?"自动比例":imageRatio} · ${imageSize}`:`${ratio==="adaptive"?"自动比例":ratio} · ${resolution} · ${duration}s`}</span><ChevronDown size={13}/></>}>
       <div className="popover-heading"><h2>画面设置</h2><span>{mode==="image"?"每次生成 1 张":"调整你的镜头"}</span></div>
       {mode==='video'&&model==='h3'&&<><label className="parameter-label">H3 生成模式</label><div className="creation-segmented">{h3Modes.map(value=><button key={value} aria-pressed={h3Mode===value} className={h3Mode===value?'selected':''} onClick={()=>chooseH3Mode(value)}>{H3_MODES[value].name}<small>{value}</small></button>)}</div></>}{mode==='image'&&imageModel==='krea2'&&<p className="popover-footnote">Story 模式 · 不支持参考图片</p>}<label className="parameter-label">画面比例</label><div className="creation-ratios">{mode==="image"?imageRatios(imageModel).map(value=><RatioChoice key={value} value={value} selected={imageRatio===value} onSelect={()=>setImageRatio(value)}/>):modelSpec.ratios.map(value=><RatioChoice key={value} value={value} selected={ratio===value} onSelect={()=>setRatio(value)}/>)}</div>
       <label className="parameter-label">清晰度</label><div className="creation-segmented">{mode==="image"?imageSpec.sizes.map(value=><button key={value} aria-pressed={imageSize===value} className={imageSize===value?"selected":""} onClick={()=>setImageSize(value)}>{value}<small>{value==="1K"?"标准":value==="1.5K"?"清晰":"高清"}</small></button>):modelSpec.resolutions.map(value=><button key={value} aria-pressed={resolution===value} className={resolution===value?"selected":""} onClick={()=>setResolution(value)}>{value}<small>{value==="480p"?"经济":value==="720p"?"均衡":"高清"}</small></button>)}</div>
       {mode==="image"?<div className="creation-dimensions"><span>输出尺寸</span>{imageModel==='krea2'?<strong>{imageSize} · {imageRatio}</strong>:<>{imageRatio==="adaptive"?<strong>由模型决定</strong>:<><strong>{imageOutputSize(imageModel,imageSize,imageRatio).replace("x"," × ")}</strong><span>px</span></>}</>}</div>:<>
        <div className="parameter-label duration-parameter-label"><label htmlFor="creation-duration">视频时长</label><div><input id="creation-duration" type="number" min={modelSpec.minDuration} max={modelSpec.maxDuration} disabled={modelSpec.fixedDuration!==null} value={duration} onChange={e=>setDuration(Math.max(modelSpec.minDuration,Math.min(modelSpec.maxDuration,Math.round(Number(e.target.value)||modelSpec.minDuration))))}/><span>秒</span></div></div>
        {modelSpec.fixedDuration===null&&<><Slider aria-label="视频时长" min={modelSpec.minDuration} max={modelSpec.maxDuration} step={1} value={[duration]} onValueChange={v=>setDuration(v[0])}/><div className="duration-presets">{[4,5,10,15,20,30].filter(value=>value>=modelSpec.minDuration&&value<=modelSpec.maxDuration).map(value=><button key={value} className={duration===value?"selected":""} onClick={()=>setDuration(value)}>{value}s</button>)}</div></>}
        {currentProvider==="byteplus"&&<label className="creation-audio-toggle"><span><AudioLines size={16}/>同步生成音频</span><input type="checkbox" checked={generateAudio} onChange={e=>setGenerateAudio(e.target.checked)}/></label>}
       </>}
      </CreationControl>
      {mode==="video"&&<button className="creation-icon-button" title="输入 @ 引用素材" aria-label="引用参考素材" onClick={()=>{textarea.current?.focus();setMention({start:textarea.current?.selectionStart??prompt.length,end:textarea.current?.selectionEnd??prompt.length,query:''});}}><AtSign size={18}/></button>}
     </div><div className="creation-toolbar-right"><span className="prompt-counter">{Array.from(currentPrompt).length.toLocaleString()} / 8,000</span><button className="creation-submit" disabled={!canGenerate} onClick={()=>void(mode==="image"?generateImage():generate())} title="Ctrl / ⌘ + Enter 生成">{busyGenerating?<LoaderCircle size={18} className="spin"/>:<ArrowUp size={19}/>}<span>{mode==="video"&&quota?.disabled&&model===LIMITED_VIDEO_MODEL?"已禁用":busyGenerating?"生成中":"生成"}</span></button></div></div>
     {error&&<div className="creation-error" role="alert"><AlertCircle size={16}/><span>{error}</span><button aria-label="关闭提示" onClick={()=>setError("")}><X size={15}/></button></div>}
     {mode==='video'&&model==='h3'&&videos.length>0&&<div className="creation-notice" role="status"><CircleHelp size={15}/>本次包含视频参考，按时长与账户单价的 2 倍计费。</div>}{mode==="video"&&portraitReason&&<div className="creation-notice" role="status"><CircleHelp size={15}/>{portraitReason}</div>}{mode==="video"&&quotaReason&&<div className="creation-notice" role="status"><CircleHelp size={15}/>{quotaReason}</div>}
    </section>
    <div className="composer-caption"><span>{mode==="image"?imageModel==='krea2'?'Story · 纯文字生图 · 每次生成 1 张':`${imageReferences.length} 张参考图 · 每次生成 1 张`:model===LIMITED_VIDEO_MODEL&&quota?`已生成 ${quota.used} / ${quota.limit} 秒${quota.reserved?` · 生成中预占 ${quota.reserved} 秒`:""}`:`${assets.length} 个参考素材`}{!currentKeyConfigured&&<> · <button onClick={openCurrentKey}>请检查 Key 配置文件</button></>}</span>{modelsError&&(model==='h3'||imageModel==='krea2')&&<span>{modelsError}</span>}<span className="shortcut-hint"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> 生成</span></div>
    <div className="creation-ideas"><span><Sparkles size={14}/>试试灵感</span>{promptIdeas.map(idea=><button key={idea.name} onClick={()=>{mode==="image"?setImagePrompt(idea.prompt):setPrompt(idea.prompt);focusPrompt();}}>{idea.name}<ArrowUpRight size={12}/></button>)}</div>
    <section className="creation-works" ref={worksRef} aria-label="我的作品"><div className="works-heading"><div><h2>我的作品</h2><span>{mode==="image"?imageJobs.length:jobs.length} {mode==="image"?"张图片":"个视频"}</span>{(busyGenerating||(mode==="image"?imagesPending:active))&&<span className="works-processing"><LoaderCircle size={13} className="spin"/>正在创作</span>}</div><div className="works-filters">{[{value:"all",label:"全部"},{value:"completed",label:"已完成"},{value:"pending",label:"进行中"}].map(filter=><button key={filter.value} aria-pressed={resultFilter===filter.value} className={resultFilter===filter.value?"selected":""} onClick={()=>setResultFilter(filter.value as typeof resultFilter)}>{filter.label}</button>)}{mode==="video"&&<button className="works-history" onClick={openHistory} aria-label="打开视频历史"><History size={16}/></button>}</div></div>
     {pollError&&mode==="video"&&<p className="creation-poll-error" role="status">{pollError}</p>}
     {(mode==="image"?visibleImages.length:visibleVideos.length)===0?<div className="works-empty"><span>{mode==="image"?<Images size={28}/>:<Film size={28}/>}</span><h3>{resultFilter==="all"?"你的下一件作品，从这里开始":"暂时没有这类作品"}</h3><p>{resultFilter==="all"?"输入一段描述，或者选一个灵感试试。生成结果会保存在这里。":"试试其他筛选条件，或开始一次新的创作。"}</p>{resultFilter!=="all"&&<button onClick={()=>setResultFilter("all")}>查看全部作品</button>}</div>:<div className="creative-gallery">
      {mode==="image"?visibleImages.map(j=><article className="work-card" key={j.id}>
       <button className="work-media image-work-media" disabled={!j.url||mediaFailures[j.id]} aria-label={j.url?`放大查看：${j.request.prompt}`:imageStatusMessage(j)} onClick={()=>j.url&&setImagePreview({url:j.url,downloadUrl:j.downloadUrl,prompt:j.request.prompt,id:j.id})}>{j.url&&!mediaFailures[j.id]?<><img loading="lazy" decoding="async" src={j.previewUrl??j.url} alt={j.request.prompt} onError={()=>setMediaFailures(p=>({...p,[j.id]:true}))}/><span className="work-zoom"><Maximize2 size={15}/></span></>:<div className="work-placeholder">{imagePending(j.status)?<LoaderCircle size={25} className="spin"/>:<AlertCircle size={25}/>}<strong>{mediaFailures[j.id]?"图片链接暂时不可用":j.contentPending?"生成已完成":imagePending(j.status)?"正在为你创作":"暂未取得图片"}</strong><p>{mediaFailures[j.id]?"可以复用设置，重新开始创作。":imageStatusMessage(j)}</p></div>}<span className={`work-status ${j.status}`}>{j.contentPending?"准备文件中":statusText[j.status]??j.status}</span></button>
       <div className="work-card-body"><p title={j.request.prompt}>{j.request.prompt}</p><div className="work-card-meta"><span>{IMAGE_MODELS[j.request.model as ImageModel]?.name??j.request.model}</span><span>{j.request.size??"2K"} · {j.request.aspect_ratio&&j.request.aspect_ratio!=="adaptive"?j.request.aspect_ratio:"自动"}</span></div><div className="work-card-footer"><time>{formatWorkDate(j.created)}</time><div><button onClick={()=>void reuseImage(j)} title="复用提示词、参数与参考图" aria-label="复用图片设置"><RefreshCw size={15}/></button>{j.url&&<a href={j.downloadUrl??j.url} target="_blank" rel="noopener noreferrer" download={`image-${j.id}.png`} title="下载原图" aria-label="下载原图"><Download size={15}/></a>}<button onClick={()=>askDelete(j.id,"image",j.status)} title="删除图片" aria-label="删除图片"><Trash2 size={15}/></button></div></div></div>
      </article>):visibleVideos.map(j=><article className="work-card" key={j.id}>
       <div className="work-media video-work-media">{j.status==="completed"&&j.url&&!mediaFailures[j.id]?<><video controls playsInline preload="none" poster={j.poster} src={j.url} onError={()=>setMediaFailures(p=>({...p,[j.id]:true}))}/><button className="work-zoom" aria-label="放大视频" onClick={()=>setVideoPreview(j)}><Maximize2 size={15}/></button></>:<div className="work-placeholder">{["submitting","queued","in_progress"].includes(j.status)?<LoaderCircle size={25} className="spin"/>:j.status==="failed"||j.status==="unknown"||mediaFailures[j.id]?<AlertCircle size={25}/>:<Film size={25}/>}<strong>{mediaFailures[j.id]?"视频链接暂时不可用":j.contentPending?"准备文件中":statusText[j.status]??j.status}</strong><p>{mediaFailures[j.id]?"点击下方刷新按钮获取新链接。":j.contentPending?"生成已完成，正在准备结果文件…":j.error??"任务已保存，生成完成后会自动更新。"}</p>{typeof j.progress==="number"&&<Progress value={j.progress}/>}</div>}<span className={`work-status ${j.status}`}>{j.contentPending?"准备文件中":statusText[j.status]??j.status}</span></div>
       <div className="work-card-body"><p title={j.request.prompt}>{j.request.prompt}</p><div className="work-card-meta"><span>{MODELS[j.request.model]?.name??"视频"}</span><span>{j.request.resolution??"720p"} · {j.request.duration}s · {j.request.aspect_ratio}</span></div><div className="work-card-footer"><time>{formatWorkDate(j.created)}</time><div><button onClick={()=>reuseVideo(j)} title="复用提示词、参数与素材" aria-label="复用视频设置"><CopyPlus size={15}/></button><button disabled={!j.upstream} onClick={()=>{setSelected(j.id);void refresh(j);setMediaFailures(p=>({...p,[j.id]:false}));}} title="刷新结果" aria-label="刷新视频结果"><RefreshCw size={15}/></button>{j.url&&<a href={j.downloadUrl??j.url} target="_blank" rel="noopener noreferrer" title="打开或下载视频" aria-label="下载视频"><Download size={15}/></a>}<button onClick={()=>askDelete(j.id,"video",j.status)} title="删除视频" aria-label="删除视频"><Trash2 size={15}/></button></div></div></div>
      </article>)}
     </div>}
    </section>
    <footer className="creative-footer"><span>映序 · 留住每一次灵感</span><span>每个想法，都可以再试一次。</span></footer>
     <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple hidden onChange={e=>{if(e.target.files)void chooseFiles(e.target.files,"image");e.target.value="";}}/>
 <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" multiple hidden onChange={e=>{if(e.target.files)void chooseFiles(e.target.files,"video");e.target.value="";}}/>
 <input ref={audioInput} type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,.mp3,.wav,.ogg,.m4a" multiple hidden onChange={e=>{if(e.target.files)void chooseFiles(e.target.files,"audio");e.target.value="";}}/>
   </main>}
  </div>
 </div>;

}
