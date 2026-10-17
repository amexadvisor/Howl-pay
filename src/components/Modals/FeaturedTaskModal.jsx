import React from 'react';

export default function FeaturedTaskModal({ data, onClose, onLaunch }) {
  if (!data || !data.open) return null;

  const { task, errorMsg } = data;
  const isBoinkers = task?.id === 'partner_boinkers' || task?.isPartner;
  const title = task?.title || 'Task Details';
  const reward = task?.reward || 100;
  const icon = task?.icon || '/assets/boinkers.jpg';

  let bodyContent = errorMsg;
  if (!bodyContent) {
    if (isBoinkers) {
      bodyContent = (
        <>
          <p style={{ margin: '0 0 8px 0' }}>
            Complete the partner requirements in <b>Boinkers</b> to claim your <b>+{reward} HOWL</b> reward!
          </p>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            <li>Open the Boinkers app via the button below</li>
            <li>Play and complete your first in-game spin or task</li>
            <li>Return to HOWL and claim your reward!</li>
          </ul>
        </>
      );
    } else {
      bodyContent = task?.description || 'Open the link, complete the steps, and return to claim your reward.';
    }
  }

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

        <div style={{ display: 'flex', justifyCenter: 'center', alignItems: 'center', margin: '4px auto 12px auto' }}>
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
          {bodyContent}
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
            <i className="fa-solid fa-arrow-up-right-from-square"></i> Open App
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
