export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  };
}

export function sendError(message: string, status: number): Response {
  const errorJson = { error: message };
  return new Response(JSON.stringify(errorJson), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" }
  });
}
