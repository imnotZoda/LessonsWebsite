// src/components/nav-sim/NavSimulation.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function NavSimulation() {
  return (
    <View style={styles.fallback}>
      <Text style={styles.title}>Autonomous Navigation & Optimal Path Planning</Text>
      <Text style={styles.body}>
        The interactive 2D navigation simulation runs in the web app. Open EduSphere in a browser, sign in, and choose
        Autonomous Navigation to place the robot, set a destination, draw obstacles, and inspect live A* pathfinding solutions.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12
  },
  title: { fontSize: 18, fontWeight: '700', color: '#f8f4fa' },
  body: { fontSize: 14, lineHeight: 21, color: '#c4c9d8', textAlign: 'center', maxWidth: 440 }
});
