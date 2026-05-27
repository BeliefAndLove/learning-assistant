import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  /** 选区所在回答对应的上一条 user 消息，用于星图把分支挂回正确提问节点 */
  sourceMessageIndex?: number;
};

/** 当前帧之下的"已下钻分支"，用来在原文上做持久高亮 */
export type BranchAnchor = {
  branchId: string;
  sourceText: string;
  /** 用于 tooltip 显示，例如截断后的分支标题 */
  label: string;
  /** 在父节点中的序号（1-indexed），显示在锚点 badge 中 */
  ordinal: number;
};

type Props = {
  item: StackItem;
  /** 选区追问 → 父层 push 子帧（父层负责附加 ancestors） */
  onAsk: (req: AskRequest) => void;
  /** 本帧消息变化时回写给上层树节点 */
  onMessagesChange: (messages: ChatMessage[]) => void;
  /** 仅 qa 帧有效：返回上一层 */
  onPop?: () => void;
  /** 本帧在栈中的索引 */
  level: number;
  /** 当前帧之下的所有已下钻分支（用于原文持久高亮） */
  branchAnchors?: BranchAnchor[];
  /** 当前悬停的分支节点 id（用于联动发光） */
  hoveredBranchId?: string | null;
  /** 鼠标移动到持久高亮锚点时回调，传递分支节点 id（null=离开） */
  onAnchorHover?: (branchId: string | null) => void;
  /** 点击持久高亮锚点时回调，传递分支节点 id */
  onAnchorClick?: (branchId: string) => void;
  /** 当前帧是否为可见顶层（栈内非顶层带 scale 动画，高亮会错位） */
  layerActive?: boolean;
  /** 布局世代：栈动画结束或分栏变化时递增，触发高亮重算 */
  layoutEpoch?: number;
  /** 从星图点击节点过来时，要求滚动到的消息索引 + nonce（同索引也能重复触发） */
  scrollTarget?: { messageIndex: number; nonce: number } | null;
};

type Popover = {
  x: number;
  y: number;
  placement: "above" | "below";
  text: string;
  sourceMessageIndex?: number;
} | null;

type HighlightRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** 持久高亮一个分支锚点的所有矩形集合 */
type AnchorLayout = {
  branchId: string;
  ordinal: number;
  label: string;
  rects: HighlightRect[];
  /** 最后一个 rect 的右上角，用来贴 badge */
  badge: { left: number; top: number } | null;
};

export function ConversationFrame({
  item,
  onAsk,
  onMessagesChange,
  onPop,
  level,
  branchAnchors,
  hoveredBranchId,
  onAnchorHover,
  onAnchorClick,
  layerActive = true,
  layoutEpoch = 0,
  scrollTarget,
}: Props) {
  const settings = useSettings();
  const messages = item.messages ?? [];
  const [input, setInput] = useState("");
  const [popover, setPopover] = useState<Popover>(null);
  const [highlight, setHighlight] = useState<HighlightRect[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [anchorLayouts, setAnchorLayouts] = useState<AnchorLayout[]>([]);
  const [pulseIndex, setPulseIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dispatchedForIndexRef = useRef<number>(-1);
  const initializedRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>(messages);

  const isRoot = item.type === "root";
  const stableAnchors = useMemo(() => branchAnchors ?? [], [branchAnchors]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    dispatchedForIndexRef.current = -1;
    initializedRef.current = messages.length > 0;
    setInput("");
    setPopover(null);
    setHighlight(null);
    setLoading(false);
    setAnchorLayouts([]);
    setPulseIndex(null);
  }, [item.id]);

  // 响应星图点击：scrollTarget.nonce 变化 → 平滑滚动到对应消息并播放脉冲
  useEffect(() => {
    if (!scrollTarget || !layerActive) return;
    const idx = scrollTarget.messageIndex;
    if (idx < 0 || idx >= messages.length) return;

    // 等待帧动画/布局稳定后再 scroll，否则 scrollIntoView 会与 stack 切换冲突
    const t = window.setTimeout(() => {
      const el = document.getElementById(`msg-${item.id}-${idx}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setPulseIndex(idx);
      window.setTimeout(() => setPulseIndex((cur) => (cur === idx ? null : cur)), 1800);
    }, 160);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTarget?.nonce, item.id]);

  const setMessages = useCallback(
    (
      next:
        | ChatMessage[]
        | ((current: ChatMessage[]) => ChatMessage[]),
    ) => {
      const resolved =
        typeof next === "function" ? next(messagesRef.current) : next;
      messagesRef.current = resolved;
      onMessagesChange(resolved);
    },
    [onMessagesChange],
  );

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

        const selectedMessageIndex = getSelectionMessageIndex(range);
        const sourceMessageIndex =
          selectedMessageIndex === null
            ? undefined
            : findPreviousUserMessageIndex(messagesRef.current, selectedMessageIndex);

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

        setPopover({ x, y, placement, text, sourceMessageIndex });
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

  // —— 持久高亮：在 prose 渲染完后，定位每个 anchor.sourceText 的矩形 ——
  const recomputeAnchors = useCallback(() => {
    if (!layerActive) {
      setAnchorLayouts([]);
      return;
    }
    const prose = proseRef.current;
    const scrollContent = scrollContentRef.current;
    if (!prose || !scrollContent || stableAnchors.length === 0) {
      setAnchorLayouts([]);
      return;
    }
    const scRect = scrollContent.getBoundingClientRect();
    const layouts: AnchorLayout[] = [];

    for (const a of stableAnchors) {
      const ranges = findTextRangesInContainer(prose, a.sourceText);
      if (ranges.length === 0) {
        layouts.push({
          branchId: a.branchId,
          ordinal: a.ordinal,
          label: a.label,
          rects: [],
          badge: null,
        });
        continue;
      }
      // 只取第一个匹配，避免重复噪声
      const range = ranges[0];
      const clientRects = Array.from(range.getClientRects()).filter(
        (r) => r.width > 0 && r.height > 0,
      );
      const rects: HighlightRect[] = clientRects.map((r) => ({
        left: r.left - scRect.left,
        top: r.top - scRect.top,
        width: r.width,
        height: r.height,
      }));
      const last = rects[rects.length - 1];
      const badge = last
        ? {
            left: last.left + last.width - 8,
            top: last.top - 8,
          }
        : null;
      layouts.push({
        branchId: a.branchId,
        ordinal: a.ordinal,
        label: a.label,
        rects,
        badge,
      });
    }
    setAnchorLayouts(layouts);
  }, [stableAnchors, layerActive]);

  // 在消息变化或 anchors 变化后重算（仅活跃层）
  useLayoutEffect(() => {
    if (!layerActive) {
      setAnchorLayouts([]);
      return;
    }
    recomputeAnchors();
  }, [messages, stableAnchors, recomputeAnchors, layerActive]);

  // 回到父分支 / 栈动画结束 / 分栏变化后延迟重算，避免 scale 动画导致偏移
  useEffect(() => {
    if (!layerActive) return;
    const raf = requestAnimationFrame(recomputeAnchors);
    const t = window.setTimeout(recomputeAnchors, 420);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [layerActive, layoutEpoch, recomputeAnchors]);

  // 滚动时同步高亮位置
  useEffect(() => {
    if (!layerActive) return;
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recomputeAnchors);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [layerActive, recomputeAnchors]);

  // 监听容器大小变化，自动重新计算高亮位置
  useEffect(() => {
    if (!layerActive) return;
    const target = scrollContentRef.current;
    const scroller = scrollRef.current;
    if (!target) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recomputeAnchors);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(target);
    if (scroller) ro.observe(scroller);
    window.addEventListener("resize", schedule);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf);
    };
  }, [layerActive, recomputeAnchors]);

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
    [settings, item.type, item.topic, item.sourceText, item.ancestors, setMessages],
  );

  // —— 自动触发：挂载时 + 末尾是 user 时 ——
  useEffect(() => {
    if (messages.length === 0) return;
    const lastIdx = messages.length - 1;
    const last = messages[lastIdx];
    if (last.role !== "user") return;
    if (dispatchedForIndexRef.current >= lastIdx) return;
    dispatchedForIndexRef.current = lastIdx;
    void runLLM(messages);
  }, [messages, runLLM]);

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
    onAsk({
      sourceText: popover.text,
      question,
      sourceMessageIndex: popover.sourceMessageIndex,
    });
    clearSelectionUI();
    window.getSelection()?.removeAllRanges();
  };

  const configured = isConfigured(settings);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full flex flex-col"
      onMouseUp={handleMouseUp}
    >
      {/* 顶部 */}
      {isRoot ? (
        <div className="px-6 py-4 border-b border-white/40 shrink-0
                        bg-gradient-to-b from-indigo-100/45 to-transparent">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl
                            bg-gradient-to-br from-indigo-500 to-rose-500
                            text-white flex items-center justify-center
                            shrink-0 ring-1 ring-white/60 shadow-soft">
              <BookOpenText size={18} strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10.5px] uppercase tracking-[0.12em] text-indigo-700/80 font-semibold">
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
          <div className="px-6 py-4 border-b border-white/40 shrink-0
                          bg-gradient-to-b from-rose-100/55 to-rose-100/15">
            <div className="max-w-3xl mx-auto flex gap-3">
              <Quote
                size={18}
                className="text-rose-500 shrink-0 mt-0.5"
                strokeWidth={2.5}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10.5px] uppercase tracking-[0.12em] text-rose-700/80 font-semibold">
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
        <div className="px-6 py-2.5 border-b border-amber-200/70 bg-amber-50/75 text-[12px] text-amber-900 shrink-0">
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
          <div ref={proseRef} className="max-w-3xl mx-auto px-6 py-6 space-y-5">
            {messages.map((m, i) => (
              <div
                key={i}
                id={`msg-${item.id}-${i}`}
                data-msg-frame={item.id}
                data-msg-index={i}
                className={[
                  "scroll-mt-24 rounded-2xl transition-shadow",
                  pulseIndex === i ? "msg-pulse" : "",
                ].join(" ")}
              >
                <MessageBubble
                  message={m}
                  isStreaming={
                    loading && i === messages.length - 1 && m.role === "assistant"
                  }
                />
              </div>
            ))}
          </div>

          {/* 持久高亮 overlay：每个已下钻分支对应一组矩形 */}
          {anchorLayouts.length > 0 && (
            <div className="pointer-events-none absolute inset-0">
              {anchorLayouts.map((layout) => {
                const isHot = layout.branchId === hoveredBranchId;
                return (
                  <div key={layout.branchId}>
                    {layout.rects.map((r, i) => (
                      <span
                        key={i}
                        className={`persist-mark${isHot ? " is-hot" : ""}`}
                        style={{
                          left: r.left,
                          top: r.top,
                          width: r.width,
                          height: r.height,
                        }}
                      />
                    ))}
                    {layout.badge && (
                      <button
                        type="button"
                        title={`跳转到分支：${layout.label}`}
                        onClick={() => onAnchorClick?.(layout.branchId)}
                        onMouseEnter={() => onAnchorHover?.(layout.branchId)}
                        onMouseLeave={() => onAnchorHover?.(null)}
                        className={`persist-anchor pointer-events-auto${isHot ? " is-hot" : ""}`}
                        style={{
                          left: layout.badge.left,
                          top: layout.badge.top,
                        }}
                      >
                        {layout.ordinal}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 选区瞬时高亮 overlay：放在内容之上、点击穿透 */}
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
      <div className="border-t border-white/40 bg-white/55 backdrop-blur-md shrink-0">
        <div className="max-w-3xl mx-auto px-6 py-3.5 flex items-center gap-3">
          <div
            className="flex-1 flex items-center gap-2 bg-white/90 rounded-xl px-4 py-2.5
                       ring-1 ring-white/60
                       focus-within:ring-indigo-300 focus-within:shadow-focus
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
                className="p-1.5 rounded-lg text-ink-700/55 hover:text-indigo-600 hover:bg-indigo-50
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
                         bg-gradient-to-br from-indigo-500 to-rose-500
                         text-white font-semibold text-[13.5px]
                         shadow-[0_4px_14px_-2px_rgba(99,102,241,0.4)]
                         hover:shadow-[0_6px_20px_-4px_rgba(236,72,153,0.5)]
                         hover:from-indigo-400 hover:to-rose-400
                         active:scale-[0.97] transition-all whitespace-nowrap"
            >
              <Sparkles size={15} className="text-amber-100" />
              <span>回到父分支</span>
              <ArrowLeft
                size={14}
                className="opacity-80 group-hover:-translate-x-0.5 transition-transform"
              />
            </button>
          )}
        </div>
        <div className="max-w-3xl mx-auto px-6 pb-2.5 text-[10.5px] text-ink-700/45 font-mono tracking-wide">
          {isRoot
            ? "主线对话 · 划选任意文本可压栈深入追问；已下钻的原文会保留高亮"
            : "Branch frame · 当前对话与父分支隔离 · 返回只切换路径，不会删除枝叶"}
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

/**
 * 在容器内查找所有文本节点拼接起来的纯文本里，是否出现目标 text；
 * 返回所有出现位置对应的 DOM Range，可能跨多个文本节点。
 */
/** 用于 DOM 文本匹配：去掉 LaTeX $ 与多余空白，兼容 KaTeX 渲染后的纯文本 */
function normalizeForSearch(s: string): string {
  return s
    .replace(/\$\$?([^$]*)\$\$?/g, "$1")
    .replace(/\$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getSelectionMessageIndex(range: Range): number | null {
  const start =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement;
  const messageEl = start?.closest("[data-msg-index]");
  const raw = messageEl?.getAttribute("data-msg-index");
  if (!raw) return null;
  const idx = Number.parseInt(raw, 10);
  return Number.isFinite(idx) ? idx : null;
}

function findPreviousUserMessageIndex(
  messages: ChatMessage[],
  fromIndex: number,
): number | undefined {
  for (let i = Math.min(fromIndex, messages.length - 1); i >= 0; i--) {
    if (messages[i]?.role === "user") return i;
  }
  return undefined;
}

function findTextRangesInContainer(
  container: HTMLElement,
  text: string,
): Range[] {
  const target = text.trim();
  if (target.length < 2) return [];

  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );
  const nodes: { node: Text; start: number; end: number }[] = [];
  let full = "";
  let cur: Node | null;
  // eslint-disable-next-line no-cond-assign
  while ((cur = walker.nextNode())) {
    const t = cur as Text;
    const start = full.length;
    full += t.data;
    nodes.push({ node: t, start, end: full.length });
  }
  if (nodes.length === 0) return [];

  const makeRange = (startIdx: number, endIdx: number): Range | null => {
    const startNode = nodes.find((n) => n.start <= startIdx && n.end > startIdx);
    const endNode = nodes.find((n) => n.start < endIdx && n.end >= endIdx);
    if (!startNode || !endNode) return null;
    try {
      const range = document.createRange();
      range.setStart(startNode.node, startIdx - startNode.start);
      range.setEnd(endNode.node, endIdx - endNode.start);
      return range;
    } catch {
      return null;
    }
  };

  const tryMatch = (query: string): Range[] => {
    if (query.length < 2) return [];
    const result: Range[] = [];
    let searchFrom = 0;
    while (result.length < 5) {
      const idx = full.indexOf(query, searchFrom);
      if (idx === -1) break;
      const range = makeRange(idx, idx + query.length);
      if (range) result.push(range);
      searchFrom = idx + query.length;
    }
    return result;
  };

  // 1. 精确匹配选区原文
  let found = tryMatch(target);
  if (found.length > 0) return found;

  // 2. 去掉 $ 后再匹配（LLM 输出 $Q$ 但 DOM 已是 KaTeX）
  const noDollar = target.replace(/\$/g, "");
  if (noDollar !== target) {
    found = tryMatch(noDollar);
    if (found.length > 0) return found;
  }

  // 3. 规范化后滑动窗口（空白 / LaTeX 与渲染 DOM 不一致时）
  const normTarget = normalizeForSearch(target);
  if (normTarget.length >= 2) {
    const maxLen = Math.min(full.length, target.length * 3 + 32);
    for (let i = 0; i < full.length; i++) {
      for (let len = normTarget.length; len <= maxLen && i + len <= full.length; len++) {
        const slice = full.slice(i, i + len);
        if (normalizeForSearch(slice) === normTarget) {
          const range = makeRange(i, i + len);
          if (range) return [range];
        }
      }
    }
  }

  return [];
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
            ? "bg-gradient-to-br from-indigo-600 to-rose-500 text-white rounded-br-md"
            : "bg-white/85 text-ink-800 rounded-bl-md ring-1 ring-white/60",
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
                   bg-indigo-100/80 text-indigo-700 text-[10.5px] font-medium
                   ring-1 ring-indigo-200/60
                   hover:bg-indigo-200/80 transition-colors"
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
              <div key={a.level} className="border-l-2 border-indigo-300 pl-2.5">
                <div className="text-[11px] font-mono text-indigo-700 font-semibold mb-1">
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
                              ? "font-semibold text-indigo-600"
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
