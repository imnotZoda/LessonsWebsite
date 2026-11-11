// src/components/nav-sim/NavSimulation.web.tsx
import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import NavCanvas, { NavCanvasHandle } from './NavCanvas.web';
import NavExplanationPanel from './NavExplanationPanel';
import {
  RobotState,
  PathResult,
  Point,
  GridCoord,
  NavConfig,
  SensorData,
  NavTelemetry
} from './types';
import { createInitialRobot } from './motionModel';

export default function NavSimulation() {
  const canvasHandleRef = useRef<NavCanvasHandle | null>(null);

  const [robot, setRobot] = useState<RobotState>(createInitialRobot(1.5, 1.5, 0));
  const [startPos, setStartPos] = useState<Point>({ x: 1.5, y: 1.5 });
  const [goalPos, setGoalPos] = useState<Point>({ x: 12.5, y: 7.5 });
  const [startCoord, setStartCoord] = useState<GridCoord>({ r: 3, c: 3 });
  const [goalCoord, setGoalCoord] = useState<GridCoord>({ r: 15, c: 25 });
  const [obstacleCount, setObstacleCount] = useState<number>(36);
  const [selectedSubtopic, setSelectedSubtopic] = useState<string>('L16.1');
  const [isExplanationCollapsed, setIsExplanationCollapsed] = useState(false);

  const [config, setConfig] = useState<NavConfig>({
    rows: 18,
    cols: 28,
    cellSize: 0.5,
    robotRadius: 0.35,
    safetyMargin: 0.15,
    wheelBase: 0.40,
    wheelRadius: 0.08,
    maxVelocity: 1.4,
    maxAngularVelocity: 2.5,
    maxAccel: 2.0,
    maxLateralAccel: 1.8,
    sensorRange: 3.5,
    algorithm: 'astar',
    heuristic: 'euclidean',
    allowDiagonal: true,
    smoothPath: true
  });

  const [sensor, setSensor] = useState<SensorData>({
    distance: 3.5,
    hit: false,
    maxRange: 3.5
  });

  const [telemetry, setTelemetry] = useState<NavTelemetry>({
    showPathVsTrajectory: false,
    replanCount: 0,
    collisionCount: 0,
    replanAlert: null,
    activeLoopStep: 1,
    inflatedCellsCount: 68,
    currentAccel: 0,
    brakingDistance: 0,
    turnSpeedCap: 1.4,
    turnWarning: false
  });

  const [pathResult, setPathResult] = useState<PathResult>({
    found: true,
    path: [{ x: 1.5, y: 1.5 }, { x: 12.5, y: 7.5 }],
    rawGridPath: [],
    nodesExplored: 42,
    totalDistance: 13.2,
    directDistance: 12.5,
    efficiencyRatio: 94.7,
    estimatedTime: 12.5,
    exploredGrid: [],
    frontierGrid: [],
    searchTimeMs: 0.4
  });

  const handlePathChange = (
    result: PathResult,
    sPos: Point,
    gPos: Point,
    sCoord: GridCoord,
    gCoord: GridCoord
  ) => {
    setPathResult(result);
    setStartPos(sPos);
    setGoalPos(gPos);
    setStartCoord(sCoord);
    setGoalCoord(gCoord);
  };

  const handleGridChange = (_grid: boolean[][], count: number) => {
    setObstacleCount(count);
  };

  const handleTelemetryChange = (partial: Partial<NavTelemetry>) => {
    setTelemetry((prev) => ({ ...prev, ...partial }));
  };

  const handleTogglePathVsTrajectory = () => {
    setTelemetry((prev) => ({
      ...prev,
      showPathVsTrajectory: !prev.showPathVsTrajectory
    }));
  };

  const handleSpawnDynamicObstacle = () => {
    canvasHandleRef.current?.spawnDynamicObstacle();
    setTelemetry((prev) => ({
      ...prev,
      replanCount: prev.replanCount + 1,
      replanAlert: '[REPLAN TRIGGERED: Path Blocked by Dynamic Obstacle]'
    }));

    setTimeout(() => {
      setTelemetry((prev) => ({ ...prev, replanAlert: null }));
    }, 3500);
  };

  return (
    <View style={styles.layout}>
      {/* 2D Interactive Map on Left */}
      <View style={styles.mapSide}>
        <NavCanvas
          ref={canvasHandleRef}
          showPathVsTrajectory={telemetry.showPathVsTrajectory}
          onRobotChange={setRobot}
          onPathChange={handlePathChange}
          onConfigChange={setConfig}
          onGridChange={handleGridChange}
          onSensorChange={setSensor}
          onTelemetryChange={handleTelemetryChange}
        />
        <View style={styles.hintCard}>
          <Text style={styles.hintIcon}>💡</Text>
          <Text style={styles.hintText}>
            <Text style={styles.hintBold}>Interactive Navigation:</Text> Drag or click to place the{' '}
            <Text style={{ color: '#38bdf8', fontWeight: '700' }}>Robot (Start)</Text> or{' '}
            <Text style={{ color: '#e0563f', fontWeight: '700' }}>Goal (Destination)</Text> anywhere on the map.
            Select any subtopic tab <Text style={{ color: '#38bdf8', fontWeight: '700' }}>L16.1–L16.10</Text> in the panel
            to inspect real-time mathematical models, live telemetry, and control loop execution.
          </Text>
        </View>
      </View>

      {/* Computations and Worked Solutions Panel on Right */}
      {isExplanationCollapsed ? (
        <View style={styles.collapsedRail}>
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setIsExplanationCollapsed(false)}
            accessibilityLabel="Show explanation panel"
            accessibilityRole="button"
          >
            <Text style={styles.toggleButtonText}>‹</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.solutionSide}>
          <TouchableOpacity
            style={styles.collapseButton}
            onPress={() => setIsExplanationCollapsed(true)}
            accessibilityLabel="Hide explanation panel"
            accessibilityRole="button"
          >
            <Text style={styles.collapseButtonText}>›</Text>
          </TouchableOpacity>
          <NavExplanationPanel
            robot={robot}
            startPos={startPos}
            goalPos={goalPos}
            startCoord={startCoord}
            goalCoord={goalCoord}
            pathResult={pathResult}
            config={config}
            sensor={sensor}
            telemetry={telemetry}
            obstacleCount={obstacleCount}
            totalCells={config.rows * config.cols}
            selectedSubtopic={selectedSubtopic}
            onSelectSubtopic={setSelectedSubtopic}
            onTogglePathVsTrajectory={handleTogglePathVsTrajectory}
            onSpawnDynamicObstacle={handleSpawnDynamicObstacle}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  layout: {
    flex: 1,
    flexDirection: 'row',
    gap: 16,
    padding: 20
  },
  mapSide: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 10
  },
  solutionSide: {
    width: 680,
    maxWidth: '60%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignSelf: 'flex-start',
    marginTop: -8
  },
  collapsedRail: {
    width: 52,
    alignItems: 'center'
  },
  collapseButton: {
    alignSelf: 'flex-end',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(29, 49, 85, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(59, 91, 136, 0.7)',
    marginBottom: -4
  },
  collapseButtonText: {
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '400',
    color: '#9fb9dc'
  },
  toggleButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(22, 34, 63, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(42, 61, 95, 0.75)'
  },
  toggleButtonText: {
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '400',
    color: '#9fb9dc'
  },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131c34',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#243452',
    gap: 10
  },
  hintIcon: {
    fontSize: 16
  },
  hintText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#94a3b8',
    flex: 1
  },
  hintBold: {
    color: '#f8f4fa',
    fontWeight: '700'
  }
});
