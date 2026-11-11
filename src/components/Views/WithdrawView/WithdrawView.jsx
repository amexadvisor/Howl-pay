import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../../context/AppContext';
import { submitWithdrawal, fetchWithdrawEligibility } from '../../../services/api';

export default function WithdrawView({ isActive = false }) {
  const {
    setActiveView,
    setOfferwallTab,
    triggerHaptic,
    showTopNotification,
    refreshBalance,
    applyBalance,
    balance
  } = useApp();
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [eligibility, setEligibility] = useState(null);
  const [loadingEligibility, setLoadingEligibility] = useState(false);

  const loadEligibility = useCallback(async () => {
    setLoadingEligibility(true);
    try {
      const res = await fetchWithdrawEligibility();
      if (res && res.success && res.eligibility) {
        setEligibility(res.eligibility);
      }
    } catch (e) {
      // Fail gracefully; backend will enforce eligibility on submission
    } finally {
      setLoadingEligibility(false);
    }
  }, []);

  useEffect(() => {
    if (isActive) {
      loadEligibility();
    }
  }, [isActive, loadEligibility]);

  const numAmount = parseInt(amount, 10) || 0;
  const exchangeUsd = numAmount * 0.00002;
  const receiveUsd = exchangeUsd - 0.01;
  const gatesBlocked = Boolean(eligibility && !eligibility.eligible);

  const goToSubscribeTask = () => {
    triggerHaptic('light');
    setActiveView('home-view');
    setTimeout(() => {
      const el = document.getElementById('ft-card-youtube-sub') || document.getElementById('featured-tasks-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  };

  const goToYoutubeTasks = () => {
    triggerHaptic('light');
    if (typeof setOfferwallTab === 'function') {
      setOfferwallTab('youtube');
    }
    setActiveView('tasks-view');
  };

  const goToInvite = () => {
    triggerHaptic('light');
    setActiveView('team-view');
  };

  const handleSubmit = async () => {
    triggerHaptic('medium');

    if (gatesBlocked) {
      showTopNotification(
        'REQUIREMENTS INCOMPLETE',
        eligibility.blocking_reason || 'Complete all withdrawal requirements first.',
        'error'
      );
      return;
    }

    const trimmedAddress = address.trim();
    const intAmount = parseInt(amount, 10);

    if (!trimmedAddress) {
      showTopNotification('INVALID ADDRESS', 'Please enter your BEP-20 wallet address.', 'error');
      return;
    }

    if (!intAmount || intAmount < 1500) {
      showTopNotification('MINIMUM WITHDRAWAL', 'Minimum withdrawal amount is 1,500 HOWL.', 'error');
      return;
    }

    if (intAmount > balance.howl) {
      showTopNotification('INSUFFICIENT BALANCE', 'You do not have enough HOWL balance.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitWithdrawal({ address: trimmedAddress, amount: intAmount });
      if (res && res.user_balance) {
        applyBalance(res.user_balance.total_howl, res.user_balance.total_usd, res.user_balance.hold);
      }
      if (res && res.eligibility) {
        setEligibility(res.eligibility);
      }
      if (res && res.success) {
        showTopNotification('REQUEST SENT!', 'Withdrawal request sent for Admin approval.', 'gold');
        setAddress('');
        setAmount('');
        refreshBalance();
        loadEligibility();
      } else {
        showTopNotification('WITHDRAWAL FAILED', res?.message || 'Withdrawal could not be processed.', 'error');
      }
    } catch (err) {
      showTopNotification('NETWORK ERROR', 'Could not submit withdrawal. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="withdraw-view" className={`view ${isActive ? 'active' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button
          onClick={() => {
            triggerHaptic('light');
            setActiveView('home-view');
          }}
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
        <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>Withdraw USDT (BEP-20)</h2>
      </div>

      {/* Withdrawal Requirements Checklist */}
      <div
        className="glass-card"
        style={{
          marginBottom: '14px',
          padding: '14px 16px',
          border: gatesBlocked
            ? '1px solid rgba(245, 158, 11, 0.4)'
            : '1px solid rgba(34, 197, 94, 0.35)'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '7px' }}>
            <i
              className={`fa-solid ${gatesBlocked ? 'fa-lock' : 'fa-shield-check'}`}
              style={{ color: gatesBlocked ? '#f59e0b' : '#22c55e' }}
            ></i>
            WITHDRAWAL REQUIREMENTS
          </div>
          <button
            onClick={loadEligibility}
            disabled={loadingEligibility}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-main)',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <i className={`fa-solid fa-rotate ${loadingEligibility ? 'fa-spin' : ''}`}></i> Refresh
          </button>
        </div>

        {!eligibility ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px 0' }}>
            {loadingEligibility ? 'Checking requirements...' : 'Tap Refresh to load requirements'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Rule 1: Official YouTube Subscribe */}
            {eligibility.subscribe?.required && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  padding: '9px 10px',
                  borderRadius: '10px',
                  background: eligibility.subscribe.passed ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${eligibility.subscribe.passed ? 'rgba(34, 197, 94, 0.3)' : 'var(--border-soft)'}`
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                  <i
                    className={`fa-solid ${eligibility.subscribe.passed ? 'fa-circle-check' : 'fa-circle-xmark'}`}
                    style={{ color: eligibility.subscribe.passed ? '#22c55e' : '#ef4444', fontSize: '14px', flexShrink: 0 }}
                  ></i>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>
                      Subscribe to YouTube Channel
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {eligibility.subscribe.passed
                        ? `Verified${eligibility.subscribe.claimed_handle ? ` (${eligibility.subscribe.claimed_handle})` : ''}`
                        : `Featured Task #1${eligibility.subscribe.target_handle ? ` (${eligibility.subscribe.target_handle})` : ''}`}
                    </div>
                  </div>
                </div>
                {!eligibility.subscribe.passed && (
                  <button
                    onClick={goToSubscribeTask}
                    style={{
                      background: '#ef4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '6px 10px',
                      fontSize: '10px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    GO
                  </button>
                )}
              </div>
            )}

            {/* Rule 2: 20 YouTube Tasks Today */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                padding: '9px 10px',
                borderRadius: '10px',
                background: eligibility.daily_youtube?.passed ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${eligibility.daily_youtube?.passed ? 'rgba(34, 197, 94, 0.3)' : 'var(--border-soft)'}`
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0, flex: 1 }}>
                <i
                  className={`fa-solid ${eligibility.daily_youtube?.passed ? 'fa-circle-check' : 'fa-circle-xmark'}`}
                  style={{ color: eligibility.daily_youtube?.passed ? '#22c55e' : '#f59e0b', fontSize: '14px', flexShrink: 0 }}
                ></i>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#fff' }}>
                    <span>YouTube Tasks Today</span>
                    <span style={{ color: eligibility.daily_youtube?.passed ? '#4ade80' : '#fbbf24' }}>
                      {Math.min(eligibility.daily_youtube?.completed || 0, eligibility.daily_youtube?.required || 20)} / {eligibility.daily_youtube?.required || 20}
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', marginTop: '5px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, ((eligibility.daily_youtube?.completed || 0) / (eligibility.daily_youtube?.required || 20)) * 100)}%`,
                        background: eligibility.daily_youtube?.passed ? '#22c55e' : '#f59e0b',
                        transition: 'width 0.3s ease'
                      }}
                    ></div>
                  </div>
                </div>
              </div>
              {!eligibility.daily_youtube?.passed && (
                <button
                  onClick={goToYoutubeTasks}
                  style={{
                    background: 'var(--accent-main)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '10px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  WATCH
                </button>
              )}
            </div>

            {/* Rule 3: 1 Invited Friend with 10+ YouTube Tasks */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                padding: '9px 10px',
                borderRadius: '10px',
                background: eligibility.referral_youtube?.passed ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${eligibility.referral_youtube?.passed ? 'rgba(34, 197, 94, 0.3)' : 'var(--border-soft)'}`
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                <i
                  className={`fa-solid ${eligibility.referral_youtube?.passed ? 'fa-circle-check' : 'fa-circle-xmark'}`}
                  style={{ color: eligibility.referral_youtube?.passed ? '#22c55e' : '#f59e0b', fontSize: '14px', flexShrink: 0 }}
                ></i>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>
                    Invite 1 Friend (10+ YouTube Tasks)
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {eligibility.referral_youtube?.passed
                      ? `${eligibility.referral_youtube.qualified_count} qualified friend(s)`
                      : eligibility.referral_youtube?.total_referrals > 0
                        ? `${eligibility.referral_youtube.qualified_count}/1 qualified • Closest friend: ${eligibility.referral_youtube.best_ref_tasks}/10 tasks`
                        : '0/1 qualified referral yet'}
                  </div>
                </div>
              </div>
              {!eligibility.referral_youtube?.passed && (
                <button
                  onClick={goToInvite}
                  style={{
                    background: 'var(--accent-main)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '10px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  INVITE
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="glass-card">
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            BEP-20 Wallet Address
          </label>
          <input
            type="text"
            id="wd-address"
            placeholder="0x..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--border-soft)',
              color: '#fff',
              padding: '14px',
              borderRadius: '12px',
              fontFamily: 'monospace',
              fontSize: '12px',
              marginTop: '6px',
              outline: 'none'
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Amount (HOWL)
            </label>
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent-orange)' }}>
              Min: 1,500
            </span>
          </div>
          <input
            type="number"
            id="wd-amount"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--border-soft)',
              color: '#fff',
              padding: '14px',
              borderRadius: '12px',
              fontSize: '15px',
              fontWeight: 700,
              marginTop: '6px',
              outline: 'none'
            }}
          />
        </div>

        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border-soft)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-muted)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span>Exchange Value</span>
            <span id="wd-usd-val" style={{ color: '#fff' }}>
              ${exchangeUsd.toFixed(4)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span>Network Fee</span>
            <span style={{ color: 'var(--accent-red)' }}>-$0.0100</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              paddingTop: '10px',
              fontSize: '15px',
              fontWeight: 800,
              color: '#fff'
            }}
          >
            <span>You Receive</span>
            <span id="wd-receive-val" style={{ color: 'var(--accent-main)' }}>
              ${receiveUsd > 0 ? receiveUsd.toFixed(4) : '0.0000'}
            </span>
          </div>
        </div>

        <button
          id="wd-btn"
          onClick={handleSubmit}
          disabled={submitting || gatesBlocked}
          style={{
            width: '100%',
            background: gatesBlocked ? 'rgba(255,255,255,0.12)' : 'var(--accent-main)',
            color: gatesBlocked ? '#94a3b8' : '#000',
            border: 'none',
            padding: '16px',
            borderRadius: '12px',
            fontWeight: 800,
            fontSize: '14px',
            cursor: submitting || gatesBlocked ? 'not-allowed' : 'pointer',
            transition: '0.2s',
            opacity: submitting ? 0.7 : 1
          }}
        >
          {submitting
            ? 'Processing Request...'
            : gatesBlocked
              ? 'Complete Requirements Above'
              : 'Submit Withdrawal Request'}
        </button>
      </div>
    </div>
  );
}
