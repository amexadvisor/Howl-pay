import React, { useEffect } from 'react';

export default function TopBanner({ notification, onDismiss }) {
  const { show, title, message, type = 'gold', icon = null, duration = 4500 } = notification;

  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, duration || 4500);
    return () => clearTimeout(timer);
  }, [show, duration, onDismiss]);

  const getIconClass = () => {
    if (icon) return icon;
    switch (type) {
      case 'success':
        return 'fa-solid fa-circle-check';
      case 'cyan':
        return 'fa-solid fa-paw';
      case 'error':
        return 'fa-solid fa-circle-exclamation';
      case 'gold':
      default:
        return 'fa-solid fa-coins';
    }
  };

  const typeClass = type === 'success' ? 'tn-success' : type === 'cyan' ? 'tn-cyan' : type === 'error' ? 'tn-error' : 'tn-gold';

  return (
    <div
      id="top-notification-banner"
      className={`top-notification-banner ${typeClass} ${show ? 'show' : ''}`}
      onClick={onDismiss}
    >
      <div className="tn-icon-wrap" id="tn-icon-wrap">
        <i id="tn-icon" className={getIconClass()}></i>
      </div>
      <div className="tn-content">
        <div id="tn-title" className="tn-title">{title}</div>
        <div id="tn-message" className="tn-message">{message}</div>
      </div>
      <button
        className="tn-close-btn"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        aria-label="Dismiss"
      >
        <i className="fa-solid fa-xmark"></i>
      </button>
    </div>
  );
}
