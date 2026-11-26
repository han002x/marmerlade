import { createContext } from 'react';

export const FlowOrderEditContext = createContext<{
  change: (id: string, order: number | undefined) => void;
  cancel: () => void;
} | null>(null);
