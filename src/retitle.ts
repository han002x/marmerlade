import type { FocusEvent } from 'react';
import { useDiagram } from './store';
import type { RefKind } from './references';

/**
 * Title field handlers: when editing ends, links that named the old title
 * follow the new one. Per keystroke would pass through clashing titles.
 */
export function retitleField(kind: RefKind, id: string) {
  return {
    onFocus: (e: FocusEvent<HTMLInputElement>) => { e.currentTarget.dataset.from = e.currentTarget.value; },
    onBlur: (e: FocusEvent<HTMLInputElement>) => useDiagram.getState().retitle(kind, id, e.currentTarget.dataset.from ?? ''),
  };
}
