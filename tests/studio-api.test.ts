import test from 'node:test';import assert from 'node:assert/strict';
import {studioRequest} from '../lib/studio-api.ts';
import {readApiResponse} from '../lib/api-response.ts';

test('read-only state requests recover from HTML 502 and JSON 503 without losing response data',async()=>{
 let calls=0;const waits:number[]=[];
 const result=await studioRequest('jobs',{}, {fetch:(async(url,init)=>{assert.equal(url,'/api/studio/jobs');assert.equal(init?.cache,'no-store');calls++;return calls===1?new Response('<html>Bad gateway</html>',{status:502}):calls===2?Response.json({error:'temporarily unavailable'},{status:503}):Response.json({jobs:[{id:'existing-video',status:'completed'}]});}) as typeof fetch,sleep:async ms=>{waits.push(ms);}});
 assert.equal(calls,3);assert.deepEqual(waits,[500,1500]);assert.equal(result.jobs[0].status,'completed');
});
test('network resets recover on GET, but a generation POST is never replayed',async()=>{
 let reads=0,writes=0;
 await studioRequest('jobs',{}, {fetch:(async()=>{if(++reads===1)throw new TypeError('Failed to fetch');return Response.json({jobs:[]});}) as typeof fetch,sleep:async()=>{}});
 assert.equal(reads,2);
 await assert.rejects(studioRequest('jobs',{method:'POST',body:'original-task',headers:{'Idempotency-Key':'same-task-id'}},{fetch:(async(_,init)=>{writes++;assert.equal(init?.body,'original-task');return new Response('Bad Gateway',{status:502});}) as typeof fetch,sleep:async()=>{throw Error('A write must not be retried');}}),(error:any)=>error.status===502&&error.retryable===true);
 assert.equal(writes,1);
});
test('persistent outages preserve HTTP metadata; validation and authentication errors are not retried',async()=>{
 let calls=0;
 await assert.rejects(studioRequest('jobs',{}, {fetch:(async()=>{calls++;return new Response('Bad gateway',{status:502});}) as typeof fetch,sleep:async()=>{}}),(error:any)=>error.status===502&&/已有作品/.test(error.message));assert.equal(calls,3);
 for(const status of [401,403,413]){calls=0;await assert.rejects(studioRequest('jobs',{}, {fetch:(async()=>{calls++;return Response.json({error:'real rejection'},{status});}) as typeof fetch,sleep:async()=>{}}),(error:any)=>error.status===status);assert.equal(calls,1);}
 await assert.rejects(readApiResponse(new Response('Bad gateway',{status:502})),(error:any)=>error.status===502&&error.retryable===true);
});

test('successful reads return failed or unknown task details without confusing their error with an API rejection',async()=>{
 for(const status of ['failed','unknown']){
  const task={id:'existing-task',status,request:{prompt:'A lake'},error:'Provider rejected this task'};
  assert.deepEqual(await readApiResponse(Response.json(task)),task);
  await assert.rejects(readApiResponse(Response.json(task,{status:503})),(e:any)=>e.status===503);
 }
 await assert.rejects(readApiResponse(Response.json({error:'Invalid operation'})),/Invalid operation/);
});
