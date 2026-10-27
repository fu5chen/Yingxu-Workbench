import http from 'node:http';

const agent=new http.Agent({keepAlive:true,maxSockets:64,maxFreeSockets:16,timeout:45000});
const retryStatus=status=>[502,503,504].includes(status);
export function proxyRequest(request,response,{upstream,headers,pathname,onFailure=()=>{},delays=[300,900]}) {
 const readOnly=['GET','HEAD'].includes(request.method),maximum=readOnly?delays.length+1:1;
 let attempt=0,current,timer,finished=false;
 const stop=()=>{finished=true;clearTimeout(timer);current?.destroy();};
 request.once('aborted',stop);
 response.once('close',()=>{if(!response.writableEnded)stop();});
 const retryOrFail=(code,status=502)=>{
  if(finished||response.destroyed)return;
  onFailure({path:pathname,method:request.method,code,attempt});
  if(readOnly&&attempt<maximum&&!response.headersSent){timer=setTimeout(run,delays[attempt-1]);return;}
  finished=true;
  if(response.headersSent){response.destroy();return;}
  if(request.method==='GET'&&!pathname.startsWith('/api/')&&String(request.headers.accept??'').includes('text/html')){
   response.writeHead(503,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Retry-After':'5','X-Content-Type-Options':'nosniff'});
   response.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5"><title>工作台正在恢复</title><body style="font:16px system-ui;padding:10vh 8vw;background:#f7f8fc;color:#334155"><h1>工作台连接暂时中断</h1><p>正在尝试恢复连接，此页面将在 5 秒后自动刷新。</p><p>请勿重复提交生成请求，恢复后可查看原任务进度。</p><button onclick="location.reload()">重新连接</button></body></html>');return;
  }
  response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':'2','X-Content-Type-Options':'nosniff'});
  response.end(JSON.stringify({error:readOnly?'工作台连接暂时中断，将自动重新同步任务状态。':'连接中断，提交结果待确认，请先查看任务记录，避免重复提交。',code:'origin_unavailable'}));
 };
 const run=()=>{
  if(finished||response.destroyed)return;
  attempt++;let settled=false;
  const outbound=http.request({hostname:upstream.hostname,port:upstream.port,path:request.url,method:request.method,headers,agent},result=>{
   if(finished){result.destroy();return;}
   if(readOnly&&retryStatus(result.statusCode)&&attempt<maximum){settled=true;result.on('error',()=>{});result.resume();retryOrFail('HTTP_'+result.statusCode,result.statusCode);return;}
   settled=true;
   const outputHeaders={...result.headers};
   if(!/^\/api\/studio\/(?:media|generated)\//.test(pathname))outputHeaders['cache-control']='no-store';
   for(const key of ['connection','keep-alive','proxy-connection','transfer-encoding','upgrade'])delete outputHeaders[key];
   response.writeHead(result.statusCode??502,outputHeaders);
   result.on('aborted',()=>{onFailure({path:pathname,method:request.method,code:'RESPONSE_ABORTED',attempt});stop();response.destroy();});
   result.on('error',()=>{stop();response.destroy();});
   result.on('end',()=>{finished=true;});
   result.pipe(response);
  });
  current=outbound;
  outbound.setTimeout(180000,()=>outbound.destroy(Object.assign(new Error('Origin timeout'),{code:'ETIMEDOUT'})));
  outbound.on('error',error=>{if(!settled){settled=true;retryOrFail(error.code??'ORIGIN_ERROR');}});
  if(attempt===1)request.pipe(outbound);else outbound.end();
 };
 run();
}

export function configureGatewayConnections(server) {
 // cloudflared normally retains idle origin connections for 90 seconds.
 server.keepAliveTimeout=120000;
 server.keepAliveTimeoutBuffer=5000;
 server.headersTimeout=130000;
}
