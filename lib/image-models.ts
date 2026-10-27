import { InputError } from "./validation.ts";
import { HYALORIA_RATIOS } from './hyaloria-options.ts';

export const IMAGE_MODELS = {
  "krea2": {name:"Hyaloria-文生图片",provider:"krea2",sizes:["2K","6MP","12MP"],note:"Story · 纯文字生图"},
  "seedream-5-0-lite-260128": {name:"Seedream 5.0 Lite",provider:"byteplus_image",sizes:["2K","3K","4K"],note:"高清图片创作"},
  "dola-seedream-5-0-pro-260628": {name:"Hyaloria-图像编辑",provider:"byteplus_image",sizes:["1K","1.5K","2K"],note:"高清图片创作"},
  "dola-seedream-5-0-flash-260915": {name:"Seedream 5.0 Flash",provider:"byteplus_image",sizes:["1K","1.5K","2K"],note:"高清图片创作"},
  "gpt-image-2": {name:"GPT Image 2",provider:"linkomobile",sizes:["1024x1024","1536x1024","1024x1536"],note:"图片创作"},
  "doubao-seedream-5-0-flash-260915": {name:"Seedream 5.0 Flash（旧接口）",provider:"linkomobile",sizes:["1024x1024","1536x1024","1024x1536"],note:"图片创作"},
} as const;
export type ImageModel = keyof typeof IMAGE_MODELS;
export const DEFAULT_IMAGE_MODEL:ImageModel = "dola-seedream-5-0-pro-260628";
export const IMAGE_ASPECT_RATIOS = ["adaptive", "1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"] as const;
export type ImageAspectRatio = typeof IMAGE_ASPECT_RATIOS[number];
export function imageRatios(model:ImageModel):readonly ImageAspectRatio[]{return model==='krea2'?HYALORIA_RATIOS:IMAGE_ASPECT_RATIOS;}
export function defaultImageSize(model:ImageModel){return model==='krea2'?'6MP':IMAGE_MODELS[model].provider==='byteplus_image'?'2K':'1024x1536';}
// Official Pro / Flash output dimensions: https://docs.byteplus.com/en/docs/ModelArk/seedream-5-0-pro
export const PRO_IMAGE_DIMENSIONS = {
  "1K": {"1:1":"1024x1024", "4:3":"1152x864", "3:4":"864x1152", "16:9":"1424x800", "9:16":"800x1424", "3:2":"1248x832", "2:3":"832x1248", "21:9":"1568x672"},
  "1.5K": {"1:1":"1536x1536", "4:3":"1792x1344", "3:4":"1344x1792", "16:9":"2048x1152", "9:16":"1152x2048", "3:2":"1872x1248", "2:3":"1248x1872", "21:9":"2352x1008"},
  "2K": {"1:1":"2048x2048", "4:3":"2368x1776", "3:4":"1776x2368", "16:9":"2816x1584", "9:16":"1584x2816", "3:2":"2496x1664", "2:3":"1664x2496", "21:9":"3136x1344"},
} as const;
export function imageOutputSize(model: ImageModel, size: string, ratio: ImageAspectRatio = "adaptive") {
  if(model==='krea2'){if(!(HYALORIA_RATIOS as readonly string[]).includes(ratio))throw new InputError('Krea2 请选择具体画面比例。');return size;}
  if (ratio === "adaptive") return size;
  if (model !== "dola-seedream-5-0-pro-260628" && model !== "dola-seedream-5-0-flash-260915") throw new InputError("当前图片模型不支持此比例设置。");
  if (!Object.prototype.hasOwnProperty.call(PRO_IMAGE_DIMENSIONS, size)) throw new InputError("请选择支持的图片尺寸。");
  const value = PRO_IMAGE_DIMENSIONS[size as keyof typeof PRO_IMAGE_DIMENSIONS][ratio];
  if (!value) throw new InputError("请选择支持的画面比例。");
  return value;
}
export function imageReferenceLimit(model:ImageModel){return IMAGE_MODELS[model].provider!=="byteplus_image"?0:model==="seedream-5-0-lite-260128"?14:10;}

export function parseImageGeneration(body:unknown){
  if(!body||typeof body!=="object")throw new InputError("图片请求格式错误。");
  const b=body as Record<string,unknown>;
  const model=String(b.model??DEFAULT_IMAGE_MODEL);
  if(!Object.prototype.hasOwnProperty.call(IMAGE_MODELS,model))throw new InputError("请选择支持的图片模型。");
  const spec=IMAGE_MODELS[model as ImageModel];
  if(typeof b.prompt!=="string"||!b.prompt.trim()||Array.from(b.prompt).length>8000)throw new InputError("请填写 1–8000 个字符的图片描述。");
  const size=String(b.size??defaultImageSize(model as ImageModel));
  if(!(spec.sizes as readonly string[]).includes(size))throw new InputError(`${spec.name} 支持的尺寸：${spec.sizes.join(" / ")}。`);
  const aspect_ratio = b.aspect_ratio ?? (model==='krea2'?'2:3':"adaptive");
  if (typeof aspect_ratio !== "string" || !(imageRatios(model as ImageModel) as readonly string[]).includes(aspect_ratio)) throw new InputError("请选择支持的画面比例。");
  imageOutputSize(model as ImageModel, size, aspect_ratio as ImageAspectRatio);
  const images=b.images??[],limit=imageReferenceLimit(model as ImageModel);
  if(!Array.isArray(images)||images.length>limit||!images.every(id=>typeof id==="string"&&/^[a-zA-Z0-9_-]{8,128}$/.test(id)))throw new InputError(`当前模型支持最多 ${limit} 张参考图，请重新上传。`);
  if(new Set(images).size!==images.length)throw new InputError("请勿重复选择参考图。");
  if(model==='krea2'&&b.krea2_mode!==undefined&&b.krea2_mode!=='story')throw new InputError('Krea2 当前仅支持 story 模式。');
  if(b.seed!==undefined&&!Number.isSafeInteger(b.seed))throw new InputError('随机种子必须为整数。');
  return {kind:"image" as const,model:model as ImageModel,prompt:b.prompt.trim(),size,aspect_ratio:aspect_ratio as ImageAspectRatio,provider:spec.provider,images:images as string[],...(model==='krea2'?{krea2_mode:'story' as const}:{}),...(b.seed!==undefined?{seed:b.seed as number}:{})};
}

export function krea2Payload(saved:ReturnType<typeof parseImageGeneration>){
 if(saved.model!=='krea2'||saved.images.length)throw new InputError('Krea2 仅支持纯文字生图。');
 return {model:'krea2',prompt:saved.prompt,aspect_ratio:saved.aspect_ratio,image_resolution:saved.size,krea2_mode:'story',...(saved.seed!==undefined?{seed:saved.seed}:{})};
}

export function imagePayload(saved:ReturnType<typeof parseImageGeneration>,references:string[]=[]){
  if(references.length!==saved.images.length)throw new InputError("参考图尚未准备完成，请重新上传。");
  const base={model:saved.model,prompt:saved.prompt,size:imageOutputSize(saved.model,saved.size,saved.aspect_ratio),response_format:"url",watermark:false};
  if(saved.provider==="linkomobile")return {...base,n:1};
  return {...base,...(references.length?{image:references.length===1?references[0]:references}:{}),output_format:"png",stream:false,...(saved.model==="seedream-5-0-lite-260128"?{sequential_image_generation:"disabled"}:{})};
}
