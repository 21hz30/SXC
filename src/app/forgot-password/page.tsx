import { redirect } from "next/navigation";
import AccountLookupForm from "@/components/AccountLookupForm";
import { getSessionUser } from "@/lib/auth";

export default async function ForgotPasswordPage() {
  if (await getSessionUser()) redirect("/");
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-background p-4 sm:p-6">
      <AccountLookupForm />
    </main>
  );
}
