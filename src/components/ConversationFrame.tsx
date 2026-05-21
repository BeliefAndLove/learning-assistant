import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpenText,
  Layers,
  Loader2,
  Quote,
  Send,
  Settings as SettingsIcon,
  Sparkles,
  StopCircle,
} from "lucide-react";
import type { AncestorFrameSnapshot, ChatMessage, StackItem } from "../types";
import { Markdown } from "./Markdown";
import { AskComposer } from "./AskComposer";
import {
  LLMConfigError,
  streamChatCompletion,
} from "../lib/llm";
import { isConfigured, toLLMConfig, useSettings } from "../lib/settings";
import { buildLLMMessages } from "../lib/context";

export type AskRequest = {
  sourceText: string;
  question: string;
};

type Props = {
  item: StackItem;
  /** 选区追问 → 父层 push 子帧（父层负责附加 ancestors） */
  onAsk: (req: AskRequest) => void;
  /** 仅 qa 帧有效：返回上一层 */
  onPop?: () => void;
  /** 本帧在栈中的索引 */
  level: number;
};

type Popover = {
  x: number;
  y: number;
  placement: "above" | "below";
  text: string;
} | null;

type HighlightRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function ConversationFrame({ item, onAsk, onPop, level }: Props) {
  const settings = useSettings();
  const [messages, setMessages] = useState<ChatMessage[]>(item.messages ?? []);
  const [input, setInput] = useState("");
  const [popover, setPopover] = useState<Popover>(null);
  const [highlight, setHighlight] = useState<HighlightRect[] | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dispatchedForIndexRef = useRef<number>(-1);
  const initializedRef = useRef(false);

  const isRoot = item.type === "root";

  const clearSelectionUI = useCallback(() => {
    setPopover(null);
    setHighlight(null);
  }, []);

  // —— 选区检测 ——
  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      // 点击 / 鼠标释放发生在 popover 内时，不要重算或清掉
      if (popoverRef.current?.contains(e.target as Node)) return;
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        const container = containerRef.current;
        const scrollContent = scrollContentRef.current;
        if (!sel || sel.isCollapsed || !container) return clearSelectionUI();
        const text = sel.toString().trim();
        if (text.length < 2) return clearSelectionUI();
        const range = sel.getRangeAt(0);
        if (!container.contains(range.commonAncestorContainer))
          return clearSelectionUI();

        // popover 锚点（相对 container）
        const rect = range.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        const spaceAbove = rect.top - cRect.top;
        const placement: "above" | "below" =
          spaceAbove < 220 ? "below" : "above";
        const x = rect.left + rect.width / 2 - cRect.left;
        const y =
          placement === "above"
            ? rect.top - cRect.top
            : rect.bottom - cRect.top;

        // 高亮 overlay 矩形（相对 scrollContent，跟随滚动）
        if (scrollContent) {
          const scRect = scrollContent.getBoundingClientRect();
          const clientRects = Array.from(range.getClientRects());
          const rects: HighlightRect[] = clientRects
            .filter((r) => r.width > 0 && r.height > 0)
            .map((r) => ({
              left: r.left - scRect.left,
              top: r.top - scRect.top,
              width: r.width,
              height: r.height,
            }));
          setHighlight(rects.length > 0 ? rects : null);
        }

        setPopover({ x, y, placement, text });
      });
    },
    [clearSelectionUI],
  );

  // click-outside：仅当点击发生在 popover 外部时才关闭
  useEffect(() => {
    if (!popover) return;
    const onMouseDown = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      clearSelectionUI();
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [popover, clearSelectionUI]);

  // 注意：不在 unmount 时 abort fetch——React 18 StrictMode 下会触发
  // "演练 unmount" 立刻把刚发出的请求干掉。让 fetch 自然完成，组件已 unmount
  // 时 setMessages 会被 React silent-ignore。用户主动点 StopCircle 才走 abort。

  // 滚动到底（仅在长度增减时；流式追加单条不滚太频繁）
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  // —— 调用 LLM ——
  const runLLM = useCallback(
    async (history: ChatMessage[]) => {
      const config = toLLMConfig(settings);
      if (!config) {
        setMessages((cur) => [
          ...cur,
          {
            role: "assistant",
            content:
              "⚠️ 还没配置模型。点击左下角「添加新的模型方」填好 API 主机 / API Key / 模型 后再来一次。",
          },
        ]);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

      setMessages((cur) => [...cur, { role: "assistant", content: "" }]);

      const llmMessages = buildLLMMessages({
        type: item.type,
        topic: item.topic,
        sourceText: item.sourceText,
        ancestors: item.ancestors,
        messages: history,
        config: settings.context,
      });

      try {
        await streamChatCompletion(
          config,
          llmMessages,
          (delta) => {
            setMessages((cur) => {
              if (cur.length === 0) return cur;
              const copy = cur.slice();
              const last = copy[copy.length - 1];
              if (last.role !== "assistant") return cur;
              copy[copy.length - 1] = {
                ...last,
                content: last.content + delta,
              };
              return copy;
            });
          },
          controller.signal,
        );
      } catch (err) {
        const aborted =
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError");
        if (aborted) {
          setMessages((cur) => {
            if (cur.length === 0) return cur;
            const copy = cur.slice();
            const last = copy[copy.length - 1];
            if (last.role === "assistant") {
              copy[copy.length - 1] = {
                ...last,
                content: last.content
                  ? last.content + "\n\n_（已中止）_"
                  : "_（已中止）_",
              };
            }
            return copy;
          });
        } else {
          const msg =
            err instanceof LLMConfigError
              ? `配置错误：${err.message}`
              : err instanceof Error
                ? err.message
                : String(err);
          setMessages((cur) => {
            if (cur.length === 0) return cur;
            const copy = cur.slice();
            const last = copy[copy.length - 1];
            if (last.role === "assistant") {
              copy[copy.length - 1] = {
                ...last,
                content: `❌ 请求失败：${msg}`,
              };
            }
            return copy;
          });
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setLoading(false);
      }
    },
    [settings, item.type, item.topic, item.sourceText, item.ancestors],
  );

  // —— 自动触发：挂载时 + 末尾是 user 时 ——
  useEffect(() => {
    // 主线首次打开且没有任何消息 → 注入开场 user 消息
    if (!initializedRef.current && messages.length === 0 && isRoot && item.topic) {
      initializedRef.current = true;
      const opening: ChatMessage = {
        role: "user",
        content: `我想学习「${item.topic}」。请给我一个清晰的总览：核心问题、关键概念、学习路径。`,
      };
      setMessages([opening]);
      return;
    }
    if (messages.length === 0) return;
    const lastIdx = messages.length - 1;
    const last = messages[lastIdx];
    if (last.role !== "user") return;
    if (dispatchedForIndexRef.current >= lastIdx) return;
    dispatchedForIndexRef.current = lastIdx;
    void runLLM(messages);
  }, [messages, isRoot, item.topic, runLLM]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(nextMessages);
    setInput("");
    // useEffect 会检测到末尾 user 自动触发 runLLM
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleAskFromSelection = (question: string) => {
    if (!popover) return;
    onAsk({ sourceText: popover.text, question });
    clearSelectionUI();
    window.getSelection()?.removeAllRanges();
  };

  const configured = isConfigured(settings);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full flex flex-col bg-paper"
      onMouseUp={handleMouseUp}
    >
      {/* 顶部 */}
      {isRoot ? (
        <div className="px-6 py-4 border-b border-ink-200/70 shrink-0
                        bg-gradient-to-b from-accent-50/40 to-transparent">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl
                            bg-gradient-to-br from-accent-100 to-accent-50
                            text-accent-600 flex items-center justify-center
                            shrink-0 ring-1 ring-accent-200/60 shadow-soft">
              <BookOpenText size={18} strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink-700/55 font-semibold">
                  主线 · L{level}
                </span>
                <span className="w-[3px] h-[3px] rounded-full bg-ink-300" />
                <span className="text-[10.5px] text-ink-700/45 font-mono">
                  recursive learner
                </span>
              </div>
              <div className="text-[18px] font-semibold text-ink-900 tracking-tight truncate">
                {item.topic ?? item.title}
              </div>
            </div>
          </div>
        </div>
      ) : (
        item.sourceText && (
          <div className="px-6 py-4 border-b border-ink-200/70 shrink-0
                          bg-gradient-to-b from-accent-50/60 to-accent-50/20">
            <div className="max-w-3xl mx-auto flex gap-3">
              <Quote
                size={18}
                className="text-accent-400 shrink-0 mt-0.5"
                strokeWidth={2.5}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10.5px] uppercase tracking-[0.12em] text-accent-600 font-semibold">
                    追问的原文 · L{level}
                  </span>
                  <AncestorsBadge ancestors={item.ancestors ?? []} />
                </div>
                <div className="text-[14px] leading-[1.7] text-ink-800 italic">
                  {item.sourceText}
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {/* 未配置提示 */}
      {!configured && (
        <div className="px-6 py-2.5 border-b border-amber-200/80 bg-amber-50/80 text-[12px] text-amber-900 shrink-0">
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            <SettingsIcon size={13} className="shrink-0 text-amber-700" />
            <span>
              {settings.hosted
                ? "服务端模型尚未就绪，请检查服务器上的 config.json 与 API 反代配置。"
                : "还没配置模型，回答将无法生成。请点击左下角「添加新的模型方」完成配置。"}
            </span>
          </div>
        </div>
      )}

      {/* 对话流 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div ref={scrollContentRef} className="relative">
          <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
            {messages.map((m, i) => (
              <MessageBubble
                key={i}
                message={m}
                isStreaming={
                  loading && i === messages.length - 1 && m.role === "assistant"
                }
              />
            ))}
          </div>
          {/* 选区高亮 overlay：放在内容之上、点击穿透；
              用 multiply 混合 → 不遮挡文字，类似 highlighter 笔触 */}
          {highlight && (
            <div className="pointer-events-none absolute inset-0">
              {highlight.map((r, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: r.left,
                    top: r.top,
                    width: r.width,
                    height: r.height,
                    mixBlendMode: "multiply",
                  }}
                  className="bg-indigo-300/70 rounded-[2px]"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 底部输入区 */}
      <div className="border-t border-ink-200/70 bg-paper/95 backdrop-blur-sm shrink-0">
        <div className="max-w-3xl mx-auto px-6 py-3.5 flex items-center gap-3">
          <div
            className="flex-1 flex items-center gap-2 bg-white rounded-xl px-4 py-2.5
                       ring-1 ring-ink-200/70
                       focus-within:ring-accent-300 focus-within:shadow-focus
                       transition-all"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                loading
                  ? "正在生成…"
                  : isRoot
                    ? "在主线对话里继续提问…"
                    : "继续追问…"
              }
              disabled={loading}
              className="flex-1 bg-transparent outline-none text-[14px] text-ink-800 placeholder:text-ink-700/40 disabled:opacity-60"
            />
            {loading ? (
              <button
                onClick={handleStop}
                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                title="中止生成"
              >
                <StopCircle size={16} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="p-1.5 rounded-lg text-ink-700/55 hover:text-accent-600 hover:bg-accent-50
                           disabled:opacity-25 disabled:hover:text-ink-700/55 disabled:hover:bg-transparent
                           transition-colors"
                title="发送 (Enter)"
              >
                <Send size={16} />
              </button>
            )}
          </div>

          {!isRoot && onPop && (
            <button
              onClick={onPop}
              className="group flex items-center gap-2 px-4 py-2.5 rounded-xl
                         bg-gradient-to-br from-emerald-500 to-emerald-600
                         text-white font-semibold text-[13.5px]
                         shadow-[0_4px_14px_-2px_rgba(16,185,129,0.4)]
                         hover:shadow-[0_6px_20px_-4px_rgba(16,185,129,0.5)]
                         hover:from-emerald-400 hover:to-emerald-500
                         active:scale-[0.97] transition-all whitespace-nowrap"
            >
              <Sparkles size={15} className="text-amber-100" />
              <span>我懂了，返回上一层</span>
              <ArrowLeft
                size={14}
                className="opacity-80 group-hover:-translate-x-0.5 transition-transform"
              />
            </button>
          )}
        </div>
        <div className="max-w-3xl mx-auto px-6 pb-2.5 text-[10.5px] text-ink-700/45 font-mono tracking-wide">
          {isRoot
            ? "主线对话 · 划选任意文本可压栈深入追问，子帧不会污染本层"
            : "Stack frame · 当前对话与上一层完全隔离 · Return 会销毁本层并恢复父层"}
        </div>
      </div>

      {/* 选区追问编辑器 */}
      <AnimatePresence>
        {popover && (
          <AskComposer
            ref={popoverRef}
            x={popover.x}
            y={popover.y}
            sourceText={popover.text}
            placement={popover.placement}
            onSubmit={handleAskFromSelection}
            onClose={() => {
              clearSelectionUI();
              window.getSelection()?.removeAllRanges();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MessageBubble({
  message,
  isStreaming,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
}) {
  const isUser = message.role === "user";
  const empty = message.content.length === 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={[
          "max-w-[85%] rounded-2xl px-4 py-3 text-[14px] leading-[1.75] shadow-soft",
          isUser
            ? "bg-gradient-to-br from-accent-600 to-accent-700 text-white rounded-br-md"
            : "bg-white text-ink-800 rounded-bl-md ring-1 ring-ink-200/70",
        ].join(" ")}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : empty && isStreaming ? (
          <div className="flex items-center gap-2 text-ink-700/55">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-[13px] animate-shimmer">思考中…</span>
          </div>
        ) : (
          <Markdown>{message.content}</Markdown>
        )}
      </div>
    </motion.div>
  );
}

function AncestorsBadge({ ancestors }: { ancestors: AncestorFrameSnapshot[] }) {
  const [open, setOpen] = useState(false);
  if (ancestors.length === 0) return null;
  const totalMsgs = ancestors.reduce(
    (acc, a) =>
      acc + (a.recentMessages?.length ?? (a.lastAssistantExcerpt ? 1 : 0)),
    0,
  );
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded
                   bg-accent-100/80 text-accent-700 text-[10.5px] font-medium
                   ring-1 ring-accent-200/60
                   hover:bg-accent-200/80 transition-colors"
        title="点击查看本帧携带的祖先上下文"
      >
        <Layers size={10} strokeWidth={2.5} />
        <span>
          含 {ancestors.length} 层祖先 · {totalMsgs} 条片段
        </span>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-30 w-[480px] max-w-[80vw]
                     rounded-xl bg-white shadow-soft ring-1 ring-ink-200
                     p-3.5 text-[12px] leading-5 text-ink-800 max-h-[60vh] overflow-y-auto"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-700/50 font-semibold mb-2">
            本帧发往 LLM 时附带的祖先上下文
          </div>
          <div className="space-y-3">
            {ancestors.map((a) => (
              <div key={a.level} className="border-l-2 border-accent-300 pl-2.5">
                <div className="text-[11px] font-mono text-accent-700 font-semibold mb-1">
                  {a.label}
                </div>
                <div className="text-[11.5px] text-ink-700/80 mb-1">
                  {a.type === "root" ? "主线主题：" : "选区原文："}
                  {a.excerpt}
                </div>
                {a.recentMessages && a.recentMessages.length > 0 && (
                  <div className="space-y-1">
                    {a.recentMessages.map((m, i) => (
                      <div key={i} className="text-[11.5px]">
                        <span
                          className={
                            m.role === "user"
                              ? "font-semibold text-accent-600"
                              : "font-semibold text-emerald-600"
                          }
                        >
                          {m.role}:
                        </span>{" "}
                        <span className="text-ink-700/80">
                          {truncateText(m.content, 140)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {!a.recentMessages && a.lastAssistantExcerpt && (
                  <div className="text-[11.5px] text-ink-700/70 italic">
                    最后回答摘要：{a.lastAssistantExcerpt}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function truncateText(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
