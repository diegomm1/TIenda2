const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return sendJson(res, 400, { error: "El body debe contener JSON válido." });
  }
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return sendJson(res, 400, { error: "El campo prompt es obligatorio." });
  }

  const contents = Array.isArray(body.history) ? body.history : [];
  contents.push({
    role: "user",
    parts: [{ text: body.prompt.trim() }],
  });

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: typeof body.systemInstruction === "string"
              ? body.systemInstruction
              : "Eres un asistente nutricional y de ahorro para compras de supermercado. Responde en español, con claridad y prudencia.",
          }],
        },
        contents,
        generationConfig: {
          temperature: typeof body.temperature === "number" ? body.temperature : 0.4,
          maxOutputTokens: typeof body.maxOutputTokens === "number" ? body.maxOutputTokens : 300,
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return sendJson(res, response.status, {
        error: data.error?.message || "Gemini rechazó la solicitud.",
      });
    }

    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();
    if (!text) {
      return sendJson(res, 502, { error: "Gemini no devolvió texto." });
    }

    return sendJson(res, 200, { text });
  } catch (error) {
    return sendJson(res, 502, { error: `No se pudo contactar con Gemini: ${error.message}` });
  }
}
