import React, { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { submitWithdrawal } from '../../../services/api';

export default function WithdrawView({ isActive = false }) {
  const { setActiveView, triggerHaptic, showTopNotification, refreshBalance, applyBalance, balance } = useApp();
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const numAmount = parseInt(amount, 10) || 0;
  const exchangeUsd = numAmount * 0.00002;
  const receiveUsd = exchangeUsd - 0.01;

  const handleSubmit = async () => {
    triggerHaptic('medium');
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
      if (res && res.success) {
        showTopNotification('REQUEST SENT!', 'Withdrawal request sent for Admin approval.', 'gold');
        setAddress('');
        setAmount('');
        refreshBalance();
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
          disabled={submitting}
          style={{
            width: '100%',
            background: 'var(--accent-main)',
            color: '#000',
            border: 'none',
            padding: '16px',
            borderRadius: '12px',
            fontWeight: 800,
            fontSize: '14px',
            cursor: submitting ? 'not-allowed' : 'pointer',
            transition: '0.2s',
            opacity: submitting ? 0.7 : 1
          }}
        >
          {submitting ? 'Processing Request...' : 'Submit Withdrawal Request'}
        </button>
      </div>
    </div>
  );
}
