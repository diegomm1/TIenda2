// gemini-1.5-flash fue retirado por Google y devuelve "model not found".
// Se puede cambiar el modelo sin tocar el código con la variable GEMINI_MODEL en Vercel.
const DEFAULT_MODEL = "gemini-3.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Los modelos actuales "piensan" y esos tokens cuentan dentro de maxOutputTokens.
// Con un límite muy bajo (p. ej. 120) la respuesta puede llegar vacía.
const MIN_OUTPUT_TOKENS = 1024;

const sendJson = (res, status, body) => {
  res.status(status).json(body);
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método no permitido. Usa POST." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, { error: "GEMINI_API_KEY no está configurada en el entorno." });
  }
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return sendJson(res, 400, { error: "El body debe contener JSON válido." });
  }
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return sendJson(res, 400, { error: "El campo prompt es obligatorio." });
  }

  const contents = [
    ...(Array.isArray(body.history) ? body.history : []),
    { role: "user", parts: [{ text: body.prompt.trim() }] },
  ];

  const requestedTokens = typeof body.maxOutputTokens === "number" ? body.maxOutputTokens : 0;

  try {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: typeof body.systemInstruction === "string" && body.systemInstruction
              ? body.systemInstruction
              : "Eres un asistente nutricional y de ahorro para compras de supermercado. Responde en español, con claridad y prudencia.",
          }],
        },
        contents,
        generationConfig: {
          temperature: typeof body.temperature === "number" ? body.temperature : 0.4,
          maxOutputTokens: Math.max(requestedTokens, MIN_OUTPUT_TOKENS),
        },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return sendJson(res, response.status, {
        error: data.error?.message || `Gemini rechazó la solicitud (${response.status}).`,
      });
    }

    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();
    if (!text) {
      const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || "sin motivo";
      return sendJson(res, 502, { error: `Gemini no devolvió texto (${reason}).` });
    }

    return sendJson(res, 200, { text });
  } catch (error) {
    return sendJson(res, 502, { error: `No se pudo contactar con Gemini: ${error.message}` });
  }
}
