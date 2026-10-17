import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { fetchLeaderboard } from '../../../services/api';

export default function LeaderboardView() {
  const { goBackFromLeaderboard } = useApp();
  const [earners, setEarners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchLeaderboard();
        if (Array.isArray(data)) {
          setEarners(data);
        }
      } catch (e) {
        console.error('Failed to load leaderboard:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div id="leaderboard-view" className="view active">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button
          onClick={goBackFromLeaderboard}
          style={{
            background: 'var(--card-bg-light)',
            border: '1px solid var(--border-soft)',
            color: '#fff',
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            cursor: 'pointer'
          }}
        >
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>Top Earners</h2>
      </div>

      <div id="leaderboard-list">
        {loading ? (
          <div className="loader-spinner" style={{ margin: '30px auto' }}></div>
        ) : earners.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            No top earners found.
          </div>
        ) : (
          earners.map((earner, index) => {
            const maskedId =
              earner.userId && earner.userId.length > 6
                ? earner.userId.substring(0, 4) + '***' + earner.userId.slice(-2)
                : earner.userId;

            const totalUsd = typeof earner.total === 'number' ? earner.total : parseFloat(earner.total || 0);

            let rankContent = `#${index + 1}`;
            let rankColor = 'var(--text-muted)';
            if (index === 0) {
              rankContent = <i className="fa-solid fa-crown" style={{ color: '#eab308', fontSize: '16px' }}></i>;
              rankColor = '#eab308';
            } else if (index === 1) {
              rankContent = <i className="fa-solid fa-medal" style={{ color: '#94a3b8', fontSize: '15px' }}></i>;
              rankColor = '#94a3b8';
            } else if (index === 2) {
              rankContent = <i className="fa-solid fa-medal" style={{ color: '#d97706', fontSize: '15px' }}></i>;
              rankColor = '#d97706';
            }

            const initial = (earner.name || 'U').charAt(0).toUpperCase();

            return (
              <div
                key={index}
                className="data-item"
                style={{ border: `1px solid ${index === 0 ? 'rgba(234,179,8,0.3)' : 'var(--border-soft)'}` }}
              >
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div
                    className="data-icon"
                    style={{
                      background: 'transparent',
                      width: '28px',
                      height: '28px',
                      marginRight: 0,
                      color: rankColor,
                      fontWeight: 800,
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {rankContent}
                  </div>

                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      background: 'var(--accent-main)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      flexShrink: 0
                    }}
                  >
                    {earner.photo_url ? (
                      <img src={earner.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ color: '#000', fontWeight: 'bold' }}>{initial}</span>
                    )}
                  </div>

                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>
                      {earner.name || 'Anonymous Wolf'}
                    </h4>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                      ID: {maskedId}
                    </p>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div className="data-val" style={{ fontSize: '14px' }}>+${totalUsd.toFixed(4)}</div>
                  {earner.total_howl ? (
                    <div style={{ fontSize: '10px', color: 'var(--accent-orange)', fontWeight: 700 }}>
                      {Number(earner.total_howl).toLocaleString()} HOWL
                    </div>
                  ) : null}
                </div>
              </div>
            );

          })
        )}
      </div>
    </div>
  );
}
