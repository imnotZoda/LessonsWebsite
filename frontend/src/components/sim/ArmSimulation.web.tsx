/* eslint-disable react/no-unknown-property -- react-three-fiber JSX intrinsics */
// Web-only interactive robotic crane — react-three-fiber.
// Workflow: place the crate first (arm waits at stow), click the crate to send
// the arm through a pick-and-place state machine: SLEW → APPROACH → DESCEND →
// GRASP → LIFT, then drop a destination marker and click it for TRANSFER →
// DESCEND → RELEASE → RETREAT. Kinematics: turntable yaw (θ₀) slews the
// vertical arm plane to the target, shoulder/elbow (θ₁, θ₂) solve planar IK.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Edges, Grid, OrbitControls } from '@react-three/drei';
import { Vector3, type Group } from 'three';

import ExplanationPanel from './ExplanationPanel';
import { solveIk, groundReachBounds, type IkResult } from './ik';

const L1 = 1.4;
const L2 = 1.2;
const SHOULDER_H = 1.9;
const GRIP_Y = 0.42; // tip height where the open claw wraps the crate
const CARRY_Y = 1.0; // hover height for approach / lift / transfer
const MAST_CLEAR = 0.55;
const BOUNDS = groundReachBounds(GRIP_Y, SHOULDER_H, L1, L2);
const R_MIN = Math.max(BOUNDS.lo, MAST_CLEAR);
const R_MAX = BOUNDS.hi;

const CUBE_HALF = 0.13;
const CUBE_CENTER_Y = CUBE_HALF + 0.01;
const HOLD_OFFSET = CUBE_CENTER_Y - GRIP_Y; // crate rides this far below the tip

const STOW = { yaw: 0.55, t1: 1.05, t2: -2.0 }; // parked pose — boom up, forearm folded

// articulated finger curl (radians): open = flared V, closed = pads on the crate
const K1_OPEN = -0.5;
const K1_CLOSED = 0.28;
const K2_OPEN = -0.35;
const K2_CLOSED = -0.05;

const BODY_MAT = { color: '#171a22', metalness: 0.72, roughness: 0.34 };
const DARK_MAT = { color: '#10131a', metalness: 0.65, roughness: 0.4 };
const GOLD_GLOW = { color: '#2a2300', emissive: '#ffd23f', emissiveIntensity: 1.15 };
const RED_GLOW = { color: '#3a0d12', emissive: '#ff2a33', emissiveIntensity: 1.6 };
const STEEL_MAT = { color: '#8b93a7', metalness: 0.85, roughness: 0.25 };

type Phase = 'place' | 'picking' | 'holding' | 'placingDown';

interface SeqStep {
  label: string;
  joints?: { yaw: number; t1: number; t2: number };
  grip?: number;
  settle?: 'joints' | 'grip';
  attach?: boolean; // crate starts riding with the claw when this step completes
  detach?: boolean; // crate is left on the ground when this step completes
}

interface Seq {
  steps: SeqStep[];
  i: number;
  mode: 'pick' | 'place';
}

function dampAngle(current: number, goal: number, lambda: number, dt: number) {
  let delta = goal - current;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

function clampToWorkspace(x: number, z: number) {
  const d = Math.hypot(x, z);
  if (d > R_MAX) return { x: (x * R_MAX) / d, z: (z * R_MAX) / d };
  if (d < R_MIN) {
    if (d < 1e-6) return { x: R_MIN, z: 0 };
    return { x: (x * R_MIN) / d, z: (z * R_MIN) / d };
  }
  return { x, z };
}

function solveAt(x: number, z: number, gripY: number, current: { yaw: number; theta1: number; theta2: number }) {
  const solved = solveIk(x, z, L1, L2, SHOULDER_H, gripY, undefined, current);
  if (!solved.reachable || !solved.chosen) return null;
  return { yaw: solved.chosen.yaw, t1: solved.chosen.theta1, t2: solved.chosen.theta2 };
}

interface FingerProps {
  side: 1 | -1;
  k1: React.MutableRefObject<Group | null>;
  k2: React.MutableRefObject<Group | null>;
}

function Finger({ side, k1, k2 }: FingerProps) {
  return (
    <group position={[0, -0.125, side * 0.165]}>
      {/* palm knuckle — red hub, rotates the finger about the X axis */}
      <mesh rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.032, 0.032, 0.06, 16]} />
        <meshStandardMaterial {...RED_GLOW} />
      </mesh>
      <group ref={k1}>
        <mesh position={[0, -0.07, 0]}>
          <boxGeometry args={[0.045, 0.14, 0.035]} />
          <meshStandardMaterial {...STEEL_MAT} />
        </mesh>
        <group position={[0, -0.14, 0]} ref={k2}>
          <mesh rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.024, 0.024, 0.055, 16]} />
            <meshStandardMaterial {...RED_GLOW} />
          </mesh>
          <mesh position={[0, -0.065, 0]}>
            <boxGeometry args={[0.05, 0.13, 0.034]} />
            <meshStandardMaterial {...STEEL_MAT} />
          </mesh>
          {/* grip pad on the inner face */}
          <mesh position={[0, -0.065, -side * 0.02]}>
            <boxGeometry args={[0.052, 0.11, 0.012]} />
            <meshStandardMaterial {...DARK_MAT} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

interface ArmRigProps {
  goalRef: React.MutableRefObject<{ yaw: number; t1: number; t2: number }>;
  gripGoalRef: React.MutableRefObject<number>;
  seqRef: React.MutableRefObject<Seq | null>;
  phase: Phase;
  holdPointRef: React.MutableRefObject<Vector3>;
  onStepDone: (step: SeqStep, nextLabel: string) => void;
  onSeqDone: (mode: 'pick' | 'place') => void;
  onLiveArm?: (state: { yaw: number; t1: number; t2: number; grip: number }) => void;
}

function ArmRig({ goalRef, gripGoalRef, seqRef, phase, holdPointRef, onStepDone, onSeqDone, onLiveArm }: ArmRigProps) {
  const joints = useRef({ ...STOW });
  const grip = useRef(0);
  const lastEmit = useRef(0);
  const yawGroup = useRef<Group>(null);
  const joint1 = useRef<Group>(null);
  const joint2 = useRef<Group>(null);
  const tip = useRef<Group>(null);
  const k1a = useRef<Group>(null);
  const k1b = useRef<Group>(null);
  const k2a = useRef<Group>(null);
  const k2b = useRef<Group>(null);
  const world = useRef(new Vector3());

  useFrame((_, delta) => {
    const s = seqRef.current;
    if (s && s.i < s.steps.length) {
      const step = s.steps[s.i];
      if (step.joints) Object.assign(goalRef.current, step.joints);
      if (step.grip !== undefined) gripGoalRef.current = step.grip;
    } else if (phase === 'place') {
      Object.assign(goalRef.current, STOW);
    }

    joints.current.yaw = dampAngle(joints.current.yaw, goalRef.current.yaw, 6, delta);
    joints.current.t1 = dampAngle(joints.current.t1, goalRef.current.t1, 6, delta);
    joints.current.t2 = dampAngle(joints.current.t2, goalRef.current.t2, 6, delta);
    if (yawGroup.current) yawGroup.current.rotation.y = -joints.current.yaw;
    if (joint1.current) joint1.current.rotation.z = joints.current.t1;
    if (joint2.current) joint2.current.rotation.z = joints.current.t2;
    // the gripper hangs plumb like a crane hook — counter-rotate the tip
    if (tip.current) {
      tip.current.rotation.z = -(joints.current.t1 + joints.current.t2);
      tip.current.getWorldPosition(world.current);
      holdPointRef.current.set(world.current.x, world.current.y + HOLD_OFFSET, world.current.z);
    }

    grip.current += (gripGoalRef.current - grip.current) * (1 - Math.exp(-10 * delta));
    const k1 = K1_OPEN + (K1_CLOSED - K1_OPEN) * grip.current;
    const k2 = K2_OPEN + (K2_CLOSED - K2_OPEN) * grip.current;
    if (k1a.current) k1a.current.rotation.x = k1;
    if (k1b.current) k1b.current.rotation.x = -k1;
    if (k2a.current) k2a.current.rotation.x = k2;
    if (k2b.current) k2b.current.rotation.x = -k2;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastEmit.current > 45) {
      lastEmit.current = now;
      onLiveArm?.({
        yaw: joints.current.yaw,
        t1: joints.current.t1,
        t2: joints.current.t2,
        grip: grip.current
      });
    }

    // advance the sequence when the current step settles
    if (s && s.i < s.steps.length) {
      const step = s.steps[s.i];
      const jointErr =
        Math.abs(goalRef.current.yaw - joints.current.yaw) +
        Math.abs(goalRef.current.t1 - joints.current.t1) +
        Math.abs(goalRef.current.t2 - joints.current.t2);
      const settled = step.settle === 'grip' ? Math.abs((step.grip ?? 0) - grip.current) < 0.06 : jointErr < 0.02;
      if (settled) {
        s.i += 1;
        if (s.i >= s.steps.length) {
          seqRef.current = null;
          onSeqDone(s.mode);
        } else {
          onStepDone(step, s.steps[s.i].label);
        }
      }
    }
  });

  return (
    <group>
      {/* square base slab with red glowing edge trim */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[1.6, 0.1, 1.6]} />
        <meshStandardMaterial {...DARK_MAT} />
      </mesh>
      {[0.78, -0.78].map((edge) => (
        <React.Fragment key={edge}>
          <mesh position={[edge, 0.105, 0]}>
            <boxGeometry args={[0.02, 0.012, 1.56]} />
            <meshStandardMaterial {...RED_GLOW} />
          </mesh>
          <mesh position={[0, 0.105, edge]}>
            <boxGeometry args={[1.56, 0.012, 0.02]} />
            <meshStandardMaterial {...RED_GLOW} />
          </mesh>
        </React.Fragment>
      ))}

      {/* tall mast with gold accent strips */}
      <mesh position={[0, 0.95, 0]}>
        <boxGeometry args={[0.4, 1.7, 0.4]} />
        <meshStandardMaterial {...BODY_MAT} />
      </mesh>
      {[0.1, -0.1].map((x) => (
        <mesh key={x} position={[x, 0.95, 0.205]}>
          <boxGeometry args={[0.035, 1.5, 0.012]} />
          <meshStandardMaterial {...GOLD_GLOW} />
        </mesh>
      ))}
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[0.5, 0.24, 0.5]} />
        <meshStandardMaterial {...DARK_MAT} />
      </mesh>

      {/* slewing assembly: yaw group on the mast top */}
      <group position={[0, SHOULDER_H, 0]} ref={yawGroup}>
        <mesh position={[0, -0.07, 0]}>
          <cylinderGeometry args={[0.22, 0.27, 0.14, 32]} />
          <meshStandardMaterial {...BODY_MAT} />
        </mesh>

        <group ref={joint1}>
          <mesh>
            <torusGeometry args={[0.15, 0.038, 14, 40]} />
            <meshStandardMaterial {...RED_GLOW} />
          </mesh>
          <mesh rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.09, 0.09, 0.1, 24]} />
            <meshStandardMaterial {...DARK_MAT} />
          </mesh>
          <mesh position={[L1 / 2, 0, 0]}>
            <boxGeometry args={[L1, 0.15, 0.13]} />
            <meshStandardMaterial {...BODY_MAT} />
          </mesh>
          <mesh position={[L1 / 2, 0.085, 0]}>
            <boxGeometry args={[L1 * 0.82, 0.024, 0.135]} />
            <meshStandardMaterial {...GOLD_GLOW} />
          </mesh>

          <group position={[L1, 0, 0]}>
            <group ref={joint2}>
              <mesh>
                <torusGeometry args={[0.11, 0.03, 14, 36]} />
                <meshStandardMaterial {...RED_GLOW} />
              </mesh>
              <mesh rotation-x={Math.PI / 2}>
                <cylinderGeometry args={[0.07, 0.07, 0.09, 24]} />
                <meshStandardMaterial {...DARK_MAT} />
              </mesh>
              <mesh position={[L2 / 2, 0, 0]}>
                <boxGeometry args={[L2, 0.12, 0.1]} />
                <meshStandardMaterial {...BODY_MAT} />
              </mesh>
              <mesh position={[L2 / 2, 0.07, 0]}>
                <boxGeometry args={[L2 * 0.8, 0.02, 0.105]} />
                <meshStandardMaterial {...GOLD_GLOW} />
              </mesh>

              {/* wrist + articulated parallel-jaw gripper */}
              <group position={[L2, 0, 0]} ref={tip}>
                <mesh>
                  <cylinderGeometry args={[0.075, 0.09, 0.12, 24]} />
                  <meshStandardMaterial {...BODY_MAT} />
                </mesh>
                <mesh position={[0, -0.06, 0]}>
                  <cylinderGeometry args={[0.045, 0.055, 0.06, 16]} />
                  <meshStandardMaterial {...DARK_MAT} />
                </mesh>
                {/* palm plate — knuckles mount on its ±z edges */}
                <mesh position={[0, -0.1, 0]}>
                  <boxGeometry args={[0.26, 0.05, 0.34]} />
                  <meshStandardMaterial {...BODY_MAT} />
                </mesh>
                <Finger side={1} k1={k1a} k2={k2a} />
                <Finger side={-1} k1={k1b} k2={k2b} />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

interface TargetCubeProps {
  pos: { x: number; z: number };
  heldRef: React.MutableRefObject<boolean>;
  holdPointRef: React.MutableRefObject<Vector3>;
}

function TargetCube({ pos, heldRef, holdPointRef }: TargetCubeProps) {
  const group = useRef<Group>(null);
  useFrame(() => {
    if (heldRef.current && group.current) {
      group.current.position.set(holdPointRef.current.x, holdPointRef.current.y, holdPointRef.current.z);
    }
  });
  return (
    <group ref={group} position={[pos.x, 0, pos.z]}>
      <mesh position={[0, CUBE_CENTER_Y, 0]}>
        <boxGeometry args={[CUBE_HALF * 2, CUBE_HALF * 2, CUBE_HALF * 2]} />
        <meshStandardMaterial color="#e0563f" emissive="#e0563f" emissiveIntensity={0.35} />
        <Edges scale={1.01} color="#8c3220" />
      </mesh>
    </group>
  );
}

function DestMarker({ pos }: { pos: { x: number; z: number } }) {
  return (
    <group position={[pos.x, 0, pos.z]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.16, 0.2, 48]} />
        <meshBasicMaterial color="#ffd23f" transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.56, 12]} />
        <meshStandardMaterial {...STEEL_MAT} />
      </mesh>
      <mesh position={[0.09, 0.5, 0]}>
        <boxGeometry args={[0.18, 0.11, 0.015]} />
        <meshStandardMaterial {...GOLD_GLOW} />
      </mesh>
    </group>
  );
}

export default function ArmSimulation() {
  const [phase, setPhase] = useState<Phase>('place');
  const [cubePos, setCubePos] = useState({ x: 1.5, z: 0.6 });
  const [marker, setMarker] = useState<{ x: number; z: number } | null>(null);
  const [result, setResult] = useState<IkResult | null>(null);
  const [stepLabel, setStepLabel] = useState<string | null>(null);
  const [fsmSteps, setFsmSteps] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [liveArm, setLiveArm] = useState({ yaw: STOW.yaw, t1: STOW.t1, t2: STOW.t2, grip: 0 });
  const [selectedSubtopic, setSelectedSubtopic] = useState('L15.10');
  const [isExplanationCollapsed, setIsExplanationCollapsed] = useState(false);

  const goal = useRef({ ...STOW });
  const gripGoal = useRef(0);
  const seq = useRef<Seq | null>(null);
  const held = useRef(false);
  const holdPoint = useRef(new Vector3());

  const placed = useRef({ x: 1.5, z: 0.6 });

  const preview = useCallback((x: number, z: number) => {
    const p = clampToWorkspace(x, z);
    placed.current = p;
    setResult(solveIk(p.x, p.z, L1, L2, SHOULDER_H, GRIP_Y, undefined, { yaw: goal.current.yaw, theta1: goal.current.t1, theta2: goal.current.t2 }));
    return p;
  }, []);

  const onPlaneDown = (event: ThreeEvent<PointerEvent>) => {
    if (phase === 'picking' || phase === 'placingDown') return;
    event.stopPropagation();
    setDragging(true);
    const p = preview(event.point.x, event.point.z);
    if (phase === 'place') setCubePos(p);
    else setMarker(p);
  };
  const onPlaneMove = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    const p = preview(event.point.x, event.point.z);
    if (phase === 'place') setCubePos(p);
    else if (phase === 'holding') setMarker(p);
  };
  // releasing the pointer IS the command — place the block, let go, the arm grasps it
  const stopDrag = () => {
    if (!dragging) return;
    setDragging(false);
    if (phase === 'place') sendPick(placed.current);
    else if (phase === 'holding' && marker) sendPlace(placed.current);
  };

  const sendPick = (pos: { x: number; z: number }) => {
    const land = solveIk(pos.x, pos.z, L1, L2, SHOULDER_H, GRIP_Y, undefined, { yaw: goal.current.yaw, theta1: goal.current.t1, theta2: goal.current.t2 });
    const hover = solveAt(pos.x, pos.z, CARRY_Y, { yaw: land.yaw, theta1: STOW.t1, theta2: STOW.t2 });
    const carry = solveAt(pos.x, pos.z, CARRY_Y, { yaw: land.yaw, theta1: STOW.t1, theta2: STOW.t2 });
    if (!land.reachable || !land.chosen || !hover || !carry) return;
    setResult(land);
    const joints = { yaw: land.chosen.yaw, t1: land.chosen.theta1, t2: land.chosen.theta2 };
    seq.current = {
      mode: 'pick',
      i: 0,
      steps: [
        { label: 'SLEW', joints: { yaw: joints.yaw, t1: STOW.t1, t2: STOW.t2 } },
        { label: 'APPROACH', joints: hover },
        { label: 'DESCEND', joints },
        { label: 'GRASP', grip: 1, settle: 'grip', attach: true },
        { label: 'LIFT', joints: carry }
      ]
    };
    setFsmSteps(seq.current.steps.map((s) => s.label));
    setStepLabel(seq.current.steps[0].label);
    setPhase('picking');
  };

  const sendPlace = (pos: { x: number; z: number }) => {
    const land = solveIk(pos.x, pos.z, L1, L2, SHOULDER_H, GRIP_Y, undefined, { yaw: goal.current.yaw, theta1: goal.current.t1, theta2: goal.current.t2 });
    const carry = solveAt(pos.x, pos.z, CARRY_Y, { yaw: goal.current.yaw, theta1: goal.current.t1, theta2: goal.current.t2 });
    if (!land.reachable || !land.chosen || !carry) return;
    setResult(land);
    const joints = { yaw: land.chosen.yaw, t1: land.chosen.theta1, t2: land.chosen.theta2 };
    seq.current = {
      mode: 'place',
      i: 0,
      steps: [
        { label: 'TRANSFER', joints: carry },
        { label: 'DESCEND', joints },
        { label: 'RELEASE', grip: 0, settle: 'grip', detach: true },
        { label: 'RETREAT', joints: STOW }
      ]
    };
    setFsmSteps(seq.current.steps.map((s) => s.label));
    setStepLabel(seq.current.steps[0].label);
    setPhase('placingDown');
  };

  const onStepDone = useCallback((step: SeqStep, nextLabel: string) => {
    if (step.attach) held.current = true;
    if (step.detach) {
      held.current = false;
      setMarker((m) => {
        if (m) setCubePos(m);
        return m;
      });
    }
    setStepLabel(nextLabel);
  }, []);

  const onSeqDone = useCallback((mode: 'pick' | 'place') => {
    setStepLabel(null);
    setFsmSteps([]);
    setPhase(mode === 'pick' ? 'holding' : 'place');
    if (mode === 'place') setMarker(null);
  }, []);

  const reset = () => {
    seq.current = null;
    held.current = false;
    gripGoal.current = 0;
    Object.assign(goal.current, STOW);
    setLiveArm({ yaw: STOW.yaw, t1: STOW.t1, t2: STOW.t2, grip: 0 });
    setMarker(null);
    setStepLabel(null);
    setFsmSteps([]);
    setDragging(false);
    setPhase('place');
    setCubePos({ x: 1.5, z: 0.6 });
    preview(1.5, 0.6);
  };

  useEffect(() => {
    preview(1.5, 0.6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hint =
    phase === 'place'
      ? 'Click or drag the ground to place the crate — the arm grasps it as soon as you let go.'
      : phase === 'holding'
        ? 'Crate secured. Click or drag the ground to set the drop point — the arm delivers on release.'
        : `Executing: ${stepLabel ?? '…'}`;

  return (
    <View style={styles.layout}>
      <View style={styles.canvasWrap}>
        <Canvas camera={{ position: [3.6, 3.4, 3.6], fov: 44 }}>
          <color attach="background" args={['#101b35']} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[4, 6, 3]} intensity={1.15} />
          <directionalLight position={[-3, 4, -3]} intensity={0.25} color="#d174d2" />

          <Grid
            position={[0, 0.001, 0]}
            args={[10, 10]}
            cellSize={0.5}
            cellColor="#24365c"
            sectionSize={1}
            sectionColor="#3f567f"
            fadeDistance={20}
            infiniteGrid
          />
          <ContactShadows position={[0, 0.002, 0]} scale={10} blur={2.4} opacity={0.55} far={5} resolution={512} />

          {/* workspace boundary: outer reach ring + mast keep-out ring */}
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
            <ringGeometry args={[R_MAX - 0.015, R_MAX, 96]} />
            <meshBasicMaterial color="#e0563f" transparent opacity={0.8} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
            <ringGeometry args={[R_MIN, R_MIN + 0.015, 64]} />
            <meshBasicMaterial color="#e0563f" transparent opacity={0.45} />
          </mesh>

          {/* pointer input surface */}
          <mesh
            rotation-x={-Math.PI / 2}
            position={[0, 0, 0]}
            onPointerDown={onPlaneDown}
            onPointerMove={onPlaneMove}
            onPointerUp={stopDrag}
            onPointerLeave={stopDrag}
          >
            <planeGeometry args={[60, 60]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>

          <TargetCube pos={cubePos} heldRef={held} holdPointRef={holdPoint} />
          {marker && phase === 'holding' && <DestMarker pos={marker} />}

          <ArmRig
            goalRef={goal}
            gripGoalRef={gripGoal}
            seqRef={seq}
            phase={phase}
            holdPointRef={holdPoint}
            onStepDone={onStepDone}
            onSeqDone={onSeqDone}
            onLiveArm={setLiveArm}
          />
          <OrbitControls makeDefault enabled={!dragging} maxPolarAngle={Math.PI / 2.05} minDistance={3} maxDistance={14} />
        </Canvas>
      </View>

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
        <View style={styles.side}>
          <TouchableOpacity
            style={styles.collapseButton}
            onPress={() => setIsExplanationCollapsed(true)}
            accessibilityLabel="Hide explanation panel"
            accessibilityRole="button"
          >
            <Text style={styles.collapseButtonText}>›</Text>
          </TouchableOpacity>
          <ExplanationPanel
            result={result}
            l1={L1}
            l2={L2}
            shoulderH={SHOULDER_H}
            gripY={GRIP_Y}
            fsmSteps={fsmSteps}
            activeStep={stepLabel}
            phase={phase}
            currentJoints={{ yaw: liveArm.yaw, t1: liveArm.t1, t2: liveArm.t2 }}
            gripValue={liveArm.grip}
            cubePos={cubePos}
            markerPos={marker}
            selectedSubtopic={selectedSubtopic}
            onSelectSubtopic={setSelectedSubtopic}
          />
          <Text style={styles.hint}>{hint}</Text>
          <View style={styles.resetBtn}>
            <Text style={styles.resetBtnText} onPress={reset}>
              ↺ Reset simulation
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1, flexDirection: 'row', gap: 16, padding: 20 },
  canvasWrap: {
    flex: 1,
    minHeight: 440,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a3d5f'
  },
  side: { width: 680, maxWidth: '60%', height: '100%', gap: 12, alignSelf: 'flex-start', marginTop: -8 },
  collapsedRail: { width: 52, alignItems: 'center' },
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
  collapseButtonText: { fontSize: 20, lineHeight: 20, fontWeight: '400', color: '#9fb9dc' },
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
  toggleButtonText: { fontSize: 20, lineHeight: 20, fontWeight: '400', color: '#9fb9dc' },
  hint: { fontSize: 14, lineHeight: 21, color: '#c4c9d8' },
  resetBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#e0563f',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#ff7a63'
  },
  resetBtnText: { fontSize: 14, fontWeight: '700', color: '#ffffff', letterSpacing: 0.3 }
});
