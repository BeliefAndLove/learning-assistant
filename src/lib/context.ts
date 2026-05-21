import type { AncestorFrameSnapshot, ChatMessage, StackItem } from "../types";
import type { ContextConfig } from "./settings";
import type { LLMMessage } from "./llm";

const SYSTEM_PROMPT =
  "你是 Recursive Learner 的讲解者，帮助用户用「调用栈」的方式递归式学习。" +
  "用户主线在学习一个主题，遇到不懂的句子会划选后进入子帧追问。" +
  "回答时：(1) 直接命中问题核心；(2) 必要时分点；" +
  "(3) 鼓励用户在你的回答里再次划选不懂的词继续下钻。" +
  "请用简体中文 Markdown 输出。";

/** 字符级裁断到 maxChars，超出部分用省略号 */
function truncate(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars).trimEnd() + "…";
}

function lastAssistant(messages: ChatMessage[]): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") return messages[i];
  }
  return undefined;
}

function labelOf(item: StackItem, level: number): string {
  if (item.type === "root") return `L${level} 主线: ${item.topic ?? item.title}`;
  return `L${level} QA: ${item.title}`;
}

/**
 * 在 push 子帧时调用：把"父链 stack"压缩成一组 ancestor snapshots。
 * - 栈深差 ≤ compressDepth：保留最近 K 条对话
 * - 栈深差 >  compressDepth：只保留 sourceText/topic + 最后助手回答的截断
 */
export function buildAncestorSnapshots(
  parentStack: StackItem[],
  config: ContextConfig,
): AncestorFrameSnapshot[] {
  const childLevel = parentStack.length; // 子帧的 level
  return parentStack.map<AncestorFrameSnapshot>((frame, idx) => {
    const distanceFromChild = childLevel - idx;
    const isNear = distanceFromChild <= config.compressDepth;
    const excerpt = frame.type === "root"
      ? frame.topic ?? frame.title
      : frame.sourceText ?? frame.title;

    if (isNear) {
      const recent = frame.messages.slice(-config.ancestorK);
      return {
        level: idx,
        type: frame.type,
        label: labelOf(frame, idx),
        excerpt,
        recentMessages: recent,
      };
    }
    const last = lastAssistant(frame.messages);
    return {
      level: idx,
      type: frame.type,
      label: labelOf(frame, idx),
      excerpt,
      lastAssistantExcerpt: last
        ? truncate(last.content, config.excerptMaxChars)
        : undefined,
    };
  });
}

function renderAncestorAsSystemText(
  ancestors: AncestorFrameSnapshot[],
): string {
  if (ancestors.length === 0) return "";
  const lines: string[] = ["—— 当前学习路径（祖先帧上下文）——"];
  for (const a of ancestors) {
    lines.push("");
    lines.push(`【${a.label}】`);
    if (a.excerpt) {
      lines.push(
        a.type === "root"
          ? `主线主题：${a.excerpt}`
          : `选区原文：「${a.excerpt}」`,
      );
    }
    if (a.recentMessages && a.recentMessages.length > 0) {
      lines.push("该帧最近对话：");
      for (const m of a.recentMessages) {
        const role = m.role === "user" ? "user" : "assistant";
        lines.push(`${role}: ${m.content}`);
      }
    } else if (a.lastAssistantExcerpt) {
      lines.push(`该帧最后回答要点：${a.lastAssistantExcerpt}`);
    }
  }
  return lines.join("\n");
}

/**
 * 构造发给 LLM 的 messages。
 * 入参：当前帧的快照（type、sourceText/topic、ancestors）+ 当前帧的对话历史
 * 出参：[system 人设, system 祖先路径, system 当前焦点, ...当前帧最近 N 条]
 */
export function buildLLMMessages(params: {
  type: "root" | "qa";
  topic?: string;
  sourceText?: string;
  ancestors?: AncestorFrameSnapshot[];
  messages: ChatMessage[];
  config: ContextConfig;
}): LLMMessage[] {
  const { type, topic, sourceText, ancestors, messages, config } = params;
  const out: LLMMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  const ancestorText = renderAncestorAsSystemText(ancestors ?? []);
  if (ancestorText) {
    out.push({ role: "system", content: ancestorText });
  }

  if (type === "root") {
    if (topic) {
      out.push({
        role: "system",
        content: `用户当前的学习主题：${topic}。请围绕它进行讲解和回答。`,
      });
    }
  } else if (sourceText) {
    out.push({
      role: "system",
      content: `用户当前在追问的文本：「${sourceText}」。请围绕它解答。`,
    });
  }

  // 当前帧的滑动窗口
  const window = messages.slice(-config.windowN);
  for (const m of window) {
    out.push({ role: m.role, content: m.content });
  }
  return out;
}
