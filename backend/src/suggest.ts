export interface ReplySuggestion {
  japanese: string
  romaji: string
  gloss: string
}

export interface SuggestionResult {
  heardEnglish: string
  suggestions: ReplySuggestion[]
}

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma3:27b'

const SYSTEM_PROMPT =
  'You help a non-fluent Japanese speaker respond out loud in a live conversation. ' +
  'You will be given a phrase the other person just said in Japanese. ' +
  'Translate it to natural English (under 15 words), then suggest exactly 3 short, natural, spoken replies the user could say back immediately. ' +
  'Keep replies casual-polite (です/ます is fine, no keigo) and short enough to say in one breath. ' +
  'At least one reply must be a question or follow-up that keeps the conversation going. ' +
  'Respond ONLY with valid JSON in this exact shape, no other text:\n' +
  '{\n' +
  '  "heard_english": "<English translation>",\n' +
  '  "suggestions": [\n' +
  '    { "japanese": "<reply>", "romaji": "<Hepburn romanization>", "gloss": "<English meaning under 8 words>" },\n' +
  '    { "japanese": "<reply>", "romaji": "<Hepburn romanization>", "gloss": "<English meaning under 8 words>" },\n' +
  '    { "japanese": "<reply>", "romaji": "<Hepburn romanization>", "gloss": "<English meaning under 8 words>" }\n' +
  '  ]\n' +
  '}'

export async function generateReplySuggestions(heardJapanese: string): Promise<SuggestionResult> {
  const res = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `They just said: "${heardJapanese}"` },
      ],
      response_format: { type: 'json_object' },
      stream: false,
      temperature: 0.7,
      max_tokens: 512,
    }),
  })

  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`)

  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = body.choices?.[0]?.message?.content
  if (!content) throw new Error('Ollama returned empty content')

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error(`Ollama returned non-JSON: ${content.slice(0, 200)}`)
  }

  const input = parsed as Record<string, unknown>
  if (
    typeof input.heard_english !== 'string' ||
    !Array.isArray(input.suggestions) ||
    input.suggestions.length !== 3 ||
    !input.suggestions.every(
      (s): s is ReplySuggestion =>
        s !== null &&
        typeof s === 'object' &&
        typeof (s as Record<string, unknown>).japanese === 'string' &&
        typeof (s as Record<string, unknown>).romaji === 'string' &&
        typeof (s as Record<string, unknown>).gloss === 'string',
    )
  ) {
    throw new Error('Ollama returned unexpected JSON shape')
  }

  return { heardEnglish: input.heard_english, suggestions: input.suggestions }
}
