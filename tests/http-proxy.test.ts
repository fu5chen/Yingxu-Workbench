import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {proxyRequest,configureGatewayConnections} from '../scripts/http-proxy.mjs';

test('gateway recovers GET after an origin reset and 503, preserves ranges, and does not replay a POST',async t=>{
 let reads=0,writes=0;const bodies:string[]=[];
 const origin=http.createServer((request,response)=>{
  if(request.method==='POST'){writes++;let body='';request.on('data',chunk=>body+=chunk);request.on('end',()=>{bodies.push(body);request.socket.destroy();});return;}
  if(request.url==='/api/studio/media/example'){assert.equal(request.headers.range,'bytes=0-3');response.writeHead(206,{'Content-Range':'bytes 0-3/8','Content-Length':'4','Content-Type':'video/mp4','Cache-Control':'private, max-age=3600'});response.end('test');return;}
  reads++;if(reads===1){request.socket.destroy();return;}if(reads===2){response.writeHead(503);response.end('restarting');return;}response.setHeader('Keep-Alive','timeout=5');response.end(JSON.stringify({jobs:[{id:'retained-video'}]}));
 });
 await new Promise<void>(resolve=>origin.listen(0,'127.0.0.1',resolve));
 const upstream=new URL('http://127.0.0.1:'+(origin.address() as any).port);
 const gateway=http.createServer((request,response)=>proxyRequest(request,response,{upstream,headers:{...request.headers,host:upstream.host},pathname:new URL(request.url!,upstream).pathname,delays:[1,1]}));
 configureGatewayConnections(gateway);assert.ok(gateway.keepAliveTimeout>90000);
 await new Promise<void>(resolve=>gateway.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{gateway.closeAllConnections();origin.closeAllConnections();await Promise.all([new Promise<void>(resolve=>gateway.close(()=>resolve())),new Promise<void>(resolve=>origin.close(()=>resolve()))]);});
 const base='http://127.0.0.1:'+(gateway.address() as any).port;
 const result=await fetch(base+'/api/studio/jobs');assert.equal(result.status,200);assert.equal((await result.json() as any).jobs[0].id,'retained-video');assert.equal(reads,3);assert.equal(result.headers.get('cache-control'),'no-store');assert.ok(!result.headers.get('keep-alive')?.includes('timeout=5'));
 const media=await fetch(base+'/api/studio/media/example',{headers:{Range:'bytes=0-3'}});assert.equal(media.status,206);assert.equal(media.headers.get('content-range'),'bytes 0-3/8');assert.equal(await media.text(),'test');
 const write=await fetch(base+'/api/studio/jobs',{method:'POST',body:'one-generation'});assert.equal(write.status,502);assert.equal((await write.json() as any).code,'origin_unavailable');assert.equal(writes,1);assert.deepEqual(bodies,['one-generation']);
});

test('browser navigation gets a recovery page while API and POST failures remain JSON',async t=>{
 const upstream=new URL('http://127.0.0.1:1');
 const gateway=http.createServer((req,res)=>proxyRequest(req,res,{upstream,headers:req.headers,pathname:new URL(req.url!,upstream).pathname,delays:[]}));
 await new Promise<void>(resolve=>gateway.listen(0,'127.0.0.1',resolve));
 t.after(()=>{gateway.closeAllConnections();gateway.close();});
 const base='http://127.0.0.1:'+(gateway.address() as any).port;
 const page=await fetch(base+'/',{headers:{Accept:'text/html'}});assert.equal(page.status,503);assert.match(await page.text(),/http-equiv="refresh"/);
 const api=await fetch(base+'/api/studio/jobs',{headers:{Accept:'text/html'}});assert.equal(api.status,502);assert.equal((await api.json() as any).code,'origin_unavailable');
 const post=await fetch(base+'/',{method:'POST',headers:{Accept:'text/html'}});assert.equal(post.status,502);assert.match(post.headers.get('content-type')!,/application\/json/);
});
