import "server-only";
import { HttpError } from "./http";

/** Minimal GitHub REST client for pushing and pulling project files without a git binary (works on serverless hosts). */
const API = "https://api.github.com";

export type RepoFile = { path: string; content: string };

async function gh<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Devly", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data as { message?: string } | null)?.message ?? text.slice(0, 200);
    if (res.status === 401) throw new HttpError(401, "GitHub rejected the token. Add a new one in Settings.", "github_token");
    if (res.status === 404) throw new HttpError(404, `GitHub: not found (${path}). Check the repository name and that the token can access it.`, "github_not_found");
    if (res.status === 403 && /rate limit/i.test(msg)) throw new HttpError(429, "GitHub rate limit reached. Try again in a few minutes.");
    throw new HttpError(502, `GitHub error: ${msg}`);
  }
  return data as T;
}

export async function githubUser(token: string): Promise<{ login: string; avatar_url: string }> {
  return gh(token, "GET", "/user");
}

export async function listRepos(token: string): Promise<{ full_name: string; private: boolean; default_branch: string; updated_at: string }[]> {
  const repos = await gh<{ full_name: string; private: boolean; default_branch: string; updated_at: string }[]>(token, "GET", "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator");
  return repos.map((r) => ({ full_name: r.full_name, private: r.private, default_branch: r.default_branch, updated_at: r.updated_at }));
}

export async function createRepo(token: string, name: string, isPrivate: boolean): Promise<{ full_name: string; default_branch: string; html_url: string }> {
  return gh(token, "POST", "/user/repos", { name, private: isPrivate, auto_init: true, description: "Built with Devly" });
}

export async function repoInfo(token: string, repo: string): Promise<{ full_name: string; default_branch: string; html_url: string; permissions?: { push?: boolean } }> {
  return gh(token, "GET", `/repos/${repo}`);
}

async function branchHead(token: string, repo: string, branch: string): Promise<{ sha: string; treeSha: string } | null> {
  try {
    const ref = await gh<{ object: { sha: string } }>(token, "GET", `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    const commit = await gh<{ tree: { sha: string } }>(token, "GET", `/repos/${repo}/git/commits/${ref.object.sha}`);
    return { sha: ref.object.sha, treeSha: commit.tree.sha };
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Commits the given files as the complete content of the branch (files not listed are removed),
 * using the Git Data API: blobs -> tree -> commit -> ref.
 */
export async function pushFiles(token: string, repo: string, branch: string, files: RepoFile[], message: string): Promise<{ sha: string; url: string }> {
  const head = await branchHead(token, repo, branch);
  const tree = files.map((f) => ({ path: f.path, mode: "100644" as const, type: "blob" as const, content: f.content }));
  const newTree = await gh<{ sha: string }>(token, "POST", `/repos/${repo}/git/trees`, { tree });
  const commit = await gh<{ sha: string; html_url: string }>(token, "POST", `/repos/${repo}/git/commits`, { message, tree: newTree.sha, parents: head ? [head.sha] : [] });
  if (head) await gh(token, "PATCH", `/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha, force: false });
  else await gh(token, "POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
  return { sha: commit.sha, url: commit.html_url };
}

const SKIP = /(^|\/)(node_modules|\.git|dist|\.next|\.vite|\.DS_Store)(\/|$)/;
const MAX_BLOB = 1_000_000;

/** Reads every text file on the branch (skips build folders, binaries and files over 1 MB). */
export async function pullFiles(token: string, repo: string, branch: string): Promise<{ files: RepoFile[]; sha: string; skipped: string[] }> {
  const head = await branchHead(token, repo, branch);
  if (!head) throw new HttpError(404, `Branch "${branch}" doesn't exist in ${repo}.`);
  const tree = await gh<{ tree: { path: string; type: string; sha: string; size?: number }[]; truncated: boolean }>(token, "GET", `/repos/${repo}/git/trees/${head.treeSha}?recursive=1`);
  const files: RepoFile[] = [];
  const skipped: string[] = [];
  const blobs = tree.tree.filter((t) => t.type === "blob" && !SKIP.test(t.path));
  const queue = [...blobs];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const b = queue.shift()!;
      if ((b.size ?? 0) > MAX_BLOB) {
        skipped.push(b.path);
        continue;
      }
      const blob = await gh<{ content: string; encoding: string }>(token, "GET", `/repos/${repo}/git/blobs/${b.sha}`);
      const buf = Buffer.from(blob.content, "base64");
      if (buf.includes(0)) {
        skipped.push(b.path);
        continue;
      }
      files.push({ path: b.path, content: buf.toString("utf8") });
    }
  });
  await Promise.all(workers);
  return { files, sha: head.sha, skipped };
}
