import { useCallback, useState } from 'react';

export type GeoStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

/**
 * Browser geolocation, requested ONLY when the user explicitly asks
 * (never on page load). Coordinates stay in memory for this session and
 * are never sent to a server or AI provider.
 */
export function useGeolocation() {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const request = useCallback((): Promise<{ lat: number; lng: number } | null> => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      setMessage('Location isn’t available in this browser. Choose a neighbourhood instead.');
      return Promise.resolve(null);
    }
    setStatus('requesting');
    setMessage(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCoords(c);
          setStatus('granted');
          resolve(c);
        },
        (err) => {
          setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
          setMessage(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission was declined. Pick a neighbourhood instead. You can change this in your browser settings.'
              : 'We couldn’t get your location. Pick a neighbourhood instead.',
          );
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
      );
    });
  }, []);

  return { status, coords, message, request };
}
