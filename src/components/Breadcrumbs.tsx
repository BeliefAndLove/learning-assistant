import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight,
  Home,
  MessageCircleQuestion,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import type { StackItem } from "../types";

type Props = {
  stack: StackItem[];
  onJump: (index: number) => void;
  onNewSession: (topic: string) => void;
};

const SAMPLE_TOPICS = [
  "Transformer",
];

export function Breadcrumbs({ stack, onJump, onNewSession }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <header className="z-50 flex items-center gap-1 px-5 h-12 rounded-2xl
                       border border-white/30 bg-white/[0.7] backdrop-blur-xl
                       shadow-glass shrink-0">
      <span className="text-[10.5px] text-indigo-700/70 mr-2 font-mono tracking-[0.12em] uppercase">
        Learning Path
      </span>

      <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto">
        {stack.map((item, idx) => {
          const isLast = idx === stack.length - 1;
          const Icon = item.type === "root" ? Home : MessageCircleQuestion;
          const label =
            item.type === "root" ? item.topic ?? item.title : item.title;
          const isRoot = item.type === "root";
          return (
            <div key={item.id} className="flex items-center gap-1 shrink-0">
              {idx > 0 && (
                <div className="flex items-center gap-0.5 shrink-0 px-0.5">
                  <div className="h-px w-2 bg-indigo-300/70" />
                  <ChevronRight
                    size={13}
                    className="text-indigo-400/80"
                    strokeWidth={2.5}
                  />
                  <div className="h-px w-2 bg-indigo-300/70" />
                </div>
              )}
              <button
                onClick={() => !isLast && onJump(idx)}
                disabled={isLast}
                className={[
                  "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[13px] transition-all shrink-0",
                  isLast
                    ? "bg-gradient-to-br from-indigo-500/12 to-rose-400/10 text-ink-900 font-semibold ring-1 ring-indigo-300/50 cursor-default"
                    : "text-ink-700/75 hover:bg-white/80 hover:text-ink-900 hover:ring-1 hover:ring-ink-200/60 cursor-pointer",
                ].join(" ")}
                title={isLast ? `当前节点 · L${idx}` : `切换到此节点 · L${idx}`}
              >
                <span
                  className={[
                    "rounded px-1 py-0.5 text-[9px] font-bold font-mono leading-none",
                    isRoot
                      ? "bg-indigo-500/15 text-indigo-700"
                      : "bg-violet-500/12 text-violet-700",
                    isLast ? "bg-indigo-600 text-white" : "",
                  ].join(" ")}
                >
                  L{idx}
                </span>
                <Icon size={14} className={isLast ? "text-rose-500" : ""} />
                <span className="max-w-[180px] truncate">{label}</span>
              </button>
            </div>
          );
        })}
        {stack.length > 1 && (
          <span className="ml-1 shrink-0 rounded-md bg-ink-100/70 px-1.5 py-0.5 text-[10px] font-mono text-ink-600">
            深度 L{stack.length - 1}
          </span>
        )}
      </div>

      <button
        onClick={() => setOpen(true)}
        className="ml-2 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                   text-[12.5px] text-ink-800/85 hover:text-indigo-700
                   hover:bg-white/70 transition-colors shrink-0"
        title="开始一段新的主线对话（会重置当前学习树）"
      >
        <Plus size={13} strokeWidth={2.5} />
        <span>新会话</span>
      </button>

      <NewSessionModal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={(topic) => {
          onNewSession(topic);
          setOpen(false);
        }}
      />
    </header>
  );
}

function NewSessionModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (topic: string) => void;
}) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  const handleSubmit = () => {
    const v = value.trim();
    if (!v) return;
    onConfirm(v);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-[520px] max-w-full rounded-2xl bg-white shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-ink-200 flex items-center justify-between">
              <div>
                <div className="text-[15px] font-semibold text-ink-900">
                  开始一段新的主线对话
                </div>
                <div className="text-[12px] text-ink-700/60 mt-0.5">
                  会清空当前学习树，从一个全新的主题开始
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-ink-700/60 hover:text-ink-900 hover:bg-ink-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5">
              <label className="block text-[12.5px] font-semibold text-ink-800 mb-2">
                你想学习什么？
              </label>
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="一个主题或一句话，例如：Transformer 的自注意力机制是怎么工作的？"
                rows={3}
                autoFocus
                className="w-full px-3 py-2.5 rounded-lg bg-white ring-1 ring-ink-200
                           focus:ring-accent-300 focus:shadow-focus outline-none
                           text-[14px] text-ink-900 placeholder:text-ink-700/40 resize-none transition-all"
              />

              <div className="mt-3">
                <div className="text-[11px] uppercase tracking-wider text-ink-700/50 font-semibold mb-1.5">
                  快速选一个示例
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_TOPICS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setValue(t)}
                      className="px-2.5 py-1 rounded-md text-[12px] bg-ink-100 text-ink-800
                                 ring-1 ring-transparent
                                 hover:bg-accent-50 hover:text-accent-700 hover:ring-accent-200
                                 transition-colors"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-ink-200 flex items-center justify-end gap-2 bg-ink-100/40">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-[13px] text-ink-800 hover:bg-ink-200/80"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={!value.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px]
                           font-semibold text-white
                           bg-gradient-to-br from-accent-500 to-accent-600
                           shadow-[0_4px_14px_-2px_rgba(91,98,224,0.4)]
                           hover:from-accent-400 hover:to-accent-500
                           hover:shadow-[0_6px_20px_-4px_rgba(91,98,224,0.5)]
                           disabled:opacity-40 disabled:shadow-none
                           transition-all"
              >
                <Sparkles size={13} className="text-amber-100" />
                开始学习
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
