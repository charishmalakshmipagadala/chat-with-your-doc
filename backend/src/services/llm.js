// Everything that talks to Claude lives here.
import Anthropic from '@anthropic-ai/sdk'
import { setTimeout as sleep } from 'node:timers/promises'
import { config } from '../config.js'

const SYSTEM_PROMPT =
  'You are a helpful assistant in a "Chat with your Doc" app. Answer clearly and concisely. Use Markdown when it helps.'

// Create the client only when it's first needed, so fake mode works without a key.
let client
function getClient() {
  client ??= new Anthropic({ apiKey: config.anthropicApiKey })
  return client
}

/**
 * Stream a reply, one piece of text at a time.
 *
 * It's an async generator (`async function*`): the caller loops over it with
 * `for await (const text of streamReply(...))` and gets each piece as soon as
 * it's produced. Real mode and fake mode yield the same kind of pieces, so the
 * rest of the app can't tell them apart.
 *
 * @param {{ role: 'user' | 'assistant', content: string }[]} messages  the whole conversation so far
 * @param {{ signal?: AbortSignal }} options  abort this to stop mid-reply
 */
export function streamReply(messages, options = {}) {
  return config.fakeLlm ? streamFakeReply(messages, options) : streamClaudeReply(messages, options)
}

async function* streamClaudeReply(messages, { signal } = {}) {
  const stream = getClient().beta.messages.stream(
    {
      model: config.model,
      max_tokens: 64000,
      system: SYSTEM_PROMPT,
      messages,
      // How hard Claude thinks before answering: low | medium | high | xhigh | max
      output_config: { effort: 'medium' },
      // If a safety check declines a request, the API retries it on a suitable
      // fallback model in the same call instead of just stopping.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    },
    { signal },
  )

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text
    }
  }

  // The whole fallback chain declined: tell the user instead of ending silently.
  const final = await stream.finalMessage()
  if (final.stop_reason === 'refusal') {
    yield "\n\n_Sorry, I can't help with that request._"
  }
}

const FAKE_WORD_DELAY_MS = 40

// Pretends to be Claude: streams a canned Markdown reply word by word.
async function* streamFakeReply(messages, { signal } = {}) {
  const question = messages.at(-1).content
  const reply =
    `🧪 **Fake mode**: no AI was called (\`FAKE_LLM=true\` in \`.env\`).\n\n` +
    `You asked: _"${question.slice(0, 200)}"_\n\n` +
    `This reply is streamed **word by word**, just like a real one:\n\n` +
    `- the server sends each piece as an SSE event\n` +
    `- the browser adds it to the message as it arrives\n` +
    `- pressing **Stop** cancels the stream\n\n` +
    `Set \`FAKE_LLM=false\` to talk to Claude for real.`

  // Split into words but keep the spaces/newlines, so Markdown stays intact.
  for (const piece of reply.split(/(?<=\s)/)) {
    await sleep(FAKE_WORD_DELAY_MS, undefined, { signal }) // throws if aborted
    yield piece
  }
}
