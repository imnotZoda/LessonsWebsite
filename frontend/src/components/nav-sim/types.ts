// src/components/nav-sim/types.ts

export interface Point {
  x: number;
  y: number;
}

export interface GridCoord {
  r: number;
  c: number;
}

export type AlgorithmType = 'astar' | 'dijkstra' | 'greedy';
export type HeuristicType = 'euclidean' | 'manhattan' | 'octile';
export type MapPreset = 'warehouse' | 'office' | 'slalom' | 'bottleneck' | 'empty';
export type InteractionMode = 'place-robot' | 'place-goal' | 'draw-wall' | 'erase-wall';

export interface RobotState {
  x: number; // in meters
  y: number; // in meters
  theta: number; // heading in radians (-PI to PI)
  v: number; // linear speed (m/s)
  w: number; // angular speed (rad/s)
  vLeft: number; // left wheel linear speed (m/s)
  vRight: number; // right wheel linear speed (m/s)
  uLeft: number; // left wheel angular speed (rad/s)
  uRight: number; // right wheel angular speed (rad/s)
  targetWaypointIndex: number;
  status: 'idle' | 'planning' | 'navigating' | 'reached' | 'blocked';
  distanceRemaining: number;
  progressPercent: number;
  traveledDistance: number;
  elapsedSeconds: number;
}

export interface NavConfig {
  rows: number;
  cols: number;
  cellSize: number; // meters per cell, default 0.5m
  robotRadius: number; // meters, default 0.35m
  safetyMargin: number; // meters, default 0.15m
  wheelBase: number; // meters between wheels (l), default 0.40m
  wheelRadius: number; // meters (r), default 0.08m
  maxVelocity: number; // m/s, default 1.4 m/s
  maxAngularVelocity: number; // rad/s, default 2.5 rad/s
  maxAccel: number; // m/s^2, default 2.0 m/s^2
  maxLateralAccel: number; // m/s^2, default 1.8 m/s^2
  sensorRange: number; // meters, default 3.5m
  algorithm: AlgorithmType;
  heuristic: HeuristicType;
  allowDiagonal: boolean;
  smoothPath: boolean;
}

export interface PathResult {
  found: boolean;
  path: Point[]; // smoothed continuous waypoints in meters
  rawGridPath: GridCoord[];
  nodesExplored: number;
  totalDistance: number; // meters along path
  directDistance: number; // straight-line Euclidean distance
  efficiencyRatio: number; // straight / path * 100%
  estimatedTime: number; // seconds
  exploredGrid: boolean[][];
  frontierGrid: boolean[][];
  searchTimeMs: number;
}

export interface SensorData {
  distance: number; // meters to closest obstacle in forward beam
  hit: boolean;
  maxRange: number;
  hitPoint?: Point;
}

export interface NavTelemetry {
  showPathVsTrajectory: boolean;
  replanCount: number;
  collisionCount: number;
  replanAlert: string | null;
  activeLoopStep: number;
  inflatedCellsCount: number;
  currentAccel: number;
  brakingDistance: number;
  turnSpeedCap: number;
  turnWarning: boolean;
}

export interface NavSubtopicMeta {
  id: string;
  code: string;
  title: string;
  badge: string;
}
