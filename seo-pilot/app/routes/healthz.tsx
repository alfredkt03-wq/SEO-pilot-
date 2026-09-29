// Liveness endpoint for the host's health checks (Render pings this and
// restarts the service if it stops answering). Deliberately does no Shopify
// authentication and no database query: it answers "this process is up and
// serving HTTP", which is the only thing a restart could fix.
export const loader = () => {
  return new Response("ok", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
};
