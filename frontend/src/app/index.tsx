// src/app/index.tsx
import React, { useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import Navbar, { RouteName } from '../components/Navbar';
import LandingPage from '../screens/LandingPage';
import LessonsPage from '../screens/LessonsPage';
import AdminPage from '../screens/AdminPage';
import ProfilePage from '../screens/ProfilePage';
import SimulationPage from '../screens/SimulationPage';
import AuthPage, { UserSession } from '../screens/AuthPage';

const SESSION_STORAGE_KEY = 'learn-portal-user';

function getStoredUser(): UserSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedUser = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return storedUser ? JSON.parse(storedUser) as UserSession : null;
  } catch {
    return null;
  }
}

function storeUser(user: UserSession) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
  }
}

function clearStoredUser() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(getStoredUser);
  const [currentRoute, setCurrentRoute] = useState<RouteName>('auth');

  const handleLoginSuccess = (user: UserSession) => {
    setCurrentUser(user);
    storeUser(user);
    if (user.role === 'admin') {
      setCurrentRoute('admin');
    } else {
      setCurrentRoute('landing');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    clearStoredUser();
    setCurrentRoute('auth');
  };

  const renderScreen = () => {
    if (!currentUser) {
      return <AuthPage onLoginSuccess={handleLoginSuccess} />;
    }

    switch (currentRoute) {
      case 'landing':
        return <LandingPage onNavigate={setCurrentRoute} />;
      case 'lessons':
        return <LessonsPage userId={currentUser.id} />;
      case 'simulation':
        return (
          <SimulationPage
            initialSim="arm"
            onSimChange={(sim) => setCurrentRoute(sim === 'arm' ? 'simulation' : 'nav-simulation')}
          />
        );
      case 'nav-simulation':
        return (
          <SimulationPage
            initialSim="navigation"
            onSimChange={(sim) => setCurrentRoute(sim === 'arm' ? 'simulation' : 'nav-simulation')}
          />
        );
      case 'admin':
        return <AdminPage adminId={currentUser.id} />;
      case 'profile':
        return (
          <ProfilePage
            userId={currentUser.id}
            username={currentUser.username}
            email={currentUser.email}
          />
        );
      default:
        return <LandingPage onNavigate={setCurrentRoute} />;
    }
  };

  return (
    <SafeAreaView nativeID="app-shell" style={styles.container}>
      {currentUser && (
        <Navbar 
          currentRoute={currentRoute} 
          onNavigate={setCurrentRoute} 
          userRole={currentUser.role}
          onLogout={handleLogout} 
        />
      )}
      {renderScreen()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#101b35' },
});