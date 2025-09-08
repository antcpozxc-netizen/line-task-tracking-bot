// src/hooks/useMe.js
import { useEffect, useState } from 'react';

export default function useMe() {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const r = await fetch('/api/me', { credentials: 'include' });
        const ct = r.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          throw new Error(`Unexpected content-type: ${ct}`);
        }
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        const j = await r.json();
        if (mounted) setState({ loading: false, data: j, error: null });
      } catch (e) {
        if (mounted) setState({ loading: false, data: null, error: e });
      }
    }

    load();
    return () => { mounted = false; };
  }, []);

  return state; // { loading, data, error }
}
