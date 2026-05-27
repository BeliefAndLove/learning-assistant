import type { LearningGraph } from "../types";

export type MindNodeKind = "root" | "question" | "deepDive";

export type MindNode = {
  id: string;
  frameId: string;
  messageIndex: number;
  kind: MindNodeKind;
  /** 相对于 frame 的横向索引（第几条用户提问，从 0 开始） */
  ordinal: number;
  /** 帧深度（root=0） */
  depth: number;
  /** 帧在地图上的 Y 行号 */
  row: number;
  x: number;
  y: number;
  /** 用户提问的原始文本 */
  text: string;
  /** 仅 branch kind：被下钻的原文片段 */
  sourceText?: string;
};

export type MindEdge = {
  id: string;
  fromId: string;
  toId: string;
  kind: "question" | "deepDive";
  path: string;
};

export type MindMapLayout = {
  nodes: MindNode[];
  edges: MindEdge[];
  width: number;
  height: number;
  /** node 信息按 id 检索 */
  nodeById: Map<string, MindNode>;
};

const QUESTION_Y_STEP = 104;
const DEEP_DIVE_X_STEP = 270;
const DEEP_DIVE_BRANCH_GAP = 220;
const X_PAD = 90;
const Y_PAD = 120;

/** 在父帧消息序列中找出生成某个 sourceText 的"用户提问"索引（启发式） */
function findSpawnUserIndex(
  parentMessages: { role: string; content: string }[],
  sourceText: string,
): number {
  if (!sourceText) return -1;
  // 先找包含 sourceText 的 assistant 消息（倒序找最后一次出现）
  for (let i = parentMessages.length - 1; i >= 0; i--) {
    const m = parentMessages[i];
    if (m.role === "assistant" && m.content.includes(sourceText)) {
      // 取它前面最近的 user 消息
      for (let j = i - 1; j >= 0; j--) {
        if (parentMessages[j].role === "user") return j;
      }
      break;
    }
  }
  // 兜底：最后一条 user 消息
  for (let i = parentMessages.length - 1; i >= 0; i--) {
    if (parentMessages[i].role === "user") return i;
  }
  return -1;
}

export function computeMindmapLayout(
  graph: LearningGraph,
  options: { expandedFrameIds?: Set<string> } = {},
): MindMapLayout {
  const nodes: MindNode[] = [];
  const edgeRefs: Array<{
    id: string;
    fromId: string;
    toId: string;
    kind: "question" | "deepDive";
  }> = [];
  const nodeById = new Map<string, MindNode>();
  const expandedFrameIds = options.expandedFrameIds ?? new Set<string>();

  if (!graph.rootId || !graph.nodesById[graph.rootId]) {
    return { nodes, edges: [], width: 200, height: 200, nodeById };
  }

  const frameFirstNode = new Map<string, MindNode>();

  function getUserMessageIndexes(frameId: string): number[] {
    const frame = graph.nodesById[frameId];
    if (!frame) return [];
    const indexes: number[] = [];
    frame.messages.forEach((m, idx) => {
      if (m.role === "user") indexes.push(idx);
    });
    return indexes;
  }

  function createFrameNodes(
    frameId: string,
    depth: number,
    x: number,
    startY: number,
  ): MindNode[] {
    const frame = graph.nodesById[frameId];
    if (!frame) return [];

    const allUserIndexes = getUserMessageIndexes(frameId);
    const shouldShowAll = frame.type === "root" || expandedFrameIds.has(frameId);
    const userIndexes = shouldShowAll ? allUserIndexes : allUserIndexes.slice(0, 1);
    const frameUserNodes: MindNode[] = [];

    userIndexes.forEach((msgIdx, ordinal) => {
      const m = frame.messages[msgIdx];
      const isFirstUserInFrame = ordinal === 0;
      const kind: MindNodeKind = frame.type === "root"
        ? isFirstUserInFrame
          ? "root"
          : "question"
        : isFirstUserInFrame
          ? "deepDive"
          : "question";

      const node: MindNode = {
        id: `${frameId}::${msgIdx}`,
        frameId,
        messageIndex: msgIdx,
        kind,
        ordinal,
        depth,
        row: ordinal,
        x,
        y: startY + ordinal * QUESTION_Y_STEP,
        text: m.content,
        sourceText: kind === "deepDive" ? frame.sourceText : undefined,
      };

      nodes.push(node);
      nodeById.set(node.id, node);
      if (ordinal === 0) frameFirstNode.set(frameId, node);
      frameUserNodes.push(node);
    });

    // 同一对话流的普通提问：向下延展
    for (let i = 1; i < frameUserNodes.length; i++) {
      const a = frameUserNodes[i - 1];
      const b = frameUserNodes[i];
      edgeRefs.push({
        id: `edge-q-${a.id}-${b.id}`,
        fromId: a.id,
        toId: b.id,
        kind: "question",
      });
    }

    return frameUserNodes;
  }

  function getChildSpawnNode(parentFrameId: string, childFrameId: string): MindNode | undefined {
    const parent = graph.nodesById[parentFrameId];
    const child = graph.nodesById[childFrameId];
    if (!parent || !child) return undefined;

    let spawnIdx = child.createdFrom?.messageIndex;
    if (spawnIdx === undefined || spawnIdx < 0) {
      spawnIdx = findSpawnUserIndex(
        parent.messages,
        child.createdFrom?.sourceText ?? child.sourceText ?? "",
      );
    }
    return nodeById.get(`${parentFrameId}::${spawnIdx}`);
  }

  function visit(frameId: string, depth: number, x: number, startY: number) {
    const frame = graph.nodesById[frameId];
    if (!frame) return;

    createFrameNodes(frameId, depth, x, startY);

    const childrenBySpawnNode = new Map<string, string[]>();
    frame.children.forEach((childId) => {
      const spawnNode = getChildSpawnNode(frameId, childId);
      if (!spawnNode) return;
      const list = childrenBySpawnNode.get(spawnNode.id) ?? [];
      list.push(childId);
      childrenBySpawnNode.set(spawnNode.id, list);
    });

    const orderedGroups = Array.from(childrenBySpawnNode.entries())
      .map(([spawnNodeId, childIds]) => ({
        spawnNode: nodeById.get(spawnNodeId),
        childIds,
      }))
      .filter((group): group is { spawnNode: MindNode; childIds: string[] } =>
        Boolean(group.spawnNode),
      )
      .sort((a, b) => a.spawnNode.y - b.spawnNode.y);

    let nextBranchTop = Number.NEGATIVE_INFINITY;
    for (const { spawnNode, childIds } of orderedGroups) {
      const groupHeight = (childIds.length - 1) * DEEP_DIVE_BRANCH_GAP;
      const desiredTop = spawnNode.y - groupHeight / 2;
      const groupTop = Math.max(desiredTop, nextBranchTop);
      nextBranchTop = groupTop + groupHeight + DEEP_DIVE_BRANCH_GAP;

      childIds.forEach((childId, idx) => {
        // 同一父帧的分支按提问顺序占用独立纵向轨道，减少连线覆盖和交叉。
        const childX = spawnNode.x + DEEP_DIVE_X_STEP;
        const childY = groupTop + idx * DEEP_DIVE_BRANCH_GAP;

        visit(childId, depth + 1, childX, childY);

        const childFirst = frameFirstNode.get(childId);
        if (!childFirst) return;

        edgeRefs.push({
          id: `edge-d-${spawnNode.id}-${childFirst.id}`,
          fromId: spawnNode.id,
          toId: childFirst.id,
          kind: "deepDive",
        });
      });
    }
  }

  visit(graph.rootId, 0, X_PAD, Y_PAD);

  // 同一纵向泳道内做防重叠处理。节点变多时会自动拉开，
  // 视图 fit 逻辑会相应缩小视角，避免互相遮挡。
  const lanes = new Map<number, MindNode[]>();
  for (const n of nodes) {
    const lane = Math.round(n.x);
    const list = lanes.get(lane) ?? [];
    list.push(n);
    lanes.set(lane, list);
  }
  for (const list of lanes.values()) {
    list.sort((a, b) => a.y - b.y);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      const minGap = cur.kind === "question" && prev.kind === "question" ? 70 : 92;
      if (cur.y - prev.y < minGap) {
        cur.y = prev.y + minGap;
      }
    }
  }

  const edges: MindEdge[] = edgeRefs.flatMap((e) => {
    const from = nodeById.get(e.fromId);
    const to = nodeById.get(e.toId);
    if (!from || !to) return [];
    const path = e.kind === "question"
      ? `M ${from.x} ${from.y} L ${to.x} ${to.y}`
      : (() => {
          const midX = from.x + (to.x - from.x) * 0.58;
          return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
        })();
    return [{ ...e, path }];
  });

  const minX = nodes.length > 0 ? Math.min(...nodes.map((n) => n.x)) : 0;
  const minY = nodes.length > 0 ? Math.min(...nodes.map((n) => n.y)) : 0;
  const shiftX = minX < X_PAD ? X_PAD - minX : 0;
  const shiftY = minY < Y_PAD ? Y_PAD - minY : 0;
  if (shiftX || shiftY) {
    for (const n of nodes) {
      n.x += shiftX;
      n.y += shiftY;
    }
    for (const e of edges) {
      const from = nodeById.get(e.fromId);
      const to = nodeById.get(e.toId);
      if (!from || !to) continue;
      e.path = e.kind === "question"
        ? `M ${from.x} ${from.y} L ${to.x} ${to.y}`
        : (() => {
            const midX = from.x + (to.x - from.x) * 0.58;
            return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
          })();
    }
  }

  const maxX = nodes.length > 0 ? Math.max(...nodes.map((n) => n.x)) : 0;
  const maxY = nodes.length > 0 ? Math.max(...nodes.map((n) => n.y)) : 0;

  const layoutWidth = Math.max(maxX + X_PAD, 240);
  const layoutHeight = Math.max(maxY + Y_PAD, 200);

  return {
    nodes,
    edges,
    width: layoutWidth,
    height: layoutHeight,
    nodeById,
  };
}

export type ViewTransform = { x: number; y: number; scale: number };

const MIN_SCALE = 0.18;
const MAX_SCALE = 2.4;

/** 将全部节点缩放到视口内可见，可选聚焦某一节点 */
export function computeFitTransform(
  viewportW: number,
  viewportH: number,
  layout: MindMapLayout,
  focusNode?: MindNode,
): ViewTransform {
  const { nodes } = layout;
  if (nodes.length === 0 || viewportW <= 0 || viewportH <= 0) {
    return { x: 0, y: 0, scale: 1 };
  }

  const pad = 56;
  const minX = Math.min(...nodes.map((n) => n.x)) - 36;
  const maxX = Math.max(...nodes.map((n) => n.x)) + 36;
  const minY = Math.min(...nodes.map((n) => n.y)) - 36;
  const maxY = Math.max(...nodes.map((n) => n.y)) + 36;
  const contentW = Math.max(maxX - minX, 80);
  const contentH = Math.max(maxY - minY, 80);

  const scale = Math.min(
    MAX_SCALE,
    Math.max(
      MIN_SCALE,
      Math.min(
        (viewportW - pad * 2) / contentW,
        (viewportH - pad * 2) / contentH,
      ),
    ),
  );

  const cx = focusNode ? focusNode.x : (minX + maxX) / 2;
  const cy = focusNode ? focusNode.y : (minY + maxY) / 2;

  return {
    x: viewportW / 2 - cx * scale,
    y: viewportH / 2 - cy * scale,
    scale,
  };
}

export function clampTransform(
  t: ViewTransform,
  viewportW: number,
  viewportH: number,
  layout: MindMapLayout,
): ViewTransform {
  if (
    !Number.isFinite(t.x) ||
    !Number.isFinite(t.y) ||
    !Number.isFinite(t.scale) ||
    viewportW <= 0 ||
    viewportH <= 0
  ) {
    return computeFitTransform(viewportW, viewportH, layout);
  }

  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale));

  const { nodes } = layout;
  if (nodes.length === 0) return { x: t.x, y: t.y, scale };

  const minX = Math.min(...nodes.map((n) => n.x)) - 40;
  const maxX = Math.max(...nodes.map((n) => n.x)) + 40;
  const minY = Math.min(...nodes.map((n) => n.y)) - 40;
  const maxY = Math.max(...nodes.map((n) => n.y)) + 40;

  const worldW = (maxX - minX) * scale;
  const worldH = (maxY - minY) * scale;
  // 允许一点“空白探索感”，但不能把所有节点都拖出视口。
  const margin = Math.min(120, Math.max(64, Math.min(viewportW, viewportH) * 0.14));

  let x = t.x;
  let y = t.y;

  if (worldW + margin * 2 < viewportW) {
    x = viewportW / 2 - ((minX + maxX) / 2) * scale;
  } else {
    const minTx = viewportW - margin - maxX * scale;
    const maxTx = margin - minX * scale;
    x = Math.min(maxTx, Math.max(minTx, x));
  }

  if (worldH + margin * 2 < viewportH) {
    y = viewportH / 2 - ((minY + maxY) / 2) * scale;
  } else {
    const minTy = viewportH - margin - maxY * scale;
    const maxTy = margin - minY * scale;
    y = Math.min(maxTy, Math.max(minTy, y));
  }

  return { x, y, scale };
}
