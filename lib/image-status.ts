export function imagePending(status: string) {
  return ["submitting", "queued", "in_progress", "unknown"].includes(status);
}
export function imageStatusMessage(job: { status: string; error?: string;contentPending?:boolean }) {
  if(job.contentPending)return '生成已完成，正在准备结果文件…';
  if (job.error) return job.error;
  if (imagePending(job.status)) return job.status === "unknown" ? "结果待确认，正在刷新…" : "正在生成，请稍候…";
  if (job.status === "completed") return "图片已生成，正在读取结果…";
  return "图片生成失败，请检查提示后重试。";
}
