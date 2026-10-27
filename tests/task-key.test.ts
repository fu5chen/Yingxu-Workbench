import test from "node:test";
import assert from "node:assert/strict";
import {sealTaskKey,openTaskKey,runnerAuthorized} from "../lib/task-key.ts";
test("queued provider keys are encrypted and bound to job, owner and provider",()=>{
 const secret="a".repeat(64),scope=JSON.stringify(["job-id","owner","byteplus_image"]),plain="test-model-key-1234567890";
 const sealed=sealTaskKey(plain,scope,secret);
 assert.ok(!sealed.includes(plain));assert.equal(openTaskKey(sealed,scope,secret),plain);
 assert.notEqual(sealed,sealTaskKey(plain,scope,secret));
 assert.throws(()=>openTaskKey(sealed,JSON.stringify(["job-id","different-owner","byteplus_image"]),secret));
 assert.throws(()=>openTaskKey(sealed,scope,"b".repeat(64)));
 assert.throws(()=>sealTaskKey(plain,scope,undefined));
 assert.equal(runnerAuthorized(null,secret),false);assert.equal(runnerAuthorized(secret,secret),true);assert.equal(runnerAuthorized("b".repeat(64),secret),false);
});
