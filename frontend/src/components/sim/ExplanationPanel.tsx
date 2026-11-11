// src/components/sim/ExplanationPanel.tsx
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { IkResult, toDegrees } from './ik';

export type SimPhase = 'place' | 'picking' | 'holding' | 'placingDown';

export interface ExplanationPanelProps {
  result: IkResult | null;
  l1: number;
  l2: number;
  shoulderH: number;
  gripY: number;
  fsmSteps: string[];
  activeStep: string | null;
  phase?: SimPhase;
  currentJoints?: { yaw: number; t1: number; t2: number };
  gripValue?: number;
  cubePos?: { x: number; z: number };
  markerPos?: { x: number; z: number } | null;
  selectedSubtopic?: string;
  onSelectSubtopic?: (subtopic: string) => void;
}

const deg = (radians: number) => `${toDegrees(radians).toFixed(1)}°`;
const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '0.00');

export interface SubtopicMeta {
  id: string;
  shortCode: string;
  title: string;
  badge: string;
}

export const SUBTOPIC_LIST: SubtopicMeta[] = [
  { id: 'L15.1', shortCode: 'L15.1', title: 'Robotic Arm Structure', badge: 'Geometry' },
  { id: 'L15.2', shortCode: 'L15.2', title: 'Position and Orientation', badge: 'Kinematics' },
  { id: 'L15.3', shortCode: 'L15.3', title: 'Joint-space vs. Cartesian Motion', badge: 'Trajectory' },
  { id: 'L15.4', shortCode: 'L15.4', title: 'Gripper Mechanisms', badge: 'Actuation' },
  { id: 'L15.5', shortCode: 'L15.5', title: 'Grasping and Contact Forces', badge: 'Dynamics' },
  { id: 'L15.6', shortCode: 'L15.6', title: 'Static Equilibrium of the Arm', badge: 'Statics' },
  { id: 'L15.7', shortCode: 'L15.7', title: 'Position and Force Control', badge: 'Control' },
  { id: 'L15.8', shortCode: 'L15.8', title: 'Pick-and-Place Sequence', badge: 'FSM Logic' },
  { id: 'L15.9', shortCode: 'L15.9', title: 'Python Simulation Plan', badge: 'Software' },
  { id: 'L15.10', shortCode: 'L15.10', title: 'Example Program Logic', badge: 'IK Solver' }
];

export default function ExplanationPanel({
  result,
  l1,
  l2,
  shoulderH,
  gripY,
  fsmSteps: _fsmSteps,
  activeStep,
  phase = 'place',
  currentJoints,
  gripValue = 0,
  cubePos,
  markerPos,
  selectedSubtopic,
  onSelectSubtopic
}: ExplanationPanelProps) {
  const [internalSubtopic, setInternalSubtopic] = useState<string>('L15.10');
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

  // Target coordinates: from result, marker, or cubePos
  const tx = result?.target.x ?? cubePos?.x ?? 1.5;
  const tz = result?.target.z ?? cubePos?.z ?? 0.6;
  const targetRadius = result ? result.radius : Math.hypot(tx, tz);
  const targetYaw = result ? result.yaw : Math.atan2(tz, tx);
  const targetDrop = result ? result.drop : gripY - shoulderH;
  const targetReach = result ? result.reach : Math.hypot(targetRadius, targetDrop);
  const cosT2 = result ? result.cosTheta2 : Math.min(1, Math.max(-1, (targetReach * targetReach - l1 * l1 - l2 * l2) / (2 * l1 * l2)));

  // Current live angles
  const liveYaw = currentJoints?.yaw ?? targetYaw;
  const liveT1 = currentJoints?.t1 ?? (result?.chosen?.theta1 ?? 0.85);
  const liveT2 = currentJoints?.t2 ?? (result?.chosen?.theta2 ?? -1.2);
  const liveGrip = gripValue;

  // Forward Kinematics from live joints
  const liveRadius = l1 * Math.cos(liveT1) + l2 * Math.cos(liveT1 + liveT2);
  const liveY = shoulderH + l1 * Math.sin(liveT1) + l2 * Math.sin(liveT1 + liveT2);
  const liveX = liveRadius * Math.cos(liveYaw);
  const liveZ = liveRadius * Math.sin(liveYaw);

  // Workspace bounds
  const rMin = 0.55;
  const rMax = Math.sqrt(Math.max(0, Math.pow(l1 + l2, 2) - Math.pow(shoulderH - gripY, 2)));
  const isTargetReachable = result ? result.reachable : (targetReach <= l1 + l2 && targetReach >= Math.abs(l1 - l2) && targetRadius >= rMin);

  // Payload & Torques
  const isHolding = phase === 'holding' || (phase === 'picking' && liveGrip > 0.5) || (phase === 'placingDown' && liveGrip > 0.5);
  const payloadMass = isHolding ? 1.0 : 0.0;
  const m1 = 8.5;
  const m2 = 6.0;
  const rc1 = l1 / 2;
  const rc2 = l2 / 2;
  const gAcc = 9.81;

  // Static torque formulas
  const tau2 = (m2 * rc2 + payloadMass * l2) * gAcc * Math.cos(liveT1 + liveT2);
  const tau1 = (m1 * rc1 + (m2 + payloadMass) * l1) * gAcc * Math.cos(liveT1) + tau2;

  // Gripper parameters
  const mu = 0.40;
  const crateMass = 1.0;
  const fNormalMin = (crateMass * gAcc) / (2 * mu);
  const safetyFactor = 1.5;
  const fNormalRequired = safetyFactor * fNormalMin;
  const currentClampForce = Math.max(0.2, liveGrip * 22.0);
  const frictionLimit = mu * currentClampForce;
  const shearPerPad = (crateMass * gAcc) / 2;
  const slipSafe = frictionLimit >= shearPerPad;

  // Status label for pill
  const statusLabel =
    phase === 'holding'
      ? '● HOLDING CRATE'
      : phase === 'picking' || phase === 'placingDown'
      ? `● FSM: ${activeStep ?? 'EXEC'}`
      : 'STANDBY';

  const currentMeta = SUBTOPIC_LIST.find((s) => s.id === activeSubtopicId) || SUBTOPIC_LIST[9];

  const panelContent = (
    <View style={[styles.card, isZoomed && styles.zoomCard]}>
      {/* Top Header matching NavExplanationPanel */}
      <View style={styles.header}>
        <View style={styles.badgeRow}>
          <Text style={styles.eyebrow}>L15 ROBOTIC MANIPULATION & GRASPING</Text>
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
              phase === 'holding'
                ? styles.statusHolding
                : phase === 'picking' || phase === 'placingDown'
                ? styles.statusActive
                : styles.statusIdle
            ]}
          >
            <Text style={styles.statusPillText}>{statusLabel}</Text>
          </View>
        </View>
        <Text style={styles.title}>{currentMeta.title}</Text>
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
          {SUBTOPIC_LIST.map((sub) => {
            const active = sub.id === activeSubtopicId;
            return (
              <TouchableOpacity
                key={sub.id}
                style={[styles.tabButton, active && styles.tabButtonActive]}
                onPress={() => handleSelectSubtopic(sub.id)}
              >
                <Text style={[styles.tabCode, active && styles.tabCodeActive]}>{sub.shortCode}</Text>
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

      {/* Main Content Area */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        {/* ========================================================
            L15.1 — Robotic Arm Structure
        ======================================================== */}
        {activeSubtopicId === 'L15.1' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Concept Explanation</Text>
            <Text style={styles.paragraph}>
              Industrial crane arm manipulator composed of rigid links interconnected by revolute joints. The base
              revolves around a vertical turntable mast (θ₀), with planar shoulder (θ₁) and elbow (θ₂) joints determining
              reach within an annular geometric workspace.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Formulas / Math Model:</Text>
              <Text style={styles.mathSub}>Workspace Radial Annulus Limits:</Text>
              <Text style={styles.formula}>R_max = √((L₁ + L₂)² − (h_shoulder − d_grip)²)</Text>
              <Text style={styles.formula}>R_min = Mast Keep-Out Radius</Text>
              <Text style={styles.mathSub}>Radial Target Distance Check:</Text>
              <Text style={styles.formula}>r_target = √(x² + z²),      R_min ≤ r_target ≤ R_max</Text>
            </View>

            <Text style={styles.widgetHeader}>Live Telemetry Widget</Text>
            <View style={styles.gridParams}>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Link 1 Length (L₁)</Text>
                <Text style={styles.paramValue}>{fmt(l1)} m</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Link 2 Length (L₂)</Text>
                <Text style={styles.paramValue}>{fmt(l2)} m</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Shoulder Height (h)</Text>
                <Text style={styles.paramValue}>{fmt(shoulderH)} m</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Outer Reach (R_max)</Text>
                <Text style={[styles.paramValue, { color: '#38bdf8' }]}>{fmt(rMax)} m</Text>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • R_max = √((L₁ + L₂)² − (h − d)²) = √(({fmt(l1)} + {fmt(l2)})² − ({fmt(shoulderH)} − {fmt(gripY)})²) = {fmt(rMax)} m
              </Text>
              <Text style={styles.solutionText}>
                • r_target = √(x² + z²) = √({fmt(tx)}² + {fmt(tz)}²) = {fmt(targetRadius)} m
              </Text>
              <Text style={styles.solutionText}>
                • Outer Margin = R_max − r_target = {fmt(rMax)} − {fmt(targetRadius)} = +{fmt(rMax - targetRadius)} m
              </Text>
              <Text style={[styles.solutionText, { color: isTargetReachable ? '#4ade80' : '#e0563f', fontWeight: '700' }]}>
                {isTargetReachable
                  ? `✓ Feasibility: r_target (${fmt(targetRadius)} m) ∈ [${fmt(rMin)} m, ${fmt(rMax)} m] ➔ Within Workspace`
                  : `✕ Feasibility: Target (${fmt(targetRadius)} m) is Outside Reachable Annulus!`}
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L15.2 — Position and Orientation
        ======================================================== */}
        {activeSubtopicId === 'L15.2' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Concept Explanation</Text>
            <Text style={styles.paragraph}>
              Describes Cartesian pose coordinates (x, y, z) transformed into cylindrical turntable space (r, θ₀, y).
              The arm slews its vertical plane toward the target azimuth and solves planar pitch kinematics.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Formulas / Math Model:</Text>
              <Text style={styles.mathSub}>Turntable Azimuth Angle & Plane Drop:</Text>
              <Text style={styles.formula}>θ₀ = atan2(z, x),      drop = y_grip − h_shoulder</Text>
              <Text style={styles.mathSub}>3D Radial Reach Vector:</Text>
              <Text style={styles.formula}>|P| = √(r² + drop²) = √(x² + z² + drop²)</Text>
            </View>

            <Text style={styles.widgetHeader}>Live Telemetry Widget</Text>
            <View style={styles.gridParams}>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Target Coord [x, y, z]</Text>
                <Text style={styles.paramValue}>[{fmt(tx)}, {fmt(gripY)}, {fmt(tz)}]</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Turntable Slew (θ₀)</Text>
                <Text style={[styles.paramValue, { color: '#38bdf8' }]}>{deg(targetYaw)}</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Vertical Drop (Δy)</Text>
                <Text style={styles.paramValue}>{fmt(targetDrop)} m</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Total Reach (|P|)</Text>
                <Text style={styles.paramValue}>{fmt(targetReach)} m</Text>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • r = √(x² + z²) = √({fmt(tx)}² + {fmt(tz)}²) = {fmt(targetRadius)} m
              </Text>
              <Text style={styles.solutionText}>
                • θ₀ = atan2(z, x) = atan2({fmt(tz)}, {fmt(tx)}) = {deg(targetYaw)}
              </Text>
              <Text style={styles.solutionText}>
                • drop = y_grip − h = {fmt(gripY)} − {fmt(shoulderH)} = {fmt(targetDrop)} m
              </Text>
              <Text style={styles.solutionText}>
                • |P| = √(r² + drop²) = √({fmt(targetRadius)}² + ({fmt(targetDrop)})²) = {fmt(targetReach)} m
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L15.3 — Joint-Space vs. Cartesian Motion
        ======================================================== */}
        {activeSubtopicId === 'L15.3' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Concept Explanation</Text>
            <Text style={styles.paragraph}>
              Compares commanding motors directly in joint coordinates θ(t) versus planning end-effector tool tip paths
              linearly in 3D Cartesian coordinates P(t), resolving inverse kinematics iteratively along the trajectory.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Formulas / Math Model:</Text>
              <Text style={styles.mathSub}>Joint-Space Linear Interpolation:</Text>
              <Text style={styles.formula}>θ_i(t) = θ_i,start + s(t) · (θ_i,target − θ_i,start),   s(t) ∈ [0, 1]</Text>
              <Text style={styles.mathSub}>Cartesian Tool Distance:</Text>
              <Text style={styles.formula}>ΔP = √((x_end − x_start)² + (y_end − y_start)² + (z_end − z_start)²)</Text>
            </View>

            <Text style={styles.widgetHeader}>Live Telemetry Widget</Text>
            <View style={styles.gridParams}>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Live Tip Pos [x, y, z]</Text>
                <Text style={styles.paramValue}>[{fmt(liveX)}, {fmt(liveY)}, {fmt(liveZ)}]</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Current Turntable (θ₀)</Text>
                <Text style={styles.paramValue}>{deg(liveYaw)}</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Current Shoulder (θ₁)</Text>
                <Text style={styles.paramValue}>{deg(liveT1)}</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Current Elbow (θ₂)</Text>
                <Text style={styles.paramValue}>{deg(liveT2)}</Text>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • Tool Position Error = ||P_goal − P_live|| = √(({fmt(tx)} − {fmt(liveX)})² + ({fmt(gripY)} − {fmt(liveY)})² + ({fmt(tz)} − {fmt(liveZ)})²) = {fmt(Math.hypot(tx - liveX, gripY - liveY, tz - liveZ))} m
              </Text>
              <Text style={styles.solutionText}>
                • Joint Yaw Delta = |θ₀,goal − θ₀,live| = |{deg(targetYaw)} − {deg(liveYaw)}| = {deg(Math.abs(targetYaw - liveYaw))}
              </Text>
              <Text style={styles.solutionText}>
                • Joint Elbow Delta = |θ₂,goal − θ₂,live| = |{deg(result?.chosen?.theta2 ?? liveT2)} − {deg(liveT2)}| = {deg(Math.abs((result?.chosen?.theta2 ?? liveT2) - liveT2))}
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L15.4 — Gripper Mechanisms
        ======================================================== */}
        {activeSubtopicId === 'L15.4' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Concept Explanation</Text>
            <Text style={styles.paragraph}>
              Articulated parallel-jaw knuckle mechanism driven by dual pneumatic/servo links. Angular finger curl
              maps linearly from normalized actuator command into physical jaw opening and pad contact stroke.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Formulas / Math Model:</Text>
              <Text style={styles.mathSub}>Knuckle Joint Curl Transformation:</Text>
              <Text style={styles.formula}>k₁ = k_open + grip · (k_closed − k_open) = −0.50 + grip · (0.78) rad</Text>
              <Text style={styles.mathSub}>Gripper Pad Linear Stroke:</Text>
              <Text style={styles.formula}>d_jaw = grip · Stroke_max = grip · 0.08 m</Text>
            </View>

            <Text style={styles.widgetHeader}>Live Telemetry Widget</Text>
            <View style={styles.gridParams}>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Actuation (grip)</Text>
                <Text style={[styles.paramValue, { color: '#38bdf8' }]}>{fmt(liveGrip * 100, 0)}%</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Knuckle Angle (k₁)</Text>
                <Text style={styles.paramValue}>{fmt(-0.5 + liveGrip * 0.78, 2)} rad</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Applied Clamp Force</Text>
                <Text style={styles.paramValue}>{fmt(currentClampForce)} N</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Claw State</Text>
                <Text style={[styles.paramValue, { color: isHolding ? '#4ade80' : '#cbd5e1' }]}>
                  {isHolding ? 'CLAMPED' : liveGrip > 0.1 ? 'CLOSING' : 'OPEN'}
                </Text>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • Knuckle Curl: k₁ = −0.50 + ({fmt(liveGrip)} · 0.78) = {fmt(-0.5 + liveGrip * 0.78, 2)} rad ({deg(-0.5 + liveGrip * 0.78)})
              </Text>
              <Text style={styles.solutionText}>
                • Clamp Normal Force: F_applied = max(0.2, {fmt(liveGrip)} · 22.0) = {fmt(currentClampForce)} N
              </Text>
              <Text style={styles.solutionText}>
                • Jaw Travel Stroke = {fmt(liveGrip)} · 80 mm = {fmt(liveGrip * 80, 1)} mm
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L15.5 — Grasping and Contact Forces
        ======================================================== */}
        {activeSubtopicId === 'L15.5' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Concept Explanation</Text>
            <Text style={styles.paragraph}>
              Friction-based grasping equilibrium. To prevent a payload from slipping under downward gravity, normal
              contact force from opposing pads must generate frictional resistance satisfying Coulomb friction criteria.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Formulas / Math Model:</Text>
              <Text style={styles.mathSub}>Minimum Normal Clamping Force per Pad:</Text>
              <Text style={styles.formula}>F_n,min = (m · g) / (2 · μ),      F_cmd = SF · F_n,min (SF = 1.5)</Text>
              <Text style={styles.mathSub}>Coulomb Friction Limit:</Text>
              <Text style={styles.formula}>F_friction,max = μ · F_applied,      Shear/Pad = (m · g) / 2</Text>
            </View>

            <Text style={styles.widgetHeader}>Live Telemetry Widget</Text>
            <View style={styles.gridParams}>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Friction Coeff (μ)</Text>
                <Text style={styles.paramValue}>{fmt(mu)}</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Min Normal (F_n,min)</Text>
                <Text style={styles.paramValue}>{fmt(fNormalMin)} N</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Required Force (SF=1.5)</Text>
                <Text style={styles.paramValue}>{fmt(fNormalRequired)} N</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Slip Security Status</Text>
                <Text style={[styles.paramValue, { color: isHolding ? (slipSafe ? '#4ade80' : '#e0563f') : '#94a3b8' }]}>
                  {isHolding ? (slipSafe ? 'SLIP-FREE' : 'SLIP RISK') : 'UNLOADED'}
                </Text>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • F_n,min = (m · g) / (2 · μ) = ({fmt(crateMass)} · {fmt(gAcc)}) / (2 · {fmt(mu)}) = {fmt(fNormalMin)} N
              </Text>
              <Text style={styles.solutionText}>
                • F_cmd = 1.5 · F_n,min = 1.5 · {fmt(fNormalMin)} N = {fmt(fNormalRequired)} N
              </Text>
              <Text style={styles.solutionText}>
                • Max Friction = μ · F_applied = {fmt(mu)} · {fmt(currentClampForce)} N = {fmt(frictionLimit)} N
              </Text>
              <Text style={styles.solutionText}>
                • Shear Force per Pad = (m · g) / 2 = ({fmt(crateMass)} · {fmt(gAcc)}) / 2 = {fmt(shearPerPad)} N
              </Text>
              <Text style={[styles.solutionText, { color: slipSafe ? '#4ade80' : '#fbbf24', fontWeight: '700' }]}>
                {isHolding
                  ? `✓ Grasp Condition: Shear (${fmt(shearPerPad)} N) ≤ Friction (${fmt(frictionLimit)} N) ➔ Stable Grasp`
                  : '• Crate unheld: Normal contact force currently inactive.'}
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L15.6 — Static Equilibrium of the Arm
        ======================================================== */}
        {activeSubtopicId === 'L15.6' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Concept Explanation</Text>
            <Text style={styles.paragraph}>
              Static balance of moments about shoulder and elbow joint axes under gravity acting on structural link masses
              and external payload crate.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Formulas / Math Model:</Text>
              <Text style={styles.mathSub}>Elbow Joint 2 Static Holding Torque:</Text>
              <Text style={styles.formula}>τ₂ = (m₂·rc₂ + m_L·L₂) · g · cos(θ₁ + θ₂)</Text>
              <Text style={styles.mathSub}>Shoulder Joint 1 Static Holding Torque:</Text>
              <Text style={styles.formula}>τ₁ = (m₁·rc₁ + (m₂ + m_L)·L₁) · g · cos(θ₁) + τ₂</Text>
            </View>

            <Text style={styles.widgetHeader}>Live Telemetry Widget</Text>
            <View style={styles.gridParams}>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Payload Mass (m_L)</Text>
                <Text style={styles.paramValue}>{fmt(payloadMass)} kg</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Link 1 Mass (m₁)</Text>
                <Text style={styles.paramValue}>{fmt(m1)} kg</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Shoulder Torque (τ₁)</Text>
                <Text style={[styles.paramValue, { color: '#38bdf8' }]}>{fmt(tau1)} Nm</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Elbow Torque (τ₂)</Text>
                <Text style={[styles.paramValue, { color: '#ffd23f' }]}>{fmt(tau2)} Nm</Text>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • τ₂ = ({fmt(m2)}·{fmt(rc2)} + {fmt(payloadMass)}·{fmt(l2)}) · {fmt(gAcc)} · cos({deg(liveT1 + liveT2)}) = {fmt(tau2)} Nm
              </Text>
              <Text style={styles.solutionText}>
                • τ₁ = ({fmt(m1)}·{fmt(rc1)} + ({fmt(m2)} + {fmt(payloadMass)})·{fmt(l1)}) · {fmt(gAcc)} · cos({deg(liveT1)}) + {fmt(tau2)} = {fmt(tau1)} Nm
              </Text>
              <Text style={styles.solutionText}>
                • Total Combined Torque = |τ₁| + |τ₂| = {fmt(Math.abs(tau1))} + {fmt(Math.abs(tau2))} = {fmt(Math.abs(tau1) + Math.abs(tau2))} Nm
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L15.7 — Position and Force Control
        ======================================================== */}
        {activeSubtopicId === 'L15.7' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Concept Explanation</Text>
            <Text style={styles.paragraph}>
              Hybrid control sequence: High-gain closed-loop PID position control during open-air trajectory flight,
              transitioning to compliant force/impedance regulation upon making contact with the workpiece.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Formulas / Math Model:</Text>
              <Text style={styles.mathSub}>PID Position Controller Formulation:</Text>
              <Text style={styles.formula}>τ_i(t) = K_p · e_i + K_i · ∫ e_i dt + K_d · (de_i / dt)</Text>
              <Text style={styles.mathSub}>Impedance Contact Law:</Text>
              <Text style={styles.formula}>F_contact = K_env · (y_target − y_surface) + B_env · v_y</Text>
            </View>

            <Text style={styles.widgetHeader}>Live Telemetry Widget</Text>
            <View style={styles.gridParams}>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Yaw Error (|e_θ₀|)</Text>
                <Text style={styles.paramValue}>{deg(Math.abs(liveYaw - targetYaw))}</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Shoulder Error (|e_θ₁|)</Text>
                <Text style={styles.paramValue}>{deg(Math.abs(liveT1 - (result?.chosen?.theta1 ?? liveT1)))}</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Elbow Error (|e_θ₂|)</Text>
                <Text style={styles.paramValue}>{deg(Math.abs(liveT2 - (result?.chosen?.theta2 ?? liveT2)))}</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Controller Regime</Text>
                <Text style={[styles.paramValue, { color: isHolding ? '#fbbf24' : '#4ade80' }]}>
                  {isHolding ? 'FORCE COMPLIANCE' : 'PID POSITION TRACKING'}
                </Text>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • Proportional Torque: τ_p(Shoulder) = K_p · e₁ = 220.0 · {fmt(Math.abs(liveT1 - (result?.chosen?.theta1 ?? liveT1)), 3)} rad = {fmt(220 * Math.abs(liveT1 - (result?.chosen?.theta1 ?? liveT1)))} Nm
              </Text>
              <Text style={styles.solutionText}>
                • Proportional Torque: τ_p(Elbow) = K_p · e₂ = 160.0 · {fmt(Math.abs(liveT2 - (result?.chosen?.theta2 ?? liveT2)), 3)} rad = {fmt(160 * Math.abs(liveT2 - (result?.chosen?.theta2 ?? liveT2)))} Nm
              </Text>
              <Text style={styles.solutionText}>
                • Active Regime: {activeStep === 'DESCEND' || activeStep === 'GRASP' ? 'Surface Contact Impedance' : 'Free Flight Kinematic Tracking'}
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L15.8 — Pick-and-Place Sequence (FSM)
        ======================================================== */}
        {activeSubtopicId === 'L15.8' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Concept Explanation</Text>
            <Text style={styles.paragraph}>
              Finite State Machine (FSM) orchestrating the complete pick-and-place lifecycle with condition guards,
              pre-grasp alignment poses, and safety timeouts.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Formulas / Math Model:</Text>
              <Text style={styles.mathSub}>Pick Sequence Pipeline:</Text>
              <Text style={styles.formula}>SLEW ➔ APPROACH ➔ DESCEND ➔ GRASP ➔ LIFT</Text>
              <Text style={styles.mathSub}>Place Sequence Pipeline:</Text>
              <Text style={styles.formula}>TRANSFER ➔ DESCEND ➔ RELEASE ➔ RETREAT ➔ IDLE</Text>
            </View>

            <Text style={styles.widgetHeader}>Live Telemetry Widget</Text>
            <View style={styles.gridParams}>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Active Phase</Text>
                <Text style={styles.paramValue}>{phase.toUpperCase()}</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Current FSM State</Text>
                <Text style={[styles.paramValue, { color: '#38bdf8' }]}>{activeStep ?? 'IDLE'}</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Claw Position</Text>
                <Text style={styles.paramValue}>{fmt(liveGrip * 100, 0)}%</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Transition Guard</Text>
                <Text style={[styles.paramValue, { color: '#4ade80' }]}>e_joint &lt; 0.02 rad</Text>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • Pickup Target Coordinates = [{fmt(tx)}, {fmt(gripY)}, {fmt(tz)}]
              </Text>
              <Text style={styles.solutionText}>
                • Destination Drop Coordinates = [{fmt(markerPos?.x ?? tx)}, {fmt(gripY)}, {fmt(markerPos?.z ?? tz)}]
              </Text>
              <Text style={styles.solutionText}>
                • Total Transfer Distance = √(({fmt(markerPos?.x ?? tx)} − {fmt(tx)})² + ({fmt(markerPos?.z ?? tz)} − {fmt(tz)})²) = {fmt(Math.hypot((markerPos?.x ?? tx) - tx, (markerPos?.z ?? tz) - tz))} m
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L15.9 — Python Simulation Plan
        ======================================================== */}
        {activeSubtopicId === 'L15.9' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Concept Explanation</Text>
            <Text style={styles.paragraph}>
              Mathematical simulation architecture running synchronous time-stepping, forward vector computations,
              and fast algebraic inverse kinematics before deploying onto real hardware robots.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Formulas / Math Model:</Text>
              <Text style={styles.mathSub}>Synchronous Time Step & Matrix Integration:</Text>
              <Text style={styles.formula}>Δt = 1 / 60 = 0.0167 s (16.67 ms)</Text>
              <Text style={styles.formula}>P_tool = [r·cos(θ₀),   h + L₁·sin(θ₁) + L₂·sin(θ₁+θ₂),   r·sin(θ₀)]</Text>
            </View>

            <Text style={styles.widgetHeader}>Live Telemetry Widget</Text>
            <View style={styles.gridParams}>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Simulation Frame Rate</Text>
                <Text style={styles.paramValue}>60 FPS (16.67 ms)</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>IK Solver Compute Time</Text>
                <Text style={[styles.paramValue, { color: '#4ade80' }]}>&lt; 0.05 ms</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Forward Kinematic (x)</Text>
                <Text style={styles.paramValue}>{fmt(liveX)} m</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Forward Kinematic (y)</Text>
                <Text style={styles.paramValue}>{fmt(liveY)} m</Text>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                • r_arm = L₁·cos(θ₁) + L₂·cos(θ₁+θ₂) = {fmt(l1)}·cos({deg(liveT1)}) + {fmt(l2)}·cos({deg(liveT1 + liveT2)}) = {fmt(liveRadius)} m
              </Text>
              <Text style={styles.solutionText}>
                • y_tool = h + L₁·sin(θ₁) + L₂·sin(θ₁+θ₂) = {fmt(shoulderH)} + {fmt(l1)}·sin({deg(liveT1)}) + {fmt(l2)}·sin({deg(liveT1 + liveT2)}) = {fmt(liveY)} m
              </Text>
              <Text style={styles.solutionText}>
                • x_tool = r_arm·cos(θ₀) = {fmt(liveRadius)}·cos({deg(liveYaw)}) = {fmt(liveX)} m
              </Text>
              <Text style={styles.solutionText}>
                • z_tool = r_arm·sin(θ₀) = {fmt(liveRadius)}·sin({deg(liveYaw)}) = {fmt(liveZ)} m
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================
            L15.10 — Example Program Logic (IK Solver)
        ======================================================== */}
        {activeSubtopicId === 'L15.10' && (
          <View style={styles.section}>
            <Text style={styles.conceptHeader}>Concept Explanation</Text>
            <Text style={styles.paragraph}>
              Closed-form trigonometric inverse kinematics solver. Solves base turntable angle θ₀ via atan2, computes
              the elbow angle θ₂ from the Law of Cosines, and extracts the shoulder pitch θ₁.
            </Text>

            <View style={styles.mathBox}>
              <Text style={styles.mathHeader}>Core Formulas / Math Model:</Text>
              <Text style={styles.mathSub}>Law of Cosines for Elbow Joint (θ₂):</Text>
              <Text style={styles.formula}>cos(θ₂) = (|P|² − L₁² − L₂²) / (2 · L₁ · L₂)</Text>
              <Text style={styles.formula}>θ₂ = ± acos(cos(θ₂))      (Elbow-Up vs Elbow-Down)</Text>
              <Text style={styles.mathSub}>Shoulder Elevation Angle (θ₁):</Text>
              <Text style={styles.formula}>θ₁ = atan2(drop, r) − atan2(L₂·sin(θ₂), L₁ + L₂·cos(θ₂))</Text>
            </View>

            <Text style={styles.widgetHeader}>Live Telemetry Widget</Text>
            <View style={styles.gridParams}>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Radial Plane Reach (|P|)</Text>
                <Text style={styles.paramValue}>{fmt(targetReach)} m</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>cos(θ₂)</Text>
                <Text style={styles.paramValue}>{fmt(cosT2, 3)}</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Solved Shoulder (θ₁)</Text>
                <Text style={[styles.paramValue, { color: '#38bdf8' }]}>{deg(result?.chosen?.theta1 ?? liveT1)}</Text>
              </View>
              <View style={styles.paramBox}>
                <Text style={styles.paramLabel}>Solved Elbow (θ₂)</Text>
                <Text style={[styles.paramValue, { color: '#ffd23f' }]}>{deg(result?.chosen?.theta2 ?? liveT2)}</Text>
              </View>
            </View>

            <View style={styles.solutionBox}>
              <Text style={styles.solutionTitle}>Step-by-Step Mathematical Solution:</Text>
              <Text style={styles.solutionText}>
                1. Slew Angle: θ₀ = atan2(z, x) = atan2({fmt(tz)}, {fmt(tx)}) = {deg(targetYaw)}
              </Text>
              <Text style={styles.solutionText}>
                2. Arm Reach: |P| = √(r² + drop²) = √({fmt(targetRadius)}² + ({fmt(targetDrop)})²) = {fmt(targetReach)} m
              </Text>
              <Text style={styles.solutionText}>
                3. cos(θ₂) = (|P|² − L₁² − L₂²) / (2·L₁·L₂) = ({fmt(targetReach)}² − {fmt(l1)}² − {fmt(l2)}²) / (2·{fmt(l1)}·{fmt(l2)}) = {fmt(cosT2, 3)}
              </Text>
              <Text style={styles.solutionText}>
                4. θ₂ = −acos({fmt(cosT2, 3)}) = {deg(result?.chosen?.theta2 ?? liveT2)} (elbow-down configuration)
              </Text>
              <Text style={styles.solutionText}>
                5. θ₁ = atan2(drop, r) − atan2(L₂·sin(θ₂), L₁ + L₂·cos(θ₂)) = atan2({fmt(targetDrop)}, {fmt(targetRadius)}) − atan2({fmt(l2 * Math.sin(result?.chosen?.theta2 ?? liveT2))}, {fmt(l1 + l2 * Math.cos(result?.chosen?.theta2 ?? liveT2))}) = {deg(result?.chosen?.theta1 ?? liveT1)}
              </Text>
              <Text style={[styles.solutionText, { color: '#4ade80', fontWeight: '700' }]}>
                ✓ Solved Joint Vector: [θ₀, θ₁, θ₂] = [{deg(result?.chosen?.yaw ?? targetYaw)}, {deg(result?.chosen?.theta1 ?? liveT1)}, {deg(result?.chosen?.theta2 ?? liveT2)}]
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
  statusHolding: {
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
  }
});
