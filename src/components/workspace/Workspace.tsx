"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { EffortChoice, EffortOption, ModelOption, ProjectDetail, SafeUser } from "@/lib/client/types";
import { Button } from "../ui";
import { Mark } from "../ui/Mark";
import { ThemePicker } from "../ThemePicker";
import { MessageSquare, Eye, FolderOpen, Settings as SettingsIcon, Database, TerminalSquare, ScrollText, MessageCircleQuestion } from "lucide-react";
import { PromptCounter } from "../PromptCounter";
import { Chat } from "./Chat";
import { PreviewPane } from "./PreviewPane";
import { useChat } from "./useChat";
import { usePreview } from "./usePreview";
import { ConflictModal, HistoryModal, PublishModal } from "./Dialogs";
import { SettingsPane } from "./SettingsPane";
import { DataPane } from "./DataPane";
import { AskPane } from "./AskPane";
import { useGithub } from "@/lib/client/useGithub";
import { GitBranch, Upload, Download } from "lucide-react";
import { FileExplorer } from "./FileExplorer";
import { CodeEditor } from "./CodeEditor";
import { Terminal } from "./Terminal";
import { LogsPane } from "./LogsPane";

type Props = { project: ProjectDetail; user: SafeUser; models: ModelOption[]; defaultModel: string; efforts: EffortOption[]; defaultEffort: EffortChoice };
type RightTab = "preview" | "code" | "settings" | "data" | "ask" | "terminal" | "logs";
type MobileTab = "chat" | "preview";

const TABS: { id: RightTab; label: string; icon: React.ComponentType<{ size?: number }>; advanced?: boolean }[] = [
  { id: "preview", label: "Preview", icon: Eye },
  { id: "code", label: "Files", icon: FolderOpen },
  { id: "data", label: "Database", icon: Database },
  { id: "settings", label: "Settings", icon: SettingsIcon },
  { id: "ask", label: "Ask", icon: MessageCircleQuestion },
  { id: "terminal", label: "Terminal", icon: TerminalSquare, advanced: true },
  { id: "logs", label: "Logs", icon: ScrollText, advanced: true },
];

export function Workspace({ project: initialProject, user: initialUser, models, defaultModel, efforts, defaultEffort }: Props) {
  const [project, setProject] = useState(initialProject);
  const [user, setUser] = useState(initialUser);
  const [model, setModel] = useState(initialProject.settings?.model && models.some((m) => m.id === initialProject.settings?.model) ? initialProject.settings.model : defaultModel);
  const [effort, setEffort] = useState<EffortChoice>((initialProject.settings?.effort as EffortChoice | undefined) ?? defaultEffort);
  const [advanced, setAdvanced] = useState(false);
  const [rightTab, setRightTabState] = useState<RightTab>("preview");
  const [lastNonAskTab, setLastNonAskTab] = useState<RightTab>("preview");
  const setRightTab = (t: RightTab) => {
    setRightTabState((prev) => {
      if (prev !== "ask") setLastNonAskTab(prev);
      return t;
    });
  };
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [panelOpen, setPanelOpen] = useState(true);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [history, setHistory] = useState(false);
  const github = useGithub(project.id);
  const [limitOpen, setLimitOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ url: string | null; error: string | null; details?: string | null } | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [filesKey, setFilesKey] = useState(0);
  const [conflict, setConflict] = useState<{ keepMine: () => Promise<void>; useLatest: () => Promise<void>; askAI: () => void } | null>(null);
  const initialSent = useRef(false);

  const preview = usePreview(project.id);

  const chat = useChat(project.id, {
    onDone: ({ promptsRemaining }) => {
      setFilesKey((k) => k + 1);
      setSaveState("saved");
      if (promptsRemaining !== null) setUser((u) => ({ ...u, promptsUsed: u.promptLimit - promptsRemaining }));
      preview.fetchStatus().then((info) => {
        if (info?.status !== "running") preview.start();
      });
    },
    onPreview: (status, url) => {
      preview.setInfo((i) => ({ ...i, status: status as typeof i.status, url }));
      if (status === "running") preview.refresh();
    },
    onPromptLimit: () => setLimitOpen(true),
  });

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setAdvanced(localStorage.getItem("bb.advanced") === "1");
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const toggleAdvanced = (v: boolean) => {
    setAdvanced(v);
    if (!v) setRightTab("preview");
    try {
      localStorage.setItem("bb.advanced", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const send = useCallback(
    (text: string, attachments?: { name: string; type: string; data: string }[]) => {
      if (!user.unlimited && user.promptLimit - user.promptsUsed <= 0) {
        setLimitOpen(true);
        return;
      }
      setSaveState("unsaved");
      setMobileTab("chat");
      chat.send(text, model, effort, attachments);
    },
    [chat, model, effort, user],
  );

  // The prompt typed on the home page kicks off the first build automatically.
  useEffect(() => {
    if (initialSent.current) return;
    const t = setTimeout(() => {
      try {
        const key = `bb.initial.${project.id}`;
        const text = sessionStorage.getItem(key);
        if (text && !initialSent.current) {
          sessionStorage.removeItem(key);
          initialSent.current = true;
          send(text);
        }
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [project.id, send]);

  async function save() {
    setSaveState("saving");
    try {
      await api(`/api/projects/${project.id}/save`, { method: "POST" });
      setSaveState("saved");
    } catch {
      setSaveState("unsaved");
    }
  }
  async function sync() {
    setSaveState("saving");
    try {
      await api(`/api/projects/${project.id}/sync`, { method: "POST" });
      setFilesKey((k) => k + 1);
      setSaveState("saved");
    } catch {
      setSaveState("unsaved");
    }
  }
  async function publish() {
    setPublishing(true);
    try {
      const r = await api<{ ok: boolean; url?: string; error?: string; details?: string }>(`/api/projects/${project.id}/publish`, { method: "POST" });
      setPublishResult({ url: r.url ?? null, error: null });
      setProject((p) => ({ ...p, publishedUrl: r.url ?? p.publishedUrl }));
    } catch (e) {
      const err = e as Error & { status?: number };
      let details: string | null = null;
      try {
        const res = await fetch(`/api/projects/${project.id}/publish`, { method: "POST", headers: { "x-requested-with": "fetch" } });
        const d = (await res.json()) as { ok: boolean; url?: string; error?: string; details?: string };
        if (d.ok && d.url) {
          setPublishResult({ url: d.url, error: null });
          setProject((p) => ({ ...p, publishedUrl: d.url ?? p.publishedUrl }));
          return;
        }
        details = d.details ?? null;
        setPublishResult({ url: null, error: d.error ?? err.message, details });
      } catch {
        setPublishResult({ url: null, error: err.message, details });
      }
    } finally {
      setPublishing(false);
    }
  }

  const askFix = (details: string) => send(`The preview shows an error. Please find the cause and fix it.\n\nError details:\n${details.slice(0, 4000)}`);
  const disabledReason = chat.running ? null : !user.unlimited && user.promptLimit - user.promptsUsed <= 0 ? "You've used your free prompts. Enter an access code to keep building." : null;

  const rightPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2 text-xs">
        {TABS.filter((t) => !t.advanced || advanced).map((t) => (
          <button key={t.id} onClick={() => setRightTab(t.id)} className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 ${rightTab === t.id ? "bg-stone-200 text-ink" : "text-muted hover:bg-stone-100"}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <div className={rightTab === "preview" ? "h-full" : "hidden"}>
          <PreviewPane projectId={project.id} info={preview.info} reloadKey={preview.reloadKey} onRefresh={preview.refresh} onRestart={preview.restart} onPublish={publish} publishing={publishing} onAskFix={askFix} advanced={advanced} aiBusy={chat.running} />
        </div>
        {rightTab === "code" ? (
          <div className="flex h-full min-h-0">
            <div className="w-56 shrink-0 border-r border-line">
              <FileExplorer projectId={project.id} selected={selectedFile} onSelect={setSelectedFile} refreshKey={filesKey} onChanged={() => setFilesKey((k) => k + 1)} />
            </div>
            <div className="min-w-0 flex-1">
              <CodeEditor projectId={project.id} path={selectedFile} refreshKey={filesKey} onSaved={() => setSaveState("saved")} onConflict={setConflict} onAskAI={send} />
            </div>
          </div>
        ) : null}
        {rightTab === "settings" ? (
          <SettingsPane
            github={github}
            onFilesChanged={() => setFilesKey((k) => k + 1)}
            project={project}
            onProject={(patch) => setProject((p) => ({ ...p, ...patch }))}
            advanced={advanced}
            onAdvanced={toggleAdvanced}
            onSave={save}
            onSync={sync}
            saveState={saveState}
            models={models}
            efforts={efforts}
            model={model}
            effort={effort}
            onModel={setModel}
            onEffort={setEffort}
            onPublish={publish}
          />
        ) : null}
        {rightTab === "data" ? <DataPane projectId={project.id} refreshKey={filesKey} /> : null}
        {rightTab === "ask" ? (
          <AskPane
            projectId={project.id}
            models={models}
            context={{ tab: lastNonAskTab, filePath: lastNonAskTab === "code" ? selectedFile : null }}
            onHandoff={(t) => {
              setRightTab("preview");
              send(t);
            }}
            builderBusy={chat.running}
          />
        ) : null}
        {advanced && rightTab === "terminal" ? <Terminal projectId={project.id} onRan={() => setFilesKey((k) => k + 1)} /> : null}
        {advanced && rightTab === "logs" ? <LogsPane projectId={project.id} info={preview.info} /> : null}
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/" className="mr-1 shrink-0" aria-label="Devly home"><Mark size={26} /></Link>
          <Link href="/projects" className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-stone-100 hover:text-ink" title="Back to projects">
            Projects
          </Link>
          <button onClick={() => setRightTab("settings")} className="min-w-0 truncate rounded-lg px-2 py-1 text-sm font-medium hover:bg-stone-100" title="Project settings">
            {project.name}
          </button>
          <span className="hidden text-xs text-muted sm:inline">{saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving..." : "Working..."}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="hidden items-center gap-1 md:flex">
            <Button size="sm" variant="ghost" onClick={() => setPanelOpen((o) => !o)} title={panelOpen ? "Hide the side panel" : "Show the preview"}>
              {panelOpen ? "Hide preview" : "Show preview"}
            </Button>
            {github.status?.repo ? (
              <span className="flex items-center gap-0.5 rounded-full border border-line px-1" title={`GitHub: ${github.status.repo}`}>
                <GitBranch size={13} className="ml-1 text-muted" />
                <Button size="sm" variant="ghost" loading={github.busy === "push"} disabled={!!github.busy || chat.running} onClick={() => github.push()} title="Push all files to GitHub">
                  <Upload size={13} /> Push
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={github.busy === "pull"}
                  disabled={!!github.busy || chat.running}
                  onClick={() => {
                    if (window.confirm("Pull replaces this project's files with the repository's files (a version is saved first). Continue?")) github.pull().then((ok) => ok && setFilesKey((k) => k + 1));
                  }}
                  title="Pull the latest files from GitHub"
                >
                  <Download size={13} /> Pull
                </Button>
              </span>
            ) : null}
            {github.message ? <span className={`max-w-[260px] truncate text-xs ${github.message.kind === "ok" ? "text-green-700" : "text-red-600"}`}>{github.message.text}</span> : null}
            <Button size="sm" variant="ghost" onClick={() => setHistory(true)}>
              History
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRightTab("settings")}>
              Settings
            </Button>
          </div>
          <ThemePicker />
          <PromptCounter user={user} onUser={setUser} forceOpen={limitOpen} onClose={() => setLimitOpen(false)} />
        </div>
      </header>

      {/* Desktop */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <div className="min-w-[380px] flex-1">
          <Chat
            messages={chat.messages}
            conversations={chat.conversations}
            conversationId={chat.conversationId}
            running={chat.running}
            status={chat.status}
            models={models}
            model={model}
            onModel={setModel}
            efforts={efforts}
            effort={effort}
            onEffort={setEffort}
            onSend={send}
            onStop={chat.stop}
            onRetry={() => chat.lastPrompt && send(chat.lastPrompt)}
            queue={chat.queue}
            onUnqueue={chat.unqueue}
            onOpenConversation={chat.openConversation}
            onNewConversation={chat.newConversation}
            onDeleteConversation={chat.deleteConversation}
            disabledReason={disabledReason}
            advanced={advanced}
            projectId={project.id}
          />
        </div>
        {panelOpen ? <div className="my-3 mr-3 w-[46%] min-w-[420px] overflow-hidden rounded-2xl border border-line bg-surface">{rightPanel}</div> : null}
      </div>

      {/* Mobile */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <div className={`min-h-0 flex-1 ${mobileTab === "chat" ? "" : "hidden"}`}>
          <Chat
            messages={chat.messages}
            conversations={chat.conversations}
            conversationId={chat.conversationId}
            running={chat.running}
            status={chat.status}
            models={models}
            model={model}
            onModel={setModel}
            efforts={efforts}
            effort={effort}
            onEffort={setEffort}
            onSend={send}
            onStop={chat.stop}
            onRetry={() => chat.lastPrompt && send(chat.lastPrompt)}
            queue={chat.queue}
            onUnqueue={chat.unqueue}
            onOpenConversation={chat.openConversation}
            onNewConversation={chat.newConversation}
            onDeleteConversation={chat.deleteConversation}
            disabledReason={disabledReason}
            advanced={false}
            projectId={project.id}
          />
        </div>
        <div className={`min-h-0 flex-1 ${mobileTab === "preview" ? "" : "hidden"}`}>
          <PreviewPane projectId={project.id} info={preview.info} reloadKey={preview.reloadKey} onRefresh={preview.refresh} onRestart={preview.restart} onPublish={publish} publishing={publishing} onAskFix={askFix} advanced={false} aiBusy={chat.running} />
        </div>
        <nav className="grid h-14 shrink-0 grid-cols-3 border-t border-line bg-surface text-sm">
          <button onClick={() => setMobileTab("chat")} className={`flex flex-col items-center justify-center gap-0.5 text-xs ${mobileTab === "chat" ? "font-medium text-ink" : "text-muted"}`}>
            <MessageSquare size={18} /> Chat
          </button>
          <button onClick={() => setMobileTab("preview")} className={`flex flex-col items-center justify-center gap-0.5 text-xs ${mobileTab === "preview" ? "font-medium text-ink" : "text-muted"}`}>
            <Eye size={18} /> Preview
          </button>
          <Link href="/projects" className="flex flex-col items-center justify-center gap-0.5 text-xs text-muted">
            <FolderOpen size={18} /> Projects
          </Link>
        </nav>
      </div>

      <HistoryModal
        projectId={project.id}
        open={history}
        onClose={() => setHistory(false)}
        onRestored={() => {
          setFilesKey((k) => k + 1);
          preview.refresh();
        }}
      />
      <PublishModal
        open={!!publishResult}
        onClose={() => setPublishResult(null)}
        url={publishResult?.url ?? null}
        error={publishResult?.error ?? null}
        details={publishResult?.details}
        advanced={advanced}
        onAskFix={() => {
          const d = publishResult?.details;
          setPublishResult(null);
          send(`Publishing failed: ${publishResult?.error ?? "build error"}. Please fix the project so it builds successfully.\n\n${(d ?? "").slice(0, 4000)}`);
        }}
      />
      <ConflictModal
        open={!!conflict}
        onClose={() => setConflict(null)}
        onKeepMine={() => {
          conflict?.keepMine();
          setConflict(null);
        }}
        onUseLatest={() => {
          conflict?.useLatest();
          setConflict(null);
        }}
        onAskAI={() => {
          conflict?.askAI();
          setConflict(null);
        }}
      />
    </div>
  );
}
