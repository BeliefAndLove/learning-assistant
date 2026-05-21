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
  "React Hooks 原理",
  "Transformer 自注意力机制",
  "PostgreSQL MVCC",
  "量子纠缠",
];

export function Breadcrumbs({ stack, onJump, onNewSession }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <header className="z-50 flex items-center gap-1 px-5 h-12 border-b border-ink-200/60 bg-paper/85 backdrop-blur-md shrink-0">
      <span className="text-[10.5px] text-ink-700/55 mr-2 font-mono tracking-[0.12em] uppercase">
        Call Stack
      </span>

      <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto">
        {stack.map((item, idx) => {
          const isLast = idx === stack.length - 1;
          const Icon = item.type === "root" ? Home : MessageCircleQuestion;
          const label =
            item.type === "root" ? item.topic ?? item.title : item.title;
          return (
            <div key={item.id} className="flex items-center gap-1">
              {idx > 0 && (
                <ChevronRight
                  size={14}
                  className="text-ink-200 shrink-0"
                  strokeWidth={2.5}
                />
              )}
              <button
                onClick={() => !isLast && onJump(idx)}
                disabled={isLast}
                className={[
                  "flex items-center gap-1.5 px-2 py-1 rounded-md text-[13px] transition-colors shrink-0",
                  isLast
                    ? "text-ink-900 font-semibold cursor-default"
                    : "text-ink-700/70 hover:bg-ink-200/50 hover:text-ink-900 cursor-pointer",
                ].join(" ")}
                title={isLast ? "当前层" : "返回此层"}
              >
                <Icon size={14} className={isLast ? "text-accent-500" : ""} />
                <span className="max-w-[220px] truncate">{label}</span>
              </button>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setOpen(true)}
        className="ml-2 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                   text-[12.5px] text-ink-700 hover:text-accent-600
                   hover:bg-accent-50 transition-colors shrink-0"
        title="开始一段新的主线对话（会重置当前栈）"
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
                  会清空当前栈，从一个全新的主题开始
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
