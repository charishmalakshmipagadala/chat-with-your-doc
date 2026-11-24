// All settings in one place, read from process.env (loaded from .env by
// `node --env-file=.env`). Other files import from here instead of reading
// process.env directly, so a missing setting is caught once, at startup.

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`\n❌ Missing ${name}. Add it to backend/.env (see .env.example).\n`)
    process.exit(1)
  }
  return value
}

// FAKE_LLM=true → stream a made-up reply instead of calling Claude.
// Free, works offline, and needs no API key or credit.
const fakeLlm = process.env.FAKE_LLM === 'true'

export const config = {
  port: Number(process.env.PORT) || 3001,
  fakeLlm,
  // The key is only required when we really call Claude.
  anthropicApiKey: fakeLlm ? process.env.ANTHROPIC_API_KEY : required('ANTHROPIC_API_KEY'),
  model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
}
