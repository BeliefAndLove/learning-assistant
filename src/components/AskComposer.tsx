import { forwardRef, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  HelpCircle,
  Lightbulb,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";

type Template = {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** 生成的 user 消息 */
  build: (sourceText: string) => string;
};

const TEMPLATES: Template[] = [
  {
    id: "explain",
    label: "解释这段",
    icon: <Lightbulb size={13} />,
    build: (s) => `请帮我解释这段话：「${s}」`,
  },
  {
    id: "why",
    label: "为什么",
    icon: <HelpCircle size={13} />,
    build: (s) => `为什么会有这种说法/现象？请围绕「${s}」展开。`,
  },
  {
    id: "example",
    label: "举个例子",
    icon: <BookOpen size={13} />,
    build: (s) => `能围绕「${s}」给我一个具体例子或代码片段吗？`,
  },
  {
    id: "deeper",
    label: "更深入",
    icon: <Search size={13} />,
    build: (s) =>
      `请就「${s}」做更深入的剖析，说明它背后的原理和取舍。`,
  },
];

type Props = {
  /** popover 锚点（选区中心位置，container 内的相对坐标） */
  x: number;
  y: number;
  /** 选中文本 */
  sourceText: string;
  /** 推荐显示在锚点上方/下方 */
  placement: "above" | "below";
  /** 提交问题 → 父组件 push 子帧 */
  onSubmit: (question: string) => void;
  onClose: () => void;
};

export const AskComposer = forwardRef<HTMLDivElement, Props>(function AskComposer(
  { x, y, sourceText, placement, onSubmit, onClose },
  ref,
) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = (question: string) => {
    const q = question.trim();
    if (!q) return;
    onSubmit(q);
  };

  const handleTemplate = (t: Template) => {
    submit(t.build(sourceText));
  };

  const handleCustomSubmit = () => {
    const text = input.trim();
    if (!text) return;
    submit(`${text}\n\n（基于这段话：「${sourceText}」）`);
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: placement === "above" ? 6 : -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: placement === "above" ? 6 : -6, scale: 0.96 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform:
          placement === "above"
            ? "translate(-50%, calc(-100% - 8px))"
            : "translate(-50%, 8px)",
        zIndex: 50,
      }}
      className="w-[420px] max-w-[92vw] rounded-2xl bg-white/95 backdrop-blur-md
                 shadow-[0_16px_48px_-12px_rgba(15,23,42,0.22),0_4px_12px_-2px_rgba(15,23,42,0.08)]
                 ring-1 ring-ink-200/80
                 overflow-hidden"
    >
      {/* 头部：sourceText 引用 */}
      <div className="px-3.5 pt-3 pb-2.5 bg-gradient-to-b from-accent-50/80 to-accent-50/30
                      border-b border-ink-200/70 flex items-start gap-2">
        <Sparkles
          size={13}
          className="text-accent-500 mt-0.5 shrink-0"
          strokeWidth={2.5}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.12em] text-accent-600 font-semibold">
            深入追问
          </div>
          <div className="text-[12px] leading-5 text-ink-800 italic line-clamp-2 mt-0.5">
            「{sourceText}」
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-ink-700/50 hover:text-ink-900 hover:bg-white/70 shrink-0 transition-colors"
          title="关闭 (Esc)"
        >
          <X size={13} />
        </button>
      </div>

      {/* 模板按钮 */}
      <div className="px-3 py-2.5 grid grid-cols-2 gap-1.5">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTemplate(t)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                       bg-paper-subtle hover:bg-accent-50 text-ink-800
                       hover:text-accent-700 text-[12.5px] transition-colors
                       ring-1 ring-ink-200/60 hover:ring-accent-200"
          >
            <span className="text-accent-500">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* 自定义输入 */}
      <div className="border-t border-ink-200/70 bg-paper-subtle/50 px-3 py-2.5">
        <div className="text-[10px] uppercase tracking-[0.12em] text-ink-700/50 font-semibold mb-1.5">
          或自定义提问
        </div>
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleCustomSubmit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            rows={2}
            placeholder="想怎么问就怎么写… Enter 送出 / Shift+Enter 换行"
            className="flex-1 resize-none px-2.5 py-1.5 rounded-lg bg-white
                       ring-1 ring-ink-200 focus:ring-accent-300 focus:shadow-focus outline-none
                       text-[12.5px] leading-5 text-ink-900 placeholder:text-ink-700/40 transition-all"
          />
          <button
            onClick={handleCustomSubmit}
            disabled={!input.trim()}
            className="p-2 rounded-lg bg-gradient-to-br from-accent-500 to-accent-600 text-white
                       shadow-[0_3px_10px_-2px_rgba(91,98,224,0.4)]
                       hover:from-accent-400 hover:to-accent-500
                       hover:shadow-[0_5px_14px_-2px_rgba(91,98,224,0.5)]
                       disabled:opacity-30 disabled:shadow-none
                       transition-all"
            title="送出 (Enter)"
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </motion.div>
  );
});
