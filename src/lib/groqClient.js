import Groq from 'groq-sdk';

// Models known to be decommissioned or unavailable on Groq so stale env overrides do not stall requests
const DEPRECATED_GROQ_MODELS = new Set([
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'llama3-70b-8192',
]);

const FALLBACK_GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b',
];

/**
 * Returns an ordered, deduplicated list of Groq chat models to try.
 */
export function getGroqModelCandidates() {
  const configured = (process.env.GROQ_LLM_MODEL || '').trim();
  const candidates = [];

  if (configured && !DEPRECATED_GROQ_MODELS.has(configured)) {
    candidates.push(configured);
  }

  for (const model of FALLBACK_GROQ_MODELS) {
    if (!candidates.includes(model)) {
      candidates.push(model);
    }
  }

  return candidates;
}

function isRetryableModelError(error) {
  const status = error?.status || error?.statusCode;
  const msg = String(error?.message || '').toLowerCase();
  const code = String(error?.error?.code || error?.code || '').toLowerCase();

  return (
    status === 404 ||
    code === 'model_not_found' ||
    code === 'model_decommissioned' ||
    msg.includes('does not exist') ||
    msg.includes('model_not_found') ||
    msg.includes('decommissioned')
  );
}

/**
 * Runs a Groq chat completion with automatic fallback across active models
 * if a configured model is unavailable or produces empty content.
 */
export async function createChatCompletionWithFallback(apiKey, payload) {
  const groq = new Groq({ apiKey });
  const candidates = getGroqModelCandidates();
  let lastError = null;

  for (const model of candidates) {
    try {
      const completion = await groq.chat.completions.create({
        ...payload,
        model,
      });

      const content = completion?.choices?.[0]?.message?.content;
      if (content && content.trim().length > 0) {
        return { completion, content: content.trim(), model };
      }

      lastError = new Error(`Model ${model} returned empty content.`);
    } catch (error) {
      lastError = error;
      if (!isRetryableModelError(error)) {
        throw error;
      }
      console.warn(`Groq model fallback from ${model}:`, error?.message);
    }
  }

  throw lastError || new Error('No available Groq chat model succeeded.');
}

/**
 * Extracts and parses a JSON object from model output, stripping any
 * reasoning tags or markdown code fences first.
 */
export function parseModelJson(rawText) {
  const withoutThink = String(rawText || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();

  const unfenced = withoutThink
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(unfenced.slice(start, end + 1));
    }
    throw new Error('AI response did not contain valid JSON.');
  }
}
