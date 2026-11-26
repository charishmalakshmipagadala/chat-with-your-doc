import Sidebar from './components/Sidebar.jsx'
import ChatWindow from './components/ChatWindow.jsx'
import ChatInput from './components/ChatInput.jsx'
import { useChat } from './hooks/useChat.js'
import { useDocuments } from './hooks/useDocuments.js'

// App only arranges the layout. State and logic live in the hooks:
// useChat() for chats and messages, useDocuments() for uploaded PDFs.
function App() {
  const chat = useChat()
  const docs = useDocuments()
  const error = chat.error || docs.error

  return (
    <div className="flex h-screen bg-gray-900">
      <Sidebar
        conversations={chat.conversations}
        activeId={chat.activeId}
        onSelect={chat.selectChat}
        onNewChat={chat.newChat}
        onDelete={chat.deleteChat}
        disabled={chat.isReplying}
        documents={docs.documents}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        {error && (
          <div className="border-b border-red-900 bg-red-950/60 px-4 py-2 text-sm text-red-300">
            ⚠️ {error}
          </div>
        )}
        <ChatWindow messages={chat.messages} isLoading={chat.isLoadingMessages} />
        <ChatInput
          onSend={chat.send}
          onStop={chat.stop}
          onUpload={docs.upload}
          isReplying={chat.isReplying}
          disabled={chat.isLoadingMessages}
        />
      </main>
    </div>
  )
}

export default App
