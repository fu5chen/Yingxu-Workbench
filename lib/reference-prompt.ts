export type PromptReference={id:string;token:string;name:string;kind:'image'|'video'|'audio';preview:string};
export type PromptPart={type:'text';text:string}|{type:'reference';reference:PromptReference};
export function splitReferencePrompt(value:string,references:PromptReference[]):PromptPart[]{
 const byToken=new Map(references.map(reference=>[reference.token,reference])),parts:PromptPart[]=[];let offset=0;
 for(const match of value.matchAll(/@(图片|视频|音频)\d+/g)){
  const reference=byToken.get(match[0]);if(!reference)continue;
  if(match.index!>offset)parts.push({type:'text',text:value.slice(offset,match.index)});
  parts.push({type:'reference',reference});offset=match.index!+match[0].length;
 }
 if(offset<value.length)parts.push({type:'text',text:value.slice(offset)});return parts;
}
export function referenceMention(value:string,cursor:number){
 const prefix=value.slice(0,cursor),match=prefix.match(/@([^\s@]{0,80})$/u);
 return match?{start:cursor-match[0].length,end:cursor,query:match[1]}:null;
}
export function remapImageReferences(value:string,before:{id:string}[],after:{id:string}[]){
 return value.replace(/@图片(\d+)/g,(token,index)=>{const previous=before[Number(index)-1];if(!previous)return token;const next=after.findIndex(item=>item.id===previous.id);return next<0?'[已移除图片]':`@图片${next+1}`;});
}
