// src/components/nav-sim/NavCanvas.web.tsx
import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Point,
  GridCoord,
  NavConfig,
  RobotState,
  PathResult,
  InteractionMode,
  MapPreset,
  AlgorithmType,
  SensorData,
  NavTelemetry
} from './types';
import { worldToGrid, gridToWorld, findPath, createPresetMap, createEmptyGrid } from './pathfinding';
import {
  updateRobotMotion,
  createInitialRobot,
  castSensorRay,
  computeInflatedCellsCount
} from './motionModel';

export interface NavCanvasHandle {
  spawnDynamicObstacle: () => void;
}

interface NavCanvasProps {
  showPathVsTrajectory: boolean;
  onRobotChange?: (robot: RobotState) => void;
  onPathChange?: (result: PathResult, startPos: Point, goalPos: Point, startCoord: GridCoord, goalCoord: GridCoord) => void;
  onConfigChange?: (config: NavConfig) => void;
  onGridChange?: (grid: boolean[][], obstacleCount: number) => void;
  onSensorChange?: (sensor: SensorData) => void;
  onTelemetryChange?: (partial: Partial<NavTelemetry>) => void;
}

const NavCanvas = forwardRef<NavCanvasHandle, NavCanvasProps>(function NavCanvas(
  {
    showPathVsTrajectory,
    onRobotChange,
    onPathChange,
    onConfigChange,
    onGridChange,
    onSensorChange,
    onTelemetryChange
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Configuration
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

  const [interactionMode, setInteractionMode] = useState<InteractionMode>('place-robot');
  const [simSpeed, setSimSpeed] = useState<number>(1.5);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Grid and positions
  const [grid, setGrid] = useState<boolean[][]>(() => createPresetMap('warehouse', 18, 28));
  const [startPos, setStartPos] = useState<Point>({ x: 1.5, y: 1.5 });
  const [goalPos, setGoalPos] = useState<Point>({ x: 12.5, y: 7.5 });

  // Robot dynamic state
  const robotRef = useRef<RobotState>(createInitialRobot(1.5, 1.5, 0));
  const [, setRobotState] = useState<RobotState>(robotRef.current);

  // Pathfinding result
  const [pathResult, setPathResult] = useState<PathResult>(() => {
    const sCoord = worldToGrid({ x: 1.5, y: 1.5 }, 0.5, 18, 28);
    const gCoord = worldToGrid({ x: 12.5, y: 7.5 }, 0.5, 18, 28);
    const initialGrid = createPresetMap('warehouse', 18, 28);
    return findPath(sCoord, gCoord, initialGrid, {
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
  });

  // Sensor state
  const sensorRef = useRef<SensorData>({ distance: 3.5, hit: false, maxRange: 3.5 });

  // Dragging state
  const dragTargetRef = useRef<'robot' | 'goal' | 'draw' | 'erase' | null>(null);
  const hoverCoordRef = useRef<GridCoord | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const pulseRef = useRef<number>(0);
  const loopStepRef = useRef<number>(1);
  const loopTimerRef = useRef<number>(0);

  // Count obstacles
  const countObstacles = useCallback((g: boolean[][]) => {
    let count = 0;
    for (let r = 0; r < g.length; r++) {
      for (let c = 0; c < g[r].length; c++) {
        if (g[r][c]) count++;
      }
    }
    return count;
  }, []);

  // Solve and update path
  const recomputePath = useCallback(
    (sPos: Point, gPos: Point, currentGrid: boolean[][], cfg: NavConfig) => {
      const sCoord = worldToGrid(sPos, cfg.cellSize, cfg.rows, cfg.cols);
      const gCoord = worldToGrid(gPos, cfg.cellSize, cfg.rows, cfg.cols);
      const res = findPath(sCoord, gCoord, currentGrid, cfg);
      setPathResult(res);

      onPathChange?.(res, sPos, gPos, sCoord, gCoord);
      onConfigChange?.(cfg);
      onGridChange?.(currentGrid, countObstacles(currentGrid));

      const infCount = computeInflatedCellsCount(currentGrid, cfg);
      onTelemetryChange?.({ inflatedCellsCount: infCount });

      return res;
    },
    [onPathChange, onConfigChange, onGridChange, onTelemetryChange, countObstacles]
  );

  // Trigger initial updates to parent
  useEffect(() => {
    recomputePath(startPos, goalPos, grid, config);
  }, []);

  // Update robot ref and notify parent
  const setRobot = useCallback(
    (newRobot: RobotState) => {
      robotRef.current = newRobot;
      setRobotState(newRobot);
      onRobotChange?.(newRobot);
    },
    [onRobotChange]
  );

  // Expose spawnDynamicObstacle to parent
  useImperativeHandle(ref, () => ({
    spawnDynamicObstacle: () => {
      // Find upcoming target cell on path ahead of robot
      let targetCoord: GridCoord | null = null;
      if (pathResult.rawGridPath && pathResult.rawGridPath.length > 2) {
        const nextIdx = Math.min(
          pathResult.rawGridPath.length - 2,
          Math.max(1, Math.floor(robotRef.current.targetWaypointIndex * 1.5) + 2)
        );
        targetCoord = pathResult.rawGridPath[nextIdx];
      }

      if (!targetCoord) {
        // Fallback: place in front of robot in heading direction
        const dropDist = 1.2;
        const fx = robotRef.current.x + dropDist * Math.cos(robotRef.current.theta);
        const fy = robotRef.current.y + dropDist * Math.sin(robotRef.current.theta);
        targetCoord = worldToGrid({ x: fx, y: fy }, config.cellSize, config.rows, config.cols);
      }

      if (targetCoord && !isStartOrGoal(targetCoord.r, targetCoord.c)) {
        grid[targetCoord.r][targetCoord.c] = true;
        setGrid([...grid]);

        onTelemetryChange?.({
          replanAlert: '[REPLAN TRIGGERED: Path Blocked by Dynamic Obstacle]',
          turnWarning: true
        });

        // Trigger A* replan immediately
        recomputePath({ x: robotRef.current.x, y: robotRef.current.y }, goalPos, grid, config);
      }
    }
  }));

  // Handle Preset Map Selection
  const handleSelectPreset = (preset: MapPreset) => {
    const newGrid =
      preset === 'empty'
        ? createEmptyGrid(config.rows, config.cols)
        : createPresetMap(preset, config.rows, config.cols);
    setGrid(newGrid);

    const sCoord = worldToGrid(startPos, config.cellSize, config.rows, config.cols);
    const gCoord = worldToGrid(goalPos, config.cellSize, config.rows, config.cols);
    newGrid[sCoord.r][sCoord.c] = false;
    newGrid[gCoord.r][gCoord.c] = false;

    setIsPlaying(false);
    const initial = createInitialRobot(startPos.x, startPos.y, 0);
    setRobot(initial);
    recomputePath(startPos, goalPos, newGrid, config);
  };

  // Reset Simulation to Start
  const handleReset = () => {
    setIsPlaying(false);
    const initial = createInitialRobot(startPos.x, startPos.y, 0);
    setRobot(initial);
    recomputePath(startPos, goalPos, grid, config);
  };

  // Toggle Play / Pause
  const handleTogglePlay = () => {
    if (!pathResult.found || pathResult.path.length === 0) return;

    if (robotRef.current.status === 'reached') {
      const initial = createInitialRobot(startPos.x, startPos.y, 0);
      initial.status = 'navigating';
      setRobot(initial);
      setIsPlaying(true);
    } else {
      const nextPlaying = !isPlaying;
      setIsPlaying(nextPlaying);
      robotRef.current.status = nextPlaying ? 'navigating' : 'idle';
      setRobot({ ...robotRef.current });
    }
  };

  // Physics animation loop
  useEffect(() => {
    const loop = (time: number) => {
      const rawDt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      const dt = Math.min(0.08, rawDt) * simSpeed;
      pulseRef.current = (pulseRef.current + 0.04) % (Math.PI * 2);

      // Cycle active control loop step for L16.10
      loopTimerRef.current += dt;
      if (loopTimerRef.current > 0.3) {
        loopTimerRef.current = 0;
        loopStepRef.current = (loopStepRef.current % 6) + 1;
        onTelemetryChange?.({ activeLoopStep: loopStepRef.current });
      }

      // Sensor raycast
      const currentSensor = castSensorRay(robotRef.current, grid, config);
      sensorRef.current = currentSensor;
      onSensorChange?.(currentSensor);

      if (isPlaying && robotRef.current.status === 'navigating' && pathResult.found) {
        const { robot: nextBot, currentAccel, turnSpeedCap, turnWarning } = updateRobotMotion(
          robotRef.current,
          pathResult.path,
          config,
          dt
        );
        setRobot(nextBot);

        onTelemetryChange?.({
          currentAccel,
          turnSpeedCap,
          turnWarning,
          brakingDistance: (nextBot.v * nextBot.v) / (2 * Math.max(0.5, config.maxAccel))
        });

        if (nextBot.status === 'reached') {
          setIsPlaying(false);
        }
      }

      drawCanvas();
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    lastTimeRef.current = performance.now();
    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, pathResult, config, simSpeed]);

  // Coordinate conversion helpers for canvas
  const getCanvasCoords = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0, r: 0, c: 0 };
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      const scaleX = (config.cols * config.cellSize) / rect.width;
      const scaleY = (config.rows * config.cellSize) / rect.height;

      const worldX = px * scaleX;
      const worldY = py * scaleY;
      const coord = worldToGrid({ x: worldX, y: worldY }, config.cellSize, config.rows, config.cols);

      return { x: worldX, y: worldY, r: coord.r, c: coord.c };
    },
    [config]
  );

  const isStartOrGoal = (r: number, c: number) => {
    const sCoord = worldToGrid(startPos, config.cellSize, config.rows, config.cols);
    const gCoord = worldToGrid(goalPos, config.cellSize, config.rows, config.cols);
    return (r === sCoord.r && c === sCoord.c) || (r === gCoord.r && c === gCoord.c);
  };

  // Pointer Down Interaction
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y, r, c } = getCanvasCoords(e);
    const distToRobot = Math.hypot(x - robotRef.current.x, y - robotRef.current.y);
    const distToGoal = Math.hypot(x - goalPos.x, y - goalPos.y);

    if (distToRobot <= config.robotRadius * 1.5 || interactionMode === 'place-robot') {
      dragTargetRef.current = 'robot';
      const cellCenter = gridToWorld({ r, c }, config.cellSize);
      setStartPos(cellCenter);
      const updatedRobot = createInitialRobot(cellCenter.x, cellCenter.y, robotRef.current.theta);
      setRobot(updatedRobot);
      grid[r][c] = false;
      setGrid([...grid]);
      recomputePath(cellCenter, goalPos, grid, config);
    } else if (distToGoal <= 0.6 || interactionMode === 'place-goal') {
      dragTargetRef.current = 'goal';
      const cellCenter = gridToWorld({ r, c }, config.cellSize);
      setGoalPos(cellCenter);
      grid[r][c] = false;
      setGrid([...grid]);
      recomputePath(startPos, cellCenter, grid, config);
    } else if (interactionMode === 'draw-wall') {
      dragTargetRef.current = 'draw';
      if (!isStartOrGoal(r, c)) {
        grid[r][c] = true;
        setGrid([...grid]);
        recomputePath(startPos, goalPos, grid, config);
      }
    } else if (interactionMode === 'erase-wall') {
      dragTargetRef.current = 'erase';
      grid[r][c] = false;
      setGrid([...grid]);
      recomputePath(startPos, goalPos, grid, config);
    }
  };

  // Pointer Move Interaction
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y, r, c } = getCanvasCoords(e);
    hoverCoordRef.current = { r, c };

    if (!dragTargetRef.current) return;

    if (dragTargetRef.current === 'robot') {
      const cellCenter = gridToWorld({ r, c }, config.cellSize);
      setStartPos(cellCenter);
      grid[r][c] = false;
      const updated = createInitialRobot(cellCenter.x, cellCenter.y, robotRef.current.theta);
      setRobot(updated);
      recomputePath(cellCenter, goalPos, grid, config);
    } else if (dragTargetRef.current === 'goal') {
      const cellCenter = gridToWorld({ r, c }, config.cellSize);
      setGoalPos(cellCenter);
      grid[r][c] = false;
      recomputePath(startPos, cellCenter, grid, config);
    } else if (dragTargetRef.current === 'draw') {
      if (!isStartOrGoal(r, c) && !grid[r][c]) {
        grid[r][c] = true;
        setGrid([...grid]);
        recomputePath(startPos, goalPos, grid, config);
      }
    } else if (dragTargetRef.current === 'erase') {
      if (grid[r][c]) {
        grid[r][c] = false;
        setGrid([...grid]);
        recomputePath(startPos, goalPos, grid, config);
      }
    }
  };

  const handlePointerUp = () => {
    dragTargetRef.current = null;
  };

  // Draw full simulation frame on HTML5 Canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const cellW = width / config.cols;
    const cellH = height / config.rows;

    ctx.clearRect(0, 0, width, height);

    // Deep modern dark floor
    ctx.fillStyle = '#0a0f1d';
    ctx.fillRect(0, 0, width, height);

    // Subtle Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= config.cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cellW, 0);
      ctx.lineTo(c * cellW, height);
      ctx.stroke();
    }
    for (let r = 0; r <= config.rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * cellH);
      ctx.lineTo(width, r * cellH);
      ctx.stroke();
    }

    // Explored Nodes Heatmap (A* Closed Set & Open Set)
    if (pathResult.exploredGrid) {
      for (let r = 0; r < config.rows; r++) {
        for (let c = 0; c < config.cols; c++) {
          if (pathResult.exploredGrid[r][c]) {
            ctx.fillStyle = 'rgba(56, 189, 248, 0.07)';
            ctx.fillRect(c * cellW + 1, r * cellH + 1, cellW - 2, cellH - 2);
          } else if (pathResult.frontierGrid && pathResult.frontierGrid[r][c]) {
            ctx.fillStyle = 'rgba(251, 191, 36, 0.12)';
            ctx.fillRect(c * cellW + 1, r * cellH + 1, cellW - 2, cellH - 2);
          }
        }
      }
    }

    // Obstacle Blocks
    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        if (grid[r][c]) {
          const ox = c * cellW;
          const oy = r * cellH;

          // Block body
          const grad = ctx.createLinearGradient(ox, oy, ox + cellW, oy + cellH);
          grad.addColorStop(0, '#1e293b');
          grad.addColorStop(1, '#334155');
          ctx.fillStyle = grad;
          ctx.fillRect(ox + 1, oy + 1, cellW - 2, cellH - 2);

          // Top highlight bevel
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(ox + 1.5, oy + 1.5, cellW - 3, cellH - 3);

          // Diagonal hatch mark
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ox + 4, oy + 4);
          ctx.lineTo(ox + cellW - 4, oy + cellH - 4);
          ctx.stroke();
        }
      }
    }

    // L16.6: RAW PATH VS. SMOOTHED TRAJECTORY COMPARISON
    if (showPathVsTrajectory && pathResult.rawGridPath && pathResult.rawGridPath.length > 1) {
      // Draw Raw Geometric Grid Path in YELLOW
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let i = 0; i < pathResult.rawGridPath.length; i++) {
        const pt = gridToWorld(pathResult.rawGridPath[i], config.cellSize);
        const px = (pt.x / (config.cols * config.cellSize)) * width;
        const py = (pt.y / (config.rows * config.cellSize)) * height;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Raw Waypoint square markers
      for (let i = 0; i < pathResult.rawGridPath.length; i++) {
        const pt = gridToWorld(pathResult.rawGridPath[i], config.cellSize);
        const px = (pt.x / (config.cols * config.cellSize)) * width;
        const py = (pt.y / (config.rows * config.cellSize)) * height;
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(px - 3, py - 3, 6, 6);
      }
    }

    // Planned Path (Laser Ribbon - Smoothed Trajectory in CYAN)
    if (pathResult.found && pathResult.path.length > 1) {
      const waypoints = pathResult.path;

      // Outer laser glow
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < waypoints.length; i++) {
        const px = (waypoints[i].x / (config.cols * config.cellSize)) * width;
        const py = (waypoints[i].y / (config.rows * config.cellSize)) * height;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Main core path line
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Animated traveling dash pulse
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 12]);
      ctx.lineDashOffset = -pulseRef.current * 18;
      ctx.stroke();
      ctx.setLineDash([]);

      // Waypoint nodes
      for (let i = 1; i < waypoints.length - 1; i++) {
        const px = (waypoints[i].x / (config.cols * config.cellSize)) * width;
        const py = (waypoints[i].y / (config.rows * config.cellSize)) * height;
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0a0f1d';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Destination / Goal Marker
    const goalPx = (goalPos.x / (config.cols * config.cellSize)) * width;
    const goalPy = (goalPos.y / (config.rows * config.cellSize)) * height;
    const pulseRadius = 12 + Math.sin(pulseRef.current * 2) * 4;

    // Outer sonar ring
    ctx.strokeStyle = 'rgba(224, 86, 63, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(goalPx, goalPy, pulseRadius + 6, 0, Math.PI * 2);
    ctx.stroke();

    // Secondary sonar ring
    ctx.fillStyle = 'rgba(224, 86, 63, 0.18)';
    ctx.beginPath();
    ctx.arc(goalPx, goalPy, pulseRadius, 0, Math.PI * 2);
    ctx.fill();

    // Central Goal Pin
    ctx.fillStyle = '#e0563f';
    ctx.beginPath();
    ctx.arc(goalPx, goalPy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Goal Target Icon (Bullseye dot)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(goalPx, goalPy, 3, 0, Math.PI * 2);
    ctx.fill();

    // Goal Label
    ctx.fillStyle = '#ff7a63';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GOAL', goalPx, goalPy - 18);

    // Robot Rendering
    const bot = robotRef.current;
    const botPx = (bot.x / (config.cols * config.cellSize)) * width;
    const botPy = (bot.y / (config.rows * config.cellSize)) * height;
    const botRadiusPx = (config.robotRadius / config.cellSize) * (cellW * 0.9);

    ctx.save();
    ctx.translate(botPx, botPy);
    ctx.rotate(bot.theta);

    // Forward LiDAR Scanning Beam
    const lidarRangePx = (config.sensorRange / (config.cols * config.cellSize)) * width;
    const lidarGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, lidarRangePx);
    lidarGrad.addColorStop(0, sensorRef.current.hit ? 'rgba(251, 191, 36, 0.35)' : 'rgba(56, 189, 248, 0.25)');
    lidarGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = lidarGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, lidarRangePx, -Math.PI / 6, Math.PI / 6);
    ctx.closePath();
    ctx.fill();

    // Robot Base Halo / Underglow
    ctx.fillStyle = isPlaying ? 'rgba(74, 222, 128, 0.25)' : 'rgba(56, 189, 248, 0.2)';
    ctx.beginPath();
    ctx.arc(0, 0, botRadiusPx + 4, 0, Math.PI * 2);
    ctx.fill();

    // Left Wheel
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-botRadiusPx * 0.7, -botRadiusPx * 1.1, botRadiusPx * 1.4, botRadiusPx * 0.35);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.strokeRect(-botRadiusPx * 0.7, -botRadiusPx * 1.1, botRadiusPx * 1.4, botRadiusPx * 0.35);

    // Right Wheel
    ctx.fillRect(-botRadiusPx * 0.7, botRadiusPx * 0.75, botRadiusPx * 1.4, botRadiusPx * 0.35);
    ctx.strokeRect(-botRadiusPx * 0.7, botRadiusPx * 0.75, botRadiusPx * 1.4, botRadiusPx * 0.35);

    // Circular Chassis
    const chassisGrad = ctx.createLinearGradient(-botRadiusPx, -botRadiusPx, botRadiusPx, botRadiusPx);
    chassisGrad.addColorStop(0, '#1e293b');
    chassisGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = chassisGrad;
    ctx.beginPath();
    ctx.arc(0, 0, botRadiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isPlaying ? '#4ade80' : '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Forward Direction Pointer Arrow
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(botRadiusPx * 0.85, 0);
    ctx.lineTo(botRadiusPx * 0.2, -botRadiusPx * 0.4);
    ctx.lineTo(botRadiusPx * 0.35, 0);
    ctx.lineTo(botRadiusPx * 0.2, botRadiusPx * 0.4);
    ctx.closePath();
    ctx.fill();

    // LiDAR Turret Center Cap
    ctx.fillStyle = sensorRef.current.hit ? '#fbbf24' : '#ffd23f';
    ctx.beginPath();
    ctx.arc(0, 0, botRadiusPx * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0b1120';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();

    // Robot Label
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ROBOT', botPx, botPy - botRadiusPx - 8);

    // Hover Cell Indicator
    if (hoverCoordRef.current) {
      const { r, c } = hoverCoordRef.current;
      if (r >= 0 && r < config.rows && c >= 0 && c < config.cols) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(c * cellW, r * cellH, cellW, cellH);
      }
    }
  }, [config, grid, pathResult, goalPos, isPlaying, showPathVsTrajectory]);

  return (
    <View style={styles.container}>
      {/* Top Toolbar: Mode, Presets */}
      <View style={styles.toolbar}>
        {/* Placement / Draw Mode Pills */}
        <View style={styles.toolGroup}>
          <Text style={styles.groupLabel}>EDIT MODE:</Text>
          <TouchableOpacity
            style={[styles.toolBtn, interactionMode === 'place-robot' && styles.toolBtnActive]}
            onPress={() => setInteractionMode('place-robot')}
          >
            <Text style={[styles.toolBtnText, interactionMode === 'place-robot' && styles.toolBtnTextActive]}>
              🤖 Move Robot
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolBtn, interactionMode === 'place-goal' && styles.toolBtnActive]}
            onPress={() => setInteractionMode('place-goal')}
          >
            <Text style={[styles.toolBtnText, interactionMode === 'place-goal' && styles.toolBtnTextActive]}>
              🎯 Move Goal
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolBtn, interactionMode === 'draw-wall' && styles.toolBtnActive]}
            onPress={() => setInteractionMode('draw-wall')}
          >
            <Text style={[styles.toolBtnText, interactionMode === 'draw-wall' && styles.toolBtnTextActive]}>
              🧱 Add Obstacle
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolBtn, interactionMode === 'erase-wall' && styles.toolBtnActive]}
            onPress={() => setInteractionMode('erase-wall')}
          >
            <Text style={[styles.toolBtnText, interactionMode === 'erase-wall' && styles.toolBtnTextActive]}>
              🧹 Erase
            </Text>
          </TouchableOpacity>
        </View>

        {/* Map Presets */}
        <View style={styles.toolGroup}>
          <Text style={styles.groupLabel}>MAP PRESET:</Text>
          <TouchableOpacity style={styles.presetBtn} onPress={() => handleSelectPreset('warehouse')}>
            <Text style={styles.presetBtnText}>📦 Warehouse</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.presetBtn} onPress={() => handleSelectPreset('office')}>
            <Text style={styles.presetBtnText}>🏢 Office</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.presetBtn} onPress={() => handleSelectPreset('slalom')}>
            <Text style={styles.presetBtnText}>〰 Slalom</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.presetBtn} onPress={() => handleSelectPreset('bottleneck')}>
            <Text style={styles.presetBtnText}>🚪 Doorway</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.presetBtn} onPress={() => handleSelectPreset('empty')}>
            <Text style={styles.presetBtnText}>⬜ Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Canvas Wrap */}
      <View style={styles.canvasWrap}>
        <canvas
          ref={canvasRef}
          width={840}
          height={540}
          style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </View>

      {/* Bottom Execution Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.playControls}>
          <TouchableOpacity
            style={[styles.actionBtn, isPlaying ? styles.pauseBtn : styles.startBtn]}
            onPress={handleTogglePlay}
          >
            <Text style={styles.actionBtnText}>{isPlaying ? '⏸ Pause' : '▶ Start Navigation'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
            <Text style={styles.resetBtnText}>↺ Reset</Text>
          </TouchableOpacity>
        </View>

        {/* Algorithm Selectors */}
        <View style={styles.algoControls}>
          <Text style={styles.metaLabel}>ALGORITHM:</Text>
          {(['astar', 'dijkstra', 'greedy'] as AlgorithmType[]).map((algo) => (
            <TouchableOpacity
              key={algo}
              style={[styles.smallPill, config.algorithm === algo && styles.smallPillActive]}
              onPress={() => {
                const nextCfg = { ...config, algorithm: algo };
                setConfig(nextCfg);
                recomputePath(startPos, goalPos, grid, nextCfg);
              }}
            >
              <Text style={[styles.smallPillText, config.algorithm === algo && styles.smallPillTextActive]}>
                {algo === 'astar' ? 'A* (Optimal)' : algo === 'dijkstra' ? 'Dijkstra' : 'Greedy'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Speed Selector */}
        <View style={styles.speedControls}>
          <Text style={styles.metaLabel}>SPEED:</Text>
          {[1.0, 1.5, 2.5].map((spd) => (
            <TouchableOpacity
              key={spd}
              style={[styles.smallPill, simSpeed === spd && styles.smallPillActive]}
              onPress={() => setSimSpeed(spd)}
            >
              <Text style={[styles.smallPillText, simSpeed === spd && styles.smallPillTextActive]}>{spd}x</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
});

export default NavCanvas;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 10
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131c34',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#243452',
    gap: 12
  },
  toolGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.8,
    marginRight: 4
  },
  toolBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: '#1e2d4d'
  },
  toolBtnActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38bdf8'
  },
  toolBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#c4c9d8'
  },
  toolBtnTextActive: {
    color: '#38bdf8',
    fontWeight: '700'
  },
  presetBtn: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#182442',
    borderWidth: 1,
    borderColor: '#2a3d5f'
  },
  presetBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#cbd5e1'
  },
  canvasWrap: {
    flex: 1,
    minHeight: 460,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a3d5f',
    backgroundColor: '#0a0f1d'
  },
  bottomBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131c34',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#243452',
    gap: 12
  },
  playControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1
  },
  startBtn: {
    backgroundColor: '#38bdf8',
    borderColor: '#7dd3fc'
  },
  pauseBtn: {
    backgroundColor: '#fbbf24',
    borderColor: '#fde68a'
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.3
  },
  resetBtn: {
    backgroundColor: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e2e8f0'
  },
  algoControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  speedControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.8
  },
  smallPill: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: '#1e2d4d'
  },
  smallPillActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38bdf8'
  },
  smallPillText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600'
  },
  smallPillTextActive: {
    color: '#38bdf8',
    fontWeight: '700'
  }
});
