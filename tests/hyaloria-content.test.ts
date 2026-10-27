import test from 'node:test';import assert from 'node:assert/strict';
import { hyaloriaTask } from '../lib/hyaloria-content.ts';
import { InputError } from '../lib/validation.ts';import { normalizeH3 } from '../lib/hyaloria.ts';
test('completed results retry only content 409/503 with short backoff, then return the ready URL',async()=>{
 const calls:string[]=[],delays:number[]=[];let attempts=0;
 const result=await hyaloriaTask(async path=>{calls.push(path);if(!path.endsWith('/content'))return{id:'job-one',status:'completed',content_url:'/api/hyaloria/v1/jobs/job-one/content'};attempts++;if(attempts<3)throw new InputError('Not yet ready',attempts===1?409:503);return{url:'https://cdn.example.com/result.png'};},'job-one',async ms=>{delays.push(ms);});
 assert.equal(result.status,'completed');assert.equal(result.url,'https://cdn.example.com/result.png');assert.equal(result.content_pending,false);assert.deepEqual(delays,[1000,2000]);assert.equal(calls.filter(x=>x.endsWith('/content')).length,3);assert.equal(calls.filter(x=>!x.endsWith('/content')).length,1);
 assert.equal(normalizeH3(result).url,'https://cdn.example.com/result.png');
});
test('eight unavailable content responses preserve the original job for later polling',async()=>{
 let attempts=0;const delays:number[]=[];
 const result=await hyaloriaTask(async path=>{if(!path.endsWith('/content'))return{id:'same-job',status:'completed',progress:100};attempts++;throw new InputError('File not ready',409);},'same-job',async ms=>{delays.push(ms);});
 assert.equal(attempts,8);assert.equal(delays.length,7);assert.ok(delays.every(ms=>ms>=1000&&ms<=2000));assert.equal(result.id,'same-job');assert.equal(normalizeH3(result).status,'in_progress');assert.equal(normalizeH3(result).contentPending,true);
});
test('pending generation does not request content, while auth and malformed URLs are not retried',async()=>{
 let calls=0;const pending=await hyaloriaTask(async()=>{calls++;return{status:'processing',progress:95};},'job');assert.equal(calls,1);assert.equal(pending.status,'processing');
 for(const status of [401,404,500]){let reads=0;await assert.rejects(()=>hyaloriaTask(async path=>{if(!path.endsWith('/content'))return{status:'completed'};reads++;throw new InputError('Failure',status);},'job',async()=>assert.fail('unexpected retry')));assert.equal(reads,1);}
 await assert.rejects(()=>hyaloriaTask(async path=>path.endsWith('/content')?{url:'http://localhost/file'}:{status:'completed'},'job',async()=>assert.fail('unexpected retry')));
});
