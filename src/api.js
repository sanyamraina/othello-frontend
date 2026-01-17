const API_URL = "http://127.0.0.1:8000";

async function postJson(url, payload) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data?.detail || `Request failed (${res.status})`;
      throw new Error(msg);
    }

    return data;
  } catch (err) {
    // This catches CORS / network errors too
    throw new Error(err?.message || "Network error (possible CORS / server down)");
  }
}

export function makeMove(payload) {
  return postJson(`${API_URL}/move`, payload);
}

export function makeAIMove(payload) {
  return postJson(`${API_URL}/ai-move`, payload);
}

export function fetchValidMoves(payload) {
  return postJson(`${API_URL}/valid-moves`, payload);
}
