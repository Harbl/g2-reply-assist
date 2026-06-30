import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ReplySuggestion {
  japanese: string
  romaji: string
  gloss: string
}

const SUGGEST_TOOL: Anthropic.Tool = {
  name: 'provide_reply_suggestions',
  description: 'Provide natural Japanese reply suggestions with romaji and an English gloss.',
  input_schema: {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            japanese: { type: 'string', description: 'A short, natural spoken Japanese reply, casual-polite register (です/ます, no keigo).' },
            romaji: { type: 'string', description: 'Hepburn romanization of the japanese field, matching it exactly.' },
            gloss: { type: 'string', description: 'English meaning, under 8 words.' },
          },
          required: ['japanese', 'romaji', 'gloss'],
        },
      },
    },
    required: ['suggestions'],
  },
}

export async function generateReplySuggestions(heardJapanese: string): Promise<ReplySuggestion[]> {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system:
      'You help a non-fluent Japanese speaker respond out loud in a live conversation. ' +
      'You will be given a phrase the other person just said in Japanese. Suggest exactly 3 short, ' +
      'natural, spoken replies the user could say back immediately. Keep them casual-polite ' +
      '(です/ます is fine, no keigo). Each must be short enough to say in one breath.',
    messages: [{ role: 'user', content: `They just said: "${heardJapanese}"` }],
    tools: [SUGGEST_TOOL],
    tool_choice: { type: 'tool', name: 'provide_reply_suggestions' },
  })

  const toolUse = msg.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )
  if (!toolUse) throw new Error('Claude did not return a tool_use block')

  const { suggestions } = toolUse.input as { suggestions: ReplySuggestion[] }
  return suggestions
}
