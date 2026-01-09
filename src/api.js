const API_URL = "http://127.0.0.1:8000";

export async function makeMove(payload) {
  const res = await fetch(`${API_URL}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Move failed");
  }

  return res.json();
}
