import { useEffect, useState } from 'react';
export function useResource<T>(load: () => Promise<T>, key: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    void load()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // The caller supplies a semantic key for every request argument.
    // `load` is deliberately not a dependency: render-created closures are unstable.
  }, [key, version]);
  return {
    data,
    error,
    loading,
    reload: () => setVersion((value) => value + 1),
  };
}
