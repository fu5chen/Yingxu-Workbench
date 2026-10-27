import {readApiResponse, type ApiResponseError} from './api-response.ts';

export async function studioRequest(path:string,init:RequestInit={},dependencies:{fetch?:typeof fetch;sleep?:(ms:number)=>Promise<void>}={}) {
 const fetcher=dependencies.fetch??globalThis.fetch,sleep=dependencies.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 const readOnly=['GET','HEAD'].includes((init.method??'GET').toUpperCase()),attempts=readOnly?3:1;
 for(let attempt=0;attempt<attempts;attempt++) {
  try { return await readApiResponse(await fetcher(`/api/studio/${path}`,{...init,...(readOnly?{cache:'no-store' as const}:{})})); }
  catch(value) {
   const error=value as ApiResponseError;
   const disconnected=error instanceof TypeError||error.name==='TimeoutError';
   if(!readOnly||init.signal?.aborted||!error.retryable&&!disconnected)throw error;
   if(attempt===attempts-1) {
    error.message='最新状态暂时未同步，已有作品仍可查看，连接恢复后会自动刷新。';
    throw error;
   }
   await sleep(Math.min(5000,Math.max([500,1500][attempt],(error.retryAfter??0)*1000)));
  }
 }
}
