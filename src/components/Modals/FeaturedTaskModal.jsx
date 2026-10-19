import React from 'react';
import { API_BASE_URL } from '../../services/api';

export default function FeaturedTaskModal({ data, onClose, onLaunch }) {
  if (!data || !data.open) return null;

  const { task, errorMsg } = data;
  const title = task?.title || 'Task Details';
  const reward = Number(task?.reward || 100).toLocaleString();
  const rawAvatar = task?.avatar_url || task?.icon_url || '/assets/boinkers.jpg';
  const icon = rawAvatar.startsWith('http') ? rawAvatar : `${API_BASE_URL}${rawAvatar}`;

  let stepsContent = null;
  if (task?.id === 'boinkers_open') {
    stepsContent = (
      <>
        <div style={{ fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
          <i className="fa-solid fa-list-check" style={{ color: '#ffcc00', marginRight: '4px' }}></i> How to complete:
        </div>
        <div style={{ marginBottom: '6px' }}>1. Tap <b>Open App</b> below to launch Boinkers.</div>
        <div style={{ marginBottom: '6px' }}>2. Keep the app open for at least 15 seconds.</div>
        <div>3. Return to Howl and tap <b>Claim</b> to receive your +{reward} HOWL!</div>
      </>
    );
  } else if (task?.id === 'boinkers_spins') {
    stepsContent = (
      <>
        <div style={{ fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
          <i className="fa-solid fa-list-check" style={{ color: '#ffcc00', marginRight: '4px' }}></i> How to complete:
        </div>
        <div style={{ marginBottom: '6px' }}>1. Tap <b>Open App</b> below to launch Boinkers.</div>
        <div style={{ marginBottom: '6px' }}>2. Spin on the wheel to gain energy and upgrade your Boinker.</div>
        <div style={{ marginBottom: '6px' }}>3. <b>Level up 10 times in Boinkers</b>.</div>
        <div>4. Return to Howl and tap <b>Claim</b> to verify & credit +{reward} HOWL!</div>
      </>
    );
  } else if (task?.id === 'boinkers_moon') {
    stepsContent = (
      <>
        <div style={{ fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
          <i className="fa-solid fa-list-check" style={{ color: '#ffcc00', marginRight: '4px' }}></i> How to complete:
        </div>
        <div style={{ marginBottom: '6px' }}>1. Tap <b>Open App</b> below to launch Boinkers.</div>
        <div style={{ marginBottom: '6px' }}>2. <b>Spend min 5 stars in Boinkers</b> on any in-game feature.</div>
        <div>3. Return to Howl and tap <b>Claim</b> to verify & credit +{reward} HOWL!</div>
      </>
    );
  } else {
    stepsContent = (
      <>
        <div style={{ fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
          <i className="fa-solid fa-circle-info" style={{ color: 'var(--accent-main)', marginRight: '4px' }}></i> How to complete:
        </div>
        <div style={{ marginBottom: '6px' }}>
          {errorMsg || task?.description || 'Complete the task requirement, then tap Claim.'}
        </div>
        <div>After completing, return here and tap <b>Claim</b>!</div>
      </>
    );
  }

  const isRegularChannel = task?.type === 'channel' && !(task?.id && task?.id.startsWith('boinkers_'));


  return (
    <div
      id="ftTaskInfoModal"
      className="full-screen-modal active"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-content"
        style={{
          maxWidth: '330px',
          padding: '22px 18px',
          borderRadius: '22px',
          position: 'relative',
          background: 'rgba(12, 16, 28, 0.97)',
          border: '1px solid rgba(255, 204, 0, 0.35)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.85)',
          textAlign: 'center'
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '14px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '4px',
            lineHeight: 1
          }}
        >
          <i className="fa-solid fa-xmark"></i>
        </button>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '4px auto 12px auto' }}>
          <div
            id="ft-modal-icon-wrap"
            style={{
              width: '58px',
              height: '58px',
              borderRadius: '14px',
              overflow: 'hidden',
              border: '1px solid rgba(255, 204, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.3)',
              margin: '0 auto'
            }}
          >
            <img id="ft-modal-icon-img" src={icon} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
          </div>
        </div>

        <div
          id="ft-modal-status-badge"
          style={{
            display: 'inline-block',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            padding: '3px 12px',
            borderRadius: '50px',
            fontSize: '10px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            marginBottom: '10px'
          }}
        >
          Task Not Completed Yet
        </div>

        <h3 id="ft-modal-title" style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 4px 0', color: '#fff' }}>
          {title}
        </h3>
        <div id="ft-modal-reward" style={{ fontSize: '12px', color: '#ffcc00', fontWeight: 800, marginBottom: '14px' }}>
          <i className="fa-solid fa-paw"></i> +{reward} HOWL
        </div>

        <div
          id="ft-modal-body"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '12px 14px',
            marginBottom: '16px',
            textAlign: 'left',
            fontSize: '12px',
            color: 'rgba(255, 255, 255, 0.85)',
            lineHeight: 1.55
          }}
        >
          {stepsContent}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            id="ft-modal-action-btn"
            onClick={() => onLaunch(task)}
            style={{
              flex: 1,
              borderRadius: '12px',
              padding: '12px',
              fontSize: '13px',
              fontWeight: 800,
              background: '#ffcc00',
              color: '#000',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            {isRegularChannel ? (
              <>
                <i className="fa-solid fa-arrow-up-right-from-square"></i> Join Channel
              </>
            ) : (
              <>
                <i className="fa-solid fa-arrow-up-right-from-square"></i> Open App
              </>
            )}
          </button>

          <button
            onClick={onClose}
            style={{
              borderRadius: '12px',
              padding: '12px 16px',
              fontSize: '13px',
              fontWeight: 700,
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              border: '1px solid var(--border-soft)',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
