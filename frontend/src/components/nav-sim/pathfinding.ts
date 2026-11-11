// src/components/nav-sim/pathfinding.ts
import { GridCoord, Point, NavConfig, PathResult, MapPreset, HeuristicType, AlgorithmType } from './types';

export function worldToGrid(pt: Point, cellSize: number, rows: number, cols: number): GridCoord {
  const c = Math.max(0, Math.min(cols - 1, Math.floor(pt.x / cellSize)));
  const r = Math.max(0, Math.min(rows - 1, Math.floor(pt.y / cellSize)));
  return { r, c };
}

export function gridToWorld(coord: GridCoord, cellSize: number): Point {
  return {
    x: (coord.c + 0.5) * cellSize,
    y: (coord.r + 0.5) * cellSize
  };
}

export function createEmptyGrid(rows: number, cols: number): boolean[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(false));
}

export function createPresetMap(preset: MapPreset, rows: number, cols: number): boolean[][] {
  const grid = createEmptyGrid(rows, cols);

  if (preset === 'empty') {
    return grid;
  }

  if (preset === 'warehouse') {
    // 3 pairs of vertical storage racking with aisles
    const rackWidth = 2;
    const colStarts = [6, 12, 18, 24];
    for (const cStart of colStarts) {
      if (cStart + rackWidth < cols - 2) {
        // Top rack
        for (let r = 3; r < 9 && r < rows; r++) {
          for (let c = cStart; c < cStart + rackWidth; c++) {
            grid[r][c] = true;
          }
        }
        // Bottom rack
        for (let r = 12; r < 18 && r < rows; r++) {
          for (let c = cStart; c < cStart + rackWidth; c++) {
            grid[r][c] = true;
          }
        }
      }
    }
    // Staging pallets
    if (rows > 8 && cols > 4) {
      grid[5][2] = true;
      grid[6][2] = true;
      grid[14][2] = true;
      grid[15][2] = true;
    }
    return grid;
  }

  if (preset === 'office') {
    // Outer border boundary walls
    const midR = Math.floor(rows / 2);
    const midC = Math.floor(cols / 2);

    // Horizontal hallway partition with doorways
    for (let c = 2; c < cols - 2; c++) {
      if (c !== 7 && c !== 8 && c !== cols - 8 && c !== cols - 7) {
        grid[midR][c] = true;
      }
    }

    // Vertical partition left
    for (let r = 2; r < rows - 2; r++) {
      if (r !== 4 && r !== 5 && r !== rows - 5) {
        grid[r][midC - 6] = true;
      }
    }

    // Vertical partition right
    for (let r = 2; r < rows - 2; r++) {
      if (r !== 4 && r !== 5 && r !== rows - 5) {
        grid[r][midC + 6] = true;
      }
    }

    // Desks / obstacles inside rooms
    if (midR > 4) {
      grid[3][midC] = true;
      grid[4][midC] = true;
      grid[midR + 3][midC] = true;
      grid[midR + 4][midC] = true;
    }
    return grid;
  }

  if (preset === 'slalom') {
    // Alternating baffles extending from top and bottom
    const step = Math.floor(cols / 5);
    for (let i = 1; i <= 4; i++) {
      const c = i * step;
      if (c < cols - 2) {
        if (i % 2 === 1) {
          // Extends from top downward
          const endR = Math.floor(rows * 0.72);
          for (let r = 0; r < endR; r++) grid[r][c] = true;
        } else {
          // Extends from bottom upward
          const startR = Math.floor(rows * 0.28);
          for (let r = startR; r < rows; r++) grid[r][c] = true;
        }
      }
    }
    return grid;
  }

  if (preset === 'bottleneck') {
    // Thick center dividing wall with a narrow single aperture door
    const midC = Math.floor(cols / 2);
    const doorR = Math.floor(rows / 2);
    for (let r = 0; r < rows; r++) {
      if (Math.abs(r - doorR) > 1) {
        grid[r][midC - 1] = true;
        grid[r][midC] = true;
      }
    }
    // A couple warning pillars
    if (midC > 6 && cols - midC > 6) {
      grid[Math.floor(rows * 0.3)][midC - 5] = true;
      grid[Math.floor(rows * 0.7)][midC - 5] = true;
      grid[Math.floor(rows * 0.3)][midC + 5] = true;
      grid[Math.floor(rows * 0.7)][midC + 5] = true;
    }
    return grid;
  }

  return grid;
}

function calculateHeuristic(a: GridCoord, b: GridCoord, type: HeuristicType): number {
  const dr = Math.abs(a.r - b.r);
  const dc = Math.abs(a.c - b.c);

  switch (type) {
    case 'manhattan':
      return dr + dc;
    case 'octile':
      return Math.SQRT2 * Math.min(dr, dc) + Math.abs(dr - dc);
    case 'euclidean':
    default:
      return Math.hypot(dr, dc);
  }
}

interface NodeRecord {
  r: number;
  c: number;
  g: number;
  h: number;
  f: number;
  parentR: number;
  parentC: number;
}

export function findPath(
  startCoord: GridCoord,
  goalCoord: GridCoord,
  grid: boolean[][],
  config: NavConfig
): PathResult {
  const startTime = performance.now();
  const rows = config.rows;
  const cols = config.cols;

  const emptyResult: PathResult = {
    found: false,
    path: [],
    rawGridPath: [],
    nodesExplored: 0,
    totalDistance: 0,
    directDistance: Math.hypot((goalCoord.c - startCoord.c) * config.cellSize, (goalCoord.r - startCoord.r) * config.cellSize),
    efficiencyRatio: 0,
    estimatedTime: 0,
    exploredGrid: Array.from({ length: rows }, () => Array(cols).fill(false)),
    frontierGrid: Array.from({ length: rows }, () => Array(cols).fill(false)),
    searchTimeMs: 0
  };

  // Check bounds and obstacle overlap
  if (
    startCoord.r < 0 || startCoord.r >= rows || startCoord.c < 0 || startCoord.c >= cols ||
    goalCoord.r < 0 || goalCoord.r >= rows || goalCoord.c < 0 || goalCoord.c >= cols ||
    grid[startCoord.r][startCoord.c] || grid[goalCoord.r][goalCoord.c]
  ) {
    emptyResult.searchTimeMs = Math.max(0.1, performance.now() - startTime);
    return emptyResult;
  }

  // Already at goal
  if (startCoord.r === goalCoord.r && startCoord.c === goalCoord.c) {
    const pt = gridToWorld(startCoord, config.cellSize);
    return {
      found: true,
      path: [pt],
      rawGridPath: [startCoord],
      nodesExplored: 1,
      totalDistance: 0,
      directDistance: 0,
      efficiencyRatio: 100,
      estimatedTime: 0,
      exploredGrid: emptyResult.exploredGrid,
      frontierGrid: emptyResult.frontierGrid,
      searchTimeMs: 0.1
    };
  }

  const gScore: number[][] = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
  const fScore: number[][] = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
  const parentGrid: { r: number; c: number }[][] = Array.from({ length: rows }, () => Array(cols).fill({ r: -1, c: -1 }));
  const closedSet: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const openSetTrack: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));

  // Binary min-heap for open set
  const openSet: NodeRecord[] = [];
  const pushOpen = (node: NodeRecord) => {
    openSet.push(node);
    let i = openSet.length - 1;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (openSet[i].f < openSet[parent].f) {
        const tmp = openSet[i];
        openSet[i] = openSet[parent];
        openSet[parent] = tmp;
        i = parent;
      } else {
        break;
      }
    }
    openSetTrack[node.r][node.c] = true;
  };

  const popOpen = (): NodeRecord | null => {
    if (openSet.length === 0) return null;
    const top = openSet[0];
    const bottom = openSet.pop()!;
    if (openSet.length > 0) {
      openSet[0] = bottom;
      let i = 0;
      const len = openSet.length;
      while (true) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        let smallest = i;
        if (left < len && openSet[left].f < openSet[smallest].f) smallest = left;
        if (right < len && openSet[right].f < openSet[smallest].f) smallest = right;
        if (smallest !== i) {
          const tmp = openSet[i];
          openSet[i] = openSet[smallest];
          openSet[smallest] = tmp;
          i = smallest;
        } else {
          break;
        }
      }
    }
    openSetTrack[top.r][top.c] = false;
    return top;
  };

  const startH = config.algorithm === 'dijkstra' ? 0 : calculateHeuristic(startCoord, goalCoord, config.heuristic);
  const startF = config.algorithm === 'greedy' ? startH : startH;
  gScore[startCoord.r][startCoord.c] = 0;
  fScore[startCoord.r][startCoord.c] = startF;

  pushOpen({
    r: startCoord.r,
    c: startCoord.c,
    g: 0,
    h: startH,
    f: startF,
    parentR: -1,
    parentC: -1
  });

  // 8-neighborhood movements
  const directions = config.allowDiagonal
    ? [
        { dr: -1, dc: 0, cost: 1.0 },
        { dr: 1, dc: 0, cost: 1.0 },
        { dr: 0, dc: -1, cost: 1.0 },
        { dr: 0, dc: 1, cost: 1.0 },
        { dr: -1, dc: -1, cost: Math.SQRT2 },
        { dr: -1, dc: 1, cost: Math.SQRT2 },
        { dr: 1, dc: -1, cost: Math.SQRT2 },
        { dr: 1, dc: 1, cost: Math.SQRT2 }
      ]
    : [
        { dr: -1, dc: 0, cost: 1.0 },
        { dr: 1, dc: 0, cost: 1.0 },
        { dr: 0, dc: -1, cost: 1.0 },
        { dr: 0, dc: 1, cost: 1.0 }
      ];

  let nodesExplored = 0;
  let reachedGoal = false;

  while (openSet.length > 0) {
    const current = popOpen();
    if (!current) break;

    const { r, c } = current;
    if (closedSet[r][c]) continue;
    closedSet[r][c] = true;
    nodesExplored++;

    if (r === goalCoord.r && c === goalCoord.c) {
      reachedGoal = true;
      break;
    }

    for (const dir of directions) {
      const nr = r + dir.dr;
      const nc = c + dir.dc;

      // Bounds
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      // Obstacle
      if (grid[nr][nc]) continue;
      // Closed
      if (closedSet[nr][nc]) continue;

      // Prevent corner cutting across two diagonal obstacles
      if (dir.dr !== 0 && dir.dc !== 0) {
        if (grid[r][nc] && grid[nr][c]) continue;
      }

      const tentativeG = gScore[r][c] + dir.cost;
      if (tentativeG < gScore[nr][nc]) {
        parentGrid[nr][nc] = { r, c };
        gScore[nr][nc] = tentativeG;

        const h = config.algorithm === 'dijkstra' ? 0 : calculateHeuristic({ r: nr, c: nc }, goalCoord, config.heuristic);
        let f: number;
        if (config.algorithm === 'dijkstra') {
          f = tentativeG;
        } else if (config.algorithm === 'greedy') {
          f = h;
        } else {
          // A* with tie-breaking heuristic multiplier (1 + 0.001) for cleaner straight line paths
          f = tentativeG + h * 1.001;
        }

        fScore[nr][nc] = f;
        pushOpen({ r: nr, c: nc, g: tentativeG, h, f, parentR: r, parentC: c });
      }
    }
  }

  const searchTimeMs = Math.max(0.1, performance.now() - startTime);

  if (!reachedGoal) {
    return {
      ...emptyResult,
      nodesExplored,
      exploredGrid: closedSet,
      frontierGrid: openSetTrack,
      searchTimeMs
    };
  }

  // Reconstruct path
  const rawGridPath: GridCoord[] = [];
  let curr = goalCoord;
  while (curr.r !== -1 && curr.c !== -1) {
    rawGridPath.unshift(curr);
    curr = parentGrid[curr.r][curr.c];
  }

  // Smooth path using line of sight (String Pulling algorithm)
  const waypoints = config.smoothPath
    ? smoothPathWaypoints(rawGridPath, grid, config.cellSize, rows, cols)
    : rawGridPath.map(coord => gridToWorld(coord, config.cellSize));

  // Compute total path distance
  let totalDistance = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalDistance += Math.hypot(waypoints[i + 1].x - waypoints[i].x, waypoints[i + 1].y - waypoints[i].y);
  }

  const directDistance = Math.hypot(
    (goalCoord.c - startCoord.c) * config.cellSize,
    (goalCoord.r - startCoord.r) * config.cellSize
  );

  const efficiencyRatio = totalDistance > 0 ? (directDistance / totalDistance) * 100 : 100;
  const estimatedTime = totalDistance / Math.max(0.2, config.maxVelocity * 0.75);

  return {
    found: true,
    path: waypoints,
    rawGridPath,
    nodesExplored,
    totalDistance,
    directDistance,
    efficiencyRatio,
    estimatedTime,
    exploredGrid: closedSet,
    frontierGrid: openSetTrack,
    searchTimeMs
  };
}

// Raycast Line-of-sight to smooth grid staircase paths
function smoothPathWaypoints(
  rawPath: GridCoord[],
  grid: boolean[][],
  cellSize: number,
  rows: number,
  cols: number
): Point[] {
  if (rawPath.length <= 2) {
    return rawPath.map(c => gridToWorld(c, cellSize));
  }

  const smoothed: Point[] = [gridToWorld(rawPath[0], cellSize)];
  let currentIndex = 0;

  while (currentIndex < rawPath.length - 1) {
    let furthest = currentIndex + 1;
    // Check line of sight to furthest reachable node
    for (let test = rawPath.length - 1; test > currentIndex; test--) {
      const p1 = gridToWorld(rawPath[currentIndex], cellSize);
      const p2 = gridToWorld(rawPath[test], cellSize);
      if (hasLineOfSight(p1, p2, grid, cellSize, rows, cols)) {
        furthest = test;
        break;
      }
    }
    smoothed.push(gridToWorld(rawPath[furthest], cellSize));
    currentIndex = furthest;
  }

  return smoothed;
}

// Line of sight check between two points with safety margin
export function hasLineOfSight(
  p1: Point,
  p2: Point,
  grid: boolean[][],
  cellSize: number,
  rows: number,
  cols: number
): boolean {
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const steps = Math.ceil(dist / (cellSize * 0.4));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const px = p1.x + (p2.x - p1.x) * t;
    const py = p1.y + (p2.y - p1.y) * t;
    const c = Math.floor(px / cellSize);
    const r = Math.floor(py / cellSize);

    if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
    if (grid[r][c]) return false;
  }
  return true;
}
