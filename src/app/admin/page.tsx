import { redirect } from "next/navigation";
import { getCurrentUser, toSafeUser } from "@/lib/auth/session";
import { Header } from "@/components/Header";
import { AdminPanel } from "@/components/admin/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "ADMIN") redirect("/projects");
  return (
    <div className="min-h-screen">
      <Header user={toSafeUser(user)} />
      <AdminPanel />
    </div>
  );
}
