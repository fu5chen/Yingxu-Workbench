import { InputError, httpsUrl } from './validation.ts';

export const HYALORIA_USER_AGENT='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
type Invoke=(path:string)=>Promise<any>;
const sleep=(milliseconds:number)=>new Promise<void>(resolve=>setTimeout(resolve,milliseconds));

// Only retry read-only content retrieval, never repeat POST /jobs.
export async function hyaloriaTask(invoke:Invoke,id:string,wait=sleep){
 const path=`/jobs/${encodeURIComponent(id)}`,raw=await invoke(path);
 if(raw.status!=='completed')return raw;
 for(let attempt=0;attempt<8;attempt++){
  try{const content=await invoke(path+'/content');return {...raw,content_url:undefined,url:httpsUrl(content.url),content_pending:false};}
  catch(error){
   if(!(error instanceof InputError)||![409,503].includes(error.status))throw error;
   if(attempt<7)await wait(attempt===0?1000:2000);
  }
 }
 // The model has completed; keep tracking the same job until its file is ready.
 return {...raw,status:'processing',progress:100,content_pending:true};
}
