import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { applyHostedPublicConfig, loadHostedPublicConfig } from "./lib/hostedConfig";
import { ARTICLE_MARKDOWN } from "./mock/article";
import type { ChatMessage, LearningGraph, LearningNode } from "./types";
import { StackRenderer } from "./components/StackRenderer";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { SettingsButton } from "./components/SettingsButton";
import { useSettings } from "./lib/settings";
import { buildAncestorSnapshots } from "./lib/context";
import type { AskRequest } from "./components/ConversationFrame";
import { ConversationFrame } from "./components/ConversationFrame";
import { BranchMap } from "./components/BranchMap";
import type { BranchAnchor } from "./components/ConversationFrame";

const DEFAULT_TOPIC = "React Hooks 原理";

function makeDefaultRoot(): LearningNode {
  return {
    id: `root-${Date.now()}`,
    type: "root",
    title: DEFAULT_TOPIC,
    topic: DEFAULT_TOPIC,
    parentId: null,
    children: [],
    messages: [
      {
        role: "user",
        content:
          "我想学习「React Hooks 原理」。请给我一个清晰的总览：核心问题、关键概念、学习路径。",
      },
      { role: "assistant", content: ARTICLE_MARKDOWN },
    ],
  };
}

function makeFreshRoot(topic: string): LearningNode {
  return {
    id: `root-${Date.now()}`,
    type: "root",
    title: topic,
    topic,
    parentId: null,
    children: [],
    messages: [{ role: "user", content: topic }],
  };
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function makeGraph(root: LearningNode): LearningGraph {
  return {
    rootId: root.id,
    activeNodeId: root.id,
    nodesById: {
      [root.id]: root,
    },
  };
}

function getPathToNode(graph: LearningGraph, nodeId: string): LearningNode[] {
  const path: LearningNode[] = [];
  let cursor: string | null = nodeId;
  const visited = new Set<string>();

  while (cursor && !visited.has(cursor)) {
    const currentId: string = cursor;
    visited.add(currentId);
    const node: LearningNode | undefined = graph.nodesById[currentId];
    if (!node) break;
    path.push(node);
    cursor = node.parentId;
  }

  return path.reverse();
}

function getBranchPath(graph: LearningGraph): LearningNode[] {
  return getPathToNode(graph, graph.activeNodeId).filter(
    (node) => node.id !== graph.rootId,
  );
}

function collectBranchAnchors(
  graph: LearningGraph,
  parentId: string,
): BranchAnchor[] {
  const parent = graph.nodesById[parentId];
  if (!parent) return [];
  const anchors: BranchAnchor[] = [];
  parent.children.forEach((childId, idx) => {
    const child = graph.nodesById[childId];
    const text = child?.createdFrom?.sourceText ?? child?.sourceText;
    if (!child || !text) return;
    anchors.push({
      branchId: child.id,
      sourceText: text,
      label: child.title,
      ordinal: idx + 1,
    });
  });
  return anchors;
}

export default function App() {
  const settings = useSettings();
  const [graph, setGraph] = useState<LearningGraph>(() =>
    makeGraph(makeDefaultRoot()),
  );
  const [hostedReady, setHostedReady] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  // 星图点击节点 → 切换帧 + 滚动到对应消息
  const [scrollTarget, setScrollTarget] = useState<{
    frameId: string;
    messageIndex: number;
    nonce: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadHostedPublicConfig().then((cfg) => {
      if (cancelled) return;
      if (cfg) applyHostedPublicConfig(cfg);
      setHostedReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activePath = getPathToNode(graph, graph.activeNodeId);
  const branchPath = getBranchPath(graph);
  const rootNode = graph.nodesById[graph.rootId];

  const activePathIds = useMemo(
    () => new Set(activePath.map((n) => n.id)),
    [activePath],
  );

  const jumpToPathIndex = useCallback(
    (index: number) => {
      const path = getPathToNode(graph, graph.activeNodeId);
      const target = path[index];
      if (target) {
        setGraph((g) => ({ ...g, activeNodeId: target.id }));
      }
    },
    [graph],
  );

  const jumpToNode = useCallback((nodeId: string) => {
    setGraph((g) =>
      g.nodesById[nodeId] ? { ...g, activeNodeId: nodeId } : g,
    );
  }, []);

  /** 星图点击节点：切到目标帧并滚动到该条消息 */
  const jumpToMessage = useCallback(
    (frameId: string, messageIndex: number) => {
      setGraph((g) =>
        g.nodesById[frameId] ? { ...g, activeNodeId: frameId } : g,
      );
      setScrollTarget({
        frameId,
        messageIndex,
        nonce: Date.now(),
      });
    },
    [],
  );

  const popBranch = useCallback((nodeId: string) => {
    setGraph((g) => {
      const node = g.nodesById[nodeId];
      if (!node?.parentId) return g;
      return { ...g, activeNodeId: node.parentId };
    });
  }, []);

  const updateNodeMessages = useCallback(
    (nodeId: string, messages: ChatMessage[]) => {
      setGraph((g) => {
        const node = g.nodesById[nodeId];
        if (!node) return g;
        return {
          ...g,
          nodesById: {
            ...g.nodesById,
            [nodeId]: { ...node, messages },
          },
        };
      });
    },
    [],
  );

  const handleAsk = useCallback(
    (parentId: string, req: AskRequest) => {
      setGraph((g) => {
        const parent = g.nodesById[parentId];
        if (!parent) return g;

        const parentPath = getPathToNode(g, parentId);
        const ancestors = buildAncestorSnapshots(parentPath, settings.context);
        const childId = `qa-${Date.now()}`;

        // 优先使用选区所在消息对应的 user 索引，避免重复文本把分支挂到相邻提问。
        let spawnIdx =
          req.sourceMessageIndex !== undefined ? req.sourceMessageIndex : -1;
        if (spawnIdx >= 0 && parent.messages[spawnIdx]?.role !== "user") {
          spawnIdx = -1;
        }
        if (spawnIdx === -1) {
          for (let i = parent.messages.length - 1; i >= 0; i--) {
            const m = parent.messages[i];
            if (m.role === "assistant" && m.content.includes(req.sourceText)) {
              for (let j = i - 1; j >= 0; j--) {
                if (parent.messages[j].role === "user") {
                  spawnIdx = j;
                  break;
                }
              }
              break;
            }
          }
        }
        if (spawnIdx === -1) {
          for (let i = parent.messages.length - 1; i >= 0; i--) {
            if (parent.messages[i].role === "user") {
              spawnIdx = i;
              break;
            }
          }
        }

        const childItem: LearningNode = {
          id: childId,
          type: "qa",
          title: truncate(req.sourceText, 18),
          sourceText: req.sourceText,
          ancestors,
          parentId,
          children: [],
          createdFrom: {
            frameId: parentId,
            sourceText: req.sourceText,
            messageIndex: spawnIdx >= 0 ? spawnIdx : undefined,
          },
          messages: [{ role: "user", content: req.question }],
        };

        return {
          ...g,
          activeNodeId: childId,
          nodesById: {
            ...g.nodesById,
            [parentId]: {
              ...parent,
              children: [...parent.children, childId],
            },
            [childId]: childItem,
          },
        };
      });
    },
    [settings.context],
  );

  const handleNewSession = useCallback((topic: string) => {
    setGraph(makeGraph(makeFreshRoot(topic)));
    setHoveredNodeId(null);
  }, []);

  // 给 ConversationFrame 计算持久高亮锚点（当前帧之下的直接 children）
  const rootAnchors = useMemo(
    () => (rootNode ? collectBranchAnchors(graph, rootNode.id) : []),
    [graph, rootNode],
  );
  const branchAnchorsByNodeId = useMemo(() => {
    const map: Record<string, BranchAnchor[]> = {};
    branchPath.forEach((node) => {
      map[node.id] = collectBranchAnchors(graph, node.id);
    });
    return map;
  }, [graph, branchPath]);

  return (
    <div className="relative h-full w-full flex flex-col p-3 gap-3">
      <Breadcrumbs
        stack={activePath}
        onJump={jumpToPathIndex}
        onNewSession={handleNewSession}
      />

      <div
        className={[
          "grid flex-1 min-h-0 overflow-hidden rounded-[28px]",
          "ring-1 ring-white/22 shadow-glass",
          branchPath.length > 0
            ? "lg:grid-cols-[minmax(360px,1fr)_minmax(420px,1fr)]"
            : "lg:grid-cols-1",
        ].join(" ")}
      >
        <section className="relative min-w-0 min-h-0 border-r border-white/15
                            bg-white/[0.86] backdrop-blur-2xl
                            before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-24
                            before:bg-glass-sheen">
          {rootNode && (
            <ConversationFrame
              key={rootNode.id}
              item={rootNode}
              level={0}
              layoutEpoch={branchPath.length}
              branchAnchors={rootAnchors}
              hoveredBranchId={hoveredNodeId}
              scrollTarget={
                scrollTarget && scrollTarget.frameId === rootNode.id
                  ? scrollTarget
                  : null
              }
              onAsk={(req) => handleAsk(rootNode.id, req)}
              onMessagesChange={(messages) =>
                updateNodeMessages(rootNode.id, messages)
              }
              onAnchorHover={setHoveredNodeId}
              onAnchorClick={jumpToNode}
            />
          )}
        </section>

        {branchPath.length > 0 && (
          <section className="relative min-w-0 min-h-0
                              bg-white/[0.6] backdrop-blur-2xl
                              before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-24
                              before:bg-glass-sheen">
            <StackRenderer
              stack={branchPath}
              levelOffset={1}
              hoveredBranchId={hoveredNodeId}
              branchAnchorsByNodeId={branchAnchorsByNodeId}
              scrollTarget={scrollTarget}
              onAsk={handleAsk}
              onPop={popBranch}
              onMessagesChange={updateNodeMessages}
              onAnchorHover={setHoveredNodeId}
              onAnchorClick={jumpToNode}
            />
          </section>
        )}
      </div>

      {branchPath.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center">
          <div
            className="pointer-events-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-full
                       border border-white/25 bg-white/[0.78] backdrop-blur-xl shadow-float
                       text-[12.5px] text-ink-800"
          >
            <Sparkles size={13} className="text-rose-500" />
            <span>
              在主线回答里划选一段文字，开出第一条枝叶
            </span>
          </div>
        </div>
      )}

      <BranchMap
        graph={graph}
        activePathIds={activePathIds}
        hoveredNodeId={hoveredNodeId}
        onSelect={jumpToMessage}
        onHover={setHoveredNodeId}
      />

      {hostedReady && <SettingsButton />}
    </div>
  );
}
