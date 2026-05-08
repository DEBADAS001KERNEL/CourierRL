import { Package, House, PackageColor, WORLD_WIDTH, WORLD_HEIGHT, Decoration } from './types';

export const generateId = () => Math.random().toString(36).substring(2, 9);

export const spawnHouse = (id: string, color: PackageColor): House => {
  const lanes = [150, 400, 700, 1000];
  const isHorizontal = Math.random() > 0.5;
  let x, y;
  if (isHorizontal) {
    y = lanes[Math.floor(Math.random() * lanes.length)] - 80;
    x = 80 + Math.random() * (WORLD_WIDTH - 200);
  } else {
    x = lanes[Math.floor(Math.random() * lanes.length)] - 80;
    y = 80 + Math.random() * (WORLD_HEIGHT - 200);
  }
  return { id, color, x, y, width: 80, height: 80, isFulfilled: false };
};

export const spawnPackage = (targetHouseId: string, color: PackageColor): Package => ({
  id: generateId(),
  color,
  x: 200 + Math.random() * (WORLD_WIDTH - 400),
  y: 200 + Math.random() * (WORLD_HEIGHT - 400),
  width: 35,
  height: 35,
  isCollected: false,
  targetHouseId,
});

export const spawnDecoration = (): Decoration => {
  const types: Array<'tree' | 'bush' | 'park'> = ['tree', 'bush', 'park'];
  const type = types[Math.floor(Math.random() * types.length)];
  return {
    id: generateId(),
    type,
    x: Math.random() * WORLD_WIDTH,
    y: Math.random() * WORLD_HEIGHT,
    width:  type === 'park' ? 150 : type === 'tree' ? 45 : 30,
    height: type === 'park' ? 150 : type === 'tree' ? 45 : 30,
    rotation: Math.random() * 360,
  };
};

export const checkCollision = (
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number },
  padding = -20
) => {
  return (
    rect1.x + padding < rect2.x + rect2.width  - padding &&
    rect1.x + rect1.width  - padding > rect2.x + padding &&
    rect1.y + padding < rect2.y + rect2.height - padding &&
    rect1.y + rect1.height - padding > rect2.y + padding
  );
};