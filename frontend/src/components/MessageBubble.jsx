import ReactMarkdown from 'react-markdown'

// One message. User messages are a bubble on the right;
// assistant messages sit on the left and are rendered as Markdown.
function MessageBubble({ message }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      {isUser ? (
        <div className="max-w-[75%] whitespace-pre-wrap rounded-2xl bg-gray-700 px-4 py-2 text-gray-100">
          {message.content}
        </div>
      ) : (
        <div className="markdown max-w-[85%] text-gray-100">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

export default MessageBubble
