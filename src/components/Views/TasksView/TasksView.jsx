import React from 'react';
import { useApp } from '../../../context/AppContext';

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

  // CPX Research SurveyWall URL
  const cpxUrl = `https://offers.cpx-research.com/index.php?app_id=35131&ext_user_id=${encodeURIComponent(user.id)}&username=${encodeURIComponent(user.username || user.first_name || '')}`;

  // TimeWall Offerwall URL
  const timewallUrl = `https://timewall.io/users/login?oid=78a1ef4a7932308b&uid=${encodeURIComponent(user.id)}`;

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
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
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
            gap: '8px',
            padding: '10px 12px',
            borderRadius: '10px',
            border: currentTab === 'cpx' ? '1px solid var(--accent-main)' : '1px solid transparent',
            background: currentTab === 'cpx' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            color: currentTab === 'cpx' ? 'var(--accent-main)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <i className="fa-solid fa-square-poll-vertical"></i>
          <span>CPX Surveys</span>
          <span style={{ fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', background: 'rgba(34, 197, 94, 0.25)', color: '#22c55e' }}>
            HOT
          </span>
        </button>

        <button
          onClick={() => handleTabChange('timewall')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px 12px',
            borderRadius: '10px',
            border: currentTab === 'timewall' ? '1px solid var(--accent-main)' : '1px solid transparent',
            background: currentTab === 'timewall' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            color: currentTab === 'timewall' ? 'var(--accent-main)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <i className="fa-solid fa-earth-africa"></i>
          <span>TimeWall</span>
        </button>
      </div>

      {/* Info notice about 7-day hold */}
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
          Earnings are placed on a <b>7-day security hold</b> before automatic credit to spendable HOWL coins.
        </span>
      </div>

      {/* Iframe View Container */}
      <div className="offerwall-iframe-container" style={{ flex: 1, minHeight: '520px' }}>
        {currentTab === 'cpx' ? (
          <iframe
            id="cpx-iframe"
            key="cpx-iframe"
            src={cpxUrl}
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
