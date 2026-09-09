import { TopNav } from "@/components/TopNav";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-2xl px-6 py-10 text-[15px] leading-relaxed">
        <h1 className="mb-6 text-2xl font-semibold">Privacy</h1>
        <p className="mb-4 text-muted">Devly lets you describe a website or app and builds it for you. This page explains what we store and why.</p>
        <h2 className="mb-2 mt-6 font-semibold">What we store</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>Your email address and a hashed password, so you can sign in.</li>
          <li>If you sign in with Google, the email address Google shares with us. We never see your Google password.</li>
          <li>The projects you create, their files, and your conversations with the AI, so your work is saved.</li>
          <li>Basic usage information, such as how many AI requests you made.</li>
        </ul>
        <h2 className="mb-2 mt-6 font-semibold">How it is used</h2>
        <p className="text-muted">Your project files and messages are sent to the AI provider (for example OpenAI) only to build and edit your project. We do not sell your data or use it for advertising.</p>
        <h2 className="mb-2 mt-6 font-semibold">Deleting your data</h2>
        <p className="text-muted">You can delete any project from its settings, which removes its files, conversations, and published site. To delete your whole account, contact the site owner.</p>
      </main>
    </div>
  );
}
