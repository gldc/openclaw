/** Thin HTTP client for gam-mcp REST approval endpoints. */

export type GamRestResult = {
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
};

async function post(url: string, body: unknown): Promise<GamRestResult> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  return (await resp.json()) as GamRestResult;
}

export function gamMcpApprove(
  baseUrl: string,
  req: { proposal_id: string; approval_token: string; approved_by: string },
): Promise<GamRestResult> {
  return post(`${baseUrl}/approve`, req);
}

export function gamMcpDeny(
  baseUrl: string,
  req: { proposal_id: string; denied_by: string },
): Promise<GamRestResult> {
  return post(`${baseUrl}/deny`, req);
}
