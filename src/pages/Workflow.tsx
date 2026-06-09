import { useEffect, useRef, useState, useCallback } from 'react';

declare global {
  interface Window {
    flowy: {
      (
        canvas: HTMLElement,
        onGrab?: (block: HTMLElement) => void,
        onRelease?: (block: HTMLElement) => void,
        onSnap?: (block: HTMLElement, first: boolean, parent: HTMLElement) => boolean,
        onRearrange?: (block: HTMLElement, parent: HTMLElement) => boolean,
        spacing_x?: number,
        spacing_y?: number
      ): void;
      load: () => void;
      output: () => { html: string; blockarr: object[]; blocks: Array<{ id: number; parent: number; data: Array<{ name: string; value: string }> }> };
      deleteBlocks: () => void;
      beginDrag: (e: MouseEvent | TouchEvent) => void;
      endDrag: (e: MouseEvent | TouchEvent) => void;
      import: (data: { html: string; blockarr: object[] }) => void;
    };
  }
}

interface BlockTemplate {
  id: string;
  label: string;
  description: string;
  color: string;
  icon: string;
}

const BLOCK_TEMPLATES: BlockTemplate[] = [
  { id: 'trigger', label: 'Trigger', description: 'Start event', color: '#6366f1', icon: '⚡' },
  { id: 'action', label: 'Action', description: 'Perform action', color: '#10b981', icon: '▶' },
  { id: 'condition', label: 'Condition', description: 'Branch logic', color: '#f59e0b', icon: '◇' },
  { id: 'delay', label: 'Delay', description: 'Wait/pause', color: '#8b5cf6', icon: '⏱' },
  { id: 'notify', label: 'Notify', description: 'Send notification', color: '#ec4899', icon: '🔔' },
  { id: 'end', label: 'End', description: 'Terminate flow', color: '#ef4444', icon: '■' },
];

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function loadCSS(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

export function WorkflowPage() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const flowyLoadedRef = useRef(false);
  const [outputJson, setOutputJson] = useState<string | null>(null);
  const [showOutput, setShowOutput] = useState(false);
  const [saved, setSaved] = useState(false);

  const initFlowy = useCallback(() => {
    if (!canvasRef.current || flowyLoadedRef.current) return;
    if (typeof window.flowy !== 'function') return;

    window.flowy(
      canvasRef.current,
      (block: HTMLElement) => {
        // onGrab
        console.log('[flowy] grabbed', block);
      },
      (block: HTMLElement) => {
        // onRelease
        console.log('[flowy] released', block);
      },
      (_block: HTMLElement, _first: boolean, _parent: HTMLElement) => {
        // onSnap - allow all
        return true;
      },
      (_block: HTMLElement, _parent: HTMLElement) => {
        // onRearrange - allow all
        return false;
      },
      20, // spacing_x
      80  // spacing_y
    );

    flowyLoadedRef.current = true;
  }, []);

  useEffect(() => {
    loadCSS('/flowy.min.css');
    loadScript('/flowy.min.js').then(() => {
      initFlowy();
    }).catch(err => console.error('[flowy] failed to load:', err));
  }, [initFlowy]);

  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (window.flowy) {
      window.flowy.beginDrag(e.nativeEvent as MouseEvent | TouchEvent);
    }
  }, []);

  const handleDragEnd = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (window.flowy) {
      window.flowy.endDrag(e.nativeEvent as MouseEvent | TouchEvent);
    }
  }, []);

  const handleExport = useCallback(() => {
    if (!window.flowy) return;
    const output = window.flowy.output();
    setOutputJson(JSON.stringify(output, null, 2));
    setShowOutput(true);
  }, []);

  const handleClear = useCallback(() => {
    if (!window.flowy) return;
    flowyLoadedRef.current = false;
    window.flowy.deleteBlocks();
    initFlowy();
    setOutputJson(null);
    setShowOutput(false);
  }, [initFlowy]);

  const handleSave = useCallback(() => {
    if (!window.flowy) return;
    const output = window.flowy.output();
    const json = JSON.stringify(output, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, []);

  return (
    <div className="flex h-full min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      {/* Sidebar: block palette */}
      <aside className="w-56 shrink-0 border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 flex flex-col gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-3">
            Blocks
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">
            Drag blocks onto the canvas to build your workflow.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {BLOCK_TEMPLATES.map((tmpl) => (
            <div
              key={tmpl.id}
              className="create-flowy cursor-grab select-none rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2.5 flex items-center gap-2.5 hover:border-stone-400 dark:hover:border-stone-500 transition-all active:scale-95"
              data-blocktype={tmpl.id}
              onMouseDown={handleDragStart}
              onMouseUp={handleDragEnd}
              onTouchStart={handleDragStart}
              onTouchEnd={handleDragEnd}
              style={{ userSelect: 'none' }}
            >
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                style={{ backgroundColor: tmpl.color + '22', color: tmpl.color }}
              >
                {tmpl.icon}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{tmpl.label}</p>
                <p className="text-[10px] text-stone-400 dark:text-stone-500 truncate">{tmpl.description}</p>
              </div>
              {/* Hidden inputs for flowy block data */}
              <input type="hidden" name="blocktype" value={tmpl.id} className="invisible absolute" />
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-auto flex flex-col gap-2 pt-4 border-t border-stone-100 dark:border-stone-800">
          <button
            onClick={handleExport}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium py-2 transition-colors"
          >
            Export JSON
          </button>
          <button
            onClick={handleSave}
            className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium py-2 transition-colors"
          >
            {saved ? '✓ Saved!' : 'Download'}
          </button>
          <button
            onClick={handleClear}
            className="w-full rounded-lg bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-300 text-xs font-medium py-2 transition-colors"
          >
            Clear All
          </button>
        </div>
      </aside>

      {/* Main canvas area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold">Workflow Builder</h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">Powered by Flowy</p>
          </div>
          <button
            onClick={() => setShowOutput((v) => !v)}
            className="text-xs text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
          >
            {showOutput ? 'Hide Output' : 'Show Output'}
          </button>
        </div>

        <div className="flex flex-1 min-h-0 relative overflow-hidden">
          {/* Flowy Canvas */}
          <div
            id="flowy-canvas"
            ref={canvasRef}
            className="flex-1 overflow-auto relative"
            style={{
              background:
                'radial-gradient(circle, rgba(99,102,241,0.06) 1px, transparent 1px) 0 0 / 28px 28px',
              minHeight: '600px',
            }}
          />

          {/* JSON Output Panel */}
          {showOutput && outputJson && (
            <div className="w-80 border-l border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex flex-col overflow-hidden">
              <div className="px-4 py-2 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-500 uppercase tracking-widest">Output</span>
                <button
                  onClick={() => setShowOutput(false)}
                  className="text-stone-400 hover:text-stone-600 text-sm"
                >
                  ✕
                </button>
              </div>
              <pre className="flex-1 overflow-auto p-4 text-xs text-stone-700 dark:text-stone-300 font-mono leading-relaxed whitespace-pre-wrap">
                {outputJson}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Global drag styles for flowy blocks */}
      <style>{`
        .block {
          border-radius: 12px;
          border: 1px solid rgba(99,102,241,0.3);
          background: white;
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
          min-width: 160px;
          padding: 10px 14px;
          font-family: inherit;
          font-size: 13px;
          font-weight: 500;
        }
        .dark .block {
          background: #1c1917;
          border-color: rgba(99,102,241,0.25);
          color: #e7e5e4;
        }
        .dragging {
          opacity: 0.85;
          box-shadow: 0 12px 40px rgba(99,102,241,0.25);
        }
        #flowy-canvas .arrowhead path {
          fill: #6366f1;
        }
        #flowy-canvas .arrowconnector {
          stroke: #6366f1;
        }
      `}</style>
    </div>
  );
}
