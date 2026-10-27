import { InputError, httpsUrl, normalizeTask, type parseGeneration } from "./validation.ts";

export function publicMediaUrl(value:unknown){
 if(typeof value!=='string')return httpsUrl(value);
 let parsed:URL;try{parsed=new URL(value);}catch{return httpsUrl(value);}
 if(parsed.protocol==='http:'){parsed.protocol='https:';const validated=new URL(httpsUrl(parsed.href));validated.protocol='http:';return validated.href;}
 return httpsUrl(value);
}
export function validateH3References(assets:{kind:string;mime:string;url:string}[]){
 for(const [kind,maximum]of [['image',9],['video',3],['audio',3]] as const)if(assets.filter(a=>a.kind===kind).length>maximum)throw new InputError(`H3 ${kind==='image'?'图片':kind==='video'?'视频':'音频'}参考最多 ${maximum} 个。`);
 if(assets.some(a=>!['image','video','audio'].includes(a.kind)||!a.mime.startsWith(a.kind+'/')))throw new InputError('H3 参考素材类型不匹配。');
 if(assets.some(a=>a.kind==='audio')&&!assets.some(a=>a.kind==='image'||a.kind==='video'))throw new InputError('H3 音频参考需要搭配图片或视频。');
 for(const asset of assets)if(asset.mime.endsWith('/remote'))publicMediaUrl(asset.url);
}
export function h3References(assets:{kind:string;mime:string;url:string}[]){validateH3References(assets);return assets.filter(a=>a.kind==='image').map(a=>{if(!a.mime.endsWith('/remote'))throw new InputError('本地素材需要先上传到可访问的存储。');return publicMediaUrl(a.url);});}
export async function prepareH3References<T extends {kind:string;mime:string;url:string}>(assets:T[],upload:(asset:T)=>Promise<string>){
 validateH3References(assets);const prepared=[];for(const asset of assets)prepared.push({kind:asset.kind,url:asset.mime.endsWith('/remote')?publicMediaUrl(asset.url):publicMediaUrl(await upload(asset))});
 return {images:prepared.filter(a=>a.kind==='image').map(a=>a.url),videos:prepared.filter(a=>a.kind==='video').map(a=>a.url),audios:prepared.filter(a=>a.kind==='audio').map(a=>a.url)};
}
export function h3Payload(parsed:ReturnType<typeof parseGeneration>,references:string[],videos:string[]=[],audios:string[]=[]) {
  if(parsed.model!=="h3"||references.length!==parsed.images.length||videos.length!==parsed.videos.length||audios.length!==parsed.audios.length)throw new InputError("H3 参考素材未准备完成。");
  return {model:"h3",prompt:parsed.prompt,...(references.length?{image_urls:references.map(publicMediaUrl)}:{}),...(videos.length?{video_urls:videos.map(publicMediaUrl)}:{}),...(audios.length?{audio_urls:audios.map(publicMediaUrl)}:{}),duration:parsed.duration,resolution:parsed.resolution,aspect_ratio:parsed.aspect_ratio,h3_mode:parsed.h3_mode??'hd',...(parsed.seed!==undefined?{seed:parsed.seed}:{})};
}
export function normalizeH3(raw:any) {
  // Status content_url is an authenticated API path, not the downloadable file.
  const result=normalizeTask({...raw,url:raw?.url??raw?.content_url,error:typeof raw?.error==="string"?{message:raw.error}:raw?.error});
  if(result.error)result.error=result.error.replace(/hy-[A-Za-z0-9_-]+/g,"[已隐藏]");
  return {...result,contentPending:raw?.content_pending===true,...(raw?.estimate?{estimate:raw.estimate}:{})};
}
