import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Server,
  ShieldCheck,
  Sliders,
  Trash2,
  X,
} from "lucide-react";
import {
  DEFAULT_CONTEXT_CONFIG,
  type ContextConfig,
  type Settings,
  setSettings,
  useSettings,
} from "../lib/settings";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SettingsModal({ open, onClose }: Props) {
  const stored = useSettings();
  const [draft, setDraft] = useState<Settings>(stored);
  const [showKey, setShowKey] = useState(false);
  const [newModelId, setNewModelId] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(stored);
      setNewModelId("");
      setNewModelName("");
      setShowKey(false);
      setAdvancedOpen(false);
    }
  }, [open, stored]);

  const updateContext = (patch: Partial<ContextConfig>) => {
    setDraft({ ...draft, context: { ...draft.context, ...patch } });
  };

  const handleAddModel = () => {
    const id = newModelId.trim();
    if (!id) return;
    const name = (newModelName.trim() || id);
    if (draft.models.some((m) => m.id === id)) {
      // 已存在则只切换选中
      setDraft({ ...draft, selectedModelId: id });
      setNewModelId("");
      setNewModelName("");
      return;
    }
    setDraft({
      ...draft,
      models: [...draft.models, { id, name }],
      selectedModelId: draft.selectedModelId ?? id,
    });
    setNewModelId("");
    setNewModelName("");
  };

  const handleRemoveModel = (id: string) => {
    const models = draft.models.filter((m) => m.id !== id);
    const selectedModelId =
      draft.selectedModelId === id
        ? models[0]?.id ?? null
        : draft.selectedModelId;
    setDraft({ ...draft, models, selectedModelId });
  };

  const handleSelectModel = (id: string) => {
    setDraft({ ...draft, selectedModelId: id });
  };

  const handleSave = () => {
    setSettings({
      ...draft,
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim(),
    });
    onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
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
            className="relative w-[640px] max-w-full max-h-[88vh] overflow-hidden
                       rounded-2xl bg-white shadow-2xl flex flex-col"
          >
            {/* 头部 */}
            <div className="px-6 py-4 border-b border-ink-200 flex items-center justify-between shrink-0">
              <div>
                <div className="text-[15px] font-semibold text-ink-900">
                  模型设置
                </div>
                <div className="text-[12px] text-ink-700/60 mt-0.5">
                  {stored.hosted
                    ? "服务端托管模式 · API Key 由服务器保管"
                    : "配置 OpenAI 兼容 API · 密钥仅保存在你本地浏览器"}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-ink-700/60 hover:text-ink-900 hover:bg-ink-100"
                title="关闭"
              >
                <X size={18} />
              </button>
            </div>

            {/* 表单 */}
            <div className="px-6 py-5 overflow-y-auto space-y-5">
              {stored.hosted && (
                <div className="px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200/80 text-[12.5px] text-emerald-900">
                  当前为<strong>共享部署</strong>：模型由服务器 config.json 提供，API
                  请求经本站反代，访客无需填写 Key。
                </div>
              )}

              {/* API 模式 */}
              <Field
                label="API 模式"
                icon={<ShieldCheck size={14} className="text-ink-700/60" />}
              >
                <div className="px-3 py-2.5 rounded-lg bg-ink-100 text-[14px] text-ink-800 flex items-center justify-between">
                  <span>OpenAI（兼容）</span>
                  <span className="text-[11px] font-mono text-ink-700/50">
                    /v1/chat/completions
                  </span>
                </div>
              </Field>

              {!stored.hosted && (
                <>
                  {/* API 主机 */}
                  <Field
                    label="API 主机"
                    icon={<Server size={14} className="text-ink-700/60" />}
                    hint="只填 base URL，不要带 /chat/completions 路径"
                  >
                    <input
                      value={draft.baseUrl}
                      onChange={(e) =>
                        setDraft({ ...draft, baseUrl: e.target.value })
                      }
                      placeholder="https://new.lemonapi.site/v1"
                      className="w-full px-3 py-2.5 rounded-lg bg-white
                                 border border-ink-200 focus:border-indigo-400
                                 focus:ring-2 focus:ring-indigo-100 outline-none
                                 text-[14px] text-ink-900 placeholder:text-ink-700/40"
                    />
                  </Field>

                  {/* API Key */}
                  <Field
                    label="API Key"
                    icon={<KeyRound size={14} className="text-ink-700/60" />}
                    hint="只保存在本地浏览器，不会上传到任何服务器"
                  >
                    <div className="relative">
                      <input
                        type={showKey ? "text" : "password"}
                        value={draft.apiKey}
                        onChange={(e) =>
                          setDraft({ ...draft, apiKey: e.target.value })
                        }
                        placeholder="sk-..."
                        autoComplete="off"
                        className="w-full px-3 py-2.5 pr-10 rounded-lg bg-white
                                   border border-ink-200 focus:border-indigo-400
                                   focus:ring-2 focus:ring-indigo-100 outline-none
                                   text-[14px] text-ink-900 placeholder:text-ink-700/40
                                   font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2
                                   p-1.5 rounded-md text-ink-700/60 hover:text-ink-900 hover:bg-ink-100"
                        title={showKey ? "隐藏" : "显示"}
                      >
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </Field>
                </>
              )}

              {stored.hosted && (
                <Field
                  label="API 地址（只读）"
                  icon={<Server size={14} className="text-ink-700/60" />}
                >
                  <div className="px-3 py-2.5 rounded-lg bg-ink-100 text-[13px] font-mono text-ink-800 break-all">
                    {draft.baseUrl || "—"}
                  </div>
                </Field>
              )}

              {/* 模型列表 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[13px] font-semibold text-ink-800">
                    模型
                  </div>
                  <div className="text-[11px] text-ink-700/50">
                    {draft.models.length} 个 · 点击切换当前模型
                  </div>
                </div>

                {/* 模型列表 */}
                <div className="space-y-1.5">
                  {draft.models.length === 0 && (
                    <div className="px-3 py-4 rounded-lg border border-dashed border-ink-200 text-center text-[12px] text-ink-700/50">
                      还没有模型，下面"新建"一个吧
                    </div>
                  )}
                  {draft.models.map((m) => {
                    const selected = draft.selectedModelId === m.id;
                    return (
                      <div
                        key={m.id}
                        className={[
                          "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors cursor-pointer",
                          selected
                            ? "border-indigo-300 bg-indigo-50"
                            : "border-ink-200 hover:border-ink-200 hover:bg-ink-100/60",
                        ].join(" ")}
                        onClick={() => handleSelectModel(m.id)}
                      >
                        <div
                          className={[
                            "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                            selected
                              ? "border-indigo-500 bg-indigo-500"
                              : "border-ink-200",
                          ].join(" ")}
                        >
                          {selected && (
                            <Check size={10} className="text-white" strokeWidth={3} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] text-ink-900 truncate">
                            {m.name}
                          </div>
                          <div className="text-[11px] text-ink-700/50 font-mono truncate">
                            {m.id}
                          </div>
                        </div>
                        {!stored.hosted && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveModel(m.id);
                          }}
                          className="p-1.5 rounded-md text-ink-700/40 hover:text-red-500 hover:bg-red-50"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 新建 */}
                {!stored.hosted && (
                <div className="mt-3 p-3 rounded-lg border border-ink-200 bg-ink-100/40">
                  <div className="text-[12px] font-semibold text-ink-700 mb-2">
                    新建模型
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={newModelId}
                      onChange={(e) => setNewModelId(e.target.value)}
                      placeholder="模型 ID（如 [L]gemini-3-flash-preview）"
                      className="px-2.5 py-2 rounded-md bg-white border border-ink-200
                                 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none
                                 text-[12.5px] text-ink-900 placeholder:text-ink-700/40 font-mono"
                    />
                    <input
                      value={newModelName}
                      onChange={(e) => setNewModelName(e.target.value)}
                      placeholder="名称（默认同 ID）"
                      className="px-2.5 py-2 rounded-md bg-white border border-ink-200
                                 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none
                                 text-[12.5px] text-ink-900 placeholder:text-ink-700/40"
                    />
                  </div>
                  <button
                    onClick={handleAddModel}
                    disabled={!newModelId.trim()}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md
                               bg-ink-900 text-white text-[12.5px] font-medium
                               hover:bg-indigo-600 disabled:opacity-40 disabled:hover:bg-ink-900
                               transition-colors"
                  >
                    <Plus size={13} />
                    新建
                  </button>
                </div>
                )}
              </div>

              {/* 高级选项：上下文窗口与栈式压缩 */}
              <div className="rounded-xl border border-ink-200 overflow-hidden">
                <button
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5
                             bg-ink-100/50 hover:bg-ink-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Sliders size={14} className="text-ink-700/70" />
                    <span className="text-[13px] font-semibold text-ink-800">
                      高级 · 上下文与栈式压缩
                    </span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={[
                      "text-ink-700/60 transition-transform",
                      advancedOpen ? "rotate-180" : "",
                    ].join(" ")}
                  />
                </button>
                {advancedOpen && (
                  <div className="px-4 py-3 bg-white space-y-3">
                    <div className="text-[11.5px] leading-5 text-ink-700/70">
                      控制每次调用 LLM 时带的对话长度。默认值适合大多数模型，
                      数值越大上下文越完整，token 消耗也越多。
                    </div>
                    <NumberField
                      label="当前帧滑动窗口 N"
                      hint="在当前对话里继续提问时，带最近 N 条消息"
                      value={draft.context.windowN}
                      min={2}
                      max={40}
                      onChange={(v) => updateContext({ windowN: v })}
                    />
                    <NumberField
                      label="近祖先 K 条"
                      hint="push 子帧时，每个「近祖先帧」带最近 K 条对话"
                      value={draft.context.ancestorK}
                      min={0}
                      max={20}
                      onChange={(v) => updateContext({ ancestorK: v })}
                    />
                    <NumberField
                      label="压缩起点深度"
                      hint="距子帧 > 该深度的祖先帧只保留摘要"
                      value={draft.context.compressDepth}
                      min={1}
                      max={10}
                      onChange={(v) => updateContext({ compressDepth: v })}
                    />
                    <NumberField
                      label="远祖先截断字数"
                      hint="远祖先帧「最后一条回答」保留多少字"
                      value={draft.context.excerptMaxChars}
                      min={60}
                      max={2000}
                      step={20}
                      onChange={(v) => updateContext({ excerptMaxChars: v })}
                    />
                    <button
                      onClick={() =>
                        updateContext({ ...DEFAULT_CONTEXT_CONFIG })
                      }
                      className="text-[11.5px] text-ink-700/60 hover:text-indigo-600"
                    >
                      恢复默认（N=6 / K=4 / 压缩深度=2 / 240 字）
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 底部 */}
            <div className="px-6 py-4 border-t border-ink-200 flex items-center justify-end gap-2 shrink-0 bg-ink-100/40">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-[13px] text-ink-800 hover:bg-ink-200/80 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white
                           bg-gradient-to-br from-indigo-500 to-indigo-600
                           shadow-sm hover:from-indigo-400 hover:to-indigo-500 transition-colors"
              >
                保存
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Field({
  label,
  icon,
  hint,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-[13px] font-semibold text-ink-800">{label}</span>
      </div>
      {children}
      {hint && (
        <div className="mt-1 text-[11px] text-ink-700/50">{hint}</div>
      )}
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium text-ink-800">{label}</div>
        {hint && (
          <div className="text-[11px] text-ink-700/50 mt-0.5 leading-4">
            {hint}
          </div>
        )}
      </div>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isNaN(n)) return;
          const clamped = Math.max(min, Math.min(max, n));
          onChange(clamped);
        }}
        className="w-20 px-2 py-1.5 rounded-md bg-white border border-ink-200
                   focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none
                   text-[13px] text-ink-900 text-right font-mono"
      />
    </div>
  );
}
