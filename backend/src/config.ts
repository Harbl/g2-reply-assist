export type SttProvider = 'local' | 'google'
// 'openai' covers any OpenAI-compatible endpoint: Ollama, LM Studio, real OpenAI, etc.
export type LlmProvider = 'openai' | 'anthropic'

export interface AppConfig {
  sttProvider: SttProvider
  llmProvider: LlmProvider
  // --- local Whisper ---
  whisperUrl: string
  whisperModel: string
  // --- Google STT uses ADC / GOOGLE_APPLICATION_CREDENTIALS; nothing stored here ---
  // --- OpenAI-compatible LLM ---
  openaiBaseUrl: string
  openaiApiKey: string
  openaiModel: string
  // --- Anthropic ---
  anthropicApiKey: string
  anthropicModel: string
}

function validate(config: AppConfig): void {
  if (!['local', 'google'].includes(config.sttProvider))
    throw new Error(`STT_PROVIDER must be 'local' or 'google', got '${config.sttProvider}'`)
  if (!['openai', 'anthropic'].includes(config.llmProvider))
    throw new Error(`LLM_PROVIDER must be 'openai' or 'anthropic', got '${config.llmProvider}'`)
  if (config.llmProvider === 'anthropic' && !config.anthropicApiKey)
    throw new Error('ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic')
}

export const config: AppConfig = (() => {
  const c: AppConfig = {
    sttProvider: (process.env.STT_PROVIDER ?? 'local') as SttProvider,
    llmProvider: (process.env.LLM_PROVIDER ?? 'openai') as LlmProvider,
    whisperUrl: process.env.WHISPER_URL ?? 'http://localhost:8000',
    whisperModel: process.env.WHISPER_MODEL ?? 'Systran/faster-whisper-large-v3',
    openaiBaseUrl: process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1',
    openaiApiKey: process.env.OPENAI_API_KEY ?? 'ollama',
    openaiModel: process.env.OPENAI_MODEL ?? 'gemma3:27b',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
  }
  validate(c)
  return c
})()

export function printConfig(): void {
  console.log(
    `STT:  ${config.sttProvider === 'local'
      ? `local Whisper  (${config.whisperUrl}, model: ${config.whisperModel})`
      : 'Google Cloud STT'}`,
  )
  console.log(
    `LLM:  ${config.llmProvider === 'anthropic'
      ? `Anthropic (${config.anthropicModel})`
      : `OpenAI-compatible (${config.openaiBaseUrl}, model: ${config.openaiModel})`}`,
  )
}
