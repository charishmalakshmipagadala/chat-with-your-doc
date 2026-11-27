import { useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'

const TITLE_LENGTH = 40

// Same rule the server uses, so the sidebar shows the right title immediately.
const makeTitle = (text) => text.replace(/\s+/g, ' ').trim().slice(0, TITLE_LENGTH)

/**
 * All chat state and actions in one custom hook, so components stay simple.
 *
 * The server is the source of truth: chats and messages live in the database.
 * This hook keeps a copy of
 *   - the list of chats (for the sidebar)
 *   - the messages of the ONE chat that is open
 *
 * activeId === null means "a new chat that isn't saved yet". It's created on
 * the server when you send its first message, so empty chats don't pile up.
 * draftDocument: the document that new chat will be about (or null).
 */
export function useChat() {
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [draftDocument, setDraftDocument] = useState(null) // { id, filename } | null
  const [messages, setMessages] = useState([])
  const [isReplying, setIsReplying] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [error, setError] = useState(null) // shown as a banner

  const abortRef = useRef(null) // AbortController of the streaming reply
  const openingRef = useRef(null) // the chat we most recently asked to open

  // ---- loading ---------------------------------------------------------------

  async function refreshConversations() {
    try {
      setConversations(await api.listConversations())
    } catch (err) {
      setError(`Couldn't load your chats: ${err.message}`)
    }
  }

  // Load the sidebar once, when the app first appears.
  useEffect(() => {
    refreshConversations()
  }, [])

  async function selectChat(id) {
    if (isReplying || id === activeId) return
    openingRef.current = id
    setActiveId(id)
    setDraftDocument(null)
    setMessages([])
    setError(null)
    setIsLoadingMessages(true)

    try {
      const data = await api.getConversation(id)
      // If you clicked another chat while this one was loading, ignore this
      // (now outdated) answer — otherwise the wrong messages would appear.
      if (openingRef.current !== id) return
      setMessages(data.messages)
    } catch (err) {
      if (openingRef.current === id) setError(`Couldn't open this chat: ${err.message}`)
    } finally {
      if (openingRef.current === id) setIsLoadingMessages(false)
    }
  }

  function newChat() {
    startDocumentChat(null)
  }

  /** A new (not yet saved) chat about `document` — or a plain chat if null. */
  function startDocumentChat(document) {
    if (isReplying) return
    openingRef.current = null
    setActiveId(null)
    setDraftDocument(document ? { id: document.id, filename: document.filename } : null)
    setMessages([])
    setError(null)
    setIsLoadingMessages(false)
  }

  async function deleteChat(id) {
    if (isReplying) return
    try {
      await api.deleteConversation(id)
    } catch (err) {
      setError(`Couldn't delete the chat: ${err.message}`)
      return
    }
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (id === activeId) newChat()
  }

  // ---- sending ---------------------------------------------------------------

  function updateReply(replyId, change) {
    setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, ...change(m) } : m)))
  }

  async function send(text) {
    if (isReplying || isLoadingMessages) return
    const isFirstMessage = messages.length === 0
    setError(null)

    // Show your message and an empty reply bubble right away.
    // (Temporary ids; after a reload the messages get their database ids.)
    const replyId = crypto.randomUUID()
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: text },
      { id: replyId, role: 'assistant', content: '', streaming: true },
    ])

    const controller = new AbortController()
    abortRef.current = controller
    setIsReplying(true)

    try {
      // A brand-new chat is created on the server only now.
      let chatId = activeId
      if (!chatId) {
        const created = await api.createConversation(draftDocument?.id ?? null)
        chatId = created.id
        openingRef.current = chatId
        setActiveId(chatId)
        setDraftDocument(null) // it's a real chat now; its document is on `created`
        setConversations((prev) => [created, ...prev])
      }

      // Update the sidebar right away: this chat moves to the top, and its
      // first message becomes the title. (The server does the same.)
      setConversations((prev) => {
        const chat = prev.find((c) => c.id === chatId)
        const others = prev.filter((c) => c.id !== chatId)
        return chat ? [{ ...chat, title: isFirstMessage ? makeTitle(text) : chat.title }, ...others] : prev
      })

      for await (const event of api.streamChat(chatId, text, { signal: controller.signal })) {
        if (event.type === 'text') {
          updateReply(replyId, (m) => ({ content: m.content + event.text }))
        } else if (event.type === 'sources') {
          updateReply(replyId, () => ({ sources: event.sources }))
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        updateReply(replyId, () => ({ stopped: true })) // user pressed Stop
      } else {
        updateReply(replyId, () => ({ error: err.message || 'Something went wrong' }))
      }
    } finally {
      updateReply(replyId, () => ({ streaming: false }))
      abortRef.current = null
      setIsReplying(false)
      refreshConversations() // get the saved titles and order from the server
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  // The document the open chat is about (saved chat or unsaved draft), or null.
  const activeChat = conversations.find((c) => c.id === activeId)
  const activeDocument = activeChat?.documentId
    ? { id: activeChat.documentId, filename: activeChat.documentName }
    : draftDocument

  return {
    conversations,
    activeId,
    activeDocument,
    messages,
    isReplying,
    isLoadingMessages,
    error,
    newChat,
    startDocumentChat,
    selectChat,
    deleteChat,
    send,
    stop,
  }
}
