// One uploaded document: file name + a coloured status badge.

const BADGES = {
  uploading: { label: 'Uploading…', className: 'bg-blue-900/60 text-blue-300 animate-pulse' },
  processing: { label: 'Processing…', className: 'bg-yellow-900/60 text-yellow-300 animate-pulse' },
  ready: { label: 'Ready', className: 'bg-green-900/60 text-green-300' },
  failed: { label: 'Failed', className: 'bg-red-900/60 text-red-300' },
}

function DocumentCard({ document, onChat, disabled }) {
  const badge = BADGES[document.status] ?? BADGES.failed

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
      <div className="flex items-center gap-2">
        <span aria-hidden>📄</span>
        <span className="flex-1 truncate text-sm text-gray-200" title={document.filename}>
          {document.filename}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
        {document.status === 'ready' && (
          <>
            <span className="text-xs text-gray-500">{document.chunkCount} chunks</span>
            {onChat && (
              <button
                onClick={() => onChat(document)}
                disabled={disabled}
                title={`Start a chat about ${document.filename}`}
                className="ml-auto rounded bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                💬 Chat
              </button>
            )}
          </>
        )}
      </div>

      {document.status === 'failed' && document.error && (
        <p className="mt-1 text-xs text-red-400">{document.error}</p>
      )}
    </div>
  )
}

export default DocumentCard
