import test from "node:test";
import assert from "node:assert/strict";
import { parseChat, chatReply, chatReplyWithoutCreation, CHAT_NO_TASK_NOTICE } from "../lib/chat.ts";
import { ACTIVE_VIDEO_MODELS, ACTIVE_IMAGE_MODELS, isActiveVideoModel, isActiveImageModel } from "../lib/active-models.ts";
import { DEFAULT_IMAGE_MODEL, imageReferenceLimit, imagePayload, parseImageGeneration } from "../lib/image-models.ts";

test("chat validates conversation boundaries and locks the provider model", () => {
  const messages = [{ role: "user", content: "你好" }, { role: "assistant", content: "你好！" }, { role: "user", content: "继续" }];
  assert.deepEqual(parseChat({ messages }), { model: "grok-4.7", messages, stream: false });
  for (const body of [
    { messages: [] }, { model: "another-model", messages },
    { messages: [{ role: "system", content: "x" }] },
    { messages: messages.slice(0, 2) },
    { messages: [{ role: "user", content: " " }] },
    { messages: [{ role: "user", content: "a".repeat(24001) }] },
    { messages: Array.from({ length: 43 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x" })) },
    { messages: Array.from({ length: 11 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x".repeat(10000) })) },
  ]) assert.throws(() => parseChat(body));
});
test("chat extracts text without rendering provider HTML and rejects missing answers", () => {
  assert.deepEqual(chatReply({ choices: [{ message: { content: "<script>text</script>" } }] }), { role: "assistant", content: "<script>text</script>" });
  assert.equal(chatReply({ choices: [{ message: { content: [{ type: "text", text: "Hello" }] } }] }).content, "Hello");
  assert.throws(() => chatReply({ choices: [] }));
  assert.throws(() => chatReply({ choices: [{ message: { content: " " } }] }));
});
test("new generations only allow retained models, with Pro-specific image payload", () => {
  assert.deepEqual(ACTIVE_VIDEO_MODELS, ["h3", "dreamina-seedance-2-5-260628"]);
  assert.deepEqual(ACTIVE_IMAGE_MODELS, ['krea2',"dola-seedream-5-0-pro-260628"]);
  assert.equal(isActiveImageModel('krea2'),true);
  assert.equal(isActiveVideoModel("dreamina-seedance-2-0-260128"), false);
  assert.equal(isActiveImageModel("seedream-5-0-lite-260128"), false);
  assert.equal(imageReferenceLimit(DEFAULT_IMAGE_MODEL), 10);
  const parsed = parseImageGeneration({ prompt: "蓝色杯子", size: "2K" });
  assert.equal(parsed.model, "dola-seedream-5-0-pro-260628");
  assert.equal("sequential_image_generation" in imagePayload(parsed), false);
});
test('text alone cannot claim a generation task exists',()=>{
 assert.equal(chatReplyWithoutCreation({choices:[{message:{content:'已将视频任务加入生成队列，进度和作品会显示在下方。'}}]}).content,CHAT_NO_TASK_NOTICE);
 assert.equal(chatReplyWithoutCreation({choices:[{message:{content:'你好，可以先描述一下画面。'}}]}).content,'你好，可以先描述一下画面。');
});
