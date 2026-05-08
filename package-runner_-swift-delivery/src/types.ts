export type PackageColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple';

export interface GameObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Player extends GameObject {
  speed: number;
  carryingId: string | null;
  score: number;
  energy: number;
  lives: number;
  angle: number;
}

export interface Package extends GameObject {
  color: PackageColor;
  isCollected: boolean;
  targetHouseId: string;
}

export interface House extends GameObject {
  color: PackageColor;
  isFulfilled: boolean;
}

export interface Decoration extends GameObject {
  type: 'tree' | 'bush' | 'park';
  rotation: number;
}

// ✅ Smaller world, smaller viewport
export const WORLD_WIDTH   = 1600;
export const WORLD_HEIGHT  = 1600;
export const VIEWPORT_SIZE = 650;