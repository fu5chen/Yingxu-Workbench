import { open } from "node:fs/promises";

export async function downloadMedia(url, destination, {headers={},local=false,maximum=512*1024*1024,concurrency=4,chunkSize=512*1024}={}) {
  const parsed=new URL(url);
  if(parsed.protocol!=="https:"&&!(local&&parsed.protocol==="http:"&&parsed.hostname==="127.0.0.1"))throw Error("Unsupported media source");
  const started=Date.now(),deadline=AbortSignal.timeout(12*60*1000);
  const request=(extra={})=>fetch(url,{headers:{...headers,...extra},redirect:"follow",signal:AbortSignal.any([deadline,AbortSignal.timeout(120000)])});
  const probe=await request({Range:"bytes=0-0"});
  if(!probe.ok)throw Error(`Source HTTP ${probe.status}`);
  const range=probe.headers.get("content-range")?.match(/^bytes 0-0\/(\d+)$/),etag=probe.headers.get("etag");
  const total=range?Number(range[1]):Number(probe.headers.get("content-length")??0);
  if(total>maximum){await probe.body?.cancel();throw Error("Media exceeds size limit");}
  const handle=await open(destination,"w");
  async function write(bytes,offset){let position=0;while(position<bytes.byteLength){const result=await handle.write(bytes,position,bytes.byteLength-position,offset+position);if(!result.bytesWritten)throw Error("Incomplete cache write");position+=result.bytesWritten;}}
  try {
    if(!range){let size=0;for await(const part of probe.body){if(size+part.byteLength>maximum)throw Error("Media exceeds size limit");await write(part,size);size+=part.byteLength;}if(total&&size!==total)throw Error("Incomplete source body");return{bytes:size,milliseconds:Date.now()-started,parallel:false};}
    await probe.body?.cancel();
    if(!Number.isSafeInteger(total)||total<=0)throw Error("Invalid media length");
    await handle.truncate(total);
    let next=0;
    async function worker(){
      for(;;){const start=next;next+=chunkSize;if(start>=total)return;const end=Math.min(total-1,start+chunkSize-1),expected=end-start+1;let failure;
        for(let attempt=0;attempt<3;attempt++)try{
          const response=await request({Range:`bytes=${start}-${end}`,...(etag?{"If-Match":etag}:{})});
          if(response.status!==206||response.headers.get("content-range")!==`bytes ${start}-${end}/${total}`){await response.body?.cancel();throw Error(`Invalid range response ${response.status}`);}
          if(etag&&response.headers.get("etag")&&response.headers.get("etag")!==etag)throw Error("Source changed during download");
          let received=0;for await(const part of response.body){if(received+part.byteLength>expected)throw Error("Range exceeded expected length");await write(part,start+received);received+=part.byteLength;}
          if(received!==expected)throw Error("Incomplete media range");failure=null;break;
        }catch(error){failure=error;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));}
        if(failure)throw failure;
      }
    }
    const results=await Promise.allSettled(Array.from({length:Math.min(concurrency,Math.ceil(total/chunkSize))},worker));
    const failed=results.find(result=>result.status==="rejected");if(failed)throw failed.reason;
    return{bytes:total,milliseconds:Date.now()-started,parallel:true};
  } finally {await handle.close();}
}
