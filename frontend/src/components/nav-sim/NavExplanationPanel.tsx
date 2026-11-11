// src/components/nav-sim/NavExplanationPanel.tsx
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import {
  NavConfig,
  PathResult,
  RobotState,
  Point,
  GridCoord,
  NavSubtopicMeta,
  SensorData,
  NavTelemetry
} from './types';

export interface NavExplanationPanelProps {
  robot: RobotState;
  startPos: Point;
  goalPos: Point;
  startCoord: GridCoord;
  goalCoord: GridCoord;
  pathResult: PathResult;
  config: NavConfig;
  sensor: SensorData;
  telemetry: NavTelemetry;
  obstacleCount: number;
  totalCells: number;
  selectedSubtopic?: string;
  onSelectSubtopic?: (id: string) => void;
  onTogglePathVsTrajectory?: () => void;
  onSpawnDynamicObstacle?: () => void;
}

export const NAV_SUBTOPIC_LIST: NavSubtopicMeta[] = [
  { id: 'L16.1', code: 'L16.1', title: 'Differential Drive & Kinematics', badge: 'Kinematics' },
  { id: 'L16.2', code: 'L16.2', title: 'Environment & Grid Mapping', badge: 'Grid Map' },
  { id: 'L16.3', code: 'L16.3', title: 'Sensors & Obstacle Inflation', badge: 'Inflation' },
  { id: 'L16.4', code: 'L16.4', title: 'Path Planning (A*, Dijkstra, Greedy)', badge: 'A* Search' },
  { id: 'L16.5', code: 'L16.5', title: 'Trajectory Planning & Limits', badge: 'Dynamics' },
  { id: 'L16.6', code: 'L16.6', title: 'Path vs. Trajectory', badge: 'Comparison' },
  { id: 'L16.7', code: 'L16.7', title: 'Minimum-Time Navigation', badge: 'Optimization' },
  { id: 'L16.8', code: 'L16.8', title: 'Dynamic Obstacles & Replanning', badge: 'Reactive' },
  { id: 'L16.9', code: 'L16.9', title: 'Python Simulator Architecture', badge: 'Metrics' },
  { id: 'L16.10', code: 'L16.10', title: 'Example Navigation Loop', badge: 'Control Loop' }
];

const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '0.00');
const deg = (rad: number) => `${((rad * 180) / Math.PI).toFixed(1)}°`;

export default function NavExplanationPanel({
  robot,
  startPos,
  goalPos,
  startCoord,
  goalCoord,
  pathResult,
  config,
  sensor,
  telemetry,
  obstacleCount,
  totalCells,
  selectedSubtopic,
  onSelectSubtopic,
  onTogglePathVsTrajectory,
  onSpawnDynamicObstacle
}: NavExplanationPanelProps) {
  const [internalSubtopic, setInternalSubtopic] = useState<string>('L16.1');
  const [isZoomed, setIsZoomed] = useState(false);
  const activeSubtopicId = selectedSubtopic ?? internalSubtopic;
  const tabScrollRef = useRef<any>(null);

  useEffect(() => {
    const el = tabScrollRef.current;
    if (!el) return;
    const node = typeof el.getScrollableNode === 'function' ? el.getScrollableNode() : el;
    if (!node || typeof node.addEventListener !== 'function') return;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        node.scrollLeft += e.deltaY;
      }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  const handleScrollLeft = () => {
    const el = tabScrollRef.current;
    if (!el) return;
    const node = typeof el.getScrollableNode === 'function' ? el.getScrollableNode() : el;
    if (node && typeof node.scrollBy === 'function') {
      node.scrollBy({ left: -160, behavior: 'smooth' });
    } else if (typeof el.scrollTo === 'function') {
      el.scrollTo({ x: 0, animated: true });
    }
  };

  const handleScrollRight = () => {
    const el = tabScrollRef.current;
    if (!el) return;
    const node = typeof el.getScrollableNode === 'function' ? el.getScrollableNode() : el;
    if (node && typeof node.scrollBy === 'function') {
      node.scrollBy({ left: 160, behavior: 'smooth' });
    } else if (typeof el.scrollTo === 'function') {
      el.scrollTo({ x: 500, animated: true });
    }
  };

  const handleSelectSubtopic = (id: string) => {
    setInternalSubtopic(id);
    onSelectSubtopic?.(id);
  };

  const rInflated = config.robotRadius + config.safetyMargin;
  const currentBrakeDist = (robot.v * robot.v) / (2 * Math.max(0.5, config.maxAccel));

  const panelContent = (
    <View style={[styles.card, isZoomed && styles.zoomCard]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.badgeRow}>
          <Text style={styles.eyebrow}>L16 AUTONOMOUS NAVIGATION & OPTIMAL PATH PLANNING</Text>
          <TouchableOpacity
            style={styles.zoomButton}
            onPress={() => setIsZoomed((current) => !current)}
            accessibilityLabel={isZoomed ? 'Close enlarged explanation panel' : 'Enlarge explanation panel'}
            accessibilityRole="button"
          >
            <Text style={styles.zoomButtonText}>{isZoomed ? '×' : '⛶'}</Text>
          </TouchableOpacity>
          <View
            style={[
              styles.statusPill,
              robot.status === 'navigating'
                ? styles.statusActive
                : robot.status === 'reached'
                ? styles.statusReached
                : styles.statusIdle
            ]}
          >
            <Text style={styles.statusPillText}>
              {robot.status === 'navigating'
                ? '● EXECUTING TRAJECTORY'
                : robot.status === 'reached'
                ? '✓ DESTINATION REACHED'
                : 'STANDBY'}
            </Text>
          </View>
        </View>
        <Text style={styles.title}>
          {NAV_SUBTOPIC_LIST.find((s) => s.id === activeSubtopicId)?.title || 'Navigation Model'}
        </Text>
      </View>

      {/* Subtopic Tab Strip with Left/Right Scroll Arrows */}
      <View style={styles.tabScrollWrap}>
        <TouchableOpacity
          style={styles.scrollArrowBtn}
          onPress={handleScrollLeft}
          accessibilityLabel="Previous tabs"
        >
          <Text style={styles.scrollArrowText}>◀</Text>
        </TouchableOpacity>

        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
          style={styles.tabScrollView}
        >
          {NAV_SUBTOPIC_LIST.map((sub) => {
            const active = sub.id === activeSubtopicId;
            return (
              <TouchableOpacity
                key={sub.id}
                style={[styles.tabButton, active && styles.tabButtonActive]}
                onPress={() => handleSelectSubtopic(sub.id)}
              >
                <Text style={[styles.tabCode, active && styles.tabCodeActive]}>{sub.code}</Text>
                <Text style={[styles.tabBadge, active && styles.tabBadgeActive]}>{sub.badge}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          style={styles.scrollArrowBtn}
          onPress={handleScrollRight}
          accessibilityLabel="Next tabs"
        >
          <Text style={styles.scrollArrowText}>▶</Text>
        </TouchableOpacity>
      </View>

      {/* Replan Visual Alert Banner */}
      {telemetry.replanAlert && (
        <View style={styles.alertBanner}>
          <Text style={styles.alertIcon}>⚠️</Text>
          <Text style={styles.alertText}>{telemetry.replanAlert}</Text>
        </View>
      )}

      {/* Main Content Area */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        {/* ========================================================
            L16.1 — Differential Drive & Kinematics
        ======================================================== */}
        {activeSubtopicId === 'L16.1' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Concept Explanation</Text>
            <Text style={styles.paragraph}>
              Explains how a 2-wheel differential-drive mobile robot operates under non-holonomic constraints (cannot
              slide sideways instantaneously), meaning its linear and angular velocities are coupled through wheel velocities.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Formulas / Math Model:</Text>
              <Text style={styles.mathSub}>Linear Velocity (v) & Angular Velocity (ω):</Text>
              <Text style={styles.formula}>v = (r / 2) · (u_R + u_L),      ω = (r / l) · (u_R - u_L)</Text>
              <Text style={styles.mathSub}>Pose Update Equations:</Text>
              <Text style={styles.formula}>x_dot = v · cos(θ),   y_dot = v · sin(θ),   θ_dot = ω</Text>
            </View>

            <Text style={styles.widgetHeader}>Live Telemetry Widget</Text>
            <View style={styles.gridParams}>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Left Wheel Speed (u_L)</Text>
                <Text style={styles.paramValue}>{fmt(robot.uLeft, 2)} rad/s</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Right Wheel Speed (u_R)</Text>
                <Text style={styles.paramValue}>{fmt(robot.uRight, 2)} rad/s</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Resolved Linear Vel (v)</Text>
                <Text style={[styles.paramValue, { color: '#38bdf8' }]}>{fmt(robot.v, 2)} m/s</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Resolved Angular Vel (ω)</Text>
                <Text style={[styles.paramValue, { color: '#38bdf8' }]}>{fmt(robot.w, 2)} rad/s</Text>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • v = (r / 2) · (u_R + u_L) = ({fmt(config.wheelRadius)} / 2) · ({fmt(robot.uRight, 2)} + {fmt(robot.uLeft, 2)}) = {fmt(robot.v, 2)} m/s
              </Text>
              <Text style={styles.solutionText}>
                • ω = (r / l) · (u_R − u_L) = ({fmt(config.wheelRadius)} / {fmt(config.wheelBase)}) · ({fmt(robot.uRight, 2)} − {fmt(robot.uLeft, 2)}) = {fmt(robot.w, 2)} rad/s
              </Text>
              <Text style={styles.solutionText}>
                • x_dot = v · cos(θ) = {fmt(robot.v, 2)} · cos({deg(robot.theta)}) = {fmt(robot.v * Math.cos(robot.theta), 2)} m/s
              </Text>
              <Text style={styles.solutionText}>
                • y_dot = v · sin(θ) = {fmt(robot.v, 2)} · sin({deg(robot.theta)}) = {fmt(robot.v * Math.sin(robot.theta), 2)} m/s
              </Text>
              <Text style={[styles.solutionText, { color: '#4ade80', fontWeight: '700' }]}>
                ✓ Current Pose: (x = {fmt(robot.x, 2)} m, y = {fmt(robot.y, 2)} m, θ = {deg(robot.theta)})
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L16.2 — Environment Representation & Grid Mapping
        ======================================================== */}
        {activeSubtopicId === 'L16.2' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Concept Explanation</Text>
            <Text style={styles.paragraph}>
              Discretizes continuous floor space into a uniform grid matrix where cells are designated as free space (0)
              or occupied space (1), establishing coordinate boundaries and start/goal nodes.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Formulas / Math Model:</Text>
              <Text style={styles.mathSub}>Cell Coordinate Mapping from World Position (X, Y) and Grid Resolution res:</Text>
              <Text style={styles.formula}>c_x = ⌊ (X - X_origin) / res ⌋,      c_y = ⌊ (Y - Y_origin) / res ⌋</Text>
            </View>

            <Text style={styles.widgetHeader}>Live Telemetry Widget</Text>
            <View style={styles.gridParams}>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Grid Dimensions</Text>
                <Text style={styles.paramValue}>{config.cols} × {config.rows} cells</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Resolution Scale (res)</Text>
                <Text style={styles.paramValue}>{config.cellSize} m/cell</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Total Map Area</Text>
                <Text style={styles.paramValue}>{fmt(config.cols * config.cellSize, 1)}m × {fmt(config.rows * config.cellSize, 1)}m</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Occupancy Status</Text>
                <Text style={[styles.paramValue, { color: '#4ade80' }]}>{totalCells - obstacleCount} Free / {obstacleCount} Blocked</Text>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • Start X Cell: c_x,start = ⌊ (X_start − X_orig) / res ⌋ = ⌊ ({fmt(startPos.x)} − 0.00) / {fmt(config.cellSize)} ⌋ = {startCoord.c}
              </Text>
              <Text style={styles.solutionText}>
                • Start Y Cell: c_y,start = ⌊ (Y_start − Y_orig) / res ⌋ = ⌊ ({fmt(startPos.y)} − 0.00) / {fmt(config.cellSize)} ⌋ = {startCoord.r}
              </Text>
              <Text style={styles.solutionText}>
                • Goal X Cell: c_x,goal = ⌊ (X_goal − X_orig) / res ⌋ = ⌊ ({fmt(goalPos.x)} − 0.00) / {fmt(config.cellSize)} ⌋ = {goalCoord.c}
              </Text>
              <Text style={styles.solutionText}>
                • Goal Y Cell: c_y,goal = ⌊ (Y_goal − Y_orig) / res ⌋ = ⌊ ({fmt(goalPos.y)} − 0.00) / {fmt(config.cellSize)} ⌋ = {goalCoord.r}
              </Text>
              <Text style={[styles.solutionText, { color: '#38bdf8', fontWeight: '700' }]}>
                ✓ Active Grid Path: Start [{startCoord.c}, {startCoord.r}] ➔ Goal [{goalCoord.c}, {goalCoord.r}]
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L16.3 — Sensor Modeling & Obstacle Inflation
        ======================================================== */}
        {activeSubtopicId === 'L16.3' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Concept Explanation</Text>
            <Text style={styles.paragraph}>
              Simulates distance-measuring sensors (LiDAR/Ultrasonic) and applies safety clearance inflation around
              physical obstacles to convert the robot into a point mass while avoiding wall collisions.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Formulas / Math Model:</Text>
              <Text style={styles.mathSub}>Obstacle Inflation Radius Calculation:</Text>
              <Text style={styles.formula}>r_inflated = r_robot + Safety Margin</Text>
              <Text style={styles.mathSub}>Euclidean Distance Check from Sensor Beam to Wall:</Text>
              <Text style={styles.formula}>d = √((x_obstacle - x_robot)² + (y_obstacle - y_robot)²) ≥ r_inflated</Text>
            </View>

            <Text style={styles.widgetHeader}>Live Telemetry Widget</Text>
            <View style={styles.gridParams}>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Active Sensor Range</Text>
                <Text style={styles.paramValue}>{fmt(sensor.maxRange)} m</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Raycast Beam Status</Text>
                <Text style={[styles.paramValue, { color: sensor.hit ? '#fbbf24' : '#4ade80' }]}>
                  {sensor.hit ? `HIT (${fmt(sensor.distance)} m)` : 'CLEAR'}
                </Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Safety Buffer Distance</Text>
                <Text style={[styles.paramValue, { color: '#38bdf8' }]}>{fmt(rInflated)} m</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Inflated Grid Cells</Text>
                <Text style={styles.paramValue}>{telemetry.inflatedCellsCount} cells</Text>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • r_inflated = r_robot + Safety Margin = {fmt(config.robotRadius)} + {fmt(config.safetyMargin)} = {fmt(rInflated)} m
              </Text>
              <Text style={styles.solutionText}>
                • Sensor Raycast Distance: d_sensor = {fmt(sensor.distance)} m (Max: {fmt(sensor.maxRange)} m)
              </Text>
              <Text style={[styles.solutionText, { color: sensor.distance >= rInflated ? '#4ade80' : '#e0563f', fontWeight: '700' }]}>
                {sensor.distance >= rInflated
                  ? `✓ Safety Check: d_sensor (${fmt(sensor.distance)} m) ≥ r_inflated (${fmt(rInflated)} m) ➔ Safe Clearance`
                  : `⚠️ Proximity Warning: d_sensor (${fmt(sensor.distance)} m) < r_inflated (${fmt(rInflated)} m)`}
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L16.4 — Path Planning Algorithms (A*, Dijkstra, Greedy)
        ======================================================== */}
        {activeSubtopicId === 'L16.4' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Concept Explanation</Text>
            <Text style={styles.paragraph}>
              Evaluates heuristic-driven graph search algorithms to compute the optimal, lowest-cost collision-free path
              across the grid network.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Formulas / Math Model:</Text>
              <Text style={styles.mathSub}>A* Evaluation Cost Function:</Text>
              <Text style={styles.formula}>f(n) = g(n) + h(n)</Text>
              <Text style={styles.mathSub}>Where g(n) is exact cost from start to node n, and h(n) is heuristic estimate:</Text>
              <Text style={styles.formula}>h(n) = √((x_goal - x_n)² + (y_goal - y_n)²)</Text>
            </View>

            <Text style={styles.widgetHeader}>Live Telemetry Widget</Text>
            <View style={styles.gridParams}>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Selected Algorithm</Text>
                <Text style={[styles.paramValue, { color: '#38bdf8' }]}>
                  {config.algorithm === 'astar' ? 'A* (Optimal)' : config.algorithm === 'dijkstra' ? 'Dijkstra' : 'Greedy Best-First'}
                </Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Nodes Evaluated / Expanded</Text>
                <Text style={styles.paramValue}>{pathResult.nodesExplored} nodes</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Computed Path Length</Text>
                <Text style={[styles.paramValue, { color: '#4ade80' }]}>{fmt(pathResult.totalDistance)} m</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Execution Search Time</Text>
                <Text style={styles.paramValue}>{fmt(pathResult.searchTimeMs, 2)} ms</Text>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • Start Heuristic: h(S) = √(({fmt(goalPos.x)} − {fmt(startPos.x)})² + ({fmt(goalPos.y)} − {fmt(startPos.y)})²) = {fmt(pathResult.directDistance)} m
              </Text>
              <Text style={styles.solutionText}>
                • Total Accumulated Path Cost: g(Goal) = ∑ Δd_i = {fmt(pathResult.totalDistance)} m
              </Text>
              <Text style={styles.solutionText}>
                • f(Goal) = g(Goal) + h(Goal) = {fmt(pathResult.totalDistance)} + 0.00 = {fmt(pathResult.totalDistance)} m
              </Text>
              <Text style={[styles.solutionText, { color: '#4ade80', fontWeight: '700' }]}>
                ✓ Path Efficiency: η = (d_direct / L_path) · 100% = ({fmt(pathResult.directDistance)} / {fmt(pathResult.totalDistance)}) · 100% = {fmt(pathResult.efficiencyRatio, 1)}%
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L16.5 — Trajectory Planning & Kinematic Limits
        ======================================================== */}
        {activeSubtopicId === 'L16.5' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Concept Explanation</Text>
            <Text style={styles.paragraph}>
              Converts the static geometric waypoint path into a time-parameterized trajectory respecting acceleration ramps,
              braking distance constraints, and turning speed limits.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Formulas / Math Model:</Text>
              <Text style={styles.mathSub}>Maximum Turning Velocity Constraint based on centripetal acceleration:</Text>
              <Text style={styles.formula}>v_turn ≤ √(a_lateral,max · R)</Text>
              <Text style={styles.mathSub}>Minimum Stopping Braking Distance:</Text>
              <Text style={styles.formula}>d_brake = v² / (2 · a_max)</Text>
            </View>

            <Text style={styles.widgetHeader}>Live Telemetry Widget</Text>
            <View style={styles.gridParams}>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Acceleration Profile Status</Text>
                <Text style={styles.paramValue}>{fmt(telemetry.currentAccel)} m/s²</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Peak Velocity Cap</Text>
                <Text style={styles.paramValue}>{fmt(telemetry.turnSpeedCap)} m/s</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Braking Distance (d_brake)</Text>
                <Text style={styles.paramValue}>{fmt(currentBrakeDist)} m</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Estimated Time of Arrival (ETA)</Text>
                <Text style={[styles.paramValue, { color: '#ffd23f' }]}>{fmt(pathResult.estimatedTime, 1)} s</Text>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • d_brake = v² / (2 · a_max) = {fmt(robot.v, 2)}² / (2 · {fmt(config.maxAccel)}) = {fmt(currentBrakeDist)} m
              </Text>
              <Text style={styles.solutionText}>
                • v_turn_cap = √(a_lat · R_turn) = √({fmt(config.maxLateralAccel)} · {fmt(robot.v / Math.max(0.01, Math.abs(robot.w)))}) = {fmt(telemetry.turnSpeedCap)} m/s
              </Text>
              <Text style={[styles.solutionText, { color: telemetry.turnWarning ? '#fbbf24' : '#4ade80', fontWeight: '700' }]}>
                {telemetry.turnWarning
                  ? '⚠️ Status: Centripetal limit active — robot decelerating into corner.'
                  : '✓ Status: Turning within lateral acceleration limits.'}
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L16.6 — Path vs. Trajectory
        ======================================================== */}
        {activeSubtopicId === 'L16.6' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Explanation Panel Text</Text>
            <Text style={styles.paragraph}>
              A geometric path tells the robot where to go spatially, whereas a trajectory also specifies when and how fast
              to move by integrating time and kinematic parameters.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Math Display:</Text>
              <Text style={styles.formula}>Path Optimization: Minimize route cost J = ∑ distance</Text>
              <Text style={styles.formula}>Trajectory Constraint: v(t) ≤ v_max   and   a(t) ≤ a_max</Text>
            </View>

            {/* Interactive Toggle */}
            <View style={styles.showcaseCard}>
              <Text style={styles.showcaseTitle}>How to Showcase It:</Text>
              <Text style={styles.showcaseDesc}>
                Toggle below to compare the raw angular waypoint path (yellow) with the smooth, S-curve interpolated motion trajectory (cyan).
              </Text>
              <TouchableOpacity
                style={[styles.toggleBtn, telemetry.showPathVsTrajectory && styles.toggleBtnActive]}
                onPress={onTogglePathVsTrajectory}
              >
                <Text style={styles.toggleBtnText}>
                  {telemetry.showPathVsTrajectory ? '✓ Hide Raw Path Comparison' : '⚡ Compare Path vs. Trajectory'}
                </Text>
              </TouchableOpacity>
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#fbbf24' }]} />
                  <Text style={styles.legendText}>Raw Geometric Grid Path</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#38bdf8' }]} />
                  <Text style={styles.legendText}>Smoothed Motion Trajectory</Text>
                </View>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • J_path = ∑ ||p_(i+1) − p_i|| = {fmt(pathResult.totalDistance)} m
              </Text>
              <Text style={styles.solutionText}>
                • Trajectory Velocity Limit: v_current ({fmt(robot.v, 2)} m/s) ≤ v_max ({fmt(config.maxVelocity)} m/s)
              </Text>
              <Text style={styles.solutionText}>
                • Trajectory Accel Limit: |a_current| ({fmt(Math.abs(telemetry.currentAccel), 2)} m/s²) ≤ a_max ({fmt(config.maxAccel)} m/s²)
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L16.7 — Minimum-Time Navigation
        ======================================================== */}
        {activeSubtopicId === 'L16.7' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Explanation Panel Text</Text>
            <Text style={styles.paragraph}>
              Minimum-time navigation evaluates candidate routes using realistic movement constraints, balancing total
              route length against acceleration limits, braking distances, and sharp-turn speed reductions.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Math Display:</Text>
              <Text style={styles.mathSub}>Braking Distance Formula:</Text>
              <Text style={styles.formula}>d_brake = v² / (2 · a_brake)</Text>
              <Text style={styles.mathSub}>Turn Velocity Cap:</Text>
              <Text style={styles.formula}>v_turn ≤ √(a_lateral,max · R)</Text>
            </View>

            {/* Live Performance Meter Card */}
            <View style={styles.meterCard}>
              <Text style={styles.meterTitle}>LIVE PERFORMANCE METER</Text>
              <View style={styles.meterRow}>
                <Text style={styles.meterLabel}>Estimated Time of Arrival (ETA):</Text>
                <Text style={styles.meterValue}>{fmt(pathResult.estimatedTime, 1)} s</Text>
              </View>
              <View style={styles.meterRow}>
                <Text style={styles.meterLabel}>Current Stopping Distance:</Text>
                <Text style={styles.meterValue}>{fmt(currentBrakeDist)} m</Text>
              </View>
              <View style={styles.meterRow}>
                <Text style={styles.meterLabel}>Corner Speed Penalty Status:</Text>
                <Text style={[styles.meterValue, { color: telemetry.turnWarning ? '#fbbf24' : '#4ade80' }]}>
                  {telemetry.turnWarning ? `PENALIZED (Cap: ${fmt(telemetry.turnSpeedCap)} m/s)` : 'NOMINAL (Full Speed)'}
                </Text>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • d_brake = v² / (2 · a_brake) = {fmt(robot.v, 2)}² / (2 · {fmt(config.maxAccel)}) = {fmt(currentBrakeDist)} m
              </Text>
              <Text style={styles.solutionText}>
                • v_turn = √(a_lat · R) = √({fmt(config.maxLateralAccel)} · {fmt(robot.v / Math.max(0.01, Math.abs(robot.w)))}) = {fmt(telemetry.turnSpeedCap)} m/s
              </Text>
              <Text style={styles.solutionText}>
                • ETA = L_remaining / v_effective = {fmt(robot.distanceRemaining)} / {fmt(Math.max(0.2, robot.v || config.maxVelocity * 0.75))} = {fmt(pathResult.estimatedTime, 1)} s
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L16.8 — Dynamic Obstacles & Replanning
        ======================================================== */}
        {activeSubtopicId === 'L16.8' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Explanation Panel Text</Text>
            <Text style={styles.paragraph}>
              When the environment changes after a route is calculated, the robot must use sensor feedback to detect
              blockages, execute local reactive stops, and trigger a global replanning cycle.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Math & Logic Display:</Text>
              <Text style={styles.formula}>Reactive Condition: if sensor_distance &lt; d_stop: stop_and_evaluate()</Text>
            </View>

            {/* Interactive Dynamic Obstacle Button */}
            <View style={styles.showcaseCard}>
              <Text style={styles.showcaseTitle}>Interactive Dynamic Replanning:</Text>
              <Text style={styles.showcaseDesc}>
                Click below to spawn a dynamic obstacle block directly in the path of the active robot. This triggers the
                sensor collision guard and causes an instantaneous A* global re-route.
              </Text>
              <TouchableOpacity style={styles.spawnBtn} onPress={onSpawnDynamicObstacle}>
                <Text style={styles.spawnBtnText}>🚨 Spawn Dynamic Obstacle</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • Reactive Stop Threshold: d_stop = {fmt(rInflated + 0.10)} m
              </Text>
              <Text style={styles.solutionText}>
                • Forward Raycast: d_sensor = {fmt(sensor.distance)} m
              </Text>
              <Text style={[styles.solutionText, { color: sensor.distance < rInflated + 0.10 ? '#e0563f' : '#4ade80', fontWeight: '700' }]}>
                • Evaluation: {fmt(sensor.distance)} m &lt; {fmt(rInflated + 0.10)} m ➔ {sensor.distance < rInflated + 0.10 ? 'BLOCKED ➔ Trigger Replan' : 'CLEAR ➔ Continue Trajectory'}
              </Text>
              <Text style={styles.solutionText}>
                • Total Replans Executed = {telemetry.replanCount}
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L16.9 — Python Obstacle-Course Simulator
        ======================================================== */}
        {activeSubtopicId === 'L16.9' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Explanation Panel Text</Text>
            <Text style={styles.paragraph}>
              Simulating the world on a 2D grid matrix allows developers to test robot footprints, clearance radii, and
              pathfinding constraints before deploying code onto physical machinery.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Architecture Display:</Text>
              <Text style={styles.formula}>Grid Occupancy Check: M[x][y] == 1  (Impassable obstacle cell)</Text>
            </View>

            {/* Simulation Metrics Dashboard */}
            <View style={styles.metricsDashboard}>
              <Text style={styles.metricsTitle}>SIMULATION METRICS DASHBOARD</Text>
              <View style={styles.metricsGrid}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>{fmt(robot.traveledDistance, 2)} m</Text>
                  <Text style={styles.metricLbl}>Total Travel Distance</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>{fmt(robot.elapsedSeconds, 1)} s</Text>
                  <Text style={styles.metricLbl}>Simulated Mission Time</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={[styles.metricVal, { color: '#4ade80' }]}>{telemetry.collisionCount}</Text>
                  <Text style={styles.metricLbl}>Collision Counts</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={[styles.metricVal, { color: '#38bdf8' }]}>{telemetry.replanCount}</Text>
                  <Text style={styles.metricLbl}>Total Replan Events</Text>
                </View>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • Grid Dimensions = {config.cols} × {config.rows} = {totalCells} total cells
              </Text>
              <Text style={styles.solutionText}>
                • Obstacle Occupancy = {obstacleCount} / {totalCells} = {fmt((obstacleCount / totalCells) * 100, 1)}% occupied
              </Text>
              <Text style={styles.solutionText}>
                • Navigable Free Space = {totalCells - obstacleCount} cells ({fmt(((totalCells - obstacleCount) / totalCells) * 100, 1)}%)
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L16.10 — Example Navigation Loop
        ======================================================== */}
        {activeSubtopicId === 'L16.10' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Explanation Panel Text</Text>
            <Text style={styles.paragraph}>
              A structured control loop cleanly separates sensing, decision-making, and actuation into a continuous
              cyclical routine executed until the goal is reached.
            </Text>

            {/* Live Interactive Pseudocode Visualizer */}
            <Text style={styles.widgetHeader}>Live Pseudocode Visualizer</Text>
            <View style={styles.codeContainer}>
              <Text style={styles.codeComment}># Cyclical Sense-Plan-Act Navigation Loop</Text>
              {[
                { step: 1, text: 'while not goal_reached():' },
                { step: 2, text: '    # 1. Sense: Read sensors & pose' },
                { step: 2, text: '    sensor_data = lidar.read_range()' },
                { step: 3, text: '    # 2. Safety: Reactive obstacle check' },
                { step: 3, text: '    if sensor_data.distance < d_stop: stop_and_replan()' },
                { step: 4, text: '    # 3. Plan: Query trajectory waypoint' },
                { step: 4, text: '    target_wp = path.get_lookahead_point(robot_pose)' },
                { step: 5, text: '    # 4. Control: Compute linear & angular speeds' },
                { step: 5, text: '    v, omega = compute_pure_pursuit(robot_pose, target_wp)' },
                { step: 6, text: '    # 5. Actuate: Solve wheel kinematics' },
                { step: 6, text: '    u_L, u_R = inverse_kinematics(v, omega, r, l)' },
                { step: 6, text: '    motors.publish_wheel_speeds(u_L, u_R)' },
                { step: 7, text: '    sleep(dt)' }
              ].map((line, idx) => {
                const isHighlight =
                  robot.status === 'navigating' &&
                  (telemetry.activeLoopStep === line.step || (line.step === 3 && sensor.hit));
                return (
                  <View key={idx} style={[styles.codeLine, isHighlight && styles.codeLineActive]}>
                    <Text style={[styles.codeText, isHighlight && styles.codeTextActive]}>{line.text}</Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • Control Loop Frequency: f_loop = 1 / Δt = 1 / 0.0167 s = 60 Hz
              </Text>
              <Text style={styles.solutionText}>
                • Current Active Pipeline Step: Step {telemetry.activeLoopStep} of 6 ({telemetry.activeLoopStep === 1 ? 'Wait Condition' : telemetry.activeLoopStep === 2 ? 'LIDAR Range Sensing' : telemetry.activeLoopStep === 3 ? 'Safety Collision Check' : telemetry.activeLoopStep === 4 ? 'Lookahead Planning' : telemetry.activeLoopStep === 5 ? 'Pure Pursuit Control' : 'Wheel Motor Command'})
              </Text>
              <Text style={styles.solutionText}>
                • Elapsed Mission Time: t = {fmt(robot.elapsedSeconds, 1)} s | Progress: {fmt(robot.progressPercent, 0)}%
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );

  return isZoomed ? (
    <Modal visible transparent animationType="fade" onRequestClose={() => setIsZoomed(false)}>
      <View style={styles.modalBackdrop}>{panelContent}</View>
    </Modal>
  ) : (
    panelContent
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#16223f',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a3d5f',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: 'rgba(3, 8, 20, 0.78)'
  },
  zoomCard: {
    width: '94%',
    maxWidth: 1200,
    height: '92%',
    maxHeight: '92%',
    transform: [{ scale: 1.08 }]
  },
  header: {
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#243452',
    backgroundColor: '#131c34'
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  zoomButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
    marginRight: 8,
    borderRadius: 15,
    backgroundColor: 'rgba(56, 189, 248, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.45)'
  },
  zoomButtonText: {
    fontSize: 20,
    lineHeight: 20,
    color: '#bfe8ff'
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: 1.2
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1
  },
  statusIdle: {
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    borderColor: '#64748b'
  },
  statusActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38bdf8'
  },
  statusReached: {
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
    borderColor: '#4ade80'
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#f8f4fa',
    letterSpacing: 0.5
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.2
  },
  tabScrollWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#243452',
    paddingHorizontal: 4
  },
  scrollArrowBtn: {
    width: 24,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16223f',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2a3d5f',
    zIndex: 2
  },
  scrollArrowText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38bdf8'
  },
  tabScrollView: {
    flex: 1
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 6
  },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'transparent',
    minWidth: 70
  },
  tabButtonActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.16)',
    borderColor: '#38bdf8'
  },
  tabCode: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8'
  },
  tabCodeActive: {
    color: '#38bdf8'
  },
  tabBadge: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2
  },
  tabBadgeActive: {
    color: '#e2e8f0',
    fontWeight: '600'
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0563f',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8
  },
  alertIcon: {
    fontSize: 16
  },
  alertText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.4
  },
  scrollArea: {
    flex: 1
  },
  scrollContent: {
    padding: 18,
    gap: 16
  },
  section: {
    gap: 12
  },
  conceptHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: 0.8
  },
  widgetHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: '#f8f4fa',
    letterSpacing: 0.5,
    marginTop: 4
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 24,
    color: '#c4c9d8'
  },
  mathBox: {
    backgroundColor: '#0b1120',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#38bdf8',
    gap: 4
  },
  mathHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#94a3b8',
    marginBottom: 2
  },
  mathSub: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 3
  },
  formula: {
    fontSize: 15,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#f1f5f9'
  },
  gridParams: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  paramBox: {
    flex: 1,
    minWidth: 130,
    backgroundColor: '#111b33',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e2d4d'
  },
  paramLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 4
  },
  paramValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff'
  },
  solutionBox: {
    backgroundColor: 'rgba(56, 189, 248, 0.05)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    gap: 6
  },
  solutionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: 0.3
  },
  solutionText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#e2e8f0'
  },
  warningBox: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#fbbf24'
  },
  warningText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fde68a'
  },
  showcaseCard: {
    backgroundColor: '#111b33',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1e2d4d',
    gap: 8
  },
  showcaseTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffd23f',
    letterSpacing: 0.5
  },
  showcaseDesc: {
    fontSize: 12,
    lineHeight: 18,
    color: '#cbd5e1'
  },
  toggleBtn: {
    backgroundColor: '#1e2d4d',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#38bdf8'
  },
  toggleBtnActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.25)'
  },
  toggleBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff'
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  legendText: {
    fontSize: 12,
    color: '#94a3b8'
  },
  meterCard: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#243452',
    gap: 8
  },
  meterTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4ade80',
    letterSpacing: 1
  },
  meterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)'
  },
  meterLabel: {
    fontSize: 12,
    color: '#94a3b8'
  },
  meterValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#f8f4fa'
  },
  spawnBtn: {
    backgroundColor: '#e0563f',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff7a63'
  },
  spawnBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff'
  },
  metricsDashboard: {
    backgroundColor: '#0b1120',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1e2d4d',
    gap: 10
  },
  metricsTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: 1
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  metricItem: {
    flex: 1,
    minWidth: 110,
    backgroundColor: '#131c34',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1e2d4d'
  },
  metricVal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff'
  },
  metricLbl: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 2
  },
  codeContainer: {
    backgroundColor: '#0a0f1d',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1e2d4d',
    gap: 2
  },
  codeComment: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#64748b',
    marginBottom: 4
  },
  codeLine: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4
  },
  codeLineActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderLeftWidth: 3,
    borderLeftColor: '#38bdf8'
  },
  codeText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#94a3b8'
  },
  codeTextActive: {
    color: '#38bdf8',
    fontWeight: '700'
  }
});
