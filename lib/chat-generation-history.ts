import type {ChatMessage} from './chat.ts';
import type {ChatGenerationJob} from './chat-creation.ts';
export type ChatGenerationEntry={id:string;message:{role:'assistant';content:string};matchContent?:string;generations:ChatGenerationJob[];notice?:boolean};
export function reconcileChatGenerations<T extends {messages:ChatMessage[]}>(threads:T[],entries:ChatGenerationEntry[]):T[]{
 const usable=entries.filter(e=>e&&typeof e.id==='string'&&Array.isArray(e.generations)&&(e.generations.length||e.notice===true)&&typeof e.message?.content==='string');
 const matches=(message:ChatMessage,entry:ChatGenerationEntry)=>message.content===entry.message.content||message.content===entry.matchContent;
 return threads.map(thread=>({...thread,messages:thread.messages.map(message=>{
  if(message.role!=='assistant')return message;
  let entry=usable.find(e=>message.turnId===e.id||message.generations?.some(g=>e.generations.some(job=>job.id===g.id)));
  if(!entry&&!message.turnId&&!message.generations?.length){const candidates=usable.filter(e=>matches(message,e));if(candidates.length===1&&threads.flatMap(t=>t.messages).filter(m=>m.role==='assistant'&&!m.turnId&&!m.generations?.length&&matches(m,candidates[0])).length===1)entry=candidates[0];}
  return entry?{...message,turnId:entry.id,content:entry.message.content,generations:entry.generations}:message;
 })}));
}
