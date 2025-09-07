// src/hooks/useMe.js
import { useEffect, useState } from 'react';
import { fetchMe } from '../api/client';

export default function useMe() {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    let mounted = true;
    fetchMe()
      .then((j) => mounted && setState({ loading: false, data: j, error: null }))
      .catch((e) => mounted && setState({ loading: false, data: null, error: e }));
    return () => { mounted = false; };
  }, []);

  return state; // {loading, data, error}
}
