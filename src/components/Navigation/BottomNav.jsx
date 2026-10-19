import React from 'react';
import LottieAnimation from '../Common/LottieAnimation';

export default function BottomNav({ activeView, leaderboardSource, onViewChange, onHaptic }) {
  const handleNavClick = (viewId) => {
    if (onHaptic) onHaptic('light');
    onViewChange(viewId);
  };

  const isHomeActive =
    activeView === 'home-view' ||
    (activeView === 'leaderboard-view' && leaderboardSource !== 'profile-view');

  const isTasksActive = activeView === 'tasks-view';

  const isTeamActive = activeView === 'team-view';

  const isProfileActive =
    activeView === 'profile-view' ||
    activeView === 'history-view' ||
    (activeView === 'leaderboard-view' && leaderboardSource === 'profile-view');

  return (
    <nav className="bottom-nav" id="bottom-nav">
      <button
        className={`nav-item ${isHomeActive ? 'active' : ''}`}
        onClick={() => handleNavClick('home-view')}
      >
        <i className="fa-solid fa-house"></i> Home
      </button>

      <button
        className={`nav-item ${isTasksActive ? 'active' : ''}`}
        onClick={() => handleNavClick('tasks-view')}
      >
        <i className="fa-solid fa-bolt"></i> Earn
      </button>

      <button
        className="nav-item center-btn"
        onClick={() => handleNavClick('home-view')}
      >
        <div className="center-icon-wrap">
          <div className="center-inner" id="nav-wolf-lottie" style={{ padding: '12px' }}>
            <LottieAnimation
              path="/assets/wolf-emoji.json"
              style={{ width: '100%', height: '100%' }}
              fallbackIcon="fa-solid fa-paw"
            />
          </div>
        </div>
        <span style={{ marginTop: '24px' }}>Play</span>
      </button>

      <button
        className={`nav-item ${isTeamActive ? 'active' : ''}`}
        onClick={() => handleNavClick('team-view')}
      >
        <i className="fa-solid fa-share-nodes"></i> Friends
      </button>

      <button
        className={`nav-item ${isProfileActive ? 'active' : ''}`}
        onClick={() => handleNavClick('profile-view')}
      >
        <i className="fa-regular fa-user"></i> Me
      </button>
    </nav>
  );
}
