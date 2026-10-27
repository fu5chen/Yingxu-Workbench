export const transientStatus = (status: number) => [502,503,504,520,521,522,523,524,530].includes(status);
export type ApiResponseError = Error & { status: number; retryable: boolean; retryAfter?: number; code?: string };
function responseError(message: string, response: Response): ApiResponseError {
  const error = new Error(message) as ApiResponseError;
  error.status = response.status;
  error.retryable = transientStatus(response.status);
  const retry = response.headers.get('retry-after');
  error.retryAfter = retry ? Math.max(1, Number(retry) || ((Date.parse(retry) - Date.now()) / 1000)) : undefined;
  return error;
}
export async function readApiResponse(response: Response) {
  let data: any;
  try { data = await response.json(); } catch {
    const message = response.status === 413
      ? "上传请求超过服务限制，视频参考图片须小于 30 MB。请检查文件大小后重试。"
      : transientStatus(response.status) ? '外网连接暂时中断，正在重新连接工作台。'
      : `服务返回了异常响应（HTTP ${response.status}），请稍后重试。`;
    throw responseError(message, response);
  }
  // A successfully fetched task can itself have failed. Its error belongs to
  // the task card; it is not an HTTP/API failure envelope.
  const task = typeof data?.id === 'string' && typeof data?.status === 'string'
    && data?.request && typeof data.request === 'object' && typeof data.request.prompt === 'string';
  if (!response.ok || typeof data?.error === "string" && !task) {
    const error = responseError(data?.error ?? "操作失败，请重试。", response);
    if (typeof data?.code === 'string') error.code = data.code;
    throw error;
  }
  return data;
}
