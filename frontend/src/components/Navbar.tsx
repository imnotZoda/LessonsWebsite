// src/components/Navbar.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export type RouteName = 'landing' | 'lessons' | 'simulation' | 'nav-simulation' | 'admin' | 'profile' | 'auth';

interface NavbarProps {
  currentRoute: RouteName;
  onNavigate: (route: RouteName) => void;
  userRole?: 'admin' | 'user';
  onLogout: () => void;
}

export default function Navbar({ currentRoute, onNavigate, userRole = 'user', onLogout }: NavbarProps) {
  return (
    <View nativeID="app-navbar" style={styles.navbar}>
      <TouchableOpacity onPress={() => onNavigate('landing')}>
        <Text style={styles.logo}>EduSphere</Text>
      </TouchableOpacity>

      <View style={styles.navLinks}>
        <TouchableOpacity 
          style={[styles.link, currentRoute === 'landing' && styles.activeLink]} 
          onPress={() => onNavigate('landing')}
        >
          <Text style={styles.linkText}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.link, currentRoute === 'lessons' && styles.activeLink]} 
          onPress={() => onNavigate('lessons')}
        >
          <Text style={styles.linkText}>Lessons</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.link, currentRoute === 'nav-simulation' && styles.activeLink]} 
          onPress={() => onNavigate('nav-simulation')}
        >
          <Text style={styles.linkText}>Navigation Sim</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.link, currentRoute === 'simulation' && styles.activeLink]} 
          onPress={() => onNavigate('simulation')}
        >
          <Text style={styles.linkText}>Arm Sim</Text>
        </TouchableOpacity>

        {userRole === 'admin' && (
          <TouchableOpacity 
            style={[styles.link, currentRoute === 'admin' && styles.activeLink]} 
            onPress={() => onNavigate('admin')}
          >
            <Text style={styles.linkText}>Admin Panel</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity 
          style={[styles.link, currentRoute === 'profile' && styles.activeLink]} 
          onPress={() => onNavigate('profile')}
        >
          <Text style={styles.linkText}>Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.link, styles.logoutBtn]} onPress={onLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navbar: {
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  logo: { fontSize: 21, fontWeight: '800', color: '#ffffff', letterSpacing: 0.3 },
  navLinks: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  link: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 9 },
  activeLink: { backgroundColor: 'rgba(224, 86, 63, 0.28)' },
  linkText: { color: '#f8f4fa', fontSize: 14, fontWeight: '600' },
  logoutBtn: { backgroundColor: '#e0563f', marginLeft: 4 },
  logoutText: { color: '#ffffff', fontSize: 13, fontWeight: '700' }
});