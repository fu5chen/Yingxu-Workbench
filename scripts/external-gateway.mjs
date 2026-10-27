import http from "node:http";
import {diskCapacityAvailable} from "./disk-capacity.mjs";
import { readFileSync } from "node:fs";
import { createHmac, pbkdf2Sync, timingSafeEqual, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseEnv } from 'node:util';
import { readKeyConfiguration, configuredKey, API_KEY_FIELDS } from './key-configuration.mjs';
import { proxyRequest, configureGatewayConnections } from './http-proxy.mjs';

const directory = new URL("../.sites-runtime/external-access/", import.meta.url);
const config = JSON.parse(readFileSync(new URL("gateway.json", directory), "utf8"));
const runtimeSecret=parseEnv(readFileSync(new URL('../.env',import.meta.url),'utf8')).STUDIO_RUNNER_TOKEN;
const cookieName = "__Host-yingxu_access";
const sign = value => createHmac("sha256", config.sessionSecret).update(value).digest("hex");
const equal = (a,b) => typeof a==="string" && typeof b==="string" && a.length===b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const attempts = new Map();
let globalWindow=0,globalCount=0;
function validSession(request) {
  const token=(request.headers.cookie??"").split(";").map(v=>v.trim()).find(v=>v.startsWith(cookieName+"="))?.slice(cookieName.length+1)??"";
  const split=token.lastIndexOf("."),payload=token.slice(0,split),sig=token.slice(split+1);
  return equal(sign(payload),sig) && Number(payload.split(".")[0])>Date.now();
}
function send(response,status,body,type="application/json",headers={}) {
  response.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...headers});
  response.end(typeof body==="string"?body:JSON.stringify(body));
}
function cookie(value){return `${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${value?43200:0}`;}
const loginPage=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>映序工作台 · 外网登录</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f7f6ff;color:#272638;font:16px system-ui;display:grid;place-items:center;min-height:100vh;padding:24px}form{width:min(440px,100%);padding:36px;background:white;border:1px solid #e4defa;border-radius:24px;box-shadow:0 16px 60px #382b6910}h1{font-size:27px;margin:10px 0}p,small{color:#77718c;line-height:1.6}label{display:block;margin-top:20px}input,button{width:100%;padding:14px;border-radius:10px;font:inherit;margin-top:8px}input{border:1px solid #ddd6ee}button{background:#785ce1;border:0;color:white;margin-top:24px;cursor:pointer}#error{color:#bf375a;min-height:24px}</style>
<form><small>映序 · 私人创作工作台</small><h1>登录工作台</h1><p>使用管理员账号访问图片、视频与对话。</p><label>账号<input name="username" autocomplete="username" maxlength="100" required></label><label>密码<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><p id="error" role="alert"></p><button>登录</button><small>仅限授权访问</small></form>
<script>document.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button'),out=document.getElementById('error');b.disabled=true;out.textContent='';try{const r=await fetch('/_access/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:f.username.value,password:f.password.value})});const d=await r.json();if(!r.ok)throw Error(d.error);location.replace('/')}catch(e){out.textContent=e.message}finally{b.disabled=false}})</script></html>`;

const server=http.createServer(async(request,response)=>{
  let publicOrigin="";
  try{publicOrigin=readFileSync(new URL("origin.txt",directory),"utf8").trim();}catch{}
  const host=request.headers.host??"";
  const local=host===`127.0.0.1:${config.port}` || host===`localhost:${config.port}`;
  if(!local && (!publicOrigin || host!==new URL(publicOrigin).host)){send(response,403,{error:"访问地址无效。"});return;}
  const origin=local?`http://${host}`:publicOrigin;
  const pathname=new URL(request.url,origin).pathname;
  if(pathname.startsWith('/_runtime/')){
    if(!local){send(response,404,{error:'页面不存在。'});return;}
    if(!equal(request.headers['x-studio-runner'],runtimeSecret)){send(response,403,{error:'访问无效。'});return;}
    const provider=pathname.slice('/_runtime/keys/'.length);
    if(request.method!=='GET'||!pathname.startsWith('/_runtime/keys/')||!Object.hasOwn(API_KEY_FIELDS,provider)){send(response,404,{error:'页面不存在。'});return;}
    try{send(response,200,{apiKey:configuredKey(readKeyConfiguration(fileURLToPath(new URL('../confiykey.json',import.meta.url))),provider)});}catch{send(response,503,{error:'confiykey.json 配置文件不可读取，请检查 JSON 格式。'});}
    return;
  }
  if(pathname.startsWith("/api/studio/internal")){send(response,404,{error:"页面不存在。"});return;}
  if(request.method!=="GET" && request.method!=="HEAD" &&
     (request.headers.origin!==origin || request.headers["sec-fetch-site"]==="cross-site")){
    send(response,403,{error:"不允许跨站请求。"});return;
  }
  if(pathname==="/login" && request.method==="GET"){send(response,200,loginPage,"text/html; charset=utf-8");return;}
  if(pathname==="/_access/login" && request.method==="POST"){
    const window=Math.floor(Date.now()/900000);
    if(window!==globalWindow){globalWindow=window;globalCount=0;attempts.clear();}
    const ip=String(request.headers["cf-connecting-ip"]??request.socket.remoteAddress);
    const count=(attempts.get(ip)??0)+1;attempts.set(ip,count);globalCount++;
    if(count>10 || globalCount>100){send(response,429,{error:"登录尝试过多，请 15 分钟后重试。"});return;}
    try{
      let body="",size=0;
      for await(const chunk of request){size+=chunk.length;if(size>4096){send(response,413,{error:"登录请求过大。"});return;}body+=chunk.toString();}
      const input=JSON.parse(body);
      if(typeof input.username!=="string"||typeof input.password!=="string"||input.password.length>256){send(response,400,{error:"请填写账号和密码。"});return;}
      const actual=pbkdf2Sync(input.password,config.salt,100000,32,"sha256").toString("hex");
      if(!equal(actual,config.passwordHash)||input.username!==config.username){send(response,401,{error:"账号或密码错误。"});return;}
      const payload=`${Date.now()+43200000}.${randomBytes(24).toString("hex")}`;
      send(response,200,{ok:true},"application/json",{"Set-Cookie":cookie(`${payload}.${sign(payload)}`)});
    }catch{send(response,400,{error:"登录请求无效。"});}
    return;
  }
  if(!validSession(request)){
    if(pathname.startsWith("/api/")||pathname.startsWith("/_access/"))send(response,401,{error:"请先登录工作台。"});
    else send(response,302,"","text/plain",{"Location":"/login"});
    return;
  }
  if(pathname==="/_access/logout"&&request.method==="POST"){send(response,200,{ok:true},"application/json",{"Set-Cookie":cookie("")});return;}
  if(request.method==='POST'&&/^\/api\/studio\/(?:upload|jobs|images|chat|chat-optimize|portrait-assets)(?:\/|$)/.test(pathname)&&!diskCapacityAvailable(fileURLToPath(new URL('../',import.meta.url)),process.env.STUDIO_SUBMIT_RESERVE_MIB)){
    send(response,503,{error:'服务器存储空间不足，已暂停新任务和上传，请联系管理员释放空间。',code:'storage_capacity_low'},'application/json',{'Retry-After':'60'});return;
  }
  // Only the built application is exposed. The development server is never proxied.
  const upstream=new URL(config.upstream);
  const headers={...request.headers,host:upstream.host};
  for(const name of Object.keys(headers)){
    if(name.startsWith("oai-authenticated-")||name.startsWith("x-forwarded-")||["forwarded","connection","upgrade","cf-connecting-ip"].includes(name))delete headers[name];
  }
  if(headers.origin)headers.origin=upstream.origin;
  headers.cookie=(headers.cookie??"").split(";").filter(v=>!v.trim().startsWith(cookieName+"=")).join(";");
  proxyRequest(request,response,{upstream,headers,pathname,onFailure:info=>console.error(JSON.stringify({type:'origin-connection',...info}))});
});
configureGatewayConnections(server);
server.on("upgrade",(_request,socket)=>socket.destroy());
server.listen(config.port,"127.0.0.1",()=>console.log(`Authenticated gateway ready: http://127.0.0.1:${config.port}`));
