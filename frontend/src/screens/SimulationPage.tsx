// src/screens/SimulationPage.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import ArmSimulation from '../components/sim/ArmSimulation';
import NavSimulation from '../components/nav-sim/NavSimulation';

export type SimMode = 'arm' | 'navigation';

interface SimulationPageProps {
  initialSim?: SimMode;
  onSimChange?: (sim: SimMode) => void;
}

export default function SimulationPage({ initialSim = 'navigation', onSimChange }: SimulationPageProps) {
  const [activeSim, setActiveSim] = useState<SimMode>(initialSim);

  useEffect(() => {
    if (initialSim) {
      setActiveSim(initialSim);
    }
  }, [initialSim]);

  const handleSelectSim = (sim: SimMode) => {
    setActiveSim(sim);
    onSimChange?.(sim);
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.topRow}>
          <View style={styles.titleArea}>
            <Text style={styles.title}>
              {activeSim === 'navigation'
                ? 'Autonomous Navigation & Optimal Path Planning'
                : 'Robotic Arm Simulation'}
            </Text>
            <Text style={styles.subtitle}>
              {activeSim === 'navigation'
                ? '2D mobile robot path planning (L16.1–L16.5). Place the robot anywhere and choose any destination on the map. The A* optimization engine computes the fastest collision-free trajectory with real-time differential-drive actuation and worked mathematical solutions in the right panel.'
                : 'Industrial crane manipulator (L15.1–L15.10). Place the crate and the crane autonomously picks and places it — slewing the base (θ₀) and solving shoulder and elbow angles (θ₁, θ₂) by inverse kinematics. Select any subtopic tab (L15.1–L15.10) in the panel to inspect real-time worked solutions dynamically computed with each movement of the object and arm.'}
            </Text>
          </View>

          {/* Sleek Segmented Switcher */}
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[styles.segmentBtn, activeSim === 'navigation' && styles.segmentBtnActive]}
              onPress={() => handleSelectSim('navigation')}
            >
              <Text style={[styles.segmentText, activeSim === 'navigation' && styles.segmentTextActive]}>
                🧭 Autonomous Navigation (L16)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.segmentBtn, activeSim === 'arm' && styles.segmentBtnActive]}
              onPress={() => handleSelectSim('arm')}
            >
              <Text style={[styles.segmentText, activeSim === 'arm' && styles.segmentTextActive]}>
                🦾 Robotic Arm (L15)
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Render Active Simulation */}
      <View style={styles.simContainer}>
        {activeSim === 'navigation' ? <NavSimulation /> : <ArmSimulation />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#101b35',
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)'
  },
  topRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16
  },
  titleArea: {
    flex: 1,
    minWidth: 320,
    gap: 6
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f8f4fa',
    letterSpacing: 0.3
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: '#c4c9d8',
    maxWidth: 780
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#0c1324',
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: '#1e2d4d',
    gap: 4
  },
  segmentBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 7,
    backgroundColor: 'transparent'
  },
  segmentBtnActive: {
    backgroundColor: '#e0563f'
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8'
  },
  segmentTextActive: {
    color: '#ffffff',
    fontWeight: '700'
  },
  simContainer: {
    flex: 1
  }
});
