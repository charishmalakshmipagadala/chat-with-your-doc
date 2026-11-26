import { useRef, useState } from 'react'
import UploadButton from './UploadButton.jsx'

const MAX_HEIGHT = 200 // px — after this the box scrolls instead of growing

// Text box at the bottom. Grows as you type.
// Enter = send, Shift+Enter = new line. While a reply streams, Send becomes Stop.
function ChatInput({ onSend, onStop, onUpload, isReplying, disabled: disabledProp = false }) {
  const disabled = isReplying || disabledProp
  const [text, setText] = useState('')
  const textareaRef = useRef(null)

  // Make the textarea exactly as tall as its content (up to MAX_HEIGHT).
  function resize() {
    const el = textareaRef.current
    el.style.height = 'auto' // shrink first so it can also get smaller
    el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT) + 'px'
  }

  function send() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
    // Wait for React to clear the text, then shrink the box back down.
    requestAnimationFrame(resize)
  }

  function handleKeyDown(e) {
    // isComposing: ignore Enter while typing with an IME (e.g. Hindi, Japanese input)
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault() // stop Enter from adding a new line
      send()
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6">
      <div className="flex items-end gap-2 rounded-2xl border border-gray-700 bg-gray-800 p-2">
        {onUpload && <UploadButton onUpload={onUpload} />}
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            resize()
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything…"
          className="flex-1 resize-none bg-transparent px-2 py-2 text-gray-100 placeholder-gray-500 outline-none"
        />
        {isReplying ? (
          <button
            onClick={onStop}
            className="rounded-xl bg-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-white"
          >
            ■ Stop
          </button>
        ) : (
          <button
            onClick={send}
            disabled={disabled || !text.trim()}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-gray-500">
        Enter to send · Shift+Enter for a new line
      </p>
    </div>
  )
}

export default ChatInput
