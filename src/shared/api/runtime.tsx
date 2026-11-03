import { createContext, useContext, useState, type ReactNode } from 'react';
import { ApiClient } from './client';
import { createMockApi } from './mock';

export function createRuntime(latency = 220) {
  const demo = createMockApi({ latency });
  return { api: new ApiClient(demo.transport), demo };
}
export type Runtime = ReturnType<typeof createRuntime>;
const RuntimeContext = createContext<Runtime | null>(null);
export function RuntimeProvider({
  children,
  value,
}: {
  children: ReactNode;
  value?: Runtime;
}) {
  const [runtime] = useState(() => value ?? createRuntime());
  return (
    <RuntimeContext.Provider value={runtime}>
      {children}
    </RuntimeContext.Provider>
  );
}
export function useRuntime() {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error('RuntimeProvider is required');
  return runtime;
}
