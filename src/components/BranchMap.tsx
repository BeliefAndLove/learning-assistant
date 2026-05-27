import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpenText,
  CornerDownRight,
  Layers,
  MessageCircle,
  Quote,
  Sparkles,
  X,
} from "lucide-react";
import type { LearningGraph } from "../types";
import {
  clampTransform,
  computeFitTransform,
  computeMindmapLayout,
  type MindNode,
} from "../lib/treeLayout";

type Props = {
  graph: LearningGraph;
  activePathIds: Set<string>;
  hoveredNodeId: string | null;
  /** 点击星图节点 → 切到帧并滚动到该条消息 */
  onSelect: (frameId: string, messageIndex: number) => void;
  /** 悬停分支节点 → 让左侧原文相应高亮发光 */
  onHover: (frameId: string | null) => void;
};

export function BranchMap({
  graph,
  activePathIds,
  hoveredNodeId,
  onSelect,
  onHover,
}: Props) {
  const [open, setOpen] = useState(false);
  const [expandedFrameIds, setExpandedFrameIds] = useState<Set<string>>(
    () => new Set(),
  );

  const layout = useMemo(
    () => computeMindmapLayout(graph, { expandedFrameIds }),
    [graph, expandedFrameIds],
  );
  const { nodes, width, height } = layout;
  const branchFrames = useMemo(
    () => Object.values(graph.nodesById).filter((n) => n.type !== "root").length,
    [graph],
  );

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const totalUserMessages = nodes.length;

  return (
    <>
      {/* 底部胶囊触发器 */}
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 280, damping: 26 }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
        className="fixed bottom-5 right-5 z-40 group
                   pointer-events-auto inline-flex items-center gap-2.5
                   pl-2 pr-4 py-2 rounded-full
                   border border-white/30 bg-white/[0.9]
                   backdrop-blur-xl shadow-float
                   text-ink-800 text-[12.5px] font-semibold
                   hover:bg-white transition-colors"
        title="展开全屏知识星图"
      >
        <span
          className="h-7 w-7 rounded-full flex items-center justify-center
                     bg-gradient-to-br from-indigo-500 via-violet-500 to-rose-500
                     text-white shadow-[0_3px_10px_rgba(99,102,241,0.45)]
                     group-hover:shadow-[0_3px_14px_rgba(236,72,153,0.55)]
                     transition-shadow"
        >
          <Sparkles size={13} strokeWidth={2.6} />
        </span>
        <span className="flex flex-col leading-tight pr-0.5">
          <span className="text-[12px] tracking-tight">知识星图</span>
          <span className="text-[10px] font-mono text-ink-500">
            {totalUserMessages} 节点 · {branchFrames} 分支
          </span>
        </span>
      </motion.button>

      {open &&
        createPortal(
          <MindMapOverlay
            key={`mindmap-${graph.activeNodeId}-${nodes.length}`}
            graph={graph}
            activePathIds={activePathIds}
            hoveredNodeId={hoveredNodeId}
            layout={layout}
            width={width}
            height={height}
            expandedFrameIds={expandedFrameIds}
            onExpandFrame={(frameId) => {
              setExpandedFrameIds((cur) => {
                const next = new Set(cur);
                next.add(frameId);
                return next;
              });
            }}
            onCollapseFrame={(frameId) => {
              setExpandedFrameIds((cur) => {
                const next = new Set(cur);
                next.delete(frameId);
                return next;
              });
            }}
            onClose={() => setOpen(false)}
            onSelect={(frameId, msgIdx) => {
              onSelect(frameId, msgIdx);
              setOpen(false);
            }}
            onHover={onHover}
          />,
          document.body,
        )}
    </>
  );
}

function MindMapOverlay({
  graph,
  activePathIds,
  hoveredNodeId,
  layout,
  width,
  height,
  expandedFrameIds,
  onExpandFrame,
  onCollapseFrame,
  onClose,
  onSelect,
  onHover,
}: {
  graph: LearningGraph;
  activePathIds: Set<string>;
  hoveredNodeId: string | null;
  layout: ReturnType<typeof computeMindmapLayout>;
  width: number;
  height: number;
  expandedFrameIds: Set<string>;
  onExpandFrame: (frameId: string) => void;
  onCollapseFrame: (frameId: string) => void;
  onClose: () => void;
  onSelect: (frameId: string, messageIndex: number) => void;
  onHover: (frameId: string | null) => void;
}) {
  const { nodes, edges } = layout;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [hoverNodeId, setLocalHover] = useState<string | null>(null);
  const transformRef = useRef(transform);
  transformRef.current = transform;

  const setSafeTransform = useCallback(
    (
      next:
        | { x: number; y: number; scale: number }
        | ((cur: { x: number; y: number; scale: number }) => {
            x: number;
            y: number;
            scale: number;
          }),
    ) => {
      const viewport = viewportRef.current;
      setTransform((cur) => {
        const resolved = typeof next === "function" ? next(cur) : next;
        if (!viewport) return resolved;
        return clampTransform(
          resolved,
          viewport.clientWidth,
          viewport.clientHeight,
          layout,
        );
      });
    },
    [layout],
  );

  const applyFit = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (vw <= 0 || vh <= 0) return;
    const next = computeFitTransform(vw, vh, layout);
    setSafeTransform(next);
  }, [layout, setSafeTransform]);

  // 打开后等视口有尺寸再居中（避免 flex 首帧 clientWidth=0 把图甩飞）
  useLayoutEffect(() => {
    applyFit();
    const viewport = viewportRef.current;
    if (!viewport) return;

    const ro = new ResizeObserver(() => {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      if (vw <= 0 || vh <= 0) return;
      const cur = transformRef.current;
      if (cur.x === 0 && cur.y === 0 && cur.scale === 1) {
        setSafeTransform(computeFitTransform(vw, vh, layout));
      }
    });
    ro.observe(viewport);

    const raf = requestAnimationFrame(() => applyFit());
    const t = window.setTimeout(() => applyFit(), 80);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [applyFit, layout]);

  // Ctrl/⌘ + 滚轮缩放；普通滚轮不拦截，避免误触把视图缩没
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setSafeTransform((t) => {
        const factor = e.deltaY < 0 ? 1.08 : 0.92;
        const nextScale = Math.min(2.4, Math.max(0.18, t.scale * factor));
        const k = nextScale / t.scale;
        return {
          x: cx - (cx - t.x) * k,
          y: cy - (cy - t.y) * k,
          scale: nextScale,
        };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setSafeTransform]);

  // Pointer 拖拽平移（带阈值 + 边界限制 + capture）
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    tx: number;
    ty: number;
    moved: boolean;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-mind-node]")) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      tx: transformRef.current.x,
      ty: transformRef.current.y,
      moved: false,
    };
    onHover(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    const raw = { x: drag.tx + dx, y: drag.ty + dy, scale: transformRef.current.scale };
    setSafeTransform(raw);
  };

  const endDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      viewportRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const onDoubleClickBackground = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-mind-node]")) return;
    if ((e.target as HTMLElement).closest("button")) return;
    applyFit();
  };

  return (
    <motion.div
      key="mindmap-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-[100] flex flex-col"
      style={{
        background:
          "radial-gradient(ellipse at 50% 30%, rgba(99, 102, 241, 0.25), rgba(10, 12, 38, 0.95) 60%), #05071c",
      }}
    >
      {/* 顶栏 */}
      <div className="relative flex items-center justify-between px-6 py-4 z-10">
        <div className="flex items-center gap-3">
          <span
            className="h-9 w-9 rounded-2xl flex items-center justify-center
                       bg-gradient-to-br from-indigo-400 via-violet-500 to-rose-500
                       text-white shadow-[0_4px_18px_rgba(99,102,241,0.45)]"
          >
            <Sparkles size={16} strokeWidth={2.4} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[14px] font-bold text-white tracking-tight">
              知识星图 · Cosmic Mindmap
            </span>
            <span className="text-[11px] text-indigo-200/70 font-mono">
              {nodes.length} 可见节点 · 点击 + 展开追问 · Ctrl/⌘+滚轮缩放
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Legend />
          <button
            type="button"
            onClick={applyFit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                       border border-white/15 bg-white/[0.08] hover:bg-white/[0.16]
                       text-[12px] text-white/85 backdrop-blur-md transition-colors"
            title="复位视图，重新居中全部节点"
          >
            复位视图
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                       border border-white/15 bg-white/[0.08] hover:bg-white/[0.16]
                       text-[12px] text-white/85 backdrop-blur-md transition-colors"
            title="退出星图（Esc）"
          >
            <X size={13} />
            关闭
          </button>
        </div>
      </div>

      {/* 主舞台 */}
      <div
        ref={viewportRef}
        className="relative flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none", userSelect: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onDoubleClick={onDoubleClickBackground}
        onMouseLeave={() => onHover(null)}
      >
        {/* 网格背景 */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(148,163,184,0.18) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            backgroundPosition: `${transform.x}px ${transform.y}px`,
          }}
        />

        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-indigo-200/60 text-sm">
            暂无节点，先在对话里发送提问或划选文字下钻
          </div>
        ) : (
        <div
          className="absolute origin-top-left"
          style={{
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
            width,
            height,
            willChange: "transform",
          }}
        >
          {/* 连线 SVG */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={width}
            height={height}
            style={{ overflow: "visible" }}
          >
            <defs>
              <linearGradient
                id="active-gradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <stop offset="0%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#fb7185" />
              </linearGradient>
              <filter id="glow-soft" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
              </filter>
            </defs>

            {edges.map((e) => {
              const fromNode = layout.nodeById.get(e.fromId);
              const toNode = layout.nodeById.get(e.toId);
              const isActive =
                fromNode &&
                toNode &&
                activePathIds.has(fromNode.frameId) &&
                activePathIds.has(toNode.frameId);

              if (e.kind === "question") {
                return (
                  <path
                    key={e.id}
                    d={e.path}
                    fill="none"
                    stroke={isActive ? "#60a5fa" : "rgba(96,165,250,0.62)"}
                    strokeWidth={isActive ? 3.6 : 3}
                    strokeLinecap="round"
                    className="drop-shadow-[0_0_5px_rgba(96,165,250,0.55)]"
                  />
                );
              }
              // deep-dive edge
              return (
                <path
                  key={e.id}
                  d={e.path}
                  fill="none"
                  stroke={isActive ? "#c084fc" : "rgba(192,132,252,0.54)"}
                  strokeWidth={isActive ? 3 : 2.2}
                  strokeDasharray="7 5"
                  strokeLinecap="round"
                  className="drop-shadow-[0_0_5px_rgba(192,132,252,0.45)]"
                />
              );
            })}
          </svg>

          {/* 节点层 */}
          {nodes.map((n) => (
            <MindNodeView
              key={n.id}
              node={n}
              isActive={
                graph.activeNodeId === n.frameId &&
                (n.kind === "deepDive" || n.kind === "root" || isLastUserOfFrame(layout.nodes, n))
              }
              isFrameActive={graph.activeNodeId === n.frameId}
              inActivePath={activePathIds.has(n.frameId)}
              isHotBranch={n.kind === "deepDive" && hoveredNodeId === n.frameId}
              isLocalHover={hoverNodeId === n.id}
              isCollapsedDeepDive={
                n.kind === "deepDive" &&
                !expandedFrameIds.has(n.frameId) &&
                countUserMessages(graph, n.frameId) > 1
              }
              isExpandedDeepDive={
                n.kind === "deepDive" &&
                expandedFrameIds.has(n.frameId) &&
                countUserMessages(graph, n.frameId) > 1
              }
              onExpand={() => onExpandFrame(n.frameId)}
              onCollapse={() => onCollapseFrame(n.frameId)}
              onClick={() => {
                const isCollapsedDeepDive =
                  n.kind === "deepDive" &&
                  !expandedFrameIds.has(n.frameId) &&
                  countUserMessages(graph, n.frameId) > 1;
                if (isCollapsedDeepDive) {
                  onExpandFrame(n.frameId);
                  return;
                }
                onSelect(n.frameId, n.messageIndex);
              }}
              onMouseEnter={() => {
                setLocalHover(n.id);
                if (n.kind === "deepDive") onHover(n.frameId);
              }}
              onMouseLeave={() => {
                setLocalHover((cur) => (cur === n.id ? null : cur));
                if (n.kind === "deepDive") onHover(null);
              }}
            />
          ))}
        </div>
        )}

        <button
          type="button"
          onClick={applyFit}
          className="absolute right-5 bottom-5 z-20 rounded-full border border-white/15
                     bg-white/[0.08] px-3 py-1.5 text-[12px] text-white/80
                     backdrop-blur-md hover:bg-white/[0.16] hover:text-white
                     transition-colors"
          title="节点不见时点击这里重新居中"
        >
          找回节点
        </button>
      </div>

      {/* 底栏提示 */}
      <div className="relative px-6 py-3 z-10 text-center text-[11.5px] text-indigo-200/55 font-mono">
        大节点默认折叠 · 点击 + 展开 · 拖拽平移 · 双击空白复位 · Esc 退出
      </div>
    </motion.div>
  );
}

function isLastUserOfFrame(nodes: MindNode[], n: MindNode): boolean {
  let lastOrdinal = -1;
  for (const x of nodes) {
    if (x.frameId === n.frameId && x.ordinal > lastOrdinal) lastOrdinal = x.ordinal;
  }
  return n.ordinal === lastOrdinal;
}

function countUserMessages(graph: LearningGraph, frameId: string): number {
  const frame = graph.nodesById[frameId];
  if (!frame) return 0;
  return frame.messages.filter((m) => m.role === "user").length;
}

function MindNodeView({
  node,
  isActive,
  isFrameActive,
  inActivePath,
  isHotBranch,
  isLocalHover,
  isCollapsedDeepDive,
  isExpandedDeepDive,
  onExpand,
  onCollapse,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  node: MindNode;
  isActive: boolean;
  isFrameActive: boolean;
  inActivePath: boolean;
  isHotBranch: boolean;
  isLocalHover: boolean;
  isCollapsedDeepDive: boolean;
  isExpandedDeepDive: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const isRoot = node.kind === "root";
  const isDeepDive = node.kind === "deepDive";

  // 节点尺寸统一，靠颜色/图标区分提问与深入追问，避免视觉误读。
  const size = 32;
  const Icon = isRoot ? BookOpenText : isDeepDive ? CornerDownRight : MessageCircle;

  const baseColor = isRoot
    ? "from-indigo-400 via-violet-500 to-rose-400"
    : isDeepDive
      ? "from-violet-400 via-purple-500 to-fuchsia-500"
      : "from-sky-400 via-blue-500 to-indigo-500";

  const ringColor = isFrameActive
    ? isDeepDive
      ? "ring-violet-200/85"
      : "ring-sky-200/85"
    : inActivePath
      ? isDeepDive
        ? "ring-violet-300/60"
        : "ring-sky-300/60"
      : "ring-white/15";

  const opacity = inActivePath || isLocalHover || isHotBranch ? 1 : 0.85;

  return (
    <div
      data-mind-node
      className="absolute"
      style={{
        left: node.x - size / 2,
        top: node.y - size / 2,
        width: size,
        height: size,
      }}
    >
      {/* 当前激活节点的脉冲 */}
      {isActive && (
        <div
          className="absolute inset-0 rounded-full animate-ping"
          style={{
            background:
              "radial-gradient(circle, rgba(251,113,133,0.6), rgba(251,113,133,0) 70%)",
          }}
        />
      )}

      <motion.button
        type="button"
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        whileHover={{ scale: 1.18 }}
        whileTap={{ scale: 0.92 }}
        animate={{ opacity }}
        transition={{ type: "spring", stiffness: 360, damping: 22 }}
        className={[
          "relative h-full w-full rounded-full",
          "bg-gradient-to-br",
          baseColor,
          "ring-2",
          ringColor,
          isDeepDive
            ? "shadow-[0_4px_20px_rgba(168,85,247,0.5)]"
            : "shadow-[0_4px_18px_rgba(59,130,246,0.48)]",
          "text-white flex items-center justify-center",
          "outline-none focus:outline-none",
        ].join(" ")}
        title={
          isCollapsedDeepDive
            ? "点击展开该追问下的提问节点"
            : isExpandedDeepDive
              ? "点击进入该追问；右下角 - 可收起提问节点"
              : node.text
        }
      >
        <Icon size={isRoot ? 15 : isDeepDive ? 15 : 13} strokeWidth={2.6} />
      </motion.button>

      {isCollapsedDeepDive && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
          className="absolute -right-1.5 -bottom-1.5 h-4 min-w-4 rounded-full
                     bg-white text-[10px] leading-4 text-center font-bold
                     text-rose-600 ring-1 ring-rose-300 shadow
                     hover:scale-110 active:scale-95 transition-transform"
          title="已折叠，点击展开"
        >
          +
        </button>
      )}

      {isExpandedDeepDive && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCollapse();
          }}
          className="absolute -right-1.5 -bottom-1.5 h-4 min-w-4 rounded-full
                     bg-violet-950/90 text-[11px] leading-4 text-center font-bold
                     text-white ring-1 ring-violet-200/70 shadow
                     hover:scale-110 active:scale-95 transition-transform"
          title="已展开，点击收起提问节点"
        >
          -
        </button>
      )}

      {/* 悬浮卡片 */}
      <AnimatePresence>
        {isLocalHover && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className="absolute z-20 pointer-events-none"
            style={{
              left: size + 12,
              top: -size / 2,
              width: 280,
            }}
          >
            <NodeCard node={node} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NodeCard({ node }: { node: MindNode }) {
  const isRoot = node.kind === "root";
  const isDeepDive = node.kind === "deepDive";
  const kindLabel = isRoot
    ? "主线 · 起点"
    : isDeepDive
      ? "深入追问 · 紫色节点"
      : "提问 · 蓝色节点";
  const kindColor = isRoot
    ? "bg-indigo-500/20 text-indigo-100 ring-indigo-300/40"
    : isDeepDive
      ? "bg-violet-500/20 text-violet-100 ring-violet-300/40"
      : "bg-sky-500/15 text-sky-100 ring-sky-300/40";

  return (
    <div
      className="rounded-2xl border border-white/15 bg-[#0a0f25]/95
                 backdrop-blur-xl p-3.5 shadow-[0_16px_44px_rgba(0,0,0,0.5)]"
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className={[
            "px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide ring-1",
            kindColor,
          ].join(" ")}
        >
          {kindLabel}
        </span>
        <span className="ml-auto text-[10px] font-mono text-indigo-200/55">
          L{node.depth} · #{node.ordinal + 1}
        </span>
      </div>

      {isDeepDive && node.sourceText && (
        <div
          className="mb-2 flex gap-1.5 rounded-lg px-2 py-1.5
                     bg-violet-500/10 text-[11px] leading-relaxed text-violet-100/85
                     ring-1 ring-violet-400/20"
        >
          <Quote size={10} className="mt-0.5 shrink-0 text-violet-300/80" />
          <span className="line-clamp-3">{node.sourceText}</span>
        </div>
      )}

      <div className="text-[12px] leading-relaxed text-white/90 line-clamp-4">
        {node.text}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div
      className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-xl
                 border border-white/12 bg-white/[0.05] backdrop-blur-md
                 text-[10.5px] text-indigo-100/85"
    >
      <Dot color="from-indigo-400 via-violet-500 to-rose-400" big />
      <span>主线起点</span>
      <Dot color="from-violet-400 via-purple-500 to-fuchsia-500" />
      <span>深入追问紫色节点</span>
      <Dot color="from-sky-400 via-blue-500 to-indigo-500" />
      <span>普通提问蓝色节点</span>
      <span className="opacity-40 mx-1">|</span>
      <Layers size={11} className="text-indigo-200/80" />
      <span className="opacity-80">蓝线=提问 · 紫色虚线=追问</span>
    </div>
  );
}

function Dot({
  color,
  big,
  small,
}: {
  color: string;
  big?: boolean;
  small?: boolean;
}) {
  const s = big ? 12 : small ? 6 : 9;
  return (
    <span
      className={[
        "rounded-full bg-gradient-to-br ring-1 ring-white/40",
        color,
      ].join(" ")}
      style={{ width: s, height: s }}
    />
  );
}
