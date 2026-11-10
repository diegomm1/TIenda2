// gemini-1.5-flash fue retirado por Google y devuelve "model not found".
// Los modelos se pueden cambiar sin tocar el código con las variables de Vercel:
//   GEMINI_MODEL           -> modelo principal
//   GEMINI_FALLBACK_MODEL  -> modelo de reserva si el principal está saturado o no existe
const DEFAULT_MODEL = "gemini-3.5-flash";
const DEFAULT_FALLBACK_MODEL = "gemini-3.1-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Los modelos actuales "piensan" y esos tokens cuentan dentro de maxOutputTokens.
// Con un límite muy bajo (p. ej. 120) la respuesta puede llegar vacía.
const MIN_OUTPUT_TOKENS = 1024;

// Errores temporales de Google (saturación, límite puntual, fallo interno).
const RETRYABLE_STATUS = new Set([429, 500, 503, 504]);
const ATTEMPTS_PER_MODEL = 2;
const RETRY_DELAY_MS = 800;
const REQUEST_TIMEOUT_MS = 8000;

const sendJson = (res, status, body) => {
  res.status(status).json(body);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Llama a un modelo concreto. Devuelve { ok, status, data }.
const callGemini = async (model, apiKey, payload) => {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
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
  const primaryModel = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL;
  const models = [...new Set([primaryModel, fallbackModel])];

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

  const payload = {
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
  };

  let lastStatus = 502;
  let lastError = "No se pudo contactar con Gemini.";

  for (const model of models) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt += 1) {
      try {
        const { ok, status, data } = await callGemini(model, apiKey, payload);

        if (ok) {
          const text = data.candidates?.[0]?.content?.parts
            ?.map((part) => part.text || "")
            .join("")
            .trim();
          if (text) {
            return sendJson(res, 200, { text });
          }
          const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || "sin motivo";
          lastStatus = 502;
          lastError = `Gemini no devolvió texto (${reason}).`;
          break; // otro intento con el mismo modelo no cambiaría nada: pasa al siguiente
        }

        lastStatus = status;
        lastError = data.error?.message || `Gemini rechazó la solicitud (${status}).`;

        if (RETRYABLE_STATUS.has(status)) {
          if (attempt < ATTEMPTS_PER_MODEL) {
            await sleep(RETRY_DELAY_MS * attempt);
          }
          continue; // reintenta; si se agotan los intentos, pasa al modelo de reserva
        }
        if (status === 404) {
          break; // el modelo no existe: prueba el de reserva
        }
        // 400 / 401 / 403...: la petición o la clave están mal, no tiene sentido reintentar
        return sendJson(res, status, { error: lastError });
      } catch (error) {
        lastStatus = 502;
        lastError = `No se pudo contactar con Gemini: ${error.message}`;
        if (attempt < ATTEMPTS_PER_MODEL) {
          await sleep(RETRY_DELAY_MS * attempt);
        }
      }
    }
  }

  return sendJson(res, lastStatus, { error: lastError });
}
