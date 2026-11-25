import Sidebar from './components/Sidebar.jsx'
import ChatWindow from './components/ChatWindow.jsx'
import ChatInput from './components/ChatInput.jsx'
import { useChat } from './hooks/useChat.js'

// App only arranges the layout. All chat state and logic lives in useChat().
function App() {
  const chat = useChat()

  return (
    <div className="flex h-screen bg-gray-900">
      <Sidebar
        conversations={chat.conversations}
        activeId={chat.activeId}
        onSelect={chat.selectChat}
        onNewChat={chat.newChat}
        onDelete={chat.deleteChat}
        disabled={chat.isReplying}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        {chat.error && (
          <div className="border-b border-red-900 bg-red-950/60 px-4 py-2 text-sm text-red-300">
            ⚠️ {chat.error}
          </div>
        )}
        <ChatWindow messages={chat.messages} isLoading={chat.isLoadingMessages} />
        <ChatInput
          onSend={chat.send}
          onStop={chat.stop}
          isReplying={chat.isReplying}
          disabled={chat.isLoadingMessages}
        />
      </main>
    </div>
  )
}

export default App
