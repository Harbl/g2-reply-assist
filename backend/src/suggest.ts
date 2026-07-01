import { config } from './config.js'

export interface ReplySuggestion {
  japanese: string
  romaji: string
  gloss: string
}

export interface SuggestionResult {
  heardEnglish: string
  suggestions: ReplySuggestion[]
}

// ── Shared prompt / schema ─────────────────────────────────────────────────

const SYSTEM_PROMPT =
  'You help a non-fluent Japanese speaker respond out loud in a live conversation. ' +
  'You will be given a phrase the other person just said in Japanese. ' +
  'Translate it to natural English (under 15 words), then suggest exactly 3 short, natural, ' +
  'spoken replies the user could say back immediately. ' +
  'Keep replies casual-polite (です/ます is fine, no keigo), short enough to say in one breath. ' +
  'At least one reply must be a question or follow-up that keeps the conversation going.'

const TOOL_SCHEMA = {
  name: 'provide_reply_suggestions',
  description: 'Translate what was heard into English, then provide natural Japanese reply suggestions.',
  input_schema: {
    type: 'object' as const,
    properties: {
      heard_english: {
        type: 'string',
        description: 'Natural English translation of what the other person said, under 15 words.',
      },
      suggestions: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            japanese: { type: 'string', description: 'Short natural spoken Japanese reply, casual-polite.' },
            romaji: { type: 'string', description: 'Hepburn romanization matching the japanese field exactly.' },
            gloss: { type: 'string', description: 'English meaning, under 8 words.' },
          },
          required: ['japanese', 'romaji', 'gloss'],
        },
      },
    },
    required: ['heard_english', 'suggestions'],
  },
}

const JSON_SYSTEM_PROMPT =
  SYSTEM_PROMPT +
  '\n\nRespond ONLY with valid JSON in this exact shape, no other text:\n' +
  '{\n' +
  '  "heard_english": "<English translation>",\n' +
  '  "suggestions": [\n' +
  '    { "japanese": "<reply>", "romaji": "<Hepburn romanization>", "gloss": "<meaning under 8 words>" },\n' +
  '    { "japanese": "<reply>", "romaji": "<Hepburn romanization>", "gloss": "<meaning under 8 words>" },\n' +
  '    { "japanese": "<reply>", "romaji": "<Hepburn romanization>", "gloss": "<meaning under 8 words>" }\n' +
  '  ]\n' +
  '}'

// ── Validation ─────────────────────────────────────────────────────────────

function validateShape(input: Record<string, unknown>): SuggestionResult {
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
    throw new Error('LLM returned unexpected output shape')
  }
  return { heardEnglish: input.heard_english, suggestions: input.suggestions }
}

// ── Anthropic provider ─────────────────────────────────────────────────────

async function generateViaAnthropic(heardJapanese: string): Promise<SuggestionResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `They just said: "${heardJapanese}"` }],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: 'tool', name: TOOL_SCHEMA.name },
    }),
  })

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)

  const body = (await res.json()) as { content?: Array<{ type: string; input?: unknown }> }
  const toolUse = body.content?.find(b => b.type === 'tool_use')
  if (!toolUse?.input) throw new Error('Anthropic did not return a tool_use block')

  return validateShape(toolUse.input as Record<string, unknown>)
}

// ── OpenAI-compatible provider (Ollama, OpenAI, LM Studio, …) ─────────────

async function generateViaOpenAI(heardJapanese: string): Promise<SuggestionResult> {
  const res = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: config.openaiModel,
      messages: [
        { role: 'system', content: JSON_SYSTEM_PROMPT },
        { role: 'user', content: `They just said: "${heardJapanese}"` },
      ],
      response_format: { type: 'json_object' },
      stream: false,
      temperature: 0.7,
      max_tokens: 512,
    }),
  })

  if (!res.ok) throw new Error(`OpenAI-compatible LLM ${res.status}: ${await res.text()}`)

  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = body.choices?.[0]?.message?.content
  if (!content) throw new Error('LLM returned empty content')

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error(`LLM returned non-JSON: ${content.slice(0, 200)}`)
  }

  return validateShape(parsed as Record<string, unknown>)
}

// ── Public API ─────────────────────────────────────────────────────────────

export function generateReplySuggestions(heardJapanese: string): Promise<SuggestionResult> {
  return config.llmProvider === 'anthropic'
    ? generateViaAnthropic(heardJapanese)
    : generateViaOpenAI(heardJapanese)
}
