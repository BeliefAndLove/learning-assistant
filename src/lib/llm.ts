export type ChatRole = "user" | "assistant" | "system";

export type LLMMessage = {
  role: ChatRole;
  content: string;
};

export type LLMConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export class LLMConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMConfigError";
  }
}

export class LLMRequestError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "LLMRequestError";
    this.status = status;
  }
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, "") + path;
}

/**
 * 调用 OpenAI 兼容的 /chat/completions 接口，流式返回。
 * onDelta 会被每一段增量内容调用一次，返回完整拼接后的字符串。
 */
export async function streamChatCompletion(
  config: LLMConfig,
  messages: LLMMessage[],
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { baseUrl, apiKey, model } = config;
  if (!baseUrl) throw new LLMConfigError("API 主机未配置");
  if (!model) throw new LLMConfigError("未选择模型");
  // hosted 模式由服务端反代注入 Authorization，浏览器不传 Key

  const url = joinUrl(baseUrl, "/chat/completions");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const res = await fetch(url, {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    throw new LLMRequestError(
      `请求失败 (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      res.status,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let full = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nlIdx: number;
      while ((nlIdx = buffer.indexOf("\n")) >= 0) {
        const rawLine = buffer.slice(0, nlIdx);
        buffer = buffer.slice(nlIdx + 1);
        const line = rawLine.replace(/\r$/, "").trim();
        if (!line) continue;
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return full;
        try {
          const obj = JSON.parse(payload);
          const choice = obj?.choices?.[0];
          const delta: unknown =
            choice?.delta?.content ?? choice?.message?.content;
          if (typeof delta === "string" && delta.length > 0) {
            full += delta;
            onDelta(delta);
          }
          const finish = choice?.finish_reason;
          if (finish && finish !== "null") {
            // 部分服务不发 [DONE]，遇到 finish_reason 也视为结束
          }
        } catch {
          // 单行 JSON 解析失败时跳过——可能是注释行或 keep-alive
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return full;
}
