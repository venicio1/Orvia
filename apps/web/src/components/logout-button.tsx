"use client";
import { useRouter } from "next/navigation";
import { authRequest } from "@/lib/csrf";

export function LogoutButton() {
  const router = useRouter();
  return <button className="logout-button" onClick={async () => { await authRequest("logout"); router.replace("/entrar"); router.refresh(); }}>Sair</button>;
}
