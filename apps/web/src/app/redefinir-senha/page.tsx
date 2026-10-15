import { AuthPanel } from "@/components/auth-panel";
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) { return <AuthPanel mode="reset" token={(await searchParams).token ?? ""} />; }
