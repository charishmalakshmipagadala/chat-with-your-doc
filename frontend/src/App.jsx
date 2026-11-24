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
      />
      <main className="flex flex-1 flex-col">
        <ChatWindow messages={chat.messages} />
        <ChatInput onSend={chat.send} onStop={chat.stop} isReplying={chat.isReplying} />
      </main>
    </div>
  )
}

export default App
