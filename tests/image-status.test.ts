import test from "node:test";
import assert from "node:assert/strict";
import { imagePending, imageStatusMessage } from "../lib/image-status.ts";
test("image placeholders distinguish processing, completion and actual failure", () => {
  for (const status of ["submitting", "queued", "in_progress", "unknown"]) {
    assert.equal(imagePending(status), true);
    assert.doesNotMatch(imageStatusMessage({status}), /失败/);
  }
  assert.equal(imagePending("completed"), false);
  assert.doesNotMatch(imageStatusMessage({status:"completed"}), /失败/);
  assert.match(imageStatusMessage({status:"failed"}), /失败/);
  assert.equal(imageStatusMessage({status:"failed",error:"接口连接超时"}), "接口连接超时");
});
