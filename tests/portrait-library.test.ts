import test from "node:test";
import assert from "node:assert/strict";
import { activePortraitReference, publicPortrait } from "../lib/portrait-state.ts";
import { signArkRequest } from "../lib/ark-signing.ts";

const active = { ark_id: "asset-example", ark_status: "Active", ark_project: "another-project", ark_group: "group-example" };
test("only ready assets in the inference project can be submitted", () => {
  assert.equal(activePortraitReference(active, "another-project", "group-example"), "asset://asset-example");
  for (const ark_status of ["Processing", "Uploading", "Failed", "Unknown", "Blocked", null]) {
    assert.throws(() => activePortraitReference({ ...active, ark_status }, "another-project", "group-example"));
  }
  assert.throws(() => activePortraitReference(active, "example-project", "group-example"));
  assert.throws(() => activePortraitReference(active, "another-project", "group-other"));
  assert.throws(() => activePortraitReference({ ...active, ark_id: "https://other.example" }, "another-project", "group-example"));
});
test("portrait UI receives status and IDs without object URLs or credentials", () => {
  assert.deepEqual(publicPortrait({ ...active, ark_error: null }), { id: "asset-example", groupId: "group-example", status: "Active", error: null });
  assert.equal(publicPortrait({}).status, "NotImported");
});
test("OpenAPI signing binds the request to the correct regional Ark host and body", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  const first = signArkRequest("CreateAsset", '{"AssetType":"Image"}', "test-ak", "test-secret", now);
  const second = signArkRequest("CreateAsset", '{"AssetType":"Video"}', "test-ak", "test-secret", now);
  assert.equal(new URL(first.url).hostname, "ark.ap-southeast-1.byteplusapi.com");
  assert.match(first.headers.Authorization, /20261020\/ap-southeast-1\/ark\/request/);
  assert.notEqual(first.headers.Authorization, second.headers.Authorization);
  assert.ok(!JSON.stringify(first).includes("test-secret"));
  assert.equal(first.headers["x-date"], "20261020T000000Z");
});
