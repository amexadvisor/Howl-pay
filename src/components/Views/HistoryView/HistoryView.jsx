import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { fetchHistory } from '../../../services/api';

export default function HistoryView() {
  const { user, setActiveView, triggerHaptic } = useApp();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    try {
      const data = await fetchHistory(user.id);
      if (Array.isArray(data)) {
        setHistory(data);
      }
    } catch (e) {
      console.error('Failed to load transaction history:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [user.id]);

  const handleBack = () => {
    triggerHaptic('light');
    setActiveView('profile-view');
  };

  return (
    <div id="history-view" className="view active">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button
          onClick={handleBack}
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
        <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>Transaction History</h2>
      </div>

      <div id="history-list">
        {loading ? (
          <div className="loader-spinner" style={{ margin: '30px auto' }}></div>
        ) : history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            No transactions found.
          </div>
        ) : (
          history.map((item, idx) => {
            const isDeduction = item.reward_amount < 0 || (item.task_type && item.task_type.includes('BEP20'));
            const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString() : '';

            let valueStr = '';
            if (item.task_type && item.task_type.includes('HOWL')) {
              valueStr = `+${Math.round(item.reward_amount).toLocaleString()} HOWL`;
            } else if (String(item.task_type || '').startsWith('TimeWall')) {
              const sign = item.reward_amount < 0 ? '-' : '+';
              valueStr = `${sign}${Math.round(Math.abs(item.reward_amount) / 0.00002).toLocaleString()} HOWL`;
            } else {
              const sign = isDeduction ? '' : '+';
              valueStr = `${sign}$${Math.abs(item.reward_amount).toFixed(4)}`;
            }

            return (
              <div key={idx} className="data-item">
                <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                  <div
                    className="data-icon"
                    style={isDeduction ? { background: 'rgba(245,158,11,0.15)', color: '#f59e0b' } : {}}
                  >
                    <i className={`fa-solid ${isDeduction ? 'fa-arrow-up' : 'fa-check'}`}></i>
                  </div>
                  <div>
                    <h4>{item.task_type || 'Reward'}</h4>
                    <p>{dateStr}</p>
                  </div>
                </div>
                <div
                  className="data-val"
                  style={{ color: isDeduction ? '#f59e0b' : 'var(--accent-main)' }}
                >
                  {valueStr}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
