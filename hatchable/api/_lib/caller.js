// Shared helper — read the authenticated caller from the edge-injected header.
// On personal-visibility projects the edge guarantees this header is set
// for any request that reaches a function.
export function getCallerId(req) {
  try {
    const raw = req.headers["x-hatchable-caller"];
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.id || parsed.handle || null;
  } catch {
    return null;
  }
}
