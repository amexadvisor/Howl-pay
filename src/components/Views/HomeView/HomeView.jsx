import React from 'react';
import { useApp } from '../../../context/AppContext';
import LottieAnimation from '../../Common/LottieAnimation';
import WatchAndEarn from './WatchAndEarn';
import FeaturedTasksSection from './FeaturedTasksSection';

export default function HomeView({ isActive = true }) {
  const { user, balance, setActiveView, openLeaderboard, triggerHaptic, setPromoModalOpen, setOfferwallTab } = useApp();

  const handleEarnClick = () => {
    triggerHaptic('light');
    if (typeof setOfferwallTab === 'function') setOfferwallTab('cpx');
    setActiveView('tasks-view');
  };

  const handleWithdrawClick = () => {
    triggerHaptic('light');
    setActiveView('withdraw-view');
  };

  const avatarInitial = (user.first_name || user.username || 'U').charAt(0).toUpperCase();

  return (
    <div id="home-view" className={`view ${isActive ? 'active' : ''}`}>
      {/* Top Bar Modern */}
      <div className="top-bar-modern">
        <div className="user-greeting">
          <div className="user-avatar-new" id="profile-pic">
            {user.photo_url ? (
              <img src={user.photo_url} alt="" />
            ) : (
              <span>{avatarInitial}</span>
            )}
          </div>
          <div className="greeting-text">
            <span className="welcome-text">WELCOME BACK</span>
            <div className="user-name-new" id="username">
              {user.first_name || user.username || 'Wolf'}
            </div>
          </div>
        </div>
      </div>

      {/* Total Balance Glass Card */}
      <div className="clickable">
        <div className="glass-card balance-card-new">
          <div className="balance-left">
            <div className="balance-label">TOTAL BALANCE</div>
            <div className="balance-amount-new" id="dash-howl-balance">
              <span id="user-howl-val">{balance.howl.toLocaleString()}</span>
            </div>
            <div className="balance-pills">
              <span className="pill pill-leaf">
                <i className="fa-solid fa-paw"></i> HOWL
              </span>
              <span className="pill pill-usd">
                <i className="fa-solid fa-circle" style={{ fontSize: '6px' }}></i> $<span id="user-usd-val">{balance.usd.toFixed(4)}</span>
              </span>
              {balance.hold > 0 && (
                <span
                  className="pill pill-hold"
                  id="hold-pill"
                  title="Offerwall & survey rewards are held for 7 days before they join your balance"
                >
                  <i className="fa-solid fa-hourglass-half" style={{ fontSize: '9px' }}></i>{' '}
                  <span id="user-hold-val">{balance.hold}</span> HOLD
                </span>
              )}
            </div>
          </div>
          <div className="balance-right">
            <div
              id="wolf-emoji"
              style={{
                width: '75px',
                height: '75px',
                filter: 'drop-shadow(0 0 15px rgba(94, 179, 255, 0.4))'
              }}
            >
              <LottieAnimation
                path="/assets/wolf-emoji.json"
                style={{ width: '100%', height: '100%' }}
                fallbackIcon="fa-solid fa-paw"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Action Grid */}
      <div className="action-grid">
        <div className="clickable" onClick={handleEarnClick}>
          <div className="glass-card action-btn" style={{ marginBottom: 0, padding: '16px' }}>
            <i className="fa-solid fa-bolt"></i> EARN
          </div>
        </div>
        <div className="clickable" onClick={handleWithdrawClick}>
          <div className="glass-card action-btn" style={{ marginBottom: 0, padding: '16px' }}>
            <i className="fa-solid fa-download"></i> WITHDRAW
          </div>
        </div>
      </div>

      {/* Promo Code Giveaway row */}
      <div
        className="clickable"
        onClick={() => {
          triggerHaptic('light');
          setPromoModalOpen(true);
        }}
      >
        <div
          className="glass-card task-row"
          style={{
            background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.12), rgba(14, 165, 233, 0.08))',
            borderColor: 'rgba(234, 179, 8, 0.35)',
            boxShadow: '0 4px 20px rgba(234, 179, 8, 0.12)'
          }}
        >
          <div
            className="task-icon"
            style={{
              background: 'rgba(234, 179, 8, 0.18)',
              color: '#eab308'
            }}
          >
            <i className="fa-solid fa-gift" style={{ fontSize: '18px' }}></i>
          </div>
          <div className="task-text">
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              Promo Code Giveaway
              <span
                style={{
                  background: 'linear-gradient(135deg, #eab308, #ca8a04)',
                  color: '#000',
                  fontSize: '9px',
                  fontWeight: 900,
                  padding: '2px 7px',
                  borderRadius: '6px',
                  letterSpacing: '0.5px'
                }}
              >
                CLAIM
              </span>
            </h4>
            <p>Enter promo code to claim bonus HOWL giveaway</p>
          </div>
          <i className="fa-solid fa-chevron-right" style={{ color: 'var(--text-muted)' }}></i>
        </div>
      </div>

      {/* Top Earners Leaderboard row */}
      <div className="clickable" onClick={() => openLeaderboard('home-view')}>
        <div className="glass-card task-row">
          <div className="task-icon">
            <i className="fa-solid fa-trophy" style={{ color: '#eab308' }}></i>
          </div>
          <div className="task-text">
            <h4>Top Earners Leaderboard</h4>
            <p>See global rankings &amp; community earners</p>
          </div>
          <i className="fa-solid fa-chevron-right" style={{ color: 'var(--text-muted)' }}></i>
        </div>
      </div>

      {/* CPX Research Surveys row */}
      <div
        className="clickable"
        onClick={() => {
          triggerHaptic('light');
          if (typeof setOfferwallTab === 'function') setOfferwallTab('cpx');
          setActiveView('tasks-view');
        }}
      >
        <div
          className="glass-card task-row"
          style={{
            border: '1px solid rgba(56, 189, 248, 0.3)',
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(15, 23, 42, 0.5) 100%)'
          }}
        >
          <div className="task-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
            <i className="fa-solid fa-square-poll-vertical" style={{ fontSize: '18px' }}></i>
          </div>
          <div className="task-text">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <h4 style={{ margin: 0 }}>CPX Research Surveys</h4>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'rgba(34, 197, 94, 0.25)',
                  color: '#22c55e'
                }}
              >
                HOT
              </span>
            </div>
            <p>High payout market surveys &amp; instant credit</p>
          </div>
          <i className="fa-solid fa-chevron-right" style={{ color: 'var(--text-muted)' }}></i>
        </div>
      </div>

      {/* Quick Tasks row */}
      <div className="clickable" onClick={() => setActiveView('quick-view')}>
        <div className="glass-card task-row">
          <div className="task-icon">
            <div className="lottie-ico" id="quick-lottie">
              <LottieAnimation
                path="/assets/thunder.json"
                style={{ width: '100%', height: '100%' }}
                fallbackIcon="fa-solid fa-bolt"
              />
            </div>
          </div>
          <div className="task-text">
            <h4>Quick Tasks</h4>
            <p>Comment &amp; bio tasks, fast HOWL rewards</p>
          </div>
          <i className="fa-solid fa-chevron-right" style={{ color: 'var(--text-muted)' }}></i>
        </div>
      </div>

      {/* TimeWall Offerwall row */}
      <div
        className="clickable"
        onClick={() => {
          triggerHaptic('light');
          if (typeof setOfferwallTab === 'function') setOfferwallTab('timewall');
          setActiveView('tasks-view');
        }}
      >
        <div className="glass-card task-row">
          <div className="task-icon">
            <div className="lottie-ico" id="offerwall-lottie">
              <LottieAnimation
                path="/assets/address.json"
                style={{ width: '100%', height: '100%' }}
                fallbackIcon="fa-solid fa-earth-africa"
              />
            </div>
          </div>
          <div className="task-text">
            <h4>TimeWall Offerwall</h4>
            <p>Micro tasks, clicks &amp; partner offers</p>
          </div>
          <i className="fa-solid fa-chevron-right" style={{ color: 'var(--text-muted)' }}></i>
        </div>
      </div>

      {/* Watch & Earn Section */}
      <WatchAndEarn />

      {/* Featured Tasks Section */}
      <FeaturedTasksSection />
    </div>
  );
}
