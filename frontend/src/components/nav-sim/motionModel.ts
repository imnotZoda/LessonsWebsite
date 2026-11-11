// src/components/nav-sim/motionModel.ts
import { RobotState, Point, NavConfig, SensorData } from './types';

export function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function createInitialRobot(x: number, y: number, theta = 0): RobotState {
  return {
    x,
    y,
    theta,
    v: 0,
    w: 0,
    vLeft: 0,
    vRight: 0,
    uLeft: 0,
    uRight: 0,
    targetWaypointIndex: 0,
    status: 'idle',
    distanceRemaining: 0,
    progressPercent: 0,
    traveledDistance: 0,
    elapsedSeconds: 0
  };
}

// Raycast forward LiDAR / Ultrasonic beam
export function castSensorRay(
  robot: RobotState,
  grid: boolean[][],
  config: NavConfig
): SensorData {
  const maxRange = config.sensorRange;
  const stepSize = 0.05; // 5 cm steps
  const cosT = Math.cos(robot.theta);
  const sinT = Math.sin(robot.theta);

  for (let dist = 0.1; dist <= maxRange; dist += stepSize) {
    const rx = robot.x + dist * cosT;
    const ry = robot.y + dist * sinT;
    const c = Math.floor(rx / config.cellSize);
    const r = Math.floor(ry / config.cellSize);

    if (r < 0 || r >= config.rows || c < 0 || c >= config.cols || grid[r][c]) {
      return {
        distance: dist,
        hit: true,
        maxRange,
        hitPoint: { x: rx, y: ry }
      };
    }
  }

  return {
    distance: maxRange,
    hit: false,
    maxRange
  };
}

// Count cells that fall inside the inflation radius of obstacles
export function computeInflatedCellsCount(
  grid: boolean[][],
  config: NavConfig
): number {
  const rows = config.rows;
  const cols = config.cols;
  const rInflated = config.robotRadius + config.safetyMargin;
  const cellInflationRadius = Math.ceil(rInflated / config.cellSize);
  let count = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c]) {
        count++;
        continue;
      }
      let isNear = false;
      for (let dr = -cellInflationRadius; dr <= cellInflationRadius && !isNear; dr++) {
        for (let dc = -cellInflationRadius; dc <= cellInflationRadius; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc]) {
            const dist = Math.hypot(dr * config.cellSize, dc * config.cellSize);
            if (dist <= rInflated) {
              isNear = true;
              break;
            }
          }
        }
      }
      if (isNear) count++;
    }
  }

  return count;
}

// Differential-drive path tracker using heading PID & lookahead
export function updateRobotMotion(
  robot: RobotState,
  waypoints: Point[],
  config: NavConfig,
  dt: number
): { robot: RobotState; currentAccel: number; turnSpeedCap: number; turnWarning: boolean } {
  if (robot.status !== 'navigating' || waypoints.length === 0) {
    return {
      robot: {
        ...robot,
        v: 0,
        w: 0,
        vLeft: 0,
        vRight: 0,
        uLeft: 0,
        uRight: 0
      },
      currentAccel: 0,
      turnSpeedCap: config.maxVelocity,
      turnWarning: false
    };
  }

  let index = robot.targetWaypointIndex;
  if (index >= waypoints.length) {
    return {
      robot: {
        ...robot,
        status: 'reached',
        v: 0,
        w: 0,
        vLeft: 0,
        vRight: 0,
        uLeft: 0,
        uRight: 0,
        distanceRemaining: 0,
        progressPercent: 100
      },
      currentAccel: 0,
      turnSpeedCap: config.maxVelocity,
      turnWarning: false
    };
  }

  const targetPt = waypoints[index];
  const dx = targetPt.x - robot.x;
  const dy = targetPt.y - robot.y;
  const distToTarget = Math.hypot(dx, dy);

  const waypointTolerance = index === waypoints.length - 1 ? 0.08 : Math.max(0.25, config.cellSize * 0.45);

  // Check if reached current waypoint
  if (distToTarget <= waypointTolerance) {
    index++;
    if (index >= waypoints.length) {
      return {
        robot: {
          ...robot,
          x: targetPt.x,
          y: targetPt.y,
          status: 'reached',
          v: 0,
          w: 0,
          vLeft: 0,
          vRight: 0,
          uLeft: 0,
          uRight: 0,
          distanceRemaining: 0,
          progressPercent: 100
        },
        currentAccel: 0,
        turnSpeedCap: config.maxVelocity,
        turnWarning: false
      };
    }
  }

  const activeTarget = waypoints[index];
  const targetDx = activeTarget.x - robot.x;
  const targetDy = activeTarget.y - robot.y;
  const targetAngle = Math.atan2(targetDy, targetDx);
  const headingError = normalizeAngle(targetAngle - robot.theta);

  // Angular velocity proportional controller with saturation
  const Kp_w = 4.0;
  let targetW = Kp_w * headingError;
  targetW = Math.max(-config.maxAngularVelocity, Math.min(config.maxAngularVelocity, targetW));

  // Turning speed cap based on centripetal acceleration: v_turn <= sqrt(a_lateral_max * R)
  // R = v / |w| -> v^2 <= a_lateral_max * (v / |w|) -> v <= a_lateral_max / |w|
  const absW = Math.max(0.01, Math.abs(targetW));
  const turnSpeedCap = Math.min(config.maxVelocity, config.maxLateralAccel / absW);
  const turnWarning = absW > 1.2;

  // Linear velocity: slowdown when turning sharply, ramp down near final destination
  const isFinal = index === waypoints.length - 1;
  const distToGoal = Math.hypot(waypoints[waypoints.length - 1].x - robot.x, waypoints[waypoints.length - 1].y - robot.y);
  const turnDamping = Math.max(0.15, Math.cos(headingError));
  const finalDecel = isFinal ? Math.min(1.0, distToGoal / 0.6) : 1.0;

  let targetV = Math.min(config.maxVelocity, turnSpeedCap) * turnDamping * finalDecel;
  if (Math.abs(headingError) > Math.PI / 3) {
    targetV *= 0.2;
  }

  // Smooth acceleration damping
  const accelV = config.maxAccel;
  const accelW = 6.0;
  const dv = targetV - robot.v;
  const boundedDv = Math.max(-accelV * dt, Math.min(accelV * dt, dv));
  const currentAccel = boundedDv / dt;

  const newV = robot.v + boundedDv;
  const newW = robot.w + Math.max(-accelW * dt, Math.min(accelW * dt, targetW - robot.w));

  // Compute differential wheel speeds:
  // vLeft = v - w * l / 2
  // vRight = v + w * l / 2
  // uLeft = vLeft / r
  // uRight = vRight / r
  const halfL = config.wheelBase / 2;
  const vRight = newV + newW * halfL;
  const vLeft = newV - newW * halfL;
  const uRight = vRight / config.wheelRadius;
  const uLeft = vLeft / config.wheelRadius;

  // Integrate state (Runge-Kutta / midpoint step)
  const midTheta = normalizeAngle(robot.theta + (newW * dt) / 2);
  const newX = robot.x + newV * Math.cos(midTheta) * dt;
  const newY = robot.y + newV * Math.sin(midTheta) * dt;
  const newTheta = normalizeAngle(robot.theta + newW * dt);

  // Remaining path distance calculation
  let remaining = Math.hypot(waypoints[index].x - newX, waypoints[index].y - newY);
  for (let i = index; i < waypoints.length - 1; i++) {
    remaining += Math.hypot(waypoints[i + 1].x - waypoints[i].x, waypoints[i + 1].y - waypoints[i].y);
  }

  const traveled = robot.traveledDistance + newV * dt;
  const totalApprox = traveled + remaining;
  const progressPercent = totalApprox > 0 ? Math.min(100, (traveled / totalApprox) * 100) : 0;

  return {
    robot: {
      ...robot,
      x: newX,
      y: newY,
      theta: newTheta,
      v: newV,
      w: newW,
      vLeft,
      vRight,
      uLeft,
      uRight,
      targetWaypointIndex: index,
      distanceRemaining: Math.max(0, remaining),
      progressPercent,
      traveledDistance: traveled,
      elapsedSeconds: robot.elapsedSeconds + dt
    },
    currentAccel,
    turnSpeedCap,
    turnWarning
  };
}
