import React, { useEffect, useRef, useState } from 'react';
import './mathblock.css';
// KaTeX CSS (will be present after installing katex)
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('katex/dist/katex.min.css');
} catch (e) {
  // ignore if katex isn't installed yet
}

type Align = 'left' | 'center' | 'right';

interface Props {
  latex: string;
  displayMode?: boolean; // block (true) or inline (false)
  align?: Align;
}

export default function MathBlock({ latex, displayMode = true, align = 'center' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [html, setHtml] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    import('katex')
      .then((katex) => {
        if (!mounted) return;
        try {
          const rendered = katex.renderToString(latex, {
            displayMode,
            throwOnError: false,
            output: 'html',
          });
          setHtml(rendered);
        } catch (err) {
          setHtml('<pre class="kb-error">Invalid LaTeX</pre>');
        }
      })
      .catch(() => {
        setHtml(`<pre class="kb-error">KaTeX not installed. Run npm install katex to render math.</pre>`);
      });
    return () => {
      mounted = false;
    };
  }, [latex, displayMode]);

  return (
    <div ref={containerRef} className={[`mathblock`, `align-${align}`].join(' ')} tabIndex={0} aria-label="Math block">
      <div className="mathblock-inner" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
