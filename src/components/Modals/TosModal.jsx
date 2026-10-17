import React from 'react';

export default function TosModal({ isOpen, onClose, onHaptic }) {
  if (!isOpen) return null;

  return (
    <div id="tosModal" className={`full-screen-modal ${isOpen ? 'active' : ''}`}>
      <div className="modal-content">
        <h2 style={{ color: 'var(--accent-orange)' }}>
          <i className="fa-solid fa-triangle-exclamation"></i> Rules
        </h2>
        <p>
          1. No VPNs, Proxies, or Emulators.
          <br /><br />
          2. Multiple accounts will trigger an automatic, unappealable ban.
          <br /><br />
          3. Rewards sync directly to your Bot Wallet.
        </p>
        <button
          className="modal-btn"
          onClick={() => {
            if (onHaptic) onHaptic('light');
            onClose();
          }}
        >
          I Understand
        </button>
      </div>
    </div>
  );
}
