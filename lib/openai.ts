import OpenAI from 'openai';

// CRITICAL: This model is non-negotiable per project requirements.
// Do NOT change to gpt-4o, gpt-4.1-mini, or any other model.
const MODEL = 'gpt-5.4-mini';

const BATCH_SIZE = 20;
const TEMPERATURE = 0.3;

interface ArticleInput {
  id: string;
  title: string;
  description: string;
}

interface SummaryResult {
  id: string;
  summary: string;
}

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _client;
}

/**
 * Build the prompt for a batch of articles.
 */
function buildPrompt(batch: ArticleInput[]): string {
  const entries = batch
    .map(
      (a, i) =>
        `${i + 1}. ID: ${a.id}\n   Title: ${a.title}\n   Content: ${a.description || '(no description)'}`,
    )
    .join('\n\n');

  return (
    'Summarize each article in 1-2 sentences. Be direct and informative. ' +
    'Return a JSON array with {id, summary} for each article. ' +
    'Use the exact article IDs provided. Output only valid JSON, no markdown fences.\n\n' +
    entries
  );
}

/**
 * Parse the raw JSON response from OpenAI into a list of SummaryResult objects.
 * Returns an empty array if parsing fails.
 */
function parseResponse(raw: string): SummaryResult[] {
  try {
    // Strip markdown code fences if model wraps the response
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is SummaryResult =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.summary === 'string',
    );
  } catch {
    return [];
  }
}

/**
 * Generate 1–2 sentence summaries for a list of articles using gpt-5.4-mini.
 *
 * Articles are batched in groups of 20 to stay within token limits.
 * Returns a Map of article_id → summary string.
 * If any OpenAI call fails, that batch is silently skipped — summaries are non-critical.
 */
export async function generateSummaries(
  articles: ArticleInput[],
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  if (articles.length === 0) return results;

  const client = getClient();

  for (let offset = 0; offset < articles.length; offset += BATCH_SIZE) {
    const batch = articles.slice(offset, offset + BATCH_SIZE);

    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        temperature: TEMPERATURE,
        messages: [
          {
            role: 'user',
            content: buildPrompt(batch),
          },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? '';
      const summaries = parseResponse(raw);

      for (const { id, summary } of summaries) {
        if (summary.trim()) {
          results.set(id, summary.trim());
        }
      }
    } catch {
      // Non-critical: missing summaries fall back to truncated description in UI
    }
  }

  return results;
}
