import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ChatMessage } from "../types";
import type { StackItem } from "../types";
import { ConversationFrame, type AskRequest } from "./ConversationFrame";
import type { BranchAnchor } from "./ConversationFrame";

type Props = {
  stack: StackItem[];
  levelOffset?: number;
  hoveredBranchId: string | null;
  branchAnchorsByNodeId: Record<string, BranchAnchor[]>;
  scrollTarget?: {
    frameId: string;
    messageIndex: number;
    nonce: number;
  } | null;
  onAsk: (parentId: string, req: AskRequest) => void;
  onPop: (nodeId: string) => void;
  onMessagesChange: (nodeId: string, messages: ChatMessage[]) => void;
  onAnchorHover: (branchId: string | null) => void;
  onAnchorClick: (branchId: string) => void;
};

export function StackRenderer({
  stack,
  levelOffset = 0,
  hoveredBranchId,
  branchAnchorsByNodeId,
  scrollTarget,
  onAsk,
  onPop,
  onMessagesChange,
  onAnchorHover,
  onAnchorClick,
}: Props) {
  const topIndex = stack.length - 1;
  const [layoutEpoch, setLayoutEpoch] = useState(0);

  return (
    <div className="relative h-full w-full">
      <AnimatePresence initial={false}>
        {stack.map((item, idx) => {
        const isTop = idx === topIndex;
        const depthFromTop = topIndex - idx;
        const anchors = branchAnchorsByNodeId[item.id] ?? [];

        // 同一个 motion.div 在「顶层 / 非顶层」之间切换 animate 对象，
        // 必须把 filter / scale / x 都明确写出来，否则 framer-motion 不会
        // 重置上一轮残留的 CSS 属性（典型表现：回切后顶层依然带着 blur）。
        const animate = isTop
          ? {
              x: 0,
              opacity: 1,
              scale: 1,
              filter: "blur(0px)",
            }
          : {
              x: 0,
              scale: 1 - Math.min(depthFromTop, 3) * 0.035,
              opacity: 1 - Math.min(depthFromTop, 3) * 0.22,
              filter: `blur(${Math.min(depthFromTop, 3) * 1.2}px)`,
            };

        return (
          <motion.div
            key={`layer-${item.id}`}
            className={[
              "absolute inset-0 overflow-hidden backdrop-blur-2xl",
              isTop
                ? "bg-white/[0.86] shadow-layer"
                : "bg-white/[0.6]",
            ].join(" ")}
            style={{ zIndex: idx }}
            initial={
              idx === 0
                ? { x: 0, opacity: 1, scale: 1, filter: "blur(0px)" }
                : { x: "100%", opacity: 0.7, scale: 1, filter: "blur(0px)" }
            }
            animate={animate}
            exit={{ x: "100%", opacity: 0.5, filter: "blur(0px)" }}
            transition={{ type: "spring", stiffness: 240, damping: 30 }}
            onAnimationComplete={() => {
              if (isTop) setLayoutEpoch((n) => n + 1);
            }}
          >
            {!isTop && (
              <div className="pointer-events-none absolute inset-0 bg-indigo-900/12" />
            )}
            <ConversationFrame
              item={item}
              level={idx + levelOffset}
              layerActive={isTop}
              layoutEpoch={isTop ? layoutEpoch : undefined}
              branchAnchors={anchors}
              hoveredBranchId={hoveredBranchId}
              scrollTarget={
                isTop && scrollTarget && scrollTarget.frameId === item.id
                  ? scrollTarget
                  : null
              }
              onAsk={(req) => onAsk(item.id, req)}
              onPop={() => onPop(item.id)}
              onMessagesChange={(messages) =>
                onMessagesChange(item.id, messages)
              }
              onAnchorHover={onAnchorHover}
              onAnchorClick={onAnchorClick}
            />
          </motion.div>
        );
        })}
      </AnimatePresence>
    </div>
  );
}
