import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../../context/AppContext';
import { quickTasksCall, API_BASE_URL } from '../../../services/api';

const FT_TG_SVG = (
  <svg className="ft-icon-svg" viewBox="0 0 24 24">
    <path
      fill="var(--accent-main)"
      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"
    />
  </svg>
);

export default function FeaturedTasksSection() {
  const { triggerHaptic, showTopNotification, refreshBalance, setFtModal } = useApp();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [miniappTimers, setMiniappTimers] = useState({});
  const timerIntervalRef = useRef(null);

  const sortTasks = (taskList) => {
    if (!Array.isArray(taskList)) return [];
    const boinkerOrder = {
      boinkers_open: 1,
      boinkers_spins: 2,
      boinkers_moon: 3
    };
    return [...taskList].sort((a, b) => {
      const aBk = a.id && a.id.startsWith('boinkers_');
      const bBk = b.id && b.id.startsWith('boinkers_');
      if (aBk && bBk) {
        return (boinkerOrder[a.id] || 99) - (boinkerOrder[b.id] || 99);
      }
      if (aBk && !bBk) return -1;
      if (!aBk && bBk) return 1;

      const aDone = !!a.done;
      const bDone = !!b.done;
      if (!aDone && bDone) return -1;
      if (aDone && !bDone) return 1;

      return (Number(b.created_at) || 0) - (Number(a.created_at) || 0);
    });
  };

  const loadTasks = async () => {
    try {
      const res = await quickTasksCall('featured_list');
      if (res && res.success && Array.isArray(res.tasks)) {
        setTasks(sortTasks(res.tasks));
      }
    } catch (e) {
      console.error('Failed to load featured tasks:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  // Timer loop for miniapp 15-second countdowns
  useEffect(() => {
    timerIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const updated = {};
      tasks.forEach((t) => {
        if (t.type === 'miniapp' && !t.done) {
          const startTime = Number(localStorage.getItem('ft_miniapp_' + t.id) || 0);
          if (startTime) {
            const elapsed = Math.floor((now - startTime) / 1000);
            if (elapsed < 15) {
              updated[t.id] = 15 - elapsed;
            }
          }
        }
      });
      setMiniappTimers((prev) => {
        const prevKeys = Object.keys(prev);
        const newKeys = Object.keys(updated);
        if (prevKeys.length === 0 && newKeys.length === 0) return prev;
        const changed = newKeys.length !== prevKeys.length || newKeys.some((k) => prev[k] !== updated[k]);
        return changed ? updated : prev;
      });
    }, 1000);

    return () => clearInterval(timerIntervalRef.current);
  }, [tasks]);

  const openLink = (url) => {
    if (!url) return;
    try {
      if (window.Telegram?.WebApp?.openTelegramLink && (url.includes('t.me/') || url.startsWith('tg:'))) {
        window.Telegram.WebApp.openTelegramLink(url);
      } else if (window.Telegram?.WebApp?.openLink) {
        window.Telegram.WebApp.openLink(url);
      } else {
        window.open(url, '_blank');
      }
    } catch (e) {
      window.open(url, '_blank');
    }
  };

  const handleGoChannel = (task) => {
    triggerHaptic('light');
    localStorage.setItem('ft_started_' + task.id, '1');
    openLink(task.invite_link);
    setTasks((prev) => [...prev]); // Trigger re-render
  };

  const handleRejoinChannel = (task) => {
    triggerHaptic('light');
    openLink(task.invite_link);
  };

  const handleGoMiniApp = (task) => {
    triggerHaptic('light');
    localStorage.setItem('ft_miniapp_' + task.id, String(Date.now()));
    openLink(task.link || task.invite_link);
    setTasks((prev) => [...prev]);
  };


  const [claimingId, setClaimingId] = useState(null);
  const [claimStageText, setClaimStageText] = useState('Checking...');

  const handleClaim = async (task) => {
    if (claimingId) return;
    setClaimingId(task.id);
    triggerHaptic('medium');

    let step = 0;
    const stages = ['Checking...', 'Verifying...', 'Crediting HOWL...', 'Finalizing...'];
    setClaimStageText(stages[0]);
    const stageTimer = setInterval(() => {
      step = (step + 1) % stages.length;
      setClaimStageText(stages[step]);
    }, 700);

    try {
      const res = await quickTasksCall('featured_claim', { taskId: task.id });
      clearInterval(stageTimer);
      setClaimingId(null);

      if (res && res.success) {
        triggerHaptic('success');
        localStorage.removeItem('ft_miniapp_' + task.id);
        showTopNotification('TASK COMPLETED!', `+${Number(task.reward).toLocaleString()} HOWL added to your balance`, 'gold');
        refreshBalance();
        setTasks((prev) =>
          sortTasks(prev.map((t) => (t.id === task.id ? { ...t, done: true } : t)))
        );
      } else {
        triggerHaptic('error');
        const errorMsg = res?.message || 'Please complete the task requirements first.';
        setFtModal({
          open: true,
          task,
          errorMsg
        });
      }
    } catch (err) {
      clearInterval(stageTimer);
      setClaimingId(null);
      triggerHaptic('error');
      showTopNotification('ERROR', 'Failed to verify task completion.', 'error');
    }
  };

  if (loading || tasks.length === 0) return null;

  return (
    <div id="featured-tasks-section" style={{ marginTop: '20px' }}>
      <div className="section-header-row">
        <div className="left">
          <span className="dot"></span> FEATURED TASKS
        </div>
      </div>

      <div id="featured-tasks-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {tasks.map((task) => {
          const isGolden = task.golden_glow || (task.id && task.id.startsWith('boinkers_'));
          const glowClass = isGolden ? ' golden-glow-task' : '';

          let iconElement = null;
          if (task.type === 'channel') {
            const avatar = task.avatar_url
              ? task.avatar_url.startsWith('http')
                ? task.avatar_url
                : API_BASE_URL + task.avatar_url
              : '';
            if (task.has_photo && avatar) {
              iconElement = <img src={avatar} className="ft-icon-img" alt="" />;
            } else {
              iconElement = FT_TG_SVG;
            }
          } else {
            const iconSrc = task.icon_url || task.avatar_url;
            if (iconSrc) {
              const fullSrc = iconSrc.startsWith('http') ? iconSrc : API_BASE_URL + iconSrc;
              iconElement = <img src={fullSrc} className="ft-icon-img" alt="" />;
            } else {
              iconElement = <i className="fa-solid fa-gamepad" style={{ color: 'var(--accent-main)', fontSize: '20px' }}></i>;
            }
          }

          const startedChannel = localStorage.getItem('ft_started_' + task.id) === '1';
          const isBk = task.id && task.id.startsWith('boinkers_');
          const playLabel = isBk ? 'PLAY' : 'JOIN';
          const waitSeconds = miniappTimers[task.id];

          return (
            <div key={task.id} className={`glass-card featured-task-card${glowClass}`} id={`ft-card-${task.id}`}>
              <div className="ft-icon-col">{iconElement}</div>

              <div className="ft-info-col">
                <div className="ft-title" title={task.title}>
                  {task.title}
                  {isGolden && (
                    <span className="golden-partner-badge">
                      <i className="fa-solid fa-star"></i> BOINKERS
                    </span>
                  )}
                </div>

                {task.description && <div className="ft-desc">{task.description}</div>}

                <div className="ft-reward">
                  <i className="fa-solid fa-paw"></i> +{Number(task.reward).toLocaleString()} HOWL
                </div>

                {task.slots_left !== null && task.slots_left !== undefined && !task.done && (
                  <div
                    style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      fontWeight: 600,
                      marginTop: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <i className="fa-solid fa-users" style={{ color: 'var(--accent-main)', fontSize: '9px' }}></i>{' '}
                    {Number(task.slots_left).toLocaleString()} spots left
                  </div>
                )}
              </div>

              <div className="ft-actions-col">
                {task.done ? (
                  <button className="ft-btn ft-btn-done" disabled>
                    <i className="fa-solid fa-check"></i> DONE
                  </button>
                ) : task.type === 'channel' ? (
                  !startedChannel ? (
                    <button className="ft-btn ft-btn-go" onClick={() => handleGoChannel(task)}>
                      GO <i className="fa-solid fa-arrow-right"></i>
                    </button>
                  ) : (
                    <>
                      <button className="ft-btn ft-btn-join" onClick={() => handleRejoinChannel(task)}>
                        {playLabel} <i className="fa-solid fa-arrow-up-right-from-square"></i>
                      </button>
                      <button
                        className="ft-btn ft-btn-claim"
                        disabled={claimingId === task.id}
                        onClick={() => handleClaim(task)}
                      >
                        {claimingId === task.id ? (
                          <>
                            <i className="fa-solid fa-spinner fa-spin"></i> {claimStageText}
                          </>
                        ) : (
                          'CLAIM'
                        )}
                      </button>
                    </>
                  )
                ) : task.type === 'miniapp' ? (
                  !localStorage.getItem('ft_miniapp_' + task.id) ? (
                    <button className="ft-btn ft-btn-go" onClick={() => handleGoMiniApp(task)}>
                      GO <i className="fa-solid fa-arrow-right"></i>
                    </button>
                  ) : waitSeconds !== undefined && waitSeconds > 0 ? (
                    <button className="ft-btn ft-btn-wait" disabled>
                      WAIT {waitSeconds}s
                    </button>
                  ) : (
                    <button
                      className="ft-btn ft-btn-claim"
                      disabled={claimingId === task.id}
                      onClick={() => handleClaim(task)}
                    >
                      {claimingId === task.id ? (
                        <>
                          <i className="fa-solid fa-spinner fa-spin"></i> {claimStageText}
                        </>
                      ) : (
                        'CLAIM'
                      )}
                    </button>
                  )
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
