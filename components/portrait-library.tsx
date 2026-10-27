"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, RefreshCw, FolderOpen } from "lucide-react";

export type Portrait = { id: string | null; groupId: string | null; status: string; error: string | null };
type Item = { id?: string; kind?: string; remoteImage?: boolean; state?: string; portrait?: Portrait };
type Api = (path: string, init?: RequestInit) => Promise<any>;
export function usePortraitLibrary<T extends Item>(items: T[], setItems: React.Dispatch<React.SetStateAction<T[]>>, enabled: boolean, api: Api) {
  const [config, setConfig] = useState<{groupName: string; groupId: string | null; uploadReady: boolean; message: string | null} | null>(null);
  const current = useRef(items); current.current = items;
  const busy = useRef(new Set<string>());
  const submitted = useRef(new Set<string>());
  const [pollError, setPollError] = useState("");
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout>;
    const load = () => api("portrait-library").then(c => { if(alive){setConfig(c);setPollError("");} }).catch(e => { if(alive){setPollError(e.message);timer=setTimeout(load,15000);} });
    void load();return () => { alive = false;clearTimeout(timer); };
  }, [api]);
  const sync = useCallback(async (id: string, create: boolean) => {
    if (busy.current.has(id)) return;
    busy.current.add(id);
    if (create) setItems(previous => previous.map(a => a.id === id ? { ...a, portrait: { id: a.portrait?.id ?? null, groupId: a.portrait?.groupId ?? config?.groupId ?? null, status: 'Uploading', error: null } } : a));
    try {
      const portrait = await api(`portrait-assets/${id}`, create ? { method: "POST" } : undefined);
      setItems(previous => previous.map(a => a.id === id ? { ...a, portrait } : a));
      setPollError("");
    } catch (error) {
      const message = (error as Error).message;
      if (create) setItems(previous => previous.map(a => a.id === id ? { ...a, portrait: { id: null, groupId: null, status: "Blocked", error: message } } : a));
      else setPollError(message);
    } finally { busy.current.delete(id); }
  }, [api, setItems, config?.groupId]);
  useEffect(() => {
    if (!enabled || !config?.uploadReady) return;
    for (const item of items) {
      if (!item.id || item.remoteImage || item.kind && item.kind !== 'image' || item.state && item.state !== 'ready') continue;
      if ((!item.portrait || item.portrait.status === 'NotImported') && !submitted.current.has(item.id)) {
        submitted.current.add(item.id);
        void sync(item.id, true);
      }
    }
  }, [enabled, config?.uploadReady, items, sync]);
  useEffect(() => {
    if (!enabled) return;
    let canceled = false, timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      for (const a of current.current) {
        if (canceled) return;
        if (a.id && (!a.kind || a.kind === "image") && ["Uploading", "Processing", "Unknown"].includes(a.portrait?.status ?? "")) await sync(a.id, false);
      }
      if (!canceled) timer = setTimeout(tick, 8000);
    };
    timer = setTimeout(tick, 5000);
    return () => { canceled = true; clearTimeout(timer); };
  }, [enabled, sync]);
  return { config, pollError, retry: (id: string) => sync(id, true), refresh: (id: string) => sync(id, false) };
}
export function PortraitLibraryNotice({ config, error }: {config?: {groupName: string; groupId: string | null; uploadReady: boolean; message: string | null} | null; error?: string}) {
  return <div className="portrait-library-notice"><FolderOpen size={20}/><div>
    <strong>虚拟角色先入库，再生成</strong>
    <p>参考图片上传后自动提交素材库审核，审核通过后自动使用资产 ID。</p>
    {config?.uploadReady && <small>素材分组：{config.groupName} · {config.groupId}</small>}
    {config && !config.uploadReady && <small>{config.message}</small>}
    {error && <small role="alert">{error}</small>}
    <small>图片仍需通过接口审核；真人肖像需符合平台的验证和授权要求。</small>
    <small><a href="https://docs.byteplus.com/en/docs/ModelArk/2333565" target="_blank" rel="noopener noreferrer">虚拟肖像库说明</a>{" · "}<a href="https://docs.byteplus.com/en/docs/ModelArk/2315856" target="_blank" rel="noopener noreferrer">真人验证与授权指引</a></small>
  </div></div>;
}
export function PortraitStatus({ value, retry, refresh }: {value?: Portrait; retry: () => void; refresh: () => void}) {
  const status = value?.status ?? "NotImported", pending = ["NotImported", "Uploading", "Processing"].includes(status);
  const text: Record<string, string> = {NotImported:"等待加入素材分组",Uploading:"正在传输并入库…",Processing:"素材库处理中…",Active:"入库成功 · 可用于生成",Blocked:"入库未完成",Failed:"素材处理未通过",Unknown:"提交结果待确认"};
  return <div className={`portrait-state ${status.toLowerCase()}`} role="status"><span>{status === "Active" ? <Check size={15}/> : pending ? <LoaderCircle size={15} className="spin"/> : null}{text[status] ?? "状态待确认"}</span>{value?.error && <small>{value.error}</small>}{value?.id && <small>素材编号：{value.id}</small>}{status === "Blocked" && <button type="button" onClick={retry}><RefreshCw size={13}/>重试入库</button>}{["Processing","Unknown"].includes(status) && <button type="button" onClick={refresh}><RefreshCw size={13}/>刷新状态</button>}</div>;
}
