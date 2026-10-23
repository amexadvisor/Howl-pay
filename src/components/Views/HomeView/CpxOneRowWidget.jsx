import React, { useEffect, useState } from 'react';
import { useApp } from '../../../context/AppContext';

export default function CpxOneRowWidget() {
  const { user, setActiveView, triggerHaptic } = useApp();
  const [surveyCount, setSurveyCount] = useState(null);

  useEffect(() => {
    if (!user?.id) return;

    let isMounted = true;
    const apiBase = (typeof window !== 'undefined' && window.API_BASE_URL) || 'https://howlearn.duckdns.org';

    // 1. Fetch authenticated secure_hash for the current user
    fetch(`${apiBase}/api/cpx-postback?action=url&user_id=${encodeURIComponent(user.id)}&username=${encodeURIComponent(user.username || user.first_name || '')}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;

        const appId = Number(data?.app_id || 35131);
        const secureHash = data?.secure_hash || '';

        // CPX Research Script Config (Design 4 - One Row Content Widget)
        const script1 = {
          div_id: 'onerow',
          theme_style: 7, // 7 = One row layout
          order_by: 1, // 1 = Best score
          display_mode: 3,
          limit_surveys: 8
        };

        const config = {
          general_config: {
            app_id: appId,
            ext_user_id: String(user.id),
            secure_hash: secureHash,
            username: user.username || user.first_name || '',
            subid_1: '',
            subid_2: ''
          },
          style_config: {
            text_color: '#2b2b2b',
            survey_box: {
              topbar_background_color: '#1DA05E',
              box_background_color: 'white',
              rounded_borders: true,
              stars_filled: '#ffaf20',
              stars_empty: 'rgb(221 221 221)',
              accent_color_small_box: '#f59e0b',
              place_stars_bottom_small_box: true
            }
          },
          script_config: [script1],
          debug: false,
          useIFrame: true,
          iFramePosition: 3,
          functions: {
            no_surveys_available: () => {
              if (isMounted) setSurveyCount(0);
            },
            count_new_surveys: (count) => {
              if (isMounted) setSurveyCount(count);
            }
          }
        };

        window.config = config;

        // Clean up previous script instance if exists to re-render fresh
        const existingScript = document.getElementById('cpx-script-tag');
        if (existingScript) existingScript.remove();

        const s = document.createElement('script');
        s.id = 'cpx-script-tag';
        s.type = 'text/javascript';
        s.src = `https://cdn.cpx-research.com/assets/js/script_tag_v2.0.js?t=${Date.now()}`;
        s.async = true;
        document.body.appendChild(s);
      })
      .catch((err) => {
        console.warn('[CPX Widget] Init error:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [user?.id, user?.username, user?.first_name]);

  // If CPX explicitly called no_surveys_available, hide the widget container
  if (surveyCount === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: '16px', marginBottom: '8px' }}>
      <div className="section-header-row" style={{ marginBottom: '10px' }}>
        <div className="left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="dot"></span>
          <span>CPX SURVEYS</span>
          <span
            style={{
              fontSize: '9px',
              fontWeight: 800,
              padding: '1px 6px',
              borderRadius: '6px',
              background: 'rgba(245, 158, 11, 0.2)',
              color: '#f59e0b',
              letterSpacing: '0.5px'
            }}
          >
            ONE ROW
          </span>
        </div>
        <div
          className="right clickable"
          onClick={() => {
            triggerHaptic('light');
            setActiveView('tasks-view');
          }}
          style={{
            fontSize: '11px',
            color: 'var(--accent-main)',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <span>All Surveys</span>
          <i className="fa-solid fa-chevron-right" style={{ fontSize: '9px' }}></i>
        </div>
      </div>

      {/* One Row Survey Widget Mount Point */}
      <div
        style={{
          width: '100%',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: '2px'
        }}
      >
        <div id="onerow" style={{ width: '100%', minHeight: '100px' }}></div>
      </div>
    </div>
  );
}
