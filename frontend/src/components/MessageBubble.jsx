import ReactMarkdown from 'react-markdown'

function TypingDots() {
  return (
    <div className="flex gap-1 text-gray-400" aria-label="Assistant is typing">
      <span className="animate-bounce">●</span>
      <span className="animate-bounce [animation-delay:150ms]">●</span>
      <span className="animate-bounce [animation-delay:300ms]">●</span>
    </div>
  )
}

// One message. User messages are a bubble on the right;
// assistant messages sit on the left and are rendered as Markdown.
function MessageBubble({ message }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] whitespace-pre-wrap rounded-2xl bg-gray-700 px-4 py-2 text-gray-100">
          {message.content}
        </div>
      </div>
    )
  }

  const { content, streaming, stopped, error } = message
  const waitingForFirstWord = streaming && !content

  return (
    <div className="flex justify-start">
      <div className="markdown max-w-[85%] text-gray-100">
        {waitingForFirstWord ? <TypingDots /> : <ReactMarkdown>{content}</ReactMarkdown>}

        {/* A blinking block cursor while words are still arriving */}
        {streaming && content && <span className="ml-0.5 animate-pulse">▍</span>}

        {stopped && <p className="mt-1 text-sm italic text-gray-500">Stopped.</p>}

        {error && (
          <p className="mt-1 rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
            ⚠️ {error}
          </p>
        )}
      </div>
    </div>
  )
}

export default MessageBubble
