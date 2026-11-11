import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads a resource and exposes explicit loading, error and reload states.
 * `loader` must be stable (wrap it in useCallback when it depends on filters).
 */
export default function useApiResource(loader, deps = [], options = {}) {
  const { immediate = true, pollInterval = 0 } = options;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!immediate) return undefined;
    let active = true;
    setData((prev) => {
      if (prev === null) setLoading(true);
      return prev;
    });
    setError(null);
    Promise.resolve()
      .then(loader)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) {
          console.error('[api] failed to load resource', {
            message: err?.message,
            status: err?.status,
            code: err?.code,
            requestId: err?.requestId,
          });
          setError(err);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey, immediate]);

  useEffect(() => {
    if (!pollInterval || pollInterval < 1000 || !immediate) return undefined;
    const id = setInterval(() => setReloadKey((key) => key + 1), pollInterval);
    return () => clearInterval(id);
  }, [pollInterval, immediate]);

  return { data, loading, error, reload, setData };
}
