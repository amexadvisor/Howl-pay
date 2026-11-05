import React, { useEffect, useState, useRef } from 'react';

// Module-level cache so we never re-fetch credentials repeatedly
let cachedAvisoConfig = null;
let configInFlightPromise = null;

export function prefetchAvisoConfig(userId) {
  const effectiveUid = (userId && /^\d+$/.test(String(userId))) ? String(userId) : '8026237972';
  if (cachedAvisoConfig && cachedAvisoConfig.userId === effectiveUid) {
    return Promise.resolve(cachedAvisoConfig);
  }
  if (configInFlightPromise) return configInFlightPromise;

  const apiBase = (typeof window !== 'undefined' && window.API_BASE_URL) || 'https://howlearn.duckdns.org';
  configInFlightPromise = fetch(`${apiBase}/api/aviso-postback?action=config&user_id=${encodeURIComponent(effectiveUid)}`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return res.json();
    })
    .then((data) => {
      configInFlightPromise = null;
      if (data && data.success) {
        cachedAvisoConfig = data;
        return data;
      }
      throw new Error(data?.error || 'Failed to load widget credentials');
    })
    .catch((err) => {
      configInFlightPromise = null;
      throw err;
    });

  return configInFlightPromise;
}

export default function AvisoYouTubeWidget({ user }) {
  const [config, setConfig] = useState(cachedAvisoConfig);
  const [loading, setLoading] = useState(!cachedAvisoConfig);
  const [error, setError] = useState(null);
  const widgetInstanceRef = useRef(null);
  const containerRef = useRef(null);

  // 1. Ensure config is fetched
  useEffect(() => {
    let isMounted = true;
    const effectiveUid = (user?.id && /^\d+$/.test(String(user.id))) ? String(user.id) : '8026237972';

    if (cachedAvisoConfig && cachedAvisoConfig.userId === effectiveUid) {
      setConfig(cachedAvisoConfig);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    prefetchAvisoConfig(effectiveUid)
      .then((cfg) => {
        if (!isMounted) return;
        setConfig(cfg);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('[AvisoYouTubeWidget] Config load error:', err);
        setError('Could not load YouTube tasks. Please check your connection and try again.');
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  // 2. Initialize the widget safely and idempotently once config and DOM are ready
  useEffect(() => {
    if (!config) return;

    let isCancelled = false;
    let pollInterval = null;
    let timeoutId = null;

    const mountInstance = () => {
      if (isCancelled) return;
      const container = document.getElementById('aviso-widget');
      if (!container || !window.YouTubeWidget) return;

      // If an instance was already mounted on this ref, destroy it first
      if (widgetInstanceRef.current && typeof widgetInstanceRef.current.destroy === 'function') {
        try {
          widgetInstanceRef.current.destroy();
        } catch (_) {}
        widgetInstanceRef.current = null;
      }

      try {
        // Explicitly create single instance via the official JavaScript SDK
        widgetInstanceRef.current = new window.YouTubeWidget('aviso-widget', {
          apiEndpoint: config.apiEndpoint || 'https://aviso.bz/api/v1',
          apiKey: config.apiKey,
          userHash: config.userHash,
          userId: String(config.userId),
          userSig: config.userSig,
          theme: 'dark'
        });

        if (!isCancelled) {
          setLoading(false);
        }
      } catch (err) {
        console.warn('[AvisoYouTubeWidget] Mount exception:', err);
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    if (window.YouTubeWidget) {
      // Script is already loaded and ready
      requestAnimationFrame(mountInstance);
    } else {
      // Poll every 50ms for SDK readiness (it is loaded with defer in index.html)
      pollInterval = setInterval(() => {
        if (window.YouTubeWidget) {
          clearInterval(pollInterval);
          pollInterval = null;
          mountInstance();
        }
      }, 50);

      // Fallback timeout after 8 seconds
      timeoutId = setTimeout(() => {
        if (pollInterval) clearInterval(pollInterval);
        if (!window.YouTubeWidget && !isCancelled) {
          setError('Failed to load YouTube widget SDK. Please check your network connection.');
          setLoading(false);
        }
      }, 8000);
    }

    return () => {
      isCancelled = true;
      if (pollInterval) clearInterval(pollInterval);
      if (timeoutId) clearTimeout(timeoutId);

      if (widgetInstanceRef.current && typeof widgetInstanceRef.current.destroy === 'function') {
        try {
          widgetInstanceRef.current.destroy();
        } catch (_) {}
        widgetInstanceRef.current = null;
      }
    };
  }, [config]);

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    const effectiveUid = (user?.id && /^\d+$/.test(String(user.id))) ? String(user.id) : '8026237972';
    cachedAvisoConfig = null;
    prefetchAvisoConfig(effectiveUid)
      .then((cfg) => {
        setConfig(cfg);
      })
      .catch(() => {
        setError('Retry failed. Please check your connection and try again.');
        setLoading(false);
      });
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '520px',
        background: '#121218',
        borderRadius: '14px',
        overflow: 'hidden',
        border: '1px solid var(--border-soft)',
        padding: '6px'
      }}
    >
      {/* Loading Overlay */}
      {loading && !error && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(18, 18, 24, 0.95)',
            textAlign: 'center',
            gap: '12px',
            borderRadius: '14px'
          }}
        >
          <i className="fa-brands fa-youtube fa-bounce" style={{ fontSize: '38px', color: '#ef4444' }}></i>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Loading YouTube Tasks...</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Preparing sponsored videos &amp; rewards</div>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 11,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(18, 18, 24, 0.98)',
            padding: '24px',
            textAlign: 'center',
            gap: '14px',
            borderRadius: '14px'
          }}
        >
          <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '32px', color: '#ef4444' }}></i>
          <div style={{ fontSize: '13px', color: '#f87171', maxWidth: '300px' }}>{error}</div>
          <button
            onClick={handleRetry}
            style={{
              background: 'var(--accent-main)',
              border: 'none',
              color: '#000',
              fontWeight: 700,
              fontSize: '12px',
              padding: '8px 16px',
              borderRadius: '10px',
              cursor: 'pointer'
            }}
          >
            <i className="fa-solid fa-rotate-right" style={{ marginRight: '6px' }}></i>
            Retry
          </button>
        </div>
      )}

      {/* 
        Persistent Widget Container
        NOTE: Do NOT add 'data-youtube-widget' here.
        'data-youtube-widget' triggers the auto-init routine in widget.js,
        which conflicts with the programmatic new window.YouTubeWidget() call.
      */}
      <div
        id="aviso-widget"
        ref={containerRef}
        style={{ width: '100%', minHeight: '500px' }}
      ></div>
    </div>
  );
}
