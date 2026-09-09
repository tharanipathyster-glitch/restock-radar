// Restock Radar — LLM-powered bill reader
//
// Real bills come in all shapes (handwritten totals, register printouts,
// supplier invoices), which is exactly the kind of unstructured-text
// problem an LLM is good at and a fixed CSV/Excel schema is not — hence
// the spec asking for "read it using an LLM" rather than a rigid upload
// format. This uses OpenAI's chat completions API (gpt-4o-mini: cheap,
// fast, and multimodal so it can read a photographed bill, not just typed
// text) with structured JSON output.
//
// Requires OPENAI_API_KEY in the environment. Without it, this throws a
// clear "not configured" error rather than silently failing — same
// placeholder pattern as server/pos-connectors/*.js. The structured
// upload-bill / upload-inventory endpoints in server.js work without any
// API key at all, so the app is still fully testable without one.

const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You read grocery/retail bills and invoices and extract line items as JSON.
Return ONLY a JSON object: { "items": [ { "item": string, "quantity": number, "unit": string|null, "unitCost": number|null } ] }.
"quantity" is the amount of stock received/purchased for that line.
"unit" is the stocking unit that quantity is counted in, lowercased and singular — "lb", "kg", "pack", "tin", "bottle", "box", "each", etc. — inferred from the bill text; null if not stated.
"unitCost" is cost per unit if it can be determined from the bill (total price divided by quantity), else null.
Ignore taxes, totals, and non-product lines. If nothing usable is found, return { "items": [] }.`;

async function parseBillWithLLM({ text, imageBase64 }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error(
      "LLM bill reading isn't configured yet — set the OPENAI_API_KEY environment variable on the server to enable it. " +
        "Until then, use the structured JSON upload option instead."
    );
    err.code = "LLM_NOT_CONFIGURED";
    throw err;
  }
  if (!text && !imageBase64) {
    throw new Error("Provide either bill text or an image to parse.");
  }

  const userContent = [];
  if (text) userContent.push({ type: "text", text });
  if (imageBase64) userContent.push({ type: "image_url", image_url: { url: imageBase64 } });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LLM request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "{}";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("LLM returned a response that wasn't valid JSON.");
  }
  return Array.isArray(parsed.items) ? parsed.items : [];
}

module.exports = { parseBillWithLLM };
