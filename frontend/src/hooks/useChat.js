import { useRef, useState } from 'react'
import { streamChat } from '../api/client.js'

// Made-up chats so the sidebar isn't empty. Replaced by the real API on Day 3.
const SAMPLE_CHATS = [
  {
    id: 'c1',
    title: 'What is this paper about?',
    messages: [
      { id: 'm1', role: 'user', content: 'What is this paper about?' },
      {
        id: 'm2',
        role: 'assistant',
        content:
          'The paper introduces a **new method** for document search. Key points:\n\n- It splits text into chunks\n- It turns each chunk into an embedding\n- It finds the closest chunks to your question',
      },
    ],
  },
]

/**
 * All chat state and actions in one custom hook, so components stay simple.
 * A "custom hook" is just a function whose name starts with `use` and that
 * calls other hooks (useState, useRef, ...).
 */
export function useChat() {
  const [conversations, setConversations] = useState(SAMPLE_CHATS)
  const [activeId, setActiveId] = useState(SAMPLE_CHATS[0].id)
  const [isReplying, setIsReplying] = useState(false)

  // The AbortController of the reply that is streaming right now.
  // useRef, not useState: changing it shouldn't re-render anything.
  const abortRef = useRef(null)

  const active = conversations.find((c) => c.id === activeId)

  // ---- small helpers that update state immutably ----------------------------

  function updateChat(chatId, change) {
    setConversations((prev) => prev.map((c) => (c.id === chatId ? change(c) : c)))
  }

  function addMessage(chatId, message) {
    updateChat(chatId, (c) => ({
      ...c,
      // Title the chat with the first 40 characters of its first question.
      title: c.messages.length === 0 ? message.content.slice(0, 40) : c.title,
      messages: [...c.messages, message],
    }))
  }

  function updateMessage(chatId, messageId, change) {
    updateChat(chatId, (c) => ({
      ...c,
      messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...change(m) } : m)),
    }))
  }

  // ---- actions --------------------------------------------------------------

  function newChat() {
    if (isReplying) return
    const chat = { id: crypto.randomUUID(), title: 'New chat', messages: [] }
    setConversations((prev) => [chat, ...prev])
    setActiveId(chat.id)
  }

  function selectChat(id) {
    if (!isReplying) setActiveId(id)
  }

  async function send(text) {
    if (isReplying || !active) return
    const chatId = active.id

    // History for Claude: earlier messages that have real content, plus the new one.
    // (Error bubbles and empty stopped replies are left out.)
    const history = active.messages
      .filter((m) => !m.error && m.content.trim())
      .map(({ role, content }) => ({ role, content }))
    history.push({ role: 'user', content: text })

    addMessage(chatId, { id: crypto.randomUUID(), role: 'user', content: text })

    // An empty assistant message that we fill in as text arrives.
    const replyId = crypto.randomUUID()
    addMessage(chatId, { id: replyId, role: 'assistant', content: '', streaming: true })

    const controller = new AbortController()
    abortRef.current = controller
    setIsReplying(true)

    try {
      for await (const piece of streamChat(history, { signal: controller.signal })) {
        updateMessage(chatId, replyId, (m) => ({ content: m.content + piece }))
      }
    } catch (err) {
      if (controller.signal.aborted) {
        updateMessage(chatId, replyId, () => ({ stopped: true })) // user pressed Stop
      } else {
        updateMessage(chatId, replyId, () => ({ error: err.message || 'Something went wrong' }))
      }
    } finally {
      updateMessage(chatId, replyId, () => ({ streaming: false }))
      abortRef.current = null
      setIsReplying(false)
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  return {
    conversations,
    activeId,
    messages: active ? active.messages : [],
    isReplying,
    newChat,
    selectChat,
    send,
    stop,
  }
}
