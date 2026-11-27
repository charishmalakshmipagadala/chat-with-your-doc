const LABELS = {
  system: { icon: '🖥️', text: 'System theme' },
  light: { icon: '☀️', text: 'Light theme' },
  dark: { icon: '🌙', text: 'Dark theme' },
}

// One button that cycles System → Light → Dark.
function ThemeToggle({ theme, onNext }) {
  const { icon, text } = LABELS[theme]
  return (
    <button
      onClick={onNext}
      title={`${text} (click to change)`}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200"
    >
      <span aria-hidden>{icon}</span>
      <span>{text}</span>
    </button>
  )
}

export default ThemeToggle
