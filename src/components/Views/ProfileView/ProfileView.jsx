import React from 'react';
import { useApp } from '../../../context/AppContext';

export default function ProfileView({ isActive = false }) {
  const { user, isAdmin, setActiveView, openLeaderboard, setTosOpen, triggerHaptic } = useApp();

  return (
    <div id="profile-view" className={`view ${isActive ? 'active' : ''}`}>
      <h2 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 16px 0' }}>Profile</h2>

      {/* Admin Panel Link (only shown if admin) */}
      {isAdmin && (
        <div
          id="admin-profile-item"
          className="clickable"
          onClick={() => {
            triggerHaptic('light');
            setActiveView('admin-view');
          }}
        >
          <div
            className="glass-card task-row"
            style={{
              background: 'rgba(94, 179, 255, 0.15)',
              borderColor: 'rgba(94, 179, 255, 0.4)'
            }}
          >
            <div className="task-icon" style={{ background: 'transparent' }}>
              <i className="fa-solid fa-shield-halved" style={{ color: 'var(--accent-main)', fontSize: '24px' }}></i>
            </div>
            <div className="task-text">
              <h4 style={{ color: 'var(--accent-main)' }}>Admin Control Panel</h4>
              <p style={{ color: 'rgba(255,255,255,0.7)' }}>Manage user bans &amp; security</p>
            </div>
            <i className="fa-solid fa-chevron-right" style={{ color: 'var(--accent-main)' }}></i>
          </div>
        </div>
      )}

      {/* Leaderboard Card */}
      <div className="clickable" onClick={() => openLeaderboard('profile-view')}>
        <div className="glass-card task-row">
          <div className="task-icon">
            <i className="fa-solid fa-trophy" style={{ color: '#eab308' }}></i>
          </div>
          <div className="task-text">
            <h4>Leaderboard</h4>
            <p>Top earners &amp; community rankings</p>
          </div>
          <i className="fa-solid fa-chevron-right" style={{ color: 'var(--text-muted)' }}></i>
        </div>
      </div>

      {/* Transaction History Card */}
      <div
        className="clickable"
        onClick={() => {
          triggerHaptic('light');
          setActiveView('history-view');
        }}
      >
        <div className="glass-card task-row">
          <div className="task-icon">
            <i className="fa-solid fa-arrow-right-arrow-left" style={{ color: '#a855f7' }}></i>
          </div>
          <div className="task-text">
            <h4>Transaction History</h4>
            <p>Earnings, withdrawals &amp; expenses</p>
          </div>
          <i className="fa-solid fa-chevron-right" style={{ color: 'var(--text-muted)' }}></i>
        </div>
      </div>

      {/* Platform Rules / TOS Card */}
      <div
        className="clickable"
        onClick={() => {
          triggerHaptic('light');
          setTosOpen(true);
        }}
      >
        <div className="glass-card task-row">
          <div className="task-icon">
            <i className="fa-solid fa-shield-halved" style={{ color: 'var(--accent-orange)' }}></i>
          </div>
          <div className="task-text">
            <h4>Platform Rules</h4>
            <p>Anti-fraud &amp; compliance</p>
          </div>
          <i className="fa-solid fa-chevron-right" style={{ color: 'var(--text-muted)' }}></i>
        </div>
      </div>
    </div>
  );
}
