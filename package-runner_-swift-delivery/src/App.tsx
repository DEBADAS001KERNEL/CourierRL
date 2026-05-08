/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package as Box, Home, Trophy, Clock, MapPin, Zap,
  Play, RotateCcw, Navigation, Trees as TreeIcon,
  Wind, CheckCircle2, Bot, Eye,
} from 'lucide-react';
import { Player, Package, House, WORLD_WIDTH, WORLD_HEIGHT, VIEWPORT_SIZE, PackageColor, Decoration } from './types';
import { generateId, spawnHouse, spawnPackage, spawnDecoration, checkCollision } from './gameEngine';
import { loadAIModel, getAIDecision, AIDecision } from './aiAgent';

const PLAYER_SIZE   = 50;
const INITIAL_LIVES = 3;
const GAME_DURATION = 120;
const STEP_SIZE     = 40;
const ACTION_LABELS = ['⬆ UP', '⬇ DOWN', '⬅ LEFT', '➡ RIGHT'];
const ACTION_COLORS = ['#38bdf8', '#f472b6', '#fb923c', '#4ade80'];
const MAX_HISTORY   = 30;

interface StepStat {
  step: number;
  action: number;
  qMax: number;
  picked: boolean;
}

export default function App() {
  const [player, setPlayer] = useState<Player>({
    id: 'p1', x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2,
    width: PLAYER_SIZE, height: PLAYER_SIZE, speed: 450,
    carryingId: null, score: 0, energy: 100, lives: INITIAL_LIVES, angle: 0,
  });

  const [gameState, setGameState]           = useState<'idle' | 'playing' | 'gameover' | 'win'>('idle');
  const [packages, setPackages]             = useState<Package[]>([]);
  const [houses, setHouses]                 = useState<House[]>([]);
  const [decorations, setDecorations]       = useState<Decoration[]>([]);
  const [timeLeft, setTimeLeft]             = useState(GAME_DURATION);
  const [deliveryStatus, setDeliveryStatus] = useState<{ msg: string; type: 'success' | 'info' } | null>(null);

  // AI state
  const [aiMode, setAiMode]         = useState(false);
  const [aiReady, setAiReady]       = useState(false);
  const [aiSpeed, setAiSpeed]       = useState(200);
  const [aiPaused, setAiPaused]     = useState(false);
  const [aiStatus, setAiStatus]     = useState('Loading model...');
  const [lastDecision, setLastDecision] = useState<AIDecision | null>(null);
  const [stepHistory, setStepHistory]   = useState<StepStat[]>([]);
  const [totalSteps, setTotalSteps]     = useState(0);
  const [actionCounts, setActionCounts] = useState([0, 0, 0, 0]);

  const lastUpdate    = useRef(Date.now());
  const keysPressed   = useRef<Record<string, boolean>>({});
  const gameLoopRef   = useRef<number>(0);
  const aiLoopRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerRef     = useRef(player);
  const packagesRef   = useRef(packages);
  const housesRef     = useRef(houses);
  playerRef.current   = player;
  packagesRef.current = packages;
  housesRef.current   = houses;

  useEffect(() => {
    loadAIModel().then((ok: boolean | ((prevState: boolean) => boolean)) => {
      setAiReady(ok);
      setAiStatus(ok ? '✓ AI Model Ready' : '⚠ No model found');
    });
  }, []);

  const initGame = useCallback(() => {
    const newHouses: House[] = [];
    const colors: PackageColor[] = ['red', 'blue', 'green'];
    colors.forEach(color => {
      newHouses.push(spawnHouse(generateId(), color));
      newHouses.push(spawnHouse(generateId(), color));
    });
    const newPackages    = newHouses.map(h => spawnPackage(h.id, h.color));
    const newDecorations: Decoration[] = [];
    for (let i = 0; i < 40; i++) newDecorations.push(spawnDecoration());

    setHouses(newHouses);
    setPackages(newPackages);
    setDecorations(newDecorations);
    setPlayer(p => ({ ...p, x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, carryingId: null, score: 0, lives: INITIAL_LIVES, energy: 100 }));
    setTimeLeft(GAME_DURATION);
    setGameState('playing');
    setAiPaused(false);
    setLastDecision(null);
    setStepHistory([]);
    setTotalSteps(0);
    setActionCounts([0, 0, 0, 0]);
  }, []);

  const aiStep = useCallback(async () => {
    const p  = playerRef.current;
    const ps = packagesRef.current;
    const hs = housesRef.current;
    if (!p || gameState !== 'playing') return;

    let targetX: number, targetY: number, destX: number, destY: number, picked: boolean;

    if (p.carryingId) {
      const pkg   = ps.find(x => x.id === p.carryingId);
      const house = hs.find(h => pkg && h.id === pkg.targetHouseId);
      if (!pkg || !house) return;
      targetX = pkg.x; targetY = pkg.y; destX = house.x; destY = house.y; picked = true;
    } else {
      const remaining = ps.filter(x => !x.isCollected);
      if (!remaining.length) return;
      const nearest = remaining.reduce((a, b) =>
        Math.hypot(p.x - a.x, p.y - a.y) < Math.hypot(p.x - b.x, p.y - b.y) ? a : b
      );
      const house = hs.find(h => h.id === nearest.targetHouseId);
      if (!house) return;
      targetX = nearest.x; targetY = nearest.y; destX = house.x; destY = house.y; picked = false;
    }

    const decision = await getAIDecision(p.x, p.y, targetX, targetY, destX, destY, picked, WORLD_WIDTH, WORLD_HEIGHT);
    const { action } = decision;

    setLastDecision(decision);
    setTotalSteps(s => s + 1);
    setActionCounts(prev => {
      const next = [...prev];
      next[action]++;
      return next;
    });
    setStepHistory(prev => {
      const qMax = Math.max(...decision.qValues);
      const entry: StepStat = { step: prev.length, action, qMax, picked };
      return [...prev.slice(-MAX_HISTORY + 1), entry];
    });

    setPlayer(prev => {
      let { x, y } = prev;
      if      (action === 0) y = Math.max(y - STEP_SIZE, 0);
      else if (action === 1) y = Math.min(y + STEP_SIZE, WORLD_HEIGHT - PLAYER_SIZE);
      else if (action === 2) x = Math.max(x - STEP_SIZE, 0);
      else if (action === 3) x = Math.min(x + STEP_SIZE, WORLD_WIDTH - PLAYER_SIZE);
      const angle = action === 3 ? 0 : action === 2 ? Math.PI : action === 0 ? -Math.PI / 2 : Math.PI / 2;
      return { ...prev, x, y, angle };
    });
  }, [gameState]);

  useEffect(() => {
    if (aiLoopRef.current) clearInterval(aiLoopRef.current);
    if (!aiMode || aiPaused || gameState !== 'playing') return;
    aiLoopRef.current = setInterval(aiStep, aiSpeed);
    return () => { if (aiLoopRef.current) clearInterval(aiLoopRef.current); };
  }, [aiMode, aiPaused, aiSpeed, aiStep, gameState]);

  const updateGame = useCallback(() => {
    const now = Date.now();
    const dt  = (now - lastUpdate.current) / 1000;
    lastUpdate.current = now;
    if (gameState !== 'playing') return;

    setTimeLeft(prev => { if (prev <= 0) { setGameState('gameover'); return 0; } return prev - dt; });

    if (!aiMode) {
      let dx = 0, dy = 0;
      const spd = player.speed * dt;
      if (keysPressed.current['w'] || keysPressed.current['ArrowUp'])    dy -= spd;
      if (keysPressed.current['s'] || keysPressed.current['ArrowDown'])  dy += spd;
      if (keysPressed.current['a'] || keysPressed.current['ArrowLeft'])  dx -= spd;
      if (keysPressed.current['d'] || keysPressed.current['ArrowRight']) dx += spd;
      setPlayer(prev => {
        const nx = Math.min(Math.max(0, prev.x + dx), WORLD_WIDTH - PLAYER_SIZE);
        const ny = Math.min(Math.max(0, prev.y + dy), WORLD_HEIGHT - PLAYER_SIZE);
        const angle = (dx !== 0 || dy !== 0) ? Math.atan2(dy, dx) : prev.angle;
        return { ...prev, x: nx, y: ny, angle };
      });
    }

    if (!player.carryingId) {
      packages.forEach(pkg => {
        if (!pkg.isCollected) {
          if (checkCollision({ x: player.x, y: player.y, width: PLAYER_SIZE, height: PLAYER_SIZE }, pkg, -15)) {
            setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, isCollected: true } : p));
            setPlayer(p => ({ ...p, carryingId: pkg.id }));
            setDeliveryStatus({ msg: `📦 Picked up ${pkg.color} package!`, type: 'info' });
            setTimeout(() => setDeliveryStatus(null), 2000);
          }
        }
      });
    }

    if (player.carryingId) {
      const currentPkg = packages.find(p => p.id === player.carryingId);
      if (currentPkg) {
        const targetHouse = houses.find(h => h.id === currentPkg.targetHouseId);
        if (targetHouse && !targetHouse.isFulfilled) {
          if (checkCollision({ x: player.x, y: player.y, width: PLAYER_SIZE, height: PLAYER_SIZE }, targetHouse, -30)) {
            setHouses(prev => prev.map(h => h.id === targetHouse.id ? { ...h, isFulfilled: true } : h));
            setPlayer(p => ({ ...p, carryingId: null, score: p.score + 1000 }));
            setDeliveryStatus({ msg: '✨ PERFECT DELIVERY! +$1000', type: 'success' });
            setTimeout(() => setDeliveryStatus(null), 2500);
            setHouses(cur => {
              if (cur.every(h => h.isFulfilled || h.id === targetHouse.id)) setTimeout(() => setGameState('win'), 500);
              return cur;
            });
          }
        }
      }
    }
  }, [player, gameState, packages, houses, aiMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keysPressed.current[e.key] = true; };
    const handleKeyUp   = (e: KeyboardEvent) => { keysPressed.current[e.key] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    const frame = () => { updateGame(); gameLoopRef.current = requestAnimationFrame(frame); };
    gameLoopRef.current = requestAnimationFrame(frame);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(gameLoopRef.current);
    };
  }, [updateGame]);

  const carryingPkg = packages.find(p => p.id === player.carryingId);
  const targetHouse = carryingPkg ? houses.find(h => h.id === carryingPkg.targetHouseId) : null;
  const totalActions = actionCounts.reduce((a, b) => a + b, 0) || 1;

  const backgroundElements = useMemo(() => (
    <div className="absolute inset-0 bg-[#eef5e9]">
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage: `linear-gradient(#86efac 1px, transparent 1px), linear-gradient(90deg, #86efac 1px, transparent 1px)`,
        backgroundSize: '80px 80px',
      }} />
      {[150, 250, 450, 550, 800, 900, 1150, 1250].map((pos, i) => (
        <React.Fragment key={i}>
          <div className="absolute left-0 w-full h-[60px] bg-slate-300/60 border-y border-white" style={{ top: pos }}>
            <div className="absolute top-1/2 w-full h-[2px] border-t-4 border-dashed border-white/80" />
          </div>
          <div className="absolute top-0 h-full w-[60px] bg-slate-300/60 border-x border-white" style={{ left: pos }}>
            <div className="absolute left-1/2 h-full w-[2px] border-l-4 border-dashed border-white/80" />
          </div>
        </React.Fragment>
      ))}
    </div>
  ), []);

  // ── AI Stats Panel ──
  const statsPanel = aiMode && lastDecision && (
    <div className="absolute top-0 right-0 w-56 bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-700 shadow-2xl p-3 z-[200] flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-700 pb-2">
        <Bot className="w-3 h-3 text-green-400 animate-pulse" />
        <span className="text-[9px] font-black uppercase tracking-widest text-green-400">DQN Agent</span>
        <span className="ml-auto text-[9px] text-slate-500">step {totalSteps}</span>
      </div>

      {/* Current action */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-wider text-slate-400">Action</span>
        <span className="text-xs font-black px-2 py-0.5 rounded-full"
          style={{ backgroundColor: ACTION_COLORS[lastDecision.action] + '33', color: ACTION_COLORS[lastDecision.action] }}>
          {ACTION_LABELS[lastDecision.action]}
        </span>
      </div>

      {/* State */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-wider text-slate-400">State</span>
        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${player.carryingId ? 'bg-yellow-500/20 text-yellow-400' : 'bg-sky-500/20 text-sky-400'}`}>
          {player.carryingId ? '📦 CARRYING' : '🔍 SEARCHING'}
        </span>
      </div>

      {/* Q-Values bar chart */}
      <div className="flex flex-col gap-1 pt-1 border-t border-slate-700">
        <span className="text-[9px] uppercase tracking-wider text-slate-400 mb-0.5">Q-Values</span>
        {lastDecision.qValues.map((q, i) => {
          const min = Math.min(...lastDecision.qValues);
          const max = Math.max(...lastDecision.qValues);
          const range = max - min || 1;
          const pct = ((q - min) / range) * 100;
          const isBest = i === lastDecision.action;
          return (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[8px] w-12 text-slate-400 shrink-0">{ACTION_LABELS[i].split(' ')[1]}</span>
              <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.2 }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: isBest ? ACTION_COLORS[i] : ACTION_COLORS[i] + '88' }}
                />
              </div>
              <span className="text-[8px] w-8 text-right font-mono"
                style={{ color: isBest ? ACTION_COLORS[i] : '#64748b' }}>
                {q.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Action distribution mini bar */}
      <div className="flex flex-col gap-1 pt-1 border-t border-slate-700">
        <span className="text-[9px] uppercase tracking-wider text-slate-400 mb-0.5">Action History</span>
        <div className="flex h-12 items-end gap-0.5">
          {actionCounts.map((c, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <motion.div
                animate={{ height: `${(c / totalActions) * 100}%` }}
                transition={{ duration: 0.3 }}
                className="w-full rounded-t-sm min-h-[2px]"
                style={{ backgroundColor: ACTION_COLORS[i] }}
              />
              <span className="text-[6px] text-slate-500">{ACTION_LABELS[i].split(' ')[1].charAt(0)}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between">
          {actionCounts.map((c, i) => (
            <span key={i} className="text-[7px] text-center flex-1 font-mono"
              style={{ color: ACTION_COLORS[i] }}>
              {((c / totalActions) * 100).toFixed(0)}%
            </span>
          ))}
        </div>
      </div>

      {/* Q-value sparkline */}
      <div className="flex flex-col gap-1 pt-1 border-t border-slate-700">
        <span className="text-[9px] uppercase tracking-wider text-slate-400">Max Q-Value Trend</span>
        <svg width="100%" height="32" className="overflow-visible">
          {stepHistory.length > 1 && (() => {
            const vals = stepHistory.map(s => s.qMax);
            const min = Math.min(...vals);
            const max = Math.max(...vals) || 1;
            const w = 200;
            const h = 28;
            const pts = vals.map((v, i) =>
              `${(i / (vals.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`
            ).join(' ');
            return (
              <polyline
                points={pts}
                fill="none"
                stroke="#4ade80"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })()}
        </svg>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-sky-50 flex flex-col items-center select-none overflow-hidden touch-none font-sans text-slate-800">

      {/* HUD */}
      <div className="w-full max-w-5xl px-4 py-3 flex justify-between items-center z-50 flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          <div className="bg-white/80 backdrop-blur-xl px-4 py-2 rounded-full border border-slate-100 shadow-lg flex items-center gap-2">
            <div className="p-1 bg-yellow-400 rounded-full"><Trophy className="w-3 h-3 text-yellow-900" /></div>
            <div className="flex flex-col">
              <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Revenue</span>
              <span className="text-base font-black tabular-nums text-slate-900">${player.score}</span>
            </div>
          </div>
          <div className="bg-white/80 backdrop-blur-xl px-4 py-2 rounded-full border border-slate-100 shadow-lg flex items-center gap-2">
            <div className={`p-1 rounded-full ${timeLeft < 30 ? 'bg-red-500 animate-pulse' : 'bg-sky-400'}`}>
              <Clock className="w-3 h-3 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Shift Time</span>
              <span className={`text-base font-black tabular-nums ${timeLeft < 30 ? 'text-red-600' : 'text-slate-900'}`}>
                {Math.floor(timeLeft / 60)}:{Math.floor(timeLeft % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <button onClick={() => { setAiMode(m => !m); setAiPaused(false); }}
            className={`px-4 py-2 rounded-full font-black text-xs uppercase tracking-wider border shadow-md transition-all flex items-center gap-1
              ${aiMode ? 'bg-green-500 border-green-400 text-white' : 'bg-white/80 border-slate-200 text-slate-600 hover:border-sky-400'}`}>
            <Bot className="w-3 h-3" />{aiMode ? 'AI ON' : 'AI MODE'}
          </button>
          {aiMode && (
            <button onClick={() => setAiPaused(p => !p)}
              className="px-4 py-2 rounded-full font-black text-xs uppercase tracking-wider border bg-white/80 border-yellow-300 text-yellow-600 shadow-md flex items-center gap-1">
              <Eye className="w-3 h-3" />{aiPaused ? 'RESUME' : 'PAUSE'}
            </button>
          )}
          {aiMode && (
            <select value={aiSpeed} onChange={e => setAiSpeed(+e.target.value)}
              className="px-3 py-2 rounded-full border border-slate-200 bg-white/80 text-slate-700 font-bold text-xs shadow-md cursor-pointer">
              <option value={500}>🐢 Slow</option>
              <option value={200}>⚡ Normal</option>
              <option value={80}>🚀 Fast</option>
              <option value={30}>💨 Ultra</option>
            </select>
          )}
          <div className="bg-white/80 px-4 py-2 rounded-full border border-slate-100 shadow-md flex items-center gap-1">
            <Zap className="w-3 h-3 text-sky-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-sky-600">Courier</span>
          </div>
        </div>
      </div>

      {/* Game canvas */}
      <div className="relative flex-1 w-full flex items-center justify-center -mt-2">
        <div className="relative" style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}>
          <div className="relative bg-white shadow-[0_40px_100px_rgba(0,0,0,0.1)] overflow-hidden rounded-[2rem] border-[10px] border-white w-full h-full">
            <div
              className="absolute transition-transform duration-75 ease-out"
              style={{
                width: WORLD_WIDTH, height: WORLD_HEIGHT,
                transform: `translate(${-player.x + VIEWPORT_SIZE / 2}px, ${-player.y + VIEWPORT_SIZE / 2}px)`,
              }}
            >
              {backgroundElements}

              {decorations.map(d => (
                <div key={d.id} className="absolute pointer-events-none"
                  style={{ left: d.x, top: d.y, width: d.width, height: d.height, transform: `rotate(${d.rotation}deg)` }}>
                  {d.type === 'tree' && <TreeIcon className="w-full h-full text-green-600/40" />}
                  {d.type === 'bush' && <div className="w-full h-full bg-green-500/20 rounded-full blur-md" />}
                  {d.type === 'park' && (
                    <div className="w-full h-full border-4 border-green-200/50 rounded-[2rem] bg-green-100/30 flex items-center justify-center">
                      <Wind className="w-6 h-6 text-green-300 animate-pulse" />
                    </div>
                  )}
                </div>
              ))}

              {houses.map(h => {
                const isActive = targetHouse?.id === h.id;
                return (
                  <div key={h.id} className="absolute z-10" style={{ left: h.x, top: h.y, width: h.width, height: h.height }}>
                    <div className="relative w-full h-full">
                      {isActive && <div className="absolute inset-[-30px] border-4 border-dashed border-white/50 rounded-full animate-spin-slow opacity-40" />}
                      <div className={`w-full h-full rounded-xl flex flex-col items-center justify-center border-b-4 border-slate-900/10 shadow-md transition-all duration-300
                        ${h.isFulfilled ? 'grayscale opacity-40' : isActive ? 'scale-110 shadow-xl ring-4 ring-white/50' : ''}`}
                        style={{ backgroundColor: h.color }}>
                        <Home className="w-7 h-7 text-white drop-shadow-md" />
                        <div className="mt-1 px-2 py-0.5 bg-white/20 rounded-full text-[8px] font-bold text-white uppercase">{h.color}</div>
                      </div>
                      {isActive && (
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white px-3 py-1 rounded-full shadow-lg border border-slate-100 flex items-center gap-1 animate-bounce">
                          <MapPin className="w-3 h-3" style={{ color: h.color }} />
                          <span className="text-[9px] font-black whitespace-nowrap">DELIVER</span>
                        </div>
                      )}
                      {h.isFulfilled && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <CheckCircle2 className="w-10 h-10 text-green-500 drop-shadow-lg" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {packages.filter(p => !p.isCollected).map(p => (
                <div key={p.id} className="absolute z-20 flex items-center justify-center"
                  style={{ left: p.x, top: p.y, width: p.width + 30, height: p.height + 30 }}>
                  <motion.div animate={{ y: [0, -10, 0], scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                    className="relative w-10 h-10 rounded-xl shadow-lg flex items-center justify-center border-2 border-white"
                    style={{ backgroundColor: p.color }}>
                    <Box className="w-5 h-5 text-white" />
                    <div className="absolute -bottom-6 bg-white/90 px-2 py-0.5 rounded-full shadow border border-slate-100 text-[8px] font-black uppercase text-slate-600 whitespace-nowrap">PICK UP</div>
                  </motion.div>
                </div>
              ))}

              <motion.div className="absolute z-40"
                style={{ left: player.x, top: player.y, width: PLAYER_SIZE, height: PLAYER_SIZE, transform: `rotate(${player.angle}rad)` }}>
                <div className="relative w-full h-full flex flex-col items-center justify-center">
                  <div className="absolute inset-[-8px] bg-sky-200/40 blur-xl rounded-full" />
                  {aiMode && !aiPaused && <div className="absolute inset-[-12px] bg-green-400/20 blur-lg rounded-full animate-pulse" />}
                  <div className="w-10 h-12 bg-white rounded-xl border-2 border-slate-100 shadow-xl flex flex-col items-center relative">
                    <div className="w-8 h-5 bg-sky-100 rounded-t-lg mt-1 border-x border-t border-sky-200 flex items-center justify-center">
                      <div className="w-5 h-0.5 bg-sky-300/50 rounded-full" />
                    </div>
                    <div className="flex gap-1 mt-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                    </div>
                    {aiMode && (
                      <div className="absolute -top-4 -right-4 bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-lg">
                        <Bot className="w-2.5 h-2.5" />
                      </div>
                    )}
                    {player.carryingId && (
                      <motion.div initial={{ scale: 0, y: 10 }} animate={{ scale: 1, y: -38 }}
                        className="absolute bg-white p-1.5 rounded-lg shadow-xl border-2 border-white">
                        <Box className="w-4 h-4" style={{ color: carryingPkg?.color }} />
                      </motion.div>
                    )}
                  </div>
                  <div className="flex justify-between w-12 -mt-1">
                    <div className="w-2.5 h-4 bg-slate-900 rounded-md" />
                    <div className="w-2.5 h-4 bg-slate-900 rounded-md" />
                  </div>
                </div>
              </motion.div>

              {targetHouse && (
                <div className="absolute z-50 pointer-events-none"
                  style={{ left: player.x + PLAYER_SIZE / 2, top: player.y + PLAYER_SIZE / 2 }}>
                  <motion.div animate={{ scale: [1, 1.2, 1], y: [-100, -115, -100] }} transition={{ repeat: Infinity, duration: 1.5 }}
                    style={{ transform: `rotate(${getAngleToHouse(player, targetHouse)}rad)` }}>
                    <Navigation className="w-9 h-9 text-slate-800 drop-shadow-lg fill-white" />
                  </motion.div>
                </div>
              )}
            </div>

            {/* Notifications */}
            <AnimatePresence>
              {deliveryStatus && (
                <motion.div initial={{ opacity: 0, y: 30, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}
                  className={`absolute bottom-16 left-1/2 -translate-x-1/2 backdrop-blur-2xl px-8 py-4 rounded-full font-black shadow-2xl z-[300] border-4 border-white text-base tracking-tight flex items-center gap-3
                    ${deliveryStatus.type === 'success' ? 'bg-green-500 text-white' : 'bg-sky-600 text-white'}`}>
                  {deliveryStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <Box className="w-5 h-5" />}
                  {deliveryStatus.msg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Overlays */}
            <AnimatePresence>
              {gameState === 'idle' && (
                <motion.div className="absolute inset-0 bg-white/95 backdrop-blur-3xl z-[400] flex flex-col items-center justify-center p-8 text-center">
                  <motion.div animate={{ rotate: [0, 5, -5, 0], y: [0, -15, 0] }} transition={{ repeat: Infinity, duration: 4 }}
                    className="bg-yellow-400 p-8 rounded-[2.5rem] mb-8 shadow-2xl rotate-3">
                    <Box className="w-16 h-16 text-yellow-900" />
                  </motion.div>
                  <h1 className="text-5xl font-black mb-3 tracking-tighter text-slate-900">BRIGHT DELIVERS</h1>
                  <p className="text-slate-400 mb-3 font-bold uppercase tracking-[0.4em] text-xs">The ultimate neighborhood courier</p>
                  <div className={`mb-6 px-5 py-1.5 rounded-full text-xs font-bold border-2 flex items-center gap-2
                    ${aiReady ? 'border-green-300 text-green-600 bg-green-50' : 'border-red-200 text-red-400 bg-red-50'}`}>
                    <Bot className="w-3 h-3" />{aiStatus}
                  </div>
                  <div className="flex gap-3 flex-wrap justify-center">
                    <button onClick={() => { setAiMode(false); initGame(); }}
                      className="px-10 py-4 bg-slate-900 text-white font-black rounded-full flex items-center gap-3 hover:bg-sky-600 hover:scale-105 active:scale-95 transition-all shadow-xl">
                      <Play className="w-5 h-5 fill-current" />
                      <span className="text-lg uppercase tracking-tighter">Play Myself</span>
                    </button>
                    <button onClick={() => { setAiMode(true); initGame(); }} disabled={!aiReady}
                      className="px-10 py-4 bg-green-500 text-white font-black rounded-full flex items-center gap-3 hover:bg-green-600 hover:scale-105 active:scale-95 transition-all shadow-xl disabled:opacity-40 disabled:cursor-not-allowed">
                      <Bot className="w-5 h-5" />
                      <span className="text-lg uppercase tracking-tighter">Watch AI Play</span>
                    </button>
                  </div>
                </motion.div>
              )}
              {gameState === 'gameover' && (
                <motion.div className="absolute inset-0 bg-white/95 backdrop-blur-3xl z-[400] flex flex-col items-center justify-center p-8 text-center">
                  <div className="bg-red-100 p-8 rounded-full mb-6"><Clock className="w-16 h-16 text-red-500" /></div>
                  <h2 className="text-5xl font-black mb-3 tracking-tighter text-slate-900 uppercase">Shift Ended</h2>
                  <p className="text-slate-500 mb-10 font-bold text-lg font-mono uppercase tracking-widest">Revenue: ${player.score}</p>
                  <div className="flex gap-3 flex-wrap justify-center">
                    <button onClick={() => { setAiMode(false); initGame(); }}
                      className="px-10 py-4 bg-red-500 text-white font-black rounded-full flex items-center gap-3 hover:scale-110 active:scale-95 transition-all shadow-xl">
                      <RotateCcw className="w-5 h-5" /><span className="text-lg uppercase tracking-tighter">Try Again</span>
                    </button>
                    <button onClick={() => { setAiMode(true); initGame(); }} disabled={!aiReady}
                      className="px-10 py-4 bg-green-500 text-white font-black rounded-full flex items-center gap-3 hover:scale-110 active:scale-95 transition-all shadow-xl disabled:opacity-40">
                      <Bot className="w-5 h-5" /><span className="text-lg uppercase tracking-tighter">Watch AI</span>
                    </button>
                  </div>
                </motion.div>
              )}
              {gameState === 'win' && (
                <motion.div className="absolute inset-0 bg-white/95 backdrop-blur-3xl z-[400] flex flex-col items-center justify-center p-8 text-center">
                  <div className="relative mb-8">
                    <Trophy className="w-24 h-24 text-yellow-400 drop-shadow-xl animate-bounce" />
                    <CheckCircle2 className="absolute -top-3 -right-3 w-8 h-8 text-green-500" />
                  </div>
                  <h2 className="text-5xl font-black mb-3 tracking-tighter text-slate-900 uppercase">Area Cleared!</h2>
                  <p className="text-slate-500 mb-10 font-bold text-2xl font-mono">PAYOUT: ${player.score}</p>
                  <div className="flex gap-3 flex-wrap justify-center">
                    <button onClick={() => { setAiMode(false); initGame(); }}
                      className="px-10 py-4 bg-green-500 text-white font-black rounded-full flex items-center gap-3 hover:scale-110 active:scale-95 transition-all shadow-xl">
                      <Trophy className="w-5 h-5" /><span className="text-lg uppercase tracking-tighter">Next Shift</span>
                    </button>
                    <button onClick={() => { setAiMode(true); initGame(); }} disabled={!aiReady}
                      className="px-10 py-4 bg-sky-500 text-white font-black rounded-full flex items-center gap-3 hover:scale-110 active:scale-95 transition-all shadow-xl disabled:opacity-40">
                      <Bot className="w-5 h-5" /><span className="text-lg uppercase tracking-tighter">AI Next Round</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── AI Stats Panel — outside the game div, overlaid top-right ── */}
          <AnimatePresence>
            {aiMode && lastDecision && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="absolute top-0 -right-60 w-56 bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-700 shadow-2xl p-3 flex flex-col gap-2"
              >
                <div className="flex items-center gap-2 border-b border-slate-700 pb-2">
                  <Bot className="w-3 h-3 text-green-400 animate-pulse" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-green-400">DQN Agent</span>
                  <span className="ml-auto text-[9px] text-slate-500">#{totalSteps}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400">Action</span>
                  <span className="text-xs font-black px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: ACTION_COLORS[lastDecision.action] + '33', color: ACTION_COLORS[lastDecision.action] }}>
                    {ACTION_LABELS[lastDecision.action]}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400">State</span>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${player.carryingId ? 'bg-yellow-500/20 text-yellow-400' : 'bg-sky-500/20 text-sky-400'}`}>
                    {player.carryingId ? '📦 CARRYING' : '🔍 SEARCHING'}
                  </span>
                </div>

                <div className="flex flex-col gap-1 pt-1 border-t border-slate-700">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 mb-0.5">Q-Values</span>
                  {lastDecision.qValues.map((q, i) => {
                    const min = Math.min(...lastDecision.qValues);
                    const max = Math.max(...lastDecision.qValues);
                    const pct = ((q - min) / (max - min || 1)) * 100;
                    const isBest = i === lastDecision.action;
                    return (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="text-[8px] w-10 text-slate-400 shrink-0">{ACTION_LABELS[i].split(' ')[1]}</span>
                        <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden">
                          <motion.div animate={{ width: `${pct}%` }} transition={{ duration: 0.2 }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: isBest ? ACTION_COLORS[i] : ACTION_COLORS[i] + '66' }} />
                        </div>
                        <span className="text-[8px] w-8 text-right font-mono tabular-nums"
                          style={{ color: isBest ? ACTION_COLORS[i] : '#64748b' }}>
                          {q.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-1 pt-1 border-t border-slate-700">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 mb-0.5">Action Mix</span>
                  <div className="flex h-10 items-end gap-0.5">
                    {actionCounts.map((c, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                        <motion.div animate={{ height: `${(c / totalActions) * 100}%` }} transition={{ duration: 0.3 }}
                          className="w-full rounded-t-sm min-h-[2px]"
                          style={{ backgroundColor: ACTION_COLORS[i] }} />
                        <span className="text-[6px] text-slate-500">{ACTION_LABELS[i].split(' ')[1][0]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between">
                    {actionCounts.map((c, i) => (
                      <span key={i} className="text-[7px] text-center flex-1 font-mono tabular-nums"
                        style={{ color: ACTION_COLORS[i] }}>
                        {((c / totalActions) * 100).toFixed(0)}%
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1 pt-1 border-t border-slate-700">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400">Max Q Trend</span>
                  <svg width="100%" height="28" viewBox="0 0 200 28" preserveAspectRatio="none">
                    {stepHistory.length > 1 && (() => {
                      const vals = stepHistory.map(s => s.qMax);
                      const min  = Math.min(...vals);
                      const max  = Math.max(...vals);
                      const pts  = vals.map((v, i) =>
                        `${(i / (vals.length - 1)) * 200},${28 - ((v - min) / (max - min || 1)) * 24}`
                      ).join(' ');
                      return <polyline points={pts} fill="none" stroke="#4ade80" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />;
                    })()}
                  </svg>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="w-full max-w-5xl px-4 py-3 flex justify-between items-center z-50">
        {!aiMode ? (
          <div className="flex bg-white/60 backdrop-blur-xl p-4 rounded-[1.5rem] gap-6 border border-white shadow-md">
            <div className="flex flex-col items-center gap-1 opacity-60">
              <div className="w-8 h-8 border-2 border-slate-400 rounded-lg flex items-center justify-center font-black text-slate-500 text-sm">W</div>
              <span className="text-[7px] font-black uppercase text-slate-400">Drive</span>
            </div>
            <div className="flex flex-col items-center gap-1 opacity-60">
              <div className="flex gap-1">
                {['A', 'S', 'D'].map(k => (
                  <div key={k} className="w-8 h-8 border-2 border-slate-400 rounded-lg flex items-center justify-center font-black text-slate-500 text-sm">{k}</div>
                ))}
              </div>
              <span className="text-[7px] font-black uppercase text-slate-400">Steering</span>
            </div>
          </div>
        ) : (
          <div className={`flex bg-white/60 backdrop-blur-xl px-6 py-4 rounded-[1.5rem] border shadow-md items-center gap-2 ${aiPaused ? 'border-yellow-200' : 'border-green-200'}`}>
            <Bot className={`w-5 h-5 ${aiPaused ? 'text-yellow-500' : 'text-green-500 animate-pulse'}`} />
            <span className="font-black text-slate-700 uppercase tracking-wider text-xs">
              {aiPaused ? 'AI PAUSED' : 'AI IS DRIVING...'}
            </span>
          </div>
        )}

        <div className="bg-white/60 backdrop-blur-xl px-6 py-4 rounded-[1.5rem] border border-white flex flex-col gap-1 items-start shadow-md min-w-[220px]">
          <span className="text-[8px] font-bold uppercase text-slate-400 tracking-widest flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Dispatch
          </span>
          <div className="flex items-center gap-3">
            <MapPin className={`w-6 h-6 ${carryingPkg ? '' : 'opacity-20 text-slate-300'}`} style={{ color: carryingPkg?.color }} />
            <span className="text-sm font-black tracking-tight text-slate-700">
              {carryingPkg ? `→ ${carryingPkg.color} house` : 'Looking...'}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 15s linear infinite; }
      `}</style>
    </div>
  );
}

function getAngleToHouse(p: Player, h: House) {
  return Math.atan2(h.y - (p.y + PLAYER_SIZE / 2), h.x - (p.x + PLAYER_SIZE / 2)) + Math.PI / 2;
}