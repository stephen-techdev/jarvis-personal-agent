import { useMemo } from 'react'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    let source = escapeHtml(text)
    const codeBlocks: string[] = []

    source = source.replace(/```[\w-]*\n?([\s\S]*?)```/g, (_match, code: string) => {
      const index = codeBlocks.length
      codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`)
      return `\u0000${index}\u0000`
    })

    source = source
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
      .replace(/^\s*[-•]\s+(.+)$/gm, '<span class="md-bullet">•</span> $1')
      .replace(/\n/g, '<br/>')

    source = source.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => codeBlocks[Number(index)] ?? '')
    return source
  }, [text])

  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
}
