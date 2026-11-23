// Left column: "New chat" button + list of past chats.
// It holds no data of its own — App passes everything in as props.
function Sidebar({ conversations, activeId, onSelect, onNewChat }) {
  return (
    <aside className="flex w-64 shrink-0 flex-col bg-gray-950 p-3">
      <button
        onClick={onNewChat}
        className="mb-4 rounded-lg border border-gray-700 px-3 py-2 text-left text-sm text-gray-100 hover:bg-gray-800"
      >
        + New chat
      </button>

      <p className="mb-2 px-2 text-xs font-semibold uppercase text-gray-500">Chats</p>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm ${
              c.id === activeId
                ? 'bg-gray-800 text-white'
                : 'text-gray-300 hover:bg-gray-800/60'
            }`}
          >
            {c.title}
          </button>
        ))}
      </nav>
    </aside>
  )
}

export default Sidebar
