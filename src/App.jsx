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
    isGateVerified,
    setIsGateVerified,
    isBanned,
    banReason,
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
    playHowlAudio
  } = useApp();

  const handleSplashEnter = () => {
    playHowlAudio();
    setSplashOpen(false);
  };

  const handleGateVerified = () => {
    setIsGateVerified(true);
  };

  const renderActiveView = () => {
    switch (activeView) {
      case 'tasks-view':
        return <TasksView />;
      case 'quick-view':
        return <QuickView />;
      case 'withdraw-view':
        return <WithdrawView />;
      case 'team-view':
        return <TeamView />;
      case 'profile-view':
        return <ProfileView />;
      case 'history-view':
        return <HistoryView />;
      case 'leaderboard-view':
        return <LeaderboardView />;
      case 'admin-view':
        return <AdminView />;
      case 'home-view':
      default:
        return <HomeView />;
    }
  };

  return (
    <>
      {/* Top Notification Popup Banner */}
      <TopBanner notification={notification} onDismiss={dismissTopNotification} />

      {/* Animated Night Sky Background */}
      <NightSky />

      {/* Splash Screen */}
      {splashOpen && <SplashScreen onEnter={handleSplashEnter} />}

      {/* Mandatory Channel Gate */}
      {!isGateVerified && !splashOpen && (
        <ChannelGate userId={user.id} onVerified={handleGateVerified} onHaptic={triggerHaptic} />
      )}

      {/* Multi-Account Ban Screen */}
      <BanScreen isBanned={isBanned} reason={banReason} />

      {/* Admin Entry Choice Modal */}
      <AdminEntryModal
        isOpen={adminChoiceModal}
        onEnterUser={() => setAdminChoiceModal(false)}
        onEnterAdmin={() => {
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
          // In React, launch adsgram
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
          if (task?.invite_link) {
            if (window.Telegram?.WebApp?.openTelegramLink) {
              window.Telegram.WebApp.openTelegramLink(task.invite_link);
            } else {
              window.open(task.invite_link, '_blank');
            }
          }
        }}
      />

      {/* Main Container */}
      <div className="container">
        <main id="main-content">{renderActiveView()}</main>

        {/* Bottom Navigation */}
        <BottomNav activeView={activeView} onViewChange={setActiveView} onHaptic={triggerHaptic} />
      </div>

      {/* Migration Switch Button for Testing */}
      <LegacySwitchBanner />
    </>
  );
}
