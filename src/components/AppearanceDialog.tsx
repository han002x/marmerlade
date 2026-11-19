import { useEffect, useRef } from 'react';
import { isTyping } from '../useHotkeys';
import { AppearanceSettings } from './AppearanceSettings';

export default function AppearanceDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const open = () => {
      if (dialog.current?.open) return;
      previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.current?.showModal();
    };
    const key = (e: KeyboardEvent) => {
      if (!e.defaultPrevented && !isTyping(e.target) && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 't') {
        e.preventDefault(); open();
      }
    };
    const close = () => previous.current?.focus();
    const element = dialog.current;
    element?.addEventListener('close', close);
    window.addEventListener('marmerlade:appearance', open);
    window.addEventListener('keydown', key);
    return () => {
      element?.removeEventListener('close', close);
      window.removeEventListener('marmerlade:appearance', open);
      window.removeEventListener('keydown', key);
    };
  }, []);
  return <dialog ref={dialog} className="mf-appearance" aria-labelledby="appearance-title"
    onClick={(e) => { if (e.target === dialog.current) { const r = dialog.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.current.close(); } }}>
    <header><h2 id="appearance-title">Appearance</h2><button type="button" aria-label="Close appearance" onClick={() => dialog.current?.close()}>×</button></header>
    <AppearanceSettings />
  </dialog>;
}
