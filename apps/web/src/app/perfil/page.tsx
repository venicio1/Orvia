import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ProfileWorkflow } from "@/components/profile-workflow";
import { currentProfile, currentUser } from "@/lib/auth";

export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  const profile = await currentProfile();
  return <AppShell active="perfil" email={user.email} professionalName={profile?.professionalName}><ProfileWorkflow mode="edit" initialProfile={profile} /></AppShell>;
}
