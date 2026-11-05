import React, { useEffect, useState, useRef } from 'react';

export default function AvisoYouTubeWidget({ user }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const widgetInstanceRef = useRef(null);

  // 1. Fetch signed configuration from our backend
  useEffect(() => {
    let isMounted = true;
    const effectiveUid = (user?.id && /^\d+$/.test(String(user.id))) ? String(user.id) : '8026237972';

    setLoading(true);
    setError(null);

    const apiBase = (typeof window !== 'undefined' && window.API_BASE_URL) || 'https://howlearn.duckdns.org';

    fetch(`${apiBase}/api/aviso-postback?action=config&user_id=${encodeURIComponent(effectiveUid)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        if (data && data.success) {
          setConfig(data);
        } else {
          throw new Error(data?.error || 'Failed to load widget credentials');
        }
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

  // 2. Initialize the widget as soon as config is ready
  useEffect(() => {
    if (!config) return;

    let isCancelled = false;

    const initWidget = () => {
      if (isCancelled) return;
      const container = document.getElementById('aviso-widget');
      if (!container) return;

      if (window.YouTubeWidget) {
        try {
          if (widgetInstanceRef.current && typeof widgetInstanceRef.current.destroy === 'function') {
            try { widgetInstanceRef.current.destroy(); } catch (_) {}
          }
          widgetInstanceRef.current = new window.YouTubeWidget('aviso-widget', {
            apiEndpoint: config.apiEndpoint || 'https://aviso.bz/api/v1',
            apiKey: config.apiKey,
            userHash: config.userHash,
            userId: String(config.userId),
            userSig: config.userSig,
            theme: 'dark'
          });
          if (!isCancelled) setLoading(false);
        } catch (e) {
          console.warn('[AvisoYouTubeWidget] Init warning:', e);
          if (!isCancelled) setLoading(false);
        }
      }
    };

    // Load widget.js script if not present
    const existingScript = document.querySelector('script[src*="aviso.bz/widget/widget.js"]');
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://aviso.bz/widget/widget.js';
      script.async = true;
      script.onload = () => {
        initWidget();
      };
      script.onerror = () => {
        if (!isCancelled) {
          setError('Failed to load YouTube widget script. Please check your network.');
          setLoading(false);
        }
      };
      document.body.appendChild(script);
    } else {
      // Script already in document: init with requestAnimationFrame to ensure container is ready
      requestAnimationFrame(() => {
        initWidget();
      });
    }

    return () => {
      isCancelled = true;
      if (widgetInstanceRef.current && typeof widgetInstanceRef.current.destroy === 'function') {
        try {
          widgetInstanceRef.current.destroy();
        } catch (_) {}
        widgetInstanceRef.current = null;
      }
    };
  }, [config]);

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
            onClick={() => {
              setError(null);
              setLoading(true);
              const apiBase = (typeof window !== 'undefined' && window.API_BASE_URL) || 'https://howlearn.duckdns.org';
              const effectiveUid = (user?.id && /^\d+$/.test(String(user.id))) ? String(user.id) : '8026237972';
              fetch(`${apiBase}/api/aviso-postback?action=config&user_id=${encodeURIComponent(effectiveUid)}`)
                .then((r) => r.json())
                .then((d) => d?.success && setConfig(d))
                .catch(() => {
                  setError('Retry failed. Please try again later.');
                  setLoading(false);
                });
            }}
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

      {/* Persistent Widget DOM Container - always in DOM */}
      <div
        id="aviso-widget"
        data-youtube-widget
        data-api-endpoint="https://aviso.bz/api/v1"
        data-api-key={config?.apiKey}
        data-user-hash={config?.userHash}
        data-user-id={config?.userId}
        data-user-sig={config?.userSig}
        data-theme="dark"
        style={{ width: '100%', minHeight: '500px' }}
      ></div>
    </div>
  );
}
