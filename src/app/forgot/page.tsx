import { Suspense } from "react";
import { ForgotForm } from "@/components/ForgotForm";

export const metadata = { title: "Reset password" };

export default function ForgotPage() {
  return (
    <Suspense>
      <ForgotForm />
    </Suspense>
  );
}
