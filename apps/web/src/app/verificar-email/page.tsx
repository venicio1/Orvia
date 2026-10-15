import { AuthPanel } from "@/components/auth-panel";
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) { return <AuthPanel mode="verify" token={(await searchParams).token ?? ""} />; }
