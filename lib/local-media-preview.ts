// Ephemeral previews never enter saved drafts or requests. Bound retained blobs.
const previews=new Map<string,{url:string;size:number}>();let bytes=0;
export function rememberMediaPreview(id:string,file:Blob){
 if(typeof URL.createObjectURL!=='function')return;
 const old=previews.get(id);if(old){URL.revokeObjectURL(old.url);bytes-=old.size;previews.delete(id);}
 previews.set(id,{url:URL.createObjectURL(file),size:file.size});bytes+=file.size;
 while(bytes>64*1024*1024&&previews.size>1){const [key,value]=previews.entries().next().value!;URL.revokeObjectURL(value.url);bytes-=value.size;previews.delete(key);}
}
export function mediaPreview(id:string|undefined,fallback:string){return id?previews.get(id)?.url??fallback:fallback;}
export function fallbackMediaPreview(image:{src:string},fallback:string){if(image.src.startsWith('blob:'))image.src=fallback;}
