import { useRef } from 'react'

// 📎 button that opens the file picker. The real <input type="file"> is hidden
// because it can't be styled nicely; the button "clicks" it for us.
function UploadButton({ onUpload, disabled }) {
  const inputRef = useRef(null)

  function handleChange(e) {
    const file = e.target.files?.[0]
    if (file) onUpload(file)
    e.target.value = '' // reset, so choosing the same file again still triggers onChange
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current.click()}
        disabled={disabled}
        title="Upload a PDF"
        aria-label="Upload a PDF"
        className="rounded-xl px-2 py-2 text-lg text-gray-400 hover:bg-gray-700 hover:text-gray-100 disabled:opacity-40"
      >
        📎
      </button>
    </>
  )
}

export default UploadButton
