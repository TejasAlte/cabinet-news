import OpenAI from 'openai';
import { AiSummaryResult, RawArticle } from '@/types';

const CATEGORIES = [
  'Politics',
  'Economy',
  'Parliament',
  'Foreign Affairs',
  'Defence',
  'Law & Justice',
  'Health',
  'Education',
  'Infrastructure',
  'National',
];

function guessCategory(text: string): string {
  const t = text.toLowerCase();
  const rules: [RegExp, string][] = [
    [/\b(bill|lok sabha|rajya sabha|parliament|session|speaker)\b/, 'Parliament'],
    [/\b(gdp|rbi|inflation|budget|economy|market|rupee)\b/, 'Economy'],
    [/\b(border|china|pakistan|us |diplomat|foreign ministry|embassy)\b/, 'Foreign Affairs'],
    [/\b(army|defence|military|navy|air force|missile)\b/, 'Defence'],
    [/\b(court|supreme court|high court|verdict|judge|cbi|ed )\b/, 'Law & Justice'],
    [/\b(hospital|health|covid|vaccine|disease)\b/, 'Health'],
    [/\b(school|university|exam|education|ugc)\b/, 'Education'],
    [/\b(highway|railway|metro|infrastructure|airport)\b/, 'Infrastructure'],
  ];
  for (const [re, cat] of rules) if (re.test(t)) return cat;
  return 'National';
}

/**
 * Deterministic, non-AI fallback: builds a factual 40-60 word summary purely
 * from the headline + RSS description, without copying sentences verbatim
 * beyond what the publisher already syndicates as a snippet. Used whenever
 * OPENAI_API_KEY is unset or the API call fails, so the pipeline never stalls.
 */
function deterministicSummary(article: RawArticle): AiSummaryResult {
  const base = `${article.headline}. ${article.contentSnippet}`.trim();
  const words = base.split(/\s+/).filter(Boolean);
  let summary = words.slice(0, 55).join(' ');
  if (words.length > 55) summary += '...';
  if (words.length < 40) {
    summary = `${summary} Reported by ${article.publisher}, covering developments as they were announced.`;
  }
  return {
    summary,
    category: guessCategory(base),
    people: [],
  };
}

let client: OpenAI | null = null;
function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/**
 * Produces { summary, category, people } as strict JSON. Falls back to a
 * deterministic summary on any error (missing key, timeout, malformed JSON)
 * so a single flaky API call never breaks the pipeline.
 */
export async function generateSummary(article: RawArticle): Promise<AiSummaryResult> {
  const ai = getClient();
  if (!ai) return deterministicSummary(article);

  try {
    const response = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a factual Indian political news summarizer for Cabinet News. ' +
            'Given a headline and a short RSS description, write an ORIGINAL summary in your own words ' +
            '(40-60 words), never copying sentences verbatim from the input. Stay strictly factual — no ' +
            'speculation or opinion. Identify the most relevant category from this list: ' +
            `${CATEGORIES.join(', ')}. List any Indian MPs (Lok Sabha or Rajya Sabha members) named or ` +
            'clearly implied. Respond ONLY with JSON: {"summary": "", "category": "", "people": []}',
        },
        {
          role: 'user',
          content: `Headline: ${article.headline}\nPublisher: ${article.publisher}\nDescription: ${article.contentSnippet}`,
        },
      ],
      max_tokens: 300,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error('empty completion');
    const parsed = JSON.parse(raw) as Partial<AiSummaryResult>;
    if (!parsed.summary || !parsed.category) throw new Error('malformed completion');

    return {
      summary: parsed.summary,
      category: CATEGORIES.includes(parsed.category) ? parsed.category : guessCategory(article.headline),
      people: Array.isArray(parsed.people) ? parsed.people.slice(0, 10) : [],
    };
  } catch (err) {
      // OpenAI unavailable — silently use deterministic summary
    return deterministicSummary(article);
  }
}
