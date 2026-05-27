export function ContextHelp({ text }: { text: string }) {
  return (
    <details className="context-help">
      <summary aria-label="Pokaż wyjaśnienie">?</summary>
      <p>{text}</p>
    </details>
  )
}
