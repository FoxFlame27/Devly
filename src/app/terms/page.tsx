import { TopNav } from "@/components/TopNav";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-2xl px-6 py-10 text-[15px] leading-relaxed">
        <h1 className="mb-6 text-2xl font-semibold">Terms of use</h1>
        <ul className="list-disc space-y-2 pl-5 text-muted">
          <li>You may use Devly to build websites and apps for yourself or others. What you build belongs to you.</li>
          <li>Do not use Devly to build anything illegal, harmful, or that infringes on someone else&apos;s rights.</li>
          <li>Free accounts include a limited number of AI requests. Additional access is granted with access codes.</li>
          <li>Devly is provided as is. We do our best to keep your projects safe, but we recommend downloading a copy of important work.</li>
          <li>We may change or stop the service; you will keep the ability to download your projects.</li>
        </ul>
      </main>
    </div>
  );
}
