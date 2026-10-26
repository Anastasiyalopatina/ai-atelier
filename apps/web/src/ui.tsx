import React, { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

// Small original line drawings; no icon dependency or remote font requests.
const paths: Record<string, ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  memory: <><path d="M8 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3M8 2h8v5H8zM8 12h8M8 16h5"/></>,
  sources: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/></>,
  research: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M8 11l2 2 4-5"/></>,
  tasks: <><path d="M9 5h12M9 12h12M9 19h12M3 5h.01M3 12h.01M3 19h.01"/></>,
  context: <><path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3z"/></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>, plus: <path d="M12 5v14M5 12h14"/>, close: <path d="m6 6 12 12M6 18 18 6"/>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  folder: <path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11H3z"/>,
  chevron: <path d="m8 5 7 7-7 7"/>, down: <path d="m6 9 6 6 6-6"/>,
  check: <path d="m5 12 4 4L19 6"/>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/></>,
  leaf: <><path d="M20 3C8 2 2 8 5 16c8 4 16-2 15-13ZM5 20l10-11"/></>,
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name] ?? paths.folder}</svg>;
}
export function Dialog({ title, children, onClose, drawer = false }: { title: string; children: ReactNode; onClose: () => void; drawer?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : document.activeElement as HTMLElement);
  const titleId = useId();
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const listener = (e: Event) => { e.preventDefault(); closeRef.current(); };
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],summary,[tabindex="0"]'))
        .filter((element) => element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (!first || !last) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    dialog.addEventListener('cancel', listener);
    dialog.addEventListener('keydown', trap);
    return () => {
      dialog.removeEventListener('cancel', listener); dialog.removeEventListener('keydown', trap); dialog.close();
      const previous = returnFocus.current;
      if (previous?.isConnected && !previous.matches(':disabled')) previous.focus();
    };
  }, []);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog?.open && (!dialog.contains(document.activeElement) || document.activeElement?.matches(':disabled'))) {
      dialog.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    }
  });
  return <dialog ref={ref} aria-labelledby={titleId} className={drawer ? 'dialog drawer' : 'dialog'}>
    <div className="dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть диалог" autoFocus><Icon name="close"/></button></div>
    <div className="dialog-body">{children}</div>
  </dialog>;
}
export function PageHeading({ eyebrow, title, children, action }: { eyebrow: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="overline">{eyebrow}</p><h1 tabIndex={-1}>{title}</h1>{children && <div className="page-description">{children}</div>}</div>{action && <div className="heading-action">{action}</div>}</div>;
}
export function SectionHeading({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>;
}
export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Время неизвестно' : date.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
