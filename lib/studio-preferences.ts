export const INITIAL_IMAGE_MODEL='krea2' as const;
export const INITIAL_VIDEO_MODEL='h3' as const;
export const INITIAL_VIDEO_MODE='raw' as const;
export type ImageDraft={model:string;prompt:string;size:string;ratio:string;ids:string[]};
type StorageAccess=Pick<Storage,'getItem'|'setItem'>;
const PER_MODEL='studio-image-model-drafts-v1';
function drafts(storage:StorageAccess):Record<string,ImageDraft>{try{const saved=JSON.parse(storage.getItem(PER_MODEL)??'{}');return saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};}catch{return{};}}
export function imageDraftFor(storage:StorageAccess,model:string):ImageDraft|null{
 const saved=drafts(storage);try{const current=JSON.parse(storage.getItem('studio-image-draft')??'null');if(current&&typeof current.model==='string'){saved[current.model]=current;storage.setItem(PER_MODEL,JSON.stringify(saved));}}catch{}
 return Object.hasOwn(saved,model)?saved[model]:null;
}
export function saveImageDraft(storage:StorageAccess,draft:ImageDraft){const saved=drafts(storage);saved[draft.model]=draft;storage.setItem(PER_MODEL,JSON.stringify(saved));storage.setItem('studio-image-draft',JSON.stringify(draft));}
