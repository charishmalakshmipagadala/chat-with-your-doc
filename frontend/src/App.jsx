import { useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import ChatWindow from './components/ChatWindow.jsx'
import ChatInput from './components/ChatInput.jsx'

const FAKE_DELAY_MS = 500
const FAKE_REPLY =
  "This is a **fake reply** for now. On Day 2 I'll be connected to Claude and give real answers."

// Made-up data so we can see the layout. Replaced by the real API on Day 3.
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
  {
    id: 'c2',
    title: 'Summarize chapter 2',
    messages: [
      { id: 'm3', role: 'user', content: 'Summarize chapter 2' },
      { id: 'm4', role: 'assistant', content: 'Chapter 2 covers the background and related work.' },
    ],
  },
]

function App() {
  const [conversations, setConversations] = useState(SAMPLE_CHATS)
  const [activeId, setActiveId] = useState(SAMPLE_CHATS[0].id)

  const [isReplying, setIsReplying] = useState(false)

  const active = conversations.find((c) => c.id === activeId)

  function handleNewChat() {
    const chat = { id: crypto.randomUUID(), title: 'New chat', messages: [] }
    setConversations([chat, ...conversations])
    setActiveId(chat.id)
  }

  // Add a message to one conversation without changing the others.
  // We use the "updater" form setConversations(prev => ...) so we always
  // work on the latest state, even inside the setTimeout below.
  function addMessage(chatId, message) {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c
        const isFirst = c.messages.length === 0
        return {
          ...c,
          // Title the chat with the first 40 characters of its first question.
          title: isFirst && message.role === 'user' ? message.content.slice(0, 40) : c.title,
          messages: [...c.messages, message],
        }
      }),
    )
  }

  function handleSend(text) {
    const chatId = activeId // remember which chat this reply belongs to
    addMessage(chatId, { id: crypto.randomUUID(), role: 'user', content: text })
    setIsReplying(true)

    setTimeout(() => {
      addMessage(chatId, { id: crypto.randomUUID(), role: 'assistant', content: FAKE_REPLY })
      setIsReplying(false)
    }, FAKE_DELAY_MS)
  }

  return (
    <div className="flex h-screen bg-gray-900">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onNewChat={handleNewChat}
      />
      <main className="flex flex-1 flex-col">
        <ChatWindow messages={active ? active.messages : []} isReplying={isReplying} />
        <ChatInput onSend={handleSend} disabled={isReplying} />
      </main>
    </div>
  )
}

export default App
