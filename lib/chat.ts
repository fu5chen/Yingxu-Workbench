import { InputError } from "./validation.ts";
import type { ChatAttachment,ChatGenerationRecord } from './chat-creation';
import {mediaCreationTarget,type MediaTarget} from './media-intent.ts';

export const CHAT_MODEL = "grok-4.7";
export type ChatMessage = { role: "user" | "assistant"; content: string; creationTarget?:MediaTarget; turnId?:string; attachments?:ChatAttachment[]; generations?:ChatGenerationRecord[] };
export function chatSubmissionContent(message:ChatMessage){
 if(message.role!=='user'||!['image','video'].includes(message.creationTarget??'')||mediaCreationTarget(message.content))return message.content;
 return `请生成${message.creationTarget==='image'?'图片':'视频'}：\n\ndetailed_description:\n${message.content}`;
}
export function parseChat(body: unknown): { model: string; messages: ChatMessage[]; stream: false } {
  if (!body || typeof body !== "object") throw new InputError("对话请求格式错误。");
  const b = body as Record<string, unknown>;
  if (b.model !== undefined && b.model !== CHAT_MODEL) throw new InputError("当前对话仅支持 grok-4.7。");
  if (!Array.isArray(b.messages) || !b.messages.length || b.messages.length > 41) throw new InputError("单次对话最多保留最近 20 轮，请开始新对话。");
  let length = 0;
  const messages = b.messages.map((m, index): ChatMessage => {
    if (!m || typeof m !== "object" || m.role !== (index % 2 === 0 ? "user" : "assistant") || typeof m.content !== "string" || !m.content.trim() || m.content.length > 24000) throw new InputError("对话内容格式错误或单条消息过长。");
    length += m.content.length;
    return { role: m.role, content: m.content.trim() };
  });
  if (length > 100000) throw new InputError("这段对话太长了，请开始新对话。");
  if (messages.at(-1)?.role !== "user") throw new InputError("请先输入你的问题。");
  return { model: CHAT_MODEL, messages, stream: false };
}

export function chatReply(raw: any): ChatMessage {
  const content = raw?.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content)
    ? content.filter(p => p?.type === "text" && typeof p.text === "string").map(p => p.text).join("\n")
    : "";
  if (!text.trim()) throw new InputError("模型没有返回文字内容，请稍后重试。", 502);
  if (text.length > 24000) throw new InputError("模型返回内容过长，请缩短问题后重试。", 502);
  return { role: "assistant", content: text };
}
export function chatResponseDeclined(raw:any):boolean{
 const message=raw?.choices?.[0]?.message;if(message?.refusal||raw?.choices?.[0]?.finish_reason==='content_filter')return true;
 const text=typeof message?.content==='string'?message.content:Array.isArray(message?.content)?message.content.map((part:any)=>part?.text??'').join('\n'):'';
 return /^(?:\s|[#*])*?(?:(?:很?抱歉|对不起|很遗憾)[，,。\s]*)?(?:我|我们|本模型|该模型)?\s*(?:无法|不能|不支持|不便)\s*(?:帮助|协助|提供|处理|优化|改写|生成|满足|完成)|^\s*(?:I(?:'m| am)? sorry[,.]?\s*(?:but\s+)?)?(?:I|We)\s+(?:cannot|can't|won't|am unable to|are unable to)\s+(?:help|assist|provide|process|optimi[sz]e|rewrite|generate|comply)/i.test(text);
}
export const CHAT_NO_TASK_NOTICE='这条消息没有实际创建图片或视频任务，因此没有可等待的生成结果。请重新明确描述需要生成的作品。';
export function chatReplyWithoutCreation(raw:any):ChatMessage{
 const reply=chatReply(raw);
 return /(?:^|\n)(?:已将|已经为你|已为你|已帮你|已提交|已创建|正在提交|正在生成|已经提交|已经生成|视频已|图片已|任务已|我已|我正在).{0,80}(?:生成|任务|队列|视频|图片)/.test(reply.content)?{role:'assistant',content:CHAT_NO_TASK_NOTICE}:reply;
}
