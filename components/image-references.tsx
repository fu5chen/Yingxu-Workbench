"use client";
import { useEffect, useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import {mediaPreview,fallbackMediaPreview} from '@/lib/local-media-preview';
import {clipboardFiles} from '@/lib/upload';

export type ImageReference={id:string;name:string;size:number;preview:string};
export function ImageReferences({items,limit,busy,locked,onChange,onBusy,onError,upload,compact=false}:{items:ImageReference[];limit:number;busy:boolean;locked:boolean;onChange:(items:ImageReference[])=>void;onBusy:(value:boolean)=>void;onError:(message:string)=>void;upload:(file:File)=>Promise<ImageReference>;compact?:boolean}){
 const input=useRef<HTMLInputElement>(null),lock=useRef(false);
 async function add(files:FileList|File[]|null){
  if(!files?.length||lock.current||busy||locked)return;
  const selected=Array.from(files);
  if(items.length+selected.length>limit){onError(`当前模型最多支持 ${limit} 张参考图。`);return;}
  if(selected.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type))){onError('参考图请使用 JPG、PNG 或 WebP。');return;}
  if(selected.some(f=>f.size>10*1024*1024)||[...items,...selected].reduce((n,f)=>n+f.size,0)>12*1024*1024){onError('单张图片最多 10 MiB，参考图合计最多 12 MiB。');return;}
  lock.current=true;onBusy(true);onError('');let next=[...items];
  try{for(const file of selected){next.push(await upload(file));onChange([...next]);}}
  catch(e){onError((e as Error).message);}finally{lock.current=false;onBusy(false);if(input.current)input.current.value='';}
 }
 useEffect(()=>{
  if(!compact)return;
  const inComposer=(target:EventTarget|null)=>target instanceof Element&&Boolean(target.closest(".creation-composer"));
  const drag=(event:DragEvent)=>{if(inComposer(event.target)&&event.dataTransfer?.types.includes("Files"))event.preventDefault();};
  const drop=(event:DragEvent)=>{if(!event.defaultPrevented&&inComposer(event.target)&&event.dataTransfer?.files.length){event.preventDefault();void add(event.dataTransfer.files);}};
  const paste=(event:ClipboardEvent)=>{if(inComposer(event.target)&&event.clipboardData){const files=clipboardFiles(event.clipboardData);if(files.length){event.preventDefault();void add(files);}}};
  document.addEventListener("dragover",drag);document.addEventListener("drop",drop);document.addEventListener("paste",paste);
  return()=>{document.removeEventListener("dragover",drag);document.removeEventListener("drop",drop);document.removeEventListener("paste",paste);};
 },[compact,items,busy,locked,limit]);
 if(compact)return <section className="compact-references" aria-label="参考图片" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.stopPropagation();void add(e.dataTransfer.files);}}><input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="上传参考图片" disabled={busy||locked} onChange={e=>void add(e.target.files)}/><button type="button" className="reference-add" disabled={busy||locked||items.length>=limit} onClick={()=>input.current?.click()} title="添加或拖放参考图片"><ImagePlus size={23}/><span>{busy?'上传中…':'参考图'}</span></button>{items.map((item,index)=><figure className="reference-tile" key={item.id}><img src={mediaPreview(item.id,item.preview)} onError={e=>fallbackMediaPreview(e.currentTarget,item.preview)} alt={`参考图${index+1}：${item.name}`}/><figcaption>图{index+1}</figcaption><button type="button" disabled={busy||locked} aria-label={`移除参考图${index+1}`} onClick={()=>onChange(items.filter(x=>x.id!==item.id))}><X size={12}/></button></figure>)}</section>;
 return <section className="image-references" aria-label="图生图参考图片"><div className="image-reference-title"><strong>参考图片（可选）</strong><span>{items.length} / {limit} 张</span></div><p>不上传是文生图；上传后，描述希望保留或修改的内容。按添加顺序对应“图1、图2…”。</p><input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="上传图生图参考图片" disabled={busy||locked} onChange={e=>void add(e.target.files)}/><button type="button" className="image-reference-upload" disabled={busy||locked||items.length>=limit} onClick={()=>input.current?.click()}><ImagePlus size={18}/>{busy?'正在上传…':'添加参考图片'}</button>{items.length>0&&<div className="image-reference-grid">{items.map((item,index)=><figure key={item.id}><img src={mediaPreview(item.id,item.preview)} onError={e=>fallbackMediaPreview(e.currentTarget,item.preview)} alt={`参考图${index+1}：${item.name}`}/><figcaption>图{index+1} · {item.name}</figcaption><button type="button" disabled={busy||locked} aria-label={`移除参考图${index+1}`} onClick={()=>onChange(items.filter(x=>x.id!==item.id))}><X size={16}/></button></figure>)}</div>}<small>JPG / PNG / WebP · 单张 ≤ 10 MiB，合计 ≤ 12 MiB{items.length>limit?` · 请移除多余图片，当前模型上限 ${limit} 张`:''}</small></section>;
}
