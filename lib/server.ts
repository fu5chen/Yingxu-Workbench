import { env } from "cloudflare:workers";
import { providerNames } from "./provider-labels";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { InputError } from "./validation";
import { runnerAuthorized } from './task-key';
import { HYALORIA_USER_AGENT } from './hyaloria-content';
export const runtime = env as typeof env & { STUDIO_RUNNER_TOKEN?: string; JOB_ENCRYPTION_KEY?: string; OSS_REGION?: string; OSS_BUCKET?: string; OSS_ACCESS_KEY_ID?: string; OSS_ACCESS_KEY_SECRET?: string; BYTEPLUS_ACCESS_KEY_ID?: string; BYTEPLUS_SECRET_ACCESS_KEY?: string; BYTEPLUS_ASSET_GROUP_ID?: string; BYTEPLUS_ASSET_PROJECT?: string; BYTEPLUS_ASSET_TOS_BUCKET?: string; PAIPU_CHAT_API_KEY?: string; HYALORIA_API_KEY?: string; PAIPU_API_KEY?: string; MODELFLARE_API_KEY?: string; LINKOMOBILE_API_KEY?: string; BYTEPLUS_API_KEY?: string; BYTEPLUS_IMAGE_API_KEY?: string };
export type Provider = "paipu_chat"|"hyaloria"|"krea2"|"paipu"|"modelflare"|"linkomobile"|"byteplus"|"byteplus_image";
const PROVIDERS = {
  paipu_chat: {cookie:"__Host-paipu_chat_api_key",env:"PAIPU_CHAT_API_KEY",name:providerNames.paipu_chat,origin:"https://api.paipu.net"},
  hyaloria: {cookie:"__Host-hyaloria_api_key",env:"HYALORIA_API_KEY",name:providerNames.hyaloria,origin:"https://asop.uk/api/hyaloria/v1"},
  krea2: {cookie:"__Host-krea2_api_key",env:"KREA2_API_KEY",name:providerNames.krea2,origin:"https://asop.uk/api/hyaloria/v1"},
  byteplus_image: {cookie:"__Host-byteplus_image_api_key",env:"BYTEPLUS_IMAGE_API_KEY",name:providerNames.byteplus_image,origin:"https://ark.ap-southeast.bytepluses.com/api/v3"},
  byteplus: {cookie:"__Host-byteplus_api_key",env:"BYTEPLUS_API_KEY",name:providerNames.byteplus,origin:"https://ark.ap-southeast.bytepluses.com/api/v3"},
  paipu: {cookie:"__Host-paipu_api_key",env:"PAIPU_API_KEY",name:providerNames.paipu,origin:"https://api.paipu.net"},
  modelflare: {cookie:"__Host-modelflare_api_key",env:"MODELFLARE_API_KEY",name:providerNames.modelflare,origin:"https://modelflare.dev"},
  linkomobile: {cookie:"__Host-linkomobile_api_key",env:"LINKOMOBILE_API_KEY",name:providerNames.linkomobile,origin:"https://settle.linkomobile.com"},
} as const;
export function database() { if (!runtime.DB) throw new InputError("任务存储暂不可用，请稍后重试。",503); return runtime.DB; }
export function bucket() { if (!runtime.BUCKET) throw new InputError("素材存储暂不可用，请稍后重试。",503); return runtime.BUCKET; }
export async function authorize(request: Request) {
  const user = await getChatGPTUser();
  const clientId = cookieValue(request, "studio_client");
  const anonymous = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)
    ? `anonymous:${clientId}`
    : "";
  const owner = user?.userId ?? anonymous;
  if (!owner) throw new InputError("匿名工作区尚未初始化，请刷新页面后重试。",401);
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new InputError("不允许跨站请求。",403);
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new InputError("不允许跨站请求。",403);
  }
  return owner;
}
function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) {
      try { return decodeURIComponent(part.slice(at + 1).trim()); } catch { return ""; }
    }
  }
  return "";
}
export function isValidApiKey(key: unknown, provider:Provider="paipu"): key is string { return typeof key === "string" && (["hyaloria","krea2"].includes(provider) ? /^hy-[A-Za-z0-9_-]{20,200}$/ : (provider === "byteplus" || provider === "byteplus_image") ? /^[A-Za-z0-9._~-]{20,512}$/ : /^sk-[A-Za-z0-9_-]{20,200}$/).test(key); }
export function hasPersonalApiKey(request: Request, provider:Provider="paipu") { return isValidApiKey(cookieValue(request, PROVIDERS[provider].cookie),provider); }
async function configuredApiKey(provider:Provider){
 const endpoint=(runtime as any).KEY_CONFIG_URL;
 if(endpoint){
  if(endpoint!=='http://127.0.0.1:5191/_runtime/keys')throw new InputError('Key 配置服务地址无效。',503);
  let response:Response;try{response=await fetch(endpoint+'/'+provider,{headers:{'x-studio-runner':runtime.STUDIO_RUNNER_TOKEN??''},signal:AbortSignal.timeout(5000)});}catch{throw new InputError('Key 配置服务暂不可用，请检查本地服务。',503);}
  const value=await response.json() as {apiKey?:string};if(!response.ok)throw new InputError('confiykey.json 配置不可读取，请检查文件格式。',503);return value.apiKey??'';
 }return (runtime as any)[PROVIDERS[provider].env];
}
export async function hasFallbackApiKey(provider:Provider="paipu") { return isValidApiKey(await configuredApiKey(provider),provider); }
export async function apiKey(request: Request, provider:Provider="paipu") {
  const config=PROVIDERS[provider],personal = cookieValue(request, config.cookie);
  // Only the private queue may use its encrypted submission-time snapshot.
  if (runnerAuthorized(request.headers.get('x-studio-runner'),runtime.STUDIO_RUNNER_TOKEN)&&isValidApiKey(personal,provider)) return personal;
  const fallback = await configuredApiKey(provider);
  if (!isValidApiKey(fallback,provider)) throw new InputError(`请在 confiykey.json 中配置有效的 ${config.name} Key。`,503);
  return fallback;
}
export function personalApiKeyCookie(value?: string, provider:Provider="paipu") {
  const base = `${PROVIDERS[provider].cookie}=${value ? encodeURIComponent(value) : ""}; Path=/; HttpOnly; Secure; SameSite=Strict`;
  return value ? `${base}; Max-Age=2592000` : `${base}; Max-Age=0`;
}
async function providerJson(provider:Provider,path: string, init: RequestInit = {}, request?: Request, options: {timeoutMs?: number; timeoutMessage?: string} = {}) {
  if (!request) throw new InputError("请求缺少鉴权上下文。", 500);
  const config=PROVIDERS[provider],key = await apiKey(request,provider); const headers = new Headers(init.headers); headers.set("Authorization", `Bearer ${key}`);
  if(provider==='hyaloria'||provider==='krea2')headers.set('User-Agent',HYALORIA_USER_AGENT);
  let response: Response;
  try { response = await fetch(`${config.origin}${path}`, { ...init, headers, redirect:"manual", signal: AbortSignal.timeout(options.timeoutMs ?? 90000) }); }
  catch (error) { console.error("Provider connection", error instanceof Error ? error.message.replaceAll(key,"[hidden]").replace(/sk-[\w-]+/g,"[hidden]") : "Network error"); throw new InputError(options.timeoutMessage ?? "服务连接中断，提交结果可能尚未返回，请勿重复提交。",504); }
  const data = await response.json().catch(() => null) as any;
  if (!response.ok) {
    if (response.status === 401) throw new InputError(`${config.name} API 密钥无效或已失效，请更新密钥后重试。`, 401);
    const message = data?.error?.message ?? data?.message ?? `生成服务返回错误（${response.status}）。`;
    console.error("Provider response",JSON.stringify({path,status:response.status,requestId:response.headers.get("x-request-id")??response.headers.get("request-id")??undefined,message:String(message).replaceAll(key,"[hidden]").replace(/sk-[\w-]+/g,"[hidden]").slice(0,300)}));
    const err = new InputError(String(message).replaceAll(key,"[已隐藏]").replace(/sk-[\w-]+/g,"[已隐藏]").slice(0,500),response.status);
    (err as any).retryAfter = response.headers.get("retry-after"); throw err;
  }
  if (!data) throw new InputError("服务返回内容异常，请保留当前任务记录。",502);
  return data;
}
export function paipuChat(init:RequestInit,request:Request) { return providerJson("paipu_chat","/v1/chat/completions",init,request,{timeoutMs:120000}); }
export function bytePlusImage(path:string,init:RequestInit={},request?:Request) { return providerJson("byteplus_image",path,init,request,{timeoutMs:300000,timeoutMessage:"图片生成等待超过 5 分钟，结果尚未确认，请保留记录，避免重复提交。"}); }
export function hyaloria(path:string,init:RequestInit={},request?:Request) { return providerJson("hyaloria",path,init,request); }
export function krea2(path:string,init:RequestInit={},request?:Request) { return providerJson("krea2",path,init,request); }
export function bytePlus(path:string,init:RequestInit={},request?:Request) { return providerJson("byteplus",path,init,request); }
export function upstream(path: string, init: RequestInit = {}, request?: Request, options: {timeoutMs?: number; timeoutMessage?: string} = {}) { return providerJson("paipu",`/v1${path}`,init,request,options); }
export function modelFlare(path: string, init: RequestInit = {}, request?: Request, options: {timeoutMs?: number; timeoutMessage?: string} = {}) { return providerJson("modelflare",path,init,request,options); }
export function linkoMobile(path: string, init: RequestInit = {}, request?: Request, options: {timeoutMs?: number; timeoutMessage?: string} = {}) { return providerJson("linkomobile",path,init,request,options); }
export function json(value: unknown, status = 200, extra: Record<string,string> = {}) { return Response.json(value, { status, headers:{"Cache-Control":"no-store",...extra} }); }
export function failure(error: unknown) {
  const known = error instanceof InputError;
  if (!known) console.error("Studio request failed", error instanceof Error ? error.name : "UnknownError");
  const retry = (error as any)?.retryAfter;
  return json({ error: known ? error.message : "暂时无法完成操作，输入已保留，请稍后再试。" }, known ? error.status : 500, retry ? {"Retry-After":retry} : {});
}
export async function readLimited(stream: ReadableStream<Uint8Array> | null, maximum: number) {
  if (!stream) throw new InputError("素材文件为空。");
  const reader = stream.getReader(); const parts: Uint8Array[]=[]; let size=0;
  try { while (true) { const {value,done}=await reader.read(); if(done) break; size+=value.byteLength; if(size>maximum){await reader.cancel();throw new InputError("素材文件超过大小限制。",413);} parts.push(value); } }
  finally {reader.releaseLock();}
  const result=new Uint8Array(size); let at=0;for(const part of parts){result.set(part,at);at+=part.length;}return result;
}
