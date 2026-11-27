import { useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import ChatWindow from './components/ChatWindow.jsx'
import ChatInput from './components/ChatInput.jsx'
import SearchPanel from './components/SearchPanel.jsx'
import { useChat } from './hooks/useChat.js'
import { useDocuments } from './hooks/useDocuments.js'
import { useTheme } from './hooks/useTheme.js'

const TABS = [
  { id: 'chat', label: '💬 Chat' },
  { id: 'search', label: '🔍 Search' },
]

// App only arranges the layout. State and logic live in the hooks:
// useChat() for chats and messages, useDocuments() for uploaded PDFs,
// useTheme() for light/dark mode.
function App() {
  const chat = useChat()
  const docs = useDocuments()
  const { theme, nextTheme } = useTheme()
  const error = chat.error || docs.error

  // Phones: is the slide-in sidebar open? (Ignored on wide screens.)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Wrap a sidebar action so the menu also closes on phones after using it.
  const andClose =
    (action) =>
    (...args) => {
      setSidebarOpen(false)
      action(...args)
    }

  // Which tab is open — remembered per document. Opening a chat about a
  // different document (or a plain chat) therefore starts on "Chat" again,
  // without needing an effect to reset it.
  const [tabFor, setTabFor] = useState({ documentId: null, tab: 'chat' })
  const doc = chat.activeDocument
  const tab = doc && tabFor.documentId === doc.id ? tabFor.tab : 'chat'
  const openTab = (id) => setTabFor({ documentId: doc?.id ?? null, tab: id })

  // "Ask this in chat" from the Search tab.
  function askInChat(question) {
    openTab('chat')
    chat.send(question)
  }

  return (
    <div className="flex h-dvh bg-gray-900 text-gray-100">
      <Sidebar
        conversations={chat.conversations}
        activeId={chat.activeId}
        onSelect={andClose(chat.selectChat)}
        onNewChat={andClose(chat.newChat)}
        onDelete={chat.deleteChat}
        disabled={chat.isReplying}
        documents={docs.documents}
        onChatWithDocument={andClose(chat.startDocumentChat)}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        theme={theme}
        onNextTheme={nextTheme}
      />

      {/* Phones: dim the page behind the open menu; tapping it closes the menu. */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: always on phones (for the ☰ button); on wide screens only
            for document chats. */}
        <header
          className={`flex items-center gap-3 border-b border-gray-800 px-4 py-2 text-sm text-gray-300 ${
            doc ? '' : 'md:hidden'
          }`}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="-ml-2 rounded-lg px-2 py-1 text-lg text-gray-400 hover:bg-gray-800 hover:text-gray-100 md:hidden"
          >
            ☰
          </button>

          <span className="min-w-0 flex-1 truncate">
            {doc ? (
              <>
                📄 <span className="hidden sm:inline">Chatting about </span>
                <span className="font-medium text-white" title={doc.filename}>
                  {doc.filename}
                </span>
              </>
            ) : (
              'Chat with your Doc'
            )}
          </span>

          {doc && (
            <nav className="flex shrink-0 gap-1 rounded-lg bg-gray-800 p-1" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => openTab(t.id)}
                  className={`rounded-md px-3 py-1 text-sm ${
                    tab === t.id ? 'bg-gray-950 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          )}
        </header>

        {error && (
          <div
            role="alert"
            className="border-b border-red-900 bg-red-950/60 px-4 py-2 text-sm text-red-300"
          >
            ⚠️ {error}
          </div>
        )}

        {tab === 'search' ? (
          <SearchPanel
            document={doc}
            onAsk={askInChat}
            askDisabled={chat.isReplying || chat.isLoadingMessages}
          />
        ) : (
          <>
            <ChatWindow
              messages={chat.messages}
              isLoading={chat.isLoadingMessages}
              document={doc}
              onAsk={chat.send}
              askDisabled={chat.isReplying}
            />
            <ChatInput
              onSend={chat.send}
              onStop={chat.stop}
              onUpload={docs.upload}
              isReplying={chat.isReplying}
              disabled={chat.isLoadingMessages}
            />
          </>
        )}
      </main>
    </div>
  )
}

export default App
