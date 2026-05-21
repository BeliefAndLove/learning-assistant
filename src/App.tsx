import { useCallback, useEffect, useState } from "react";
import { applyHostedPublicConfig, loadHostedPublicConfig } from "./lib/hostedConfig";
import { ARTICLE_MARKDOWN } from "./mock/article";
import type { StackItem } from "./types";
import { StackRenderer } from "./components/StackRenderer";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { SettingsButton } from "./components/SettingsButton";
import { useSettings } from "./lib/settings";
import { buildAncestorSnapshots } from "./lib/context";
import type { AskRequest } from "./components/ConversationFrame";

const DEFAULT_TOPIC = "React Hooks 原理";

function makeDefaultRoot(): StackItem {
  return {
    id: `root-${Date.now()}`,
    type: "root",
    title: DEFAULT_TOPIC,
    topic: DEFAULT_TOPIC,
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

function makeFreshRoot(topic: string): StackItem {
  return {
    id: `root-${Date.now()}`,
    type: "root",
    title: topic,
    topic,
    messages: [],
  };
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export default function App() {
  const settings = useSettings();
  const [stack, setStack] = useState<StackItem[]>(() => [makeDefaultRoot()]);
  const [hostedReady, setHostedReady] = useState(false);

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

  const pop = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const popTo = useCallback((index: number) => {
    setStack((s) => (index < s.length ? s.slice(0, index + 1) : s));
  }, []);

  const handleAsk = useCallback(
    (parentLevel: number, req: AskRequest) => {
      setStack((s) => {
        const parentStack = s.slice(0, parentLevel + 1);
        const ancestors = buildAncestorSnapshots(parentStack, settings.context);
        const childItem: StackItem = {
          id: `qa-${Date.now()}`,
          type: "qa",
          title: truncate(req.sourceText, 18),
          sourceText: req.sourceText,
          ancestors,
          messages: [{ role: "user", content: req.question }],
        };
        return [...parentStack, childItem];
      });
    },
    [settings.context],
  );

  const handleNewSession = useCallback((topic: string) => {
    setStack([makeFreshRoot(topic)]);
  }, []);

  return (
    <div className="h-full w-full flex flex-col">
      <Breadcrumbs
        stack={stack}
        onJump={popTo}
        onNewSession={handleNewSession}
      />
      <div className="relative flex-1 overflow-hidden">
        <StackRenderer stack={stack} onAsk={handleAsk} onPop={pop} />
      </div>
      {hostedReady && <SettingsButton />}
    </div>
  );
}
