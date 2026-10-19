import React from 'react';
import { useApp } from './context/AppContext';
import NightSky from './components/Background/NightSky';
import TopBanner from './components/Notifications/TopBanner';
import BottomNav from './components/Navigation/BottomNav';
import SplashScreen from './components/Modals/SplashScreen';
import ChannelGate from './components/Modals/ChannelGate';
import BanScreen from './components/Modals/BanScreen';
import AdminEntryModal from './components/Modals/AdminEntryModal';
import TosModal from './components/Modals/TosModal';
import AdsGramPreWatchModal from './components/Modals/AdsGramPreWatchModal';
import AdsGramCompletedModal from './components/Modals/AdsGramCompletedModal';
import FeaturedTaskModal from './components/Modals/FeaturedTaskModal';
import LegacySwitchBanner from './components/Common/LegacySwitchBanner';

import HomeView from './components/Views/HomeView/HomeView';
import TasksView from './components/Views/TasksView/TasksView';
import QuickView from './components/Views/QuickView/QuickView';
import WithdrawView from './components/Views/WithdrawView/WithdrawView';
import TeamView from './components/Views/TeamView/TeamView';
import ProfileView from './components/Views/ProfileView/ProfileView';
import HistoryView from './components/Views/HistoryView/HistoryView';
import LeaderboardView from './components/Views/LeaderboardView/LeaderboardView';
import AdminView from './components/Views/AdminView/AdminView';

export default function App() {
  const {
    user,
    activeView,
    setActiveView,
    leaderboardSource,
    isGateVerified,
    setIsGateVerified,
    isBanned,
    banReason,
    isAdmin,
    adminChoiceModal,
    setAdminChoiceModal,
    splashOpen,
    setSplashOpen,
    tosOpen,
    setTosOpen,
    adsrPreModalOpen,
    setAdsrPreModalOpen,
    adsrCompletedModal,
    setAdsrCompletedModal,
    ftModal,
    setFtModal,
    notification,
    dismissTopNotification,
    triggerHaptic,
    playHowlAudio,
    triggerAdsrStartWatch
  } = useApp();

  const handleSplashEnter = React.useCallback(() => {
    playHowlAudio();
    setSplashOpen(false);
  }, [playHowlAudio, setSplashOpen]);

  const handleGateVerified = React.useCallback(() => {
    setIsGateVerified(true);
  }, [setIsGateVerified]);

  return (
    <>
      {/* Top Notification Popup Banner */}
      <TopBanner notification={notification} onDismiss={dismissTopNotification} />

      {/* Animated Night Sky Background */}
      <NightSky />

      {/* Splash Screen */}
      {splashOpen && <SplashScreen onEnter={handleSplashEnter} />}

      {/* Mandatory Channel Gate (exempts admin users) */}
      {!isGateVerified && !isAdmin && !splashOpen && (
        <ChannelGate userId={user.id} onVerified={handleGateVerified} onHaptic={triggerHaptic} />
      )}

      {/* Multi-Account Ban Screen */}
      <BanScreen isBanned={isBanned} reason={banReason} />

      {/* Admin Entry Choice Modal */}
      <AdminEntryModal
        isOpen={adminChoiceModal}
        onEnterUser={() => {
          try { sessionStorage.setItem('howl_admin_mode_chosen', 'user'); } catch (e) {}
          setAdminChoiceModal(false);
        }}
        onEnterAdmin={() => {
          try { sessionStorage.setItem('howl_admin_mode_chosen', 'admin'); } catch (e) {}
          setAdminChoiceModal(false);
          setActiveView('admin-view');
        }}
      />

      {/* Terms of Service Rules Modal */}
      <TosModal isOpen={tosOpen} onClose={() => setTosOpen(false)} onHaptic={triggerHaptic} />

      {/* AdsGram Pre-Watch Tutorial Modal */}
      <AdsGramPreWatchModal
        isOpen={adsrPreModalOpen}
        onClose={() => setAdsrPreModalOpen(false)}
        onConfirm={() => {
          setAdsrPreModalOpen(false);
          triggerAdsrStartWatch();
        }}
      />

      {/* AdsGram Completed Summary Modal */}
      <AdsGramCompletedModal
        data={adsrCompletedModal}
        onClose={() => setAdsrCompletedModal({ ...adsrCompletedModal, open: false })}
      />

      {/* Featured Task Guidance Modal */}
      <FeaturedTaskModal
        data={ftModal}
        onClose={() => setFtModal({ ...ftModal, open: false })}
        onLaunch={(task) => {
          setFtModal({ ...ftModal, open: false });
          const targetUrl = task?.invite_link || task?.link;
          if (targetUrl) {
            if (window.Telegram?.WebApp?.openTelegramLink && (targetUrl.includes('t.me/') || targetUrl.startsWith('tg:'))) {
              window.Telegram.WebApp.openTelegramLink(targetUrl);
            } else if (window.Telegram?.WebApp?.openLink) {
              window.Telegram.WebApp.openLink(targetUrl);
            } else {
              window.open(targetUrl, '_blank');
            }
          }
        }}
      />


      {/* Main Container - All views mounted simultaneously matching legacy.html DOM */}
      <div className="container">
        <main id="main-content">
          <HomeView isActive={activeView === 'home-view'} />
          <TasksView isActive={activeView === 'tasks-view'} />
          <QuickView isActive={activeView === 'quick-view'} />
          <WithdrawView isActive={activeView === 'withdraw-view'} />
          <TeamView isActive={activeView === 'team-view'} />
          <ProfileView isActive={activeView === 'profile-view'} />
          <HistoryView isActive={activeView === 'history-view'} />
          <LeaderboardView isActive={activeView === 'leaderboard-view'} />
          {isAdmin && <AdminView isActive={activeView === 'admin-view'} />}
        </main>

        {/* Bottom Navigation */}
        {activeView !== 'admin-view' && (
          <BottomNav
            activeView={activeView}
            leaderboardSource={leaderboardSource}
            onViewChange={setActiveView}
            onHaptic={triggerHaptic}
          />
        )}
      </div>

      {/* Migration Switch Button for Testing */}
      <LegacySwitchBanner />
    </>
  );
}
