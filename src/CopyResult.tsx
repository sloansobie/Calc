import { useEffect, useRef, useState, type ReactNode } from 'react';

export function CopyResult({ text, children }: { text: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      const native = (window as Window & { calculatorCopy?: (text: string) => void }).calculatorCopy;
      if (native) native(text);
      else await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1200);
    } catch { setCopied(false); }
  }
  return <button className="copy-result" title="Click to copy result" aria-label={copied ? 'Copied' : `Copy result: ${text}`}
    onClick={(event) => { event.stopPropagation(); void copy(); }}>
    {children}<span className="copy-confirmation" aria-live="polite">{copied ? 'Copied' : ''}</span>
  </button>;
}
