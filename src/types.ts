export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** 祖先帧的"压缩快照"——push 子帧时一次性算好，子帧 LLM 调用时直接用 */
export type AncestorFrameSnapshot = {
  level: number; // 0 表示主线
  type: "root" | "qa";
  /** 用来在面包屑/上下文段中给祖先帧一个标签：root 用 topic，qa 用 sourceText */
  label: string;
  /** root 帧：学习主题；qa 帧：sourceText */
  excerpt: string;
  /**
   * 该祖先帧带给子帧的对话片段。
   *  - 近祖先（栈深差 ≤ compressDepth）：带最近 K 条对话
   *  - 远祖先（栈深差 >  compressDepth）：只带最后一条 assistant 回答的截断
   */
  recentMessages?: ChatMessage[];
  /** 远祖先的 "最后回答" 截断（与 recentMessages 二选一） */
  lastAssistantExcerpt?: string;
};

export type StackItem = {
  id: string;
  /** root: 主线对话栈底；qa: 选区追问子帧 */
  type: "root" | "qa";
  /** 顶部面包屑显示的短标题 */
  title: string;
  /** 兼容老字段（暂不使用） */
  content?: string;
  /** root 帧专用：学习主题，比如 "React Hooks 原理" */
  topic?: string;
  /** qa 帧专用：用户划选的那段原文 */
  sourceText?: string;
  /** 创建本帧时从父链快照下来的祖先上下文（root 帧为空） */
  ancestors?: AncestorFrameSnapshot[];
  /** 本帧的对话历史 */
  messages: ChatMessage[];
};

export type BranchOrigin = {
  /** 从哪个帧里划选出来的 */
  frameId: string;
  /** 后续可用于把枝叶锚回某条消息 */
  messageIndex?: number;
  /** 创建分支时的原始选区 */
  sourceText: string;
};

export type LearningNode = StackItem & {
  parentId: string | null;
  children: string[];
  createdFrom?: BranchOrigin;
};

export type LearningGraph = {
  rootId: string;
  nodesById: Record<string, LearningNode>;
  activeNodeId: string;
};
