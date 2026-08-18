import { redirect } from "next/navigation";
import { AgentPanel } from "@/components/agente/AgentPanel";
import { getSessionProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listAgents, loadAgentPanel } from "@/lib/services/agent-panel";

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.role === "club") redirect("/dashboard");

  const supabase = await createClient();
  const query = await searchParams;
  const agents = session.role === "admin" ? await listAgents(supabase) : [];
  const targetUserId = session.role === "admin" ? query.user ?? agents[0]?.userId : session.userId;

  if (!targetUserId) {
    return <AgentPanel key="no-agent" initialData={null} agents={agents} readOnly />;
  }

  try {
    const data = await loadAgentPanel(supabase, targetUserId);
    return <AgentPanel key={data.agent.userId} initialData={data} agents={agents} readOnly={session.role === "admin"} />;
  } catch {
    return <AgentPanel key={targetUserId} initialData={null} agents={agents} readOnly={session.role === "admin"} loadFailed />;
  }
}
