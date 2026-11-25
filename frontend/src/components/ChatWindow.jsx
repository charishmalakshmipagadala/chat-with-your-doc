import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble.jsx'

// The scrollable message list. Shows a welcome screen when the chat is empty.
function ChatWindow({ messages, isLoading }) {
  const bottomRef = useRef(null)

  // Every time messages change — a new message, or a new word streamed into
  // the last one — scroll the invisible marker at the bottom into view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-400">Loading chat…</div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
        <h2 className="mb-2 text-2xl font-semibold text-gray-200">Chat with your Doc</h2>
        <p>Ask a question to get started.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

export default ChatWindow
