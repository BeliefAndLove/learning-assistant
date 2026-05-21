import { AnimatePresence, motion } from "framer-motion";
import type { StackItem } from "../types";
import { ConversationFrame, type AskRequest } from "./ConversationFrame";

type Props = {
  stack: StackItem[];
  onAsk: (parentLevel: number, req: AskRequest) => void;
  onPop: () => void;
};

export function StackRenderer({ stack, onAsk, onPop }: Props) {
  const topIndex = stack.length - 1;

  return (
    <div className="relative h-full w-full">
      {stack.map((item, idx) => {
        const isTop = idx === topIndex;
        const depthFromTop = topIndex - idx;

        return (
          <AnimatePresence key={item.id} mode="sync">
            {!isTop && (
              <motion.div
                key={`layer-${item.id}`}
                className="absolute inset-0 overflow-hidden bg-paper-subtle"
                style={{ zIndex: idx }}
                initial={false}
                animate={{
                  scale: 1 - Math.min(depthFromTop, 3) * 0.035,
                  opacity: 1 - Math.min(depthFromTop, 3) * 0.22,
                  filter: `blur(${Math.min(depthFromTop, 3) * 1.2}px)`,
                }}
                transition={{ type: "spring", stiffness: 220, damping: 30 }}
              >
                <div className="pointer-events-none absolute inset-0 bg-ink-900/25" />
                <ConversationFrame
                  item={item}
                  level={idx}
                  onAsk={(req) => onAsk(idx, req)}
                  onPop={idx === 0 ? undefined : onPop}
                />
              </motion.div>
            )}

            {isTop && (
              <motion.div
                key={`layer-${item.id}`}
                className="absolute inset-0 overflow-hidden bg-paper shadow-layer"
                style={{ zIndex: idx }}
                initial={
                  idx === 0
                    ? { x: 0, opacity: 1 }
                    : { x: "100%", opacity: 0.7 }
                }
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: "100%", opacity: 0.5 }}
                transition={{ type: "spring", stiffness: 240, damping: 30 }}
              >
                <ConversationFrame
                  item={item}
                  level={idx}
                  onAsk={(req) => onAsk(idx, req)}
                  onPop={idx === 0 ? undefined : onPop}
                />
              </motion.div>
            )}
          </AnimatePresence>
        );
      })}
    </div>
  );
}
