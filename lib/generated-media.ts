export const GENERATED_FORMATS={
 'image/jpeg':'jpg','image/png':'png','image/webp':'webp',
 'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov',
} as const;
export function generatedMediaFormat(bytes:Uint8Array,kind:'image'|'video'){
 const text=(offset:number,length:number)=>String.fromCharCode(...bytes.slice(offset,offset+length));
 let mime:keyof typeof GENERATED_FORMATS|undefined;
 if(kind==='image'){
  if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)mime='image/jpeg';
  else if(bytes[0]===0x89&&text(1,3)==='PNG'&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)mime='image/png';
  else if(text(0,4)==='RIFF'&&text(8,4)==='WEBP')mime='image/webp';
 }else{
  if(text(4,4)==='ftyp')mime=text(8,4)==='qt  '?'video/quicktime':'video/mp4';
  else if(bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3)mime='video/webm';
 }
 if(!mime)throw new Error('生成文件格式无法识别，未写入结果缓存。');
 return {mime,extension:GENERATED_FORMATS[mime]};
}
