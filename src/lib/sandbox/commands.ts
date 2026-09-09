/**
 * Command restrictions for the AI / terminal. Commands run inside the sandbox
 * (which also enforces filesystem isolation), but we additionally allowlist
 * binaries so obviously dangerous tools are never invoked.
 */
const ALLOWED_BINARIES = new Set([
  "node", "npm", "npx", "pnpm", "yarn", "tsc", "vite", "next", "eslint", "prettier", "vitest", "jest",
  "ls", "cat", "echo", "grep", "find", "mkdir", "rm", "cp", "mv", "touch", "head", "tail", "wc", "pwd",
  "sed", "awk", "sort", "uniq", "cut", "tr", "diff", "which", "true", "false", "test", "printf", "env",
  "git", "tar", "unzip", "zip", "date", "sleep", "du", "stat", "basename", "dirname", "xargs", "tee", "cd", "export",
]);

const FORBIDDEN_PATTERNS: RegExp[] = [
  /\bsudo\b/, /\bsu\b/, /\bchmod\s+[0-7]*777/, /\bcurl\b/, /\bwget\b/, /\bssh\b/, /\bscp\b/, /\bnc\b/, /\bnetcat\b/,
  /\bkill(all)?\b/, /\bpkill\b/, /\breboot\b/, /\bshutdown\b/, /\blaunchctl\b/, /\bdocker\b/, /\bpython3?\b/, /\bperl\b/, /\bruby\b/,
  /\bopen\b/, /\bosascript\b/, /\bdefaults\b/, /\bcrontab\b/, /\bmount\b/, /\bdiskutil\b/, /\/dev\/(disk|rdisk)/,
  /\$\(/, /`/, /\bexec\b/, /\beval\b/, /\bsource\b/, /^\s*\./, /\bnohup\b/, /\bdd\b/, /\bmkfifo\b/,
];

export class CommandNotAllowed extends Error {}

/** Validates a shell command string. Throws CommandNotAllowed when it is not acceptable. */
export function validateCommand(command: string): string {
  if (typeof command !== "string") throw new CommandNotAllowed("Command must be a string");
  const cmd = command.trim();
  if (!cmd) throw new CommandNotAllowed("Command is empty");
  if (cmd.length > 2000) throw new CommandNotAllowed("Command is too long");
  if (/[\r\n]/.test(cmd)) throw new CommandNotAllowed("Multi-line commands are not allowed");
  for (const re of FORBIDDEN_PATTERNS) if (re.test(cmd)) throw new CommandNotAllowed(`This command is not allowed in the sandbox: ${cmd}`);
  // Absolute paths outside the project are blocked by the sandbox, but reject obvious host paths early
  if (/(^|\s)\/(Users|home|etc|var|private|System|Library|root|opt|usr\/local)\b/.test(cmd))
    throw new CommandNotAllowed("Only paths inside the project are allowed");

  const segments = cmd.split(/&&|\|\||;|\|/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const words = seg.split(/\s+/);
    // skip leading env assignments like FOO=bar
    let i = 0;
    while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++;
    const bin = (words[i] ?? "").replace(/^.*\//, "");
    if (!ALLOWED_BINARIES.has(bin)) throw new CommandNotAllowed(`"${bin || seg}" is not available in the sandbox`);
    if (bin === "rm" && /(^|\s)-[a-zA-Z]*r[a-zA-Z]*\s+(\/|~|\.\.|\*)\s*$/.test(seg)) throw new CommandNotAllowed("Refusing to delete outside the project");
    if (bin === "git" && /\b(push|remote|fetch|clone|pull)\b/.test(seg)) throw new CommandNotAllowed("Network git operations are handled by the platform");
  }
  return cmd;
}

const PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[a-z0-9-._^~>=<|* ]+)?$/;

export function validatePackageName(name: string): string {
  const n = name.trim();
  if (!n || n.length > 214 || !PACKAGE_NAME.test(n)) throw new CommandNotAllowed(`Invalid package name: ${name}`);
  return n;
}
