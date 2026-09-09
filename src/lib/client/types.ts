import type { SafeUser } from "@/lib/auth/session";
import type { Effort, EffortChoice, ModelOption } from "@/config/models";

export type { SafeUser, ModelOption, Effort, EffortChoice };
export type EffortOption = { id: EffortChoice; label: string; description: string };

export type ProjectSummary = { id: string; name: string; template: string; updatedAt: string; createdAt: string; publishedSlug: string | null; publishedAt: string | null };

export type ProjectSettings = { model?: string; effort?: string };
export type ProjectDetail = { id: string; name: string; template: string; description: string | null; updatedAt: string; publishedUrl: string | null; publishedAt: string | null; settings: ProjectSettings | null };

export type FileChanges = { created: string[]; changed: string[]; deleted: string[] };

export type ActivityItem = { id: string; name: string; label: string; detail?: string; ok?: boolean; summary?: string };

export type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  activity?: ActivityItem[] | null;
  changes?: FileChanges | null;
  status?: "RUNNING" | "COMPLETE" | "STOPPED" | "ERROR";
  createdAt?: string;
  /** Images attached to a user message */
  attachments?: { name: string; type: string; data: string }[] | null;
  /** A question the AI asked, with clickable options */
  question?: { question: string; options: string[] } | null;
  /** client-only */
  pending?: boolean;
  error?: string | null;
};

export type ConversationSummary = { id: string; title: string; updatedAt: string; messageCount: number };

export type PreviewInfo = {
  status: "stopped" | "installing" | "starting" | "running" | "error";
  url: string | null;
  port: number | null;
  lastError: string | null;
  runtimeErrors: { kind: string; message: string; stack?: string; at: number }[];
  version: number;
  uptimeMs: number | null;
};

export type TreeNode = { name: string; path: string; type: "file" | "dir"; children?: TreeNode[]; size?: number };

export type SnapshotSummary = { id: string; label: string; trigger: string; fileCount: number; createdAt: string };
