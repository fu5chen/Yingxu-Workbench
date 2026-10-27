"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Copy, LoaderCircle, MessageSquare, Plus, Sparkles, Search, PanelLeft, X, Trash2, Paperclip, WandSparkles, PencilLine } from "lucide-react";
import { PortraitStatus, usePortraitLibrary } from './portrait-library';
import { toast } from "sonner";
import { CHAT_MODEL,chatSubmissionContent, type ChatMessage } from "@/lib/chat";
import type {MediaTarget} from '@/lib/media-intent';
import { ChatGeneration,chatImageDimensions } from './chat-generation';
import { uploadRequest } from '@/lib/upload';
import {rememberMediaPreview,mediaPreview,fallbackMediaPreview} from '@/lib/local-media-preview';
import {REFERENCE_IMAGE_MAX_BYTES} from '@/lib/validation';
import type {ChatAttachment,ChatCreationContext,ChatGenerationJob} from '@/lib/chat-creation';
import {reconcileChatGenerations} from '@/lib/chat-generation-history';

type Conversation = { id: string; title: string; messages: ChatMessage[] };
const STORAGE = "studio-grok-conversations-v1";
const fresh = (): Conversation => ({ id: crypto.randomUUID(), title: "新对话", messages: [] });
export function ChatStudio({ api, configured, onKey,creationContext={},referenceImages=[],generationJobs=[],onGenerationUpdate,onPreview }: {
  api: (path: string, init?: RequestInit) => Promise<any>;
  configured: boolean;
  onKey: () => void;
  creationContext?:ChatCreationContext;
  referenceImages?:ChatAttachment[];
  generationJobs?:ChatGenerationJob[];
  onGenerationUpdate?:(job:ChatGenerationJob)=>void;
  onPreview?:(job:ChatGenerationJob)=>void;
}) {
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<{ id: string; text: string; attachments: ChatAttachment[] } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [search,setSearch]=useState("");
  const [historyVisible,setHistoryVisible]=useState(false);
  const [attachments,setAttachments]=useState<ChatAttachment[]>(referenceImages),[uploading,setUploading]=useState(false);
  const portraits=usePortraitLibrary(attachments,setAttachments,true,api);
  const attachmentInput=useRef<HTMLInputElement>(null),uploadLock=useRef(false),retryTurn=useRef<{id:string;fingerprint:string}|null>(null);
  const [optimizing,setOptimizing]=useState(false),[optimizationPreview,setOptimizationPreview]=useState('');
  const optimizationLock=useRef(false),draftInput=useRef<HTMLTextAreaElement>(null),latestDraft=useRef(draft);latestDraft.current=draft;
  const optimizedTarget=useRef<MediaTarget|null>(null),previewTarget=useRef<MediaTarget|null>(null);
  useEffect(()=>{if(!draft)optimizedTarget.current=null;},[draft]);
  const lock = useRef(false), bottom = useRef<HTMLDivElement>(null);
  const current = threads.find(t => t.id === selected);
  useEffect(() => {
    let saved: Conversation[] = [];
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE) ?? "[]");
      if (Array.isArray(value)) saved = value.filter(t => typeof t?.id === "string" && typeof t.title === "string" && Array.isArray(t.messages) && t.messages.every((m: ChatMessage, i: number) => m?.role === (i % 2 ? "assistant" : "user") && typeof m.content === "string" && m.content.length <= 24000)).map(t=>({...t,messages:t.messages.map((m:ChatMessage)=>({...m,attachments:Array.isArray(m.attachments)?m.attachments.filter(a=>a&&typeof a.name==='string'&&typeof a.preview==='string').slice(0,10):[],generations:Array.isArray(m.generations)?m.generations.filter(g=>g&&typeof g.id==='string'&&/^[\w-]{8,128}$/.test(g.id)&&['image','video'].includes(g.kind)&&g.request&&typeof g.request.prompt==='string').slice(0,2):[]}))}));
    } catch {}
    if (!saved.length) saved = [fresh()];
    setThreads(saved); setSelected(saved[0].id); setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE, JSON.stringify(threads)); setStorageError(""); }
    catch { setStorageError("浏览器存储空间不足，本次对话暂未保存。请复制需要保留的内容。"); }
  }, [threads, ready]);
  useEffect(()=>{if(!ready)return;let active=true;void api('chat-generations').then(value=>{if(active&&Array.isArray(value.entries))setThreads(previous=>reconcileChatGenerations(previous,value.entries));}).catch(()=>{});return()=>{active=false;};},[ready,api]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [current?.messages.length, pending]);
  function newChat() {
    if (lock.current || uploadLock.current || optimizationLock.current) return;
    const item = fresh(); setThreads(p => [item, ...p]); setSelected(item.id); setDraft(""); setError("");setAttachments([]);
  }
  function deleteChat(id: string) {
    if (lock.current || uploadLock.current || optimizationLock.current) return;
    const index = threads.findIndex(t => t.id === id), removed = threads[index];
    if (!removed) return;
    const remaining = threads.filter(t => t.id !== id), next = remaining.length ? remaining : [fresh()];
    setThreads(next);
    if (selected === id) {
      setSelected(next[Math.min(index, next.length - 1)].id);
      setDraft(""); setError(""); setCopied(null);setAttachments([]);
    }
    if (!remaining.length) setSearch("");
    toast.success("对话已删除", { action: { label: "撤销", onClick: () => setThreads(previous => {
      if (previous.some(t => t.id === removed.id)) return previous;
      const restored = [...previous]; restored.splice(Math.min(index, restored.length), 0, removed); return restored;
    }) } });
  }
  function addReference(image:ChatAttachment){if(optimizationLock.current)return;setAttachments(previous=>[image,...previous.filter(item=>image.id?item.id!==image.id:item.jobId!==image.jobId)].slice(0,10));}
  function editMessage(index:number){
    if(lock.current||uploadLock.current||optimizationLock.current)return;
    const message=current?.messages[index];if(message?.role!=='user')return;
    const previous={draft,attachments:[...attachments],target:optimizedTarget.current};
    const kinds=current?.messages[index+1]?.generations?.map(job=>job.kind)??[];
    optimizedTarget.current=message.creationTarget??(kinds.length===1?kinds[0]:null);
    setDraft(message.content);setError('');setCopied(null);
    setAttachments((message.attachments??[]).slice(0,10).map(image=>{const job=image.jobId?generationJobs.find(job=>job.id===image.jobId):undefined;return{...image,automatic:false,preview:image.id?'/api/studio/media/'+encodeURIComponent(image.id):job?.previewUrl??job?.url??image.preview};}));
    requestAnimationFrame(()=>{draftInput.current?.focus();draftInput.current?.setSelectionRange(message.content.length,message.content.length);draftInput.current?.scrollIntoView({behavior:'smooth',block:'nearest'});});
    toast.success('文字和参考图片已放回输入框',{action:{label:'撤销',onClick:()=>{if(lock.current||uploadLock.current||optimizationLock.current)return;optimizedTarget.current=previous.target;setDraft(previous.draft);setAttachments(previous.attachments);requestAnimationFrame(()=>draftInput.current?.focus());}}});
  }
  async function optimizePrompt(){
    const original=draft;if(!original.trim()||optimizationLock.current||lock.current||uploadLock.current||!configured)return;
    optimizationLock.current=true;setOptimizing(true);setError('');
    try{const result=await api('chat-optimize',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({prompt:original,references:attachments})});if(typeof result.prompt!=='string'||!result.prompt.trim()||Array.from(result.prompt).length>8000||!['image','video'].includes(result.target))throw new Error('优化结果异常，原提示词已保留。');if(latestDraft.current===original){optimizedTarget.current=result.target;setDraft(result.prompt);requestAnimationFrame(()=>draftInput.current?.focus());toast.success(result.target==='image'?'图片提示词已优化':'视频提示词已优化');}else{previewTarget.current=result.target;setOptimizationPreview(result.prompt);}}
    catch(error){setError((error as Error).message);}finally{optimizationLock.current=false;setOptimizing(false);}
  }
  async function uploadImages(files:FileList|null){
    if(!files?.length||uploadLock.current||optimizationLock.current)return;
    if(attachments.length+files.length>10){setError('参考图片最多10张。');return;}
    if(Array.from(files).some(file=>!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>=REFERENCE_IMAGE_MAX_BYTES)){setError('请上传小于30 MB的JPG、PNG或WebP图片。');return;}
    uploadLock.current=true;setUploading(true);setError('');
    try{for(const file of Array.from(files)){const preview=URL.createObjectURL(file);let dimensions;try{dimensions=await chatImageDimensions(preview);}finally{URL.revokeObjectURL(preview);}const asset=await api('upload?kind=image',uploadRequest(file,crypto.randomUUID()));rememberMediaPreview(asset.id,file);addReference({...asset,...dimensions});}}
    catch(error){setError((error as Error).message);}finally{uploadLock.current=false;setUploading(false);if(attachmentInput.current)attachmentInput.current.value='';}
  }
  async function send() {
    const text = draft.trim();
    if (!text || !current || lock.current || uploadLock.current || optimizationLock.current || !configured) return;
    lock.current = true; setPending({ id: current.id, text, attachments: [...attachments] }); setError("");
    const id = current.id;setDraft("");
    const message: ChatMessage = { role: "user", content: text,...(optimizedTarget.current?{creationTarget:optimizedTarget.current}:{}),...(attachments.length?{attachments:[...attachments]}:{}) };
    try {
      const references=await Promise.all(attachments.map(async item=>({...item,...(!item.width||!item.height?await chatImageDimensions(item.preview):{})})));
      const latestImage=current.messages.flatMap(m=>m.generations??[]).filter(g=>g.kind==='image').reverse().map(g=>generationJobs.find(job=>job.id===g.id)).find(job=>job?.status==='completed'&&job.url);
      if(latestImage&&!references.some(item=>item.jobId===latestImage.id))references.push({jobId:latestImage.id,name:'刚才生成的图片',preview:latestImage.previewUrl??latestImage.url!,...await chatImageDimensions(latestImage.url!),automatic:true} as ChatAttachment);
      const messages=[...current.messages.slice(-40),message].map(m=>({role:m.role,content:(chatSubmissionContent(m)+(m.generations?.length?'\n已请求的作品描述：'+m.generations.map(g=>g.request.prompt).join('\n'):'')).slice(0,24000)}));
      const body={model:CHAT_MODEL,messages,creationContext:{...creationContext,references}},fingerprint=JSON.stringify(body);
      const turn=retryTurn.current?.fingerprint===fingerprint?retryTurn.current:{id:crypto.randomUUID(),fingerprint};retryTurn.current=turn;
      const response = await api("chat", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": turn.id }, body: JSON.stringify(body) });
      if (response.message?.role !== "assistant" || typeof response.message.content !== "string") throw new Error("对话响应异常，请重试。");
      const generations:ChatGenerationJob[]=Array.isArray(response.generations)?response.generations:[],reply:ChatMessage={...response.message,turnId:response.id,...(generations.length?{generations}:{})};
      const usedImages=new Set(generations.flatMap(job=>job.request.images??[]).map(image=>typeof image==='string'?image:image.id));
      const recalled=references.filter(image=>image.jobId&&usedImages.has('chat-ref-'+image.jobId)&&!(message.attachments??[]).some(original=>original.jobId===image.jobId));
      const savedMessage:ChatMessage={...message,...(recalled.length?{attachments:[...(message.attachments??[]),...recalled]}:{})};
      setThreads(p => p.map(t => t.id === id ? { ...t, title: t.messages.length ? t.title : text.slice(0, 22), messages: [...t.messages, savedMessage, reply] } : t));
      generations.forEach(job=>onGenerationUpdate?.(job));retryTurn.current=null;
    } catch (e) { if((e as any).status>=400&&(e as any).status<500)retryTurn.current=null;setDraft(previous=>{if(previous)return `${text}\n\n${previous}`;optimizedTarget.current=message.creationTarget??null;return text;});setError((e as Error).message); }
    finally { lock.current = false; setPending(null); }
  }
  return <main className="chat-studio">
    {optimizationPreview&&<div className="chat-optimization-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setOptimizationPreview('');}}><section role="dialog" aria-modal="true" aria-labelledby="optimization-preview-title" onKeyDown={event=>{if(event.key==='Escape')setOptimizationPreview('');}}><header><h2 id="optimization-preview-title">提示词优化已完成</h2><button aria-label="关闭优化结果" onClick={()=>setOptimizationPreview('')}><X size={18}/></button></header><p>草稿已有新的修改，优化结果已单独保留。</p><textarea autoFocus readOnly aria-label="优化后的提示词" value={optimizationPreview}/><footer><button onClick={()=>setOptimizationPreview('')}>关闭</button><button onClick={()=>{optimizedTarget.current=previewTarget.current;setDraft(optimizationPreview);setOptimizationPreview('');requestAnimationFrame(()=>draftInput.current?.focus());}}>替换当前草稿</button></footer></section></div>}
    <div className={`chat-workspace ${historyVisible?"show-chat-history":""}`}>
      {historyVisible&&<button className="chat-history-scrim" aria-label="关闭对话列表" onClick={()=>setHistoryVisible(false)}/>}
      <aside className="chat-sidebar"><button className="chat-new" onClick={newChat} disabled={Boolean(pending)||uploading||optimizing}><Plus size={19}/>新对话</button><div className="chat-history-search"><Search size={14}/><input aria-label="搜索对话" placeholder="搜索对话" value={search} onChange={e=>setSearch(e.target.value)}/></div><h2>最近对话</h2><div className="chat-thread-list">{threads.filter(t=>t.title.toLowerCase().includes(search.toLowerCase())).map(t => <div key={t.id} className={`chat-thread-row ${selected === t.id ? "selected" : ""}`}><button className="chat-thread-select" aria-pressed={selected === t.id} disabled={Boolean(pending)||uploading||optimizing} onClick={() => { setSelected(t.id); setDraft(""); setError("");setAttachments([]);setHistoryVisible(false); }}><MessageSquare size={17}/><span>{t.title}</span></button><button className="chat-thread-delete" aria-label={`删除对话：${t.title}`} title="删除对话" disabled={Boolean(pending)||uploading||optimizing} onClick={() => deleteChat(t.id)}><Trash2 size={14}/></button></div>)}</div></aside>
      <section className="chat-panel" aria-label="对话">
        <header className="chat-panel-header"><div><button className="chat-history-toggle" aria-label="查看最近对话" aria-expanded={historyVisible} onClick={()=>setHistoryVisible(!historyVisible)}><PanelLeft size={18}/></button><strong>{current?.title??"新对话"}</strong></div><div className="chat-header-actions"><span>{CHAT_MODEL}</span><button aria-label="开始新对话" title="新对话" disabled={Boolean(pending)||uploading||optimizing} onClick={()=>{newChat();setHistoryVisible(false);}}><Plus size={19}/></button></div></header>
        <div className="chat-messages" role="log" aria-label="对话消息" aria-live="polite">
          {!current?.messages.length && !pending && <div className="chat-welcome chat-welcome-simple"><span><MessageSquare size={25}/></span><h2>有什么可以帮你？</h2><p>输入问题，开始对话。</p></div>}
          {current?.messages.map((m, i) => <article key={i} className={`chat-message ${m.role}`}><div className="chat-speaker">{m.role === "user" ? "你" : "grok-4.7"}</div>{Boolean(m.attachments?.length)&&<div className="chat-message-attachments">{m.attachments!.map((image,index)=><img key={index} src={mediaPreview(image.id,image.preview)} onError={e=>fallbackMediaPreview(e.currentTarget,image.preview)} alt={image.name} loading="lazy"/>)}</div>}<div className="chat-content">{m.content}</div>{m.generations?.map(record=><ChatGeneration key={record.id} record={record} job={generationJobs.find(job=>job.id===record.id)} api={api} onUpdate={job=>onGenerationUpdate?.(job)} onReference={addReference} onPreview={job=>onPreview?.(job)}/>)}{m.role==='user'&&<div className="chat-user-actions"><button className="chat-reedit" aria-label={`重新编辑第 ${Math.floor(i/2)+1} 条消息`} aria-describedby={`chat-reedit-tip-${i}`} disabled={Boolean(pending)||uploading||optimizing} onClick={()=>editMessage(i)}><PencilLine size={15}/><span className="chat-reedit-tooltip" id={`chat-reedit-tip-${i}`} role="tooltip">重新编辑</span></button></div>}{m.role === "assistant" && <button className="chat-copy" aria-label={`复制第 ${Math.ceil((i + 1) / 2)} 条回复`} onClick={async () => { try { await navigator.clipboard.writeText(m.content); setCopied(i); } catch { setError("无法访问剪贴板，请选中文字手动复制。"); } }}>{copied === i ? <Check size={14}/> : <Copy size={14}/>} {copied === i ? "已复制" : "复制"}</button>}</article>)}
          {pending?.id === selected && <><article className="chat-message user"><div className="chat-speaker">你</div>{pending.attachments.length>0&&<div className="chat-message-attachments">{pending.attachments.map((image,index)=><img key={index} src={mediaPreview(image.id,image.preview)} onError={e=>fallbackMediaPreview(e.currentTarget,image.preview)} alt={image.name}/>)}</div>}<div className="chat-content">{pending.text}</div></article><div className="chat-thinking" role="status"><LoaderCircle size={18} className="spin"/>正在思考，请稍候…</div></>}
          <div ref={bottom}/>
        </div>
        <div className="chat-compose">{storageError && <p className="chat-error" role="status">{storageError}</p>}{portraits.pollError&&<p className="chat-error" role="status">{portraits.pollError}</p>}{error && <p className="chat-error" role="alert">{error} 输入内容已保留。</p>}{!configured && <p className="chat-error">对话接口尚未配置。<button onClick={onKey}>设置 API Key</button></p>}{attachments.length>0&&<div className="chat-attachments">{attachments.map((image,index)=><div className="chat-reference-item" key={image.id??image.jobId}><figure><img src={mediaPreview(image.id,image.preview)} onError={e=>fallbackMediaPreview(e.currentTarget,image.preview)} alt={image.name}/><figcaption>{image.name}</figcaption><button aria-label={`移除聊天参考图${index+1}`} disabled={optimizing} onClick={()=>setAttachments(previous=>previous.filter((_,i)=>i!==index))}><X size={12}/></button></figure>{image.id&&<div className="chat-reference-library"><PortraitStatus value={image.portrait} retry={()=>void portraits.retry(image.id!)} refresh={()=>void portraits.refresh(image.id!)}/></div>}</div>)}</div>}<div className="chat-input-wrap"><textarea ref={draftInput} aria-label="对话内容" placeholder="输入消息，或描述要生成的图片、视频…" maxLength={8000} value={draft} onChange={e => setDraft(e.target.value)} onPaste={e=>{if(e.clipboardData.files.length){e.preventDefault();void uploadImages(e.clipboardData.files);}}} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}/><input ref={attachmentInput} hidden type="file" multiple accept="image/png,image/jpeg,image/webp" aria-label="上传聊天参考图片" onChange={e=>void uploadImages(e.target.files)}/><button className="chat-optimize" aria-label="提示词优化" aria-describedby="chat-optimize-tooltip" aria-busy={optimizing} disabled={!ready||!configured||!draft.trim()||Boolean(pending)||uploading||optimizing} onClick={()=>void optimizePrompt()}>{optimizing?<LoaderCircle size={17} className="spin"/>:<><WandSparkles size={17}/><i className="chat-optimize-dot"/></>}<span id="chat-optimize-tooltip" className="chat-optimize-tooltip" role="tooltip">提示词优化</span></button><button className="chat-attach" aria-label="添加聊天参考图片" title="添加参考图片" disabled={uploading||Boolean(pending)||optimizing||attachments.length>=10} onClick={()=>attachmentInput.current?.click()}>{uploading?<LoaderCircle size={17} className="spin"/>:<Paperclip size={17}/>}</button><button className="chat-send" aria-label="发送消息" disabled={!ready || !configured || !draft.trim() || Boolean(pending)||uploading||optimizing} onClick={() => void send()}>{pending ? <LoaderCircle size={21} className="spin"/> : <ArrowUp size={23}/>}</button></div><div className="chat-compose-help"><span>Enter 发送 · Shift + Enter 换行</span>{draft.length>7000&&<span>{draft.length} / 8,000</span>}</div></div>
      </section>
    </div>
  </main>;
}
