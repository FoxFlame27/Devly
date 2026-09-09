/**
 * Starter templates. Every template is a real, runnable Vite/Next project so the
 * live preview works before the AI has written a single line.
 */
export type TemplateId = "website" | "react" | "nextjs" | "static";

export type Template = {
  id: TemplateId;
  label: string;
  description: string;
  devCommand: string;
  buildCommand: string;
  outputDir: string;
  files: Record<string, string>;
};

/** Injected into every template's HTML so runtime errors reach the platform preview (via postMessage). */
export const ERROR_REPORTER = `<script>
(function(){
  function send(kind, message, stack){ try { parent.postMessage({ source: 'buildbot-preview', kind: kind, message: String(message).slice(0, 2000), stack: stack ? String(stack).slice(0, 4000) : '' }, '*'); } catch (e) {} }
  window.addEventListener('error', function(e){ send('error', e.message, e.error && e.error.stack); });
  window.addEventListener('unhandledrejection', function(e){ var r = e.reason; send('error', (r && r.message) || r, r && r.stack); });
  var seen = '';
  setInterval(function(){
    var o = document.querySelector('vite-error-overlay');
    if (!o) { if (seen) { seen=''; send('clear', ''); } return; }
    var m = o.shadowRoot && o.shadowRoot.querySelector('.message');
    var f = o.shadowRoot && o.shadowRoot.querySelector('.file');
    var t = ((m && m.textContent) || '') + ' ' + ((f && f.textContent) || '');
    if (t.trim() && t !== seen) { seen = t; send('compile', t.trim()); }
  }, 800);
  window.addEventListener('load', function(){ send('ready', ''); });
})();
</script>`;

const gitignore = `node_modules\ndist\n.vite\n.DS_Store\n`;

const website: Template = {
  id: "website",
  label: "Website",
  description: "A fast, simple site. Great for landing pages, portfolios, and businesses.",
  devCommand: "npx vite --host 127.0.0.1 --strictPort --port $PORT",
  buildCommand: "npx vite build",
  outputDir: "dist",
  files: {
    "package.json": JSON.stringify(
      { name: "my-website", private: true, version: "0.0.0", type: "module", scripts: { dev: "vite", build: "vite build", preview: "vite preview" }, devDependencies: { vite: "^8.2.2" } },
      null,
      2,
    ),
    ".gitignore": gitignore,
    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Website</title>
    <link rel="stylesheet" href="/src/style.css" />
    ${ERROR_REPORTER}
  </head>
  <body>
    <main class="hero">
      <h1>Your site is ready to be built</h1>
      <p>Describe what you want in the chat and it will appear here.</p>
    </main>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`,
    "src/style.css": `*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #0f1115; color: #e8eaf0; }
.hero { min-height: 100vh; display: grid; place-content: center; text-align: center; padding: 2rem; }
h1 { font-size: 2rem; margin: 0 0 0.5rem; }
p { color: #9aa3b2; margin: 0; }
`,
    "src/main.js": `// Your site's JavaScript lives here.
console.log("Site loaded");
`,
  },
};

const react: Template = {
  id: "react",
  label: "React App",
  description: "An interactive app with components and state. Great for tools, dashboards, and games.",
  devCommand: "npx vite --host 127.0.0.1 --strictPort --port $PORT",
  buildCommand: "npx vite build",
  outputDir: "dist",
  files: {
    "package.json": JSON.stringify(
      {
        name: "my-app",
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: { dev: "vite", build: "tsc -b && vite build", preview: "vite preview" },
        dependencies: { react: "^19.2.8", "react-dom": "^19.2.8" },
        devDependencies: {
          "@types/react": "^19.2.18",
          "@types/react-dom": "^19.2.7",
          "@vitejs/plugin-react": "^6.1.1",
          "@tailwindcss/vite": "^4.3.3",
          tailwindcss: "^4.3.3",
          typescript: "^5.9.3",
          vite: "^8.2.2",
        },
      },
      null,
      2,
    ),
    ".gitignore": gitignore,
    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App</title>
    ${ERROR_REPORTER}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
`,
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          isolatedModules: true,
          resolveJsonModule: true,
        },
        include: ["src"],
      },
      null,
      2,
    ),
    "src/main.tsx": `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
    "src/index.css": `@import "tailwindcss";

body { @apply bg-neutral-950 text-neutral-100 antialiased; }
`,
    "src/App.tsx": `export default function App() {
  return (
    <main className="min-h-screen grid place-content-center text-center p-8">
      <h1 className="text-3xl font-semibold">Your app is ready to be built</h1>
      <p className="mt-2 text-neutral-400">Describe what you want in the chat and it will appear here.</p>
    </main>
  );
}
`,
  },
};

const nextjs: Template = {
  id: "nextjs",
  label: "Next.js",
  description: "A full web app with pages and server features. Best for bigger projects.",
  devCommand: "npx next dev -H 127.0.0.1 -p $PORT",
  buildCommand: "npx next build",
  outputDir: "out",
  files: {
    "package.json": JSON.stringify(
      {
        name: "my-next-app",
        private: true,
        version: "0.1.0",
        scripts: { dev: "next dev", build: "next build", start: "next start" },
        dependencies: { next: "^16.3.4", react: "^19.2.8", "react-dom": "^19.2.8" },
        devDependencies: { "@types/node": "^24.0.0", "@types/react": "^19.2.18", "@types/react-dom": "^19.2.7", typescript: "^5.9.3", tailwindcss: "^4.3.3", "@tailwindcss/postcss": "^4.3.3" },
      },
      null,
      2,
    ),
    ".gitignore": `node_modules\n.next\nout\n.DS_Store\n`,
    "next.config.ts": `import type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = { output: "export", images: { unoptimized: true } };\n\nexport default nextConfig;\n`,
    "postcss.config.mjs": `export default { plugins: { "@tailwindcss/postcss": {} } };\n`,
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["dom", "dom.iterable", "esnext"],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: "esnext",
          moduleResolution: "bundler",
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: "preserve",
          incremental: true,
          plugins: [{ name: "next" }],
          paths: { "@/*": ["./*"] },
        },
        include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        exclude: ["node_modules"],
      },
      null,
      2,
    ),
    "app/layout.tsx": `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "My App", description: "Built with AI" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: ${JSON.stringify(ERROR_REPORTER.replace(/^<script>|<\/script>$/g, ""))} }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
`,
    "app/globals.css": `@import "tailwindcss";\n\nbody { @apply bg-neutral-950 text-neutral-100 antialiased; }\n`,
    "app/page.tsx": `export default function Home() {
  return (
    <main className="min-h-screen grid place-content-center text-center p-8">
      <h1 className="text-3xl font-semibold">Your app is ready to be built</h1>
      <p className="mt-2 text-neutral-400">Describe what you want in the chat and it will appear here.</p>
    </main>
  );
}
`,
  },
};

/** Plain HTML/CSS/JS with no build step: previewed and published straight from the stored files. */
const staticSite: Template = {
  id: "static",
  label: "Website (plain HTML)",
  description: "HTML, CSS and JavaScript with no build step. Works everywhere, including serverless hosting.",
  devCommand: "none",
  buildCommand: "",
  outputDir: ".",
  files: {
    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Website</title>
    <link rel="stylesheet" href="styles.css" />
    ${ERROR_REPORTER}
  </head>
  <body>
    <main class="hero">
      <h1>Your site is ready to be built</h1>
      <p>Describe what you want in the chat and it will appear here.</p>
    </main>
    <script src="app.js"></script>
  </body>
</html>
`,
    "styles.css": `*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #0f1115; color: #e8eaf0; }
.hero { min-height: 100vh; display: grid; place-content: center; text-align: center; padding: 2rem; }
h1 { font-size: 2rem; margin: 0 0 0.5rem; }
p { color: #9aa3b2; margin: 0; }
`,
    "app.js": `// Your site's JavaScript lives here. Use plain JS; libraries can be loaded from a CDN with a <script> tag.
console.log("Site loaded");
`,
  },
};

export const TEMPLATES: Record<TemplateId, Template> = { website, react, nextjs, static: staticSite };

export function getTemplate(id: string | null | undefined): Template {
  return (id && (TEMPLATES as Record<string, Template>)[id]) || TEMPLATES.website;
}

/** Picks a template from a free-text description when the user did not choose one. */
export function inferTemplate(prompt: string): TemplateId {
  const p = prompt.toLowerCase();
  if (/\b(next\.?js|full[- ]stack|server[- ]side|api route|database)\b/.test(p)) return "nextjs";
  if (/\b(app|dashboard|game|tool|calculator|todo|to-do|tracker|editor|chat|quiz|interactive|counter|timer|kanban|board|player)\b/.test(p)) return "react";
  return "website";
}
