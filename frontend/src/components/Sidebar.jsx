import DocumentCard from './DocumentCard.jsx'
import ThemeToggle from './ThemeToggle.jsx'

// Left column: "New chat" button, list of past chats, uploaded documents, and
// the theme switch. It holds no data of its own — App passes everything in.
//
// On wide screens it's always visible. On phones (below Tailwind's `md`
// breakpoint, 768px) it slides in over the page when `isOpen` is true.
function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
  disabled,
  documents,
  onChatWithDocument,
  isOpen,
  onClose,
  theme,
  onNextTheme,
}) {
  function handleDelete(e, chat) {
    e.stopPropagation() // don't also open the chat we're deleting
    if (window.confirm(`Delete "${chat.title}"? This can't be undone.`)) onDelete(chat.id)
  }

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col bg-gray-950 p-3 transition-transform md:static md:z-auto md:w-64 md:shrink-0 md:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="mb-4 flex gap-2">
        <button
          onClick={onNewChat}
          disabled={disabled}
          className="flex-1 rounded-lg border border-gray-700 px-3 py-2 text-left text-sm text-gray-100 hover:bg-gray-800 disabled:opacity-40"
        >
          + New chat
        </button>
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="rounded-lg px-3 text-gray-400 hover:bg-gray-800 hover:text-gray-100 md:hidden"
        >
          ✕
        </button>
      </div>

      <p className="mb-2 px-2 text-xs font-semibold uppercase text-gray-400">Chats</p>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {conversations.length === 0 && (
          <p className="px-2 text-sm text-gray-400">No chats yet. Ask something to start one.</p>
        )}

        {conversations.map((c) => (
          // `group` lets the 🗑 button appear only while hovering this row
          <div
            key={c.id}
            className={`group flex items-center rounded-lg ${
              c.id === activeId ? 'bg-gray-800' : 'hover:bg-gray-800/60'
            }`}
          >
            <button
              onClick={() => onSelect(c.id)}
              disabled={disabled}
              title={c.documentName ? `About: ${c.documentName}` : undefined}
              className={`flex-1 truncate px-3 py-2 text-left text-sm ${
                c.id === activeId ? 'text-white' : 'text-gray-300'
              }`}
            >
              {c.documentId && <span aria-label="Document chat">📄 </span>}
              {c.title}
            </button>
            <button
              onClick={(e) => handleDelete(e, c)}
              disabled={disabled}
              title="Delete chat"
              aria-label={`Delete chat ${c.title}`}
              // Phones have no hover, so there it's always visible.
              className="mr-1 rounded px-2 py-1 text-sm text-gray-400 hover:text-red-400 focus:opacity-100 disabled:hidden md:opacity-0 md:group-hover:opacity-100"
            >
              🗑
            </button>
          </div>
        ))}
      </nav>

      <section className="mt-3 border-t border-gray-800 pt-3">
        <p className="mb-2 px-2 text-xs font-semibold uppercase text-gray-400">Documents</p>
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {documents.length === 0 ? (
            <p className="px-2 text-sm text-gray-400">Upload a PDF with 📎 to get started.</p>
          ) : (
            documents.map((d) => (
              <DocumentCard key={d.id} document={d} onChat={onChatWithDocument} disabled={disabled} />
            ))
          )}
        </div>
      </section>

      <div className="mt-3 border-t border-gray-800 pt-2">
        <ThemeToggle theme={theme} onNext={onNextTheme} />
      </div>
    </aside>
  )
}

export default Sidebar
