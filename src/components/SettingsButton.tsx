import { useState } from "react";
import { motion } from "framer-motion";
import { Settings as SettingsIcon } from "lucide-react";
import { getSelectedModel, isConfigured, useSettings } from "../lib/settings";
import { SettingsModal } from "./SettingsModal";

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const settings = useSettings();
  const configured = isConfigured(settings);
  const model = getSelectedModel(settings);

  if (settings.hosted) {
    return (
      <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="fixed bottom-4 left-4 z-40 flex items-center gap-2
                   px-3 py-2 rounded-xl bg-white/90 backdrop-blur-md
                   ring-1 ring-ink-200/80 shadow-soft
                   text-[12.5px] text-ink-800 hover:shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
        title="服务端已配置模型；点击可调整高级上下文参数"
      >
        <SettingsIcon size={14} className="text-emerald-600" />
        <span className="font-medium text-emerald-800">服务端模型</span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="text-[11px] text-ink-700/55 font-mono max-w-[200px] truncate">
          {model?.name ?? "已托管"}
        </span>
      </motion.button>
      <SettingsModal open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        className="fixed bottom-4 left-4 z-40 flex items-center gap-2
                   px-3 py-2 rounded-xl bg-white/90 backdrop-blur-md
                   ring-1 ring-ink-200/80
                   shadow-soft hover:shadow-[0_8px_24px_rgba(15,23,42,0.12)]
                   text-[12.5px] text-ink-800
                   transition-shadow"
        title="模型设置"
      >
        <SettingsIcon size={14} className="text-ink-700/70" />
        <span className="font-medium">添加新的模型方</span>
        <span
          className={[
            "w-1.5 h-1.5 rounded-full",
            configured
              ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
              : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]",
          ].join(" ")}
        />
        <span className="text-[11px] text-ink-700/55 font-mono max-w-[180px] truncate">
          {configured && model ? model.name : "未配置"}
        </span>
      </motion.button>

      <SettingsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
