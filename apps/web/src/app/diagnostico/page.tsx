import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DiagnosticWorkspace } from "@/components/diagnostic-workspace";
import { currentProfile, currentUser } from "@/lib/auth";

export default async function DiagnosticPage() {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  const profile = await currentProfile();
  return <AppShell active="diagnostico" email={user.email} professionalName={profile?.professionalName}><DiagnosticWorkspace /></AppShell>;
}
