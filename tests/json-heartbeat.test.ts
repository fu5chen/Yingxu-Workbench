import test from "node:test";
import assert from "node:assert/strict";
import { jsonHeartbeat } from "../lib/json-heartbeat.ts";
import { readApiResponse } from "../lib/api-response.ts";
test("long image responses send an immediate heartbeat then parse as normal JSON", async () => {
  let finish!: (value: unknown) => void;
  const response = jsonHeartbeat(() => new Promise(resolve => {finish=resolve;}), () => "error");
  const reader = response.body!.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "\n");
  finish({status:"completed",url:"/image.png"});
  const result = await reader.read();
  assert.equal(JSON.parse(new TextDecoder().decode(result.value)).status, "completed");
  assert.equal((await reader.read()).done, true);
});
test("errors after response headers remain visible to API callers", async () => {
  const response=jsonHeartbeat(async()=>{throw Error("private detail");},()=> "生成等待超时");
  await assert.rejects(()=>readApiResponse(response),/生成等待超时/);
});
