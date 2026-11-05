import React from 'react';
import { useApp } from '../../../context/AppContext';
import AvisoYouTubeWidget, { prefetchAvisoConfig } from './AvisoYouTubeWidget';

export default function TasksView({ isActive = false }) {
  const { user, setActiveView, triggerHaptic, offerwallTab, setOfferwallTab } = useApp();

  const handleBack = () => {
    triggerHaptic('light');
    setActiveView('home-view');
  };

  const handleTabChange = (tab) => {
    triggerHaptic('light');
    if (typeof setOfferwallTab === 'function') {
      setOfferwallTab(tab);
    }
  };

  const [signedCpxUrl, setSignedCpxUrl] = React.useState('');

  // CPX Research SurveyWall URL (with fallback and backend MD5 signature)
  const fallbackCpxUrl = `https://offers.cpx-research.com/index.php?app_id=35131&ext_user_id=${encodeURIComponent(user?.id || '')}&username=${encodeURIComponent(user?.username || user?.first_name || '')}`;

  React.useEffect(() => {
    if (!user?.id) return;
    const apiBase = (typeof window !== 'undefined' && window.API_BASE_URL) || 'https://howlearn.duckdns.org';
    fetch(`${apiBase}/api/cpx-postback?action=url&user_id=${encodeURIComponent(user.id)}&username=${encodeURIComponent(user.username || user.first_name || '')}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.url) {
          setSignedCpxUrl(data.url);
        }
      })
      .catch(() => {});

    // Prefetch Aviso credentials immediately so YouTube tasks open with zero latency
    prefetchAvisoConfig(user.id).catch(() => {});
  }, [user?.id, user?.username, user?.first_name]);

  const activeCpxUrl = signedCpxUrl || fallbackCpxUrl;

  // TimeWall Offerwall URL
  const timewallUrl = `https://timewall.io/users/login?oid=78a1ef4a7932308b&uid=${encodeURIComponent(user?.id || '')}`;

  const currentTab = offerwallTab || 'cpx';

  return (
    <div id="tasks-view" className={`view ${isActive ? 'active' : ''}`}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px' }}>
        <button
          onClick={handleBack}
          style={{
            background: 'var(--card-bg-light)',
            border: '1px solid var(--border-soft)',
            color: '#fff',
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>Surveys &amp; Tasks</h2>
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>Complete partner offers &amp; earn HOWL</p>
        </div>
      </div>

      {/* Provider Selector Segmented Tabs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '6px',
          background: 'rgba(0,0,0,0.3)',
          padding: '4px',
          borderRadius: '14px',
          border: '1px solid var(--border-soft)',
          marginBottom: '12px'
        }}
      >
        <button
          onClick={() => handleTabChange('cpx')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '9px 6px',
            borderRadius: '10px',
            border: currentTab === 'cpx' ? '1px solid var(--accent-main)' : '1px solid transparent',
            background: currentTab === 'cpx' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            color: currentTab === 'cpx' ? 'var(--accent-main)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <i className="fa-solid fa-square-poll-vertical"></i>
          <span>CPX</span>
          <span style={{ fontSize: '9px', fontWeight: 800, padding: '1px 4px', borderRadius: '4px', background: 'rgba(34, 197, 94, 0.25)', color: '#22c55e' }}>
            HOT
          </span>
        </button>

        <button
          onClick={() => handleTabChange('timewall')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '9px 6px',
            borderRadius: '10px',
            border: currentTab === 'timewall' ? '1px solid var(--accent-main)' : '1px solid transparent',
            background: currentTab === 'timewall' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            color: currentTab === 'timewall' ? 'var(--accent-main)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <i className="fa-solid fa-earth-africa"></i>
          <span>TimeWall</span>
        </button>

        <button
          onClick={() => handleTabChange('youtube')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '9px 6px',
            borderRadius: '10px',
            border: currentTab === 'youtube' ? '1px solid #ef4444' : '1px solid transparent',
            background: currentTab === 'youtube' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
            color: currentTab === 'youtube' ? '#ef4444' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <i className="fa-brands fa-youtube" style={{ color: '#ef4444', fontSize: '13px' }}></i>
          <span>YouTube</span>
          <span style={{ fontSize: '9px', fontWeight: 800, padding: '1px 4px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.25)', color: '#ef4444' }}>
            NEW
          </span>
        </button>
      </div>

      {/* Info notice */}
      {currentTab === 'youtube' ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '10px',
            padding: '8px 12px',
            marginBottom: '14px',
            fontSize: '11px',
            color: '#fca5a5',
            lineHeight: 1.4
          }}
        >
          <i className="fa-brands fa-youtube" style={{ fontSize: '14px', color: '#ef4444', flexShrink: 0 }}></i>
          <span>
            Watch sponsored videos to earn <b>instant HOWL coins</b> credited immediately to your spendable balance.
          </span>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: '10px',
            padding: '8px 12px',
            marginBottom: '14px',
            fontSize: '11px',
            color: '#f59e0b',
            lineHeight: 1.4
          }}
        >
          <i className="fa-solid fa-shield-halved" style={{ fontSize: '13px', flexShrink: 0 }}></i>
          <span>
            Survey earnings are placed on a <b>7-day security hold</b> before automatic credit to spendable HOWL coins.
          </span>
        </div>
      )}

      {/* Main View Container */}
      <div className="offerwall-iframe-container" style={{ flex: 1, minHeight: '520px' }}>
        {currentTab === 'youtube' ? (
          <AvisoYouTubeWidget user={user} />
        ) : currentTab === 'cpx' ? (
          <iframe
            id="cpx-iframe"
            key="cpx-iframe"
            src={activeCpxUrl}
            title="CPX Research Surveys"
            allow="geolocation"
            style={{ width: '100%', height: '100%', minHeight: '520px', border: 'none', borderRadius: '12px' }}
          ></iframe>
        ) : (
          <iframe
            id="timewall-iframe"
            key="timewall-iframe"
            src={timewallUrl}
            title="TimeWall Offerwall"
            style={{ width: '100%', height: '100%', minHeight: '520px', border: 'none', borderRadius: '12px' }}
          ></iframe>
        )}
      </div>
    </div>
  );
}
