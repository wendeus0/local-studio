import { NextRequest } from "next/server";
import { handleRuntimeLog } from "@local-studio/agent-runtime/http/handlers";
import { proxyToAgentRuntime } from "@/app/api/agent/proxy-to-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return (await proxyToAgentRuntime(request)) ?? handleRuntimeLog(request, id);
}
