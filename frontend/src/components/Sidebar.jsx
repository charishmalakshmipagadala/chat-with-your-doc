import DocumentCard from './DocumentCard.jsx'

// Left column: "New chat" button, list of past chats, and uploaded documents.
// It holds no data of its own — App passes everything in as props.
function Sidebar({ conversations, activeId, onSelect, onNewChat, onDelete, disabled, documents }) {
  function handleDelete(e, chat) {
    e.stopPropagation() // don't also open the chat we're deleting
    if (window.confirm(`Delete "${chat.title}"? This can't be undone.`)) onDelete(chat.id)
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-gray-950 p-3">
      <button
        onClick={onNewChat}
        disabled={disabled}
        className="mb-4 rounded-lg border border-gray-700 px-3 py-2 text-left text-sm text-gray-100 hover:bg-gray-800 disabled:opacity-40"
      >
        + New chat
      </button>

      <p className="mb-2 px-2 text-xs font-semibold uppercase text-gray-500">Chats</p>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {conversations.length === 0 && (
          <p className="px-2 text-sm text-gray-500">No chats yet. Ask something to start one.</p>
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
              className={`flex-1 truncate px-3 py-2 text-left text-sm ${
                c.id === activeId ? 'text-white' : 'text-gray-300'
              }`}
            >
              {c.title}
            </button>
            <button
              onClick={(e) => handleDelete(e, c)}
              disabled={disabled}
              title="Delete chat"
              aria-label={`Delete chat ${c.title}`}
              className="mr-1 rounded px-2 py-1 text-sm text-gray-500 opacity-0 hover:text-red-400 focus:opacity-100 group-hover:opacity-100 disabled:hidden"
            >
              🗑
            </button>
          </div>
        ))}
      </nav>

      <section className="mt-3 border-t border-gray-800 pt-3">
        <p className="mb-2 px-2 text-xs font-semibold uppercase text-gray-500">Documents</p>
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {documents.length === 0 ? (
            <p className="px-2 text-sm text-gray-500">Upload a PDF with 📎 to get started.</p>
          ) : (
            documents.map((d) => <DocumentCard key={d.id} document={d} />)
          )}
        </div>
      </section>
    </aside>
  )
}

export default Sidebar
