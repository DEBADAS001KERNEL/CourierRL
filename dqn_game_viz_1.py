import torch
import torch.nn as nn
import numpy as np
import random
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.animation import FuncAnimation

# ── CONFIG (must match training) ──
WORLD_W         = 500
WORLD_H         = 500
STEP_SIZE       = 40
MAX_DIST        = (WORLD_W**2 + WORLD_H**2) ** 0.5
STATE_DIM       = 7
ACTION_DIM      = 4
HIDDEN_DIM      = 256
MAX_STEPS       = 400
PICKUP_RADIUS   = 40
DELIVERY_RADIUS = 40

PAIR_COLORS = ["#FF5050", "#50C878", "#4DA6FF"]
BG_COLOR    = "#0f0f1a"
GRID_COLOR  = "#1a1a2e"

# ── DQN ──
class DQN(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(STATE_DIM, HIDDEN_DIM), nn.ReLU(),
            nn.Linear(HIDDEN_DIM, HIDDEN_DIM), nn.ReLU(),
            nn.Linear(HIDDEN_DIM, ACTION_DIM),
        )
    def forward(self, x): return self.net(x)

model = DQN()
model.load_state_dict(torch.load("dqn_delivery.pth", map_location="cpu"))
model.eval()

# ── HELPERS ──
def euclid(a, b):
    return ((a[0]-b[0])**2 + (a[1]-b[1])**2)**0.5

def rand_pos(margin=70):
    return [random.uniform(margin, WORLD_W-margin),
            random.uniform(margin, WORLD_H-margin)]

def spawn_all():
    while True:
        pts = [rand_pos() for _ in range(7)]
        ok  = all(euclid(pts[i], pts[j]) > 100 for i in range(7) for j in range(i+1,7))
        if ok:
            return pts[0], pts[1:4], pts[4:7]

def get_action(agent, pkg, house, picked):
    s = np.array([agent[0]/WORLD_W, agent[1]/WORLD_H,
                  pkg[0]/WORLD_W,   pkg[1]/WORLD_H,
                  house[0]/WORLD_W, house[1]/WORLD_H,
                  float(picked)], dtype=np.float32)
    with torch.no_grad():
        return model(torch.FloatTensor(s).unsqueeze(0)).argmax(dim=1).item()

def move(pos, action):
    x, y = pos
    s = STEP_SIZE
    if   action == 0: y = max(y-s, 0)
    elif action == 1: y = min(y+s, WORLD_H)
    elif action == 2: x = max(x-s, 0)
    elif action == 3: x = min(x+s, WORLD_W)
    return [x, y]

# ── COLLECT TRAJECTORY ──
agent_start, packages, houses = spawn_all()

frames        = []
agent         = list(agent_start)
delivered     = [False, False, False]
carrying      = None
pickup_steps  = [None, None, None]
deliver_steps = [None, None, None]

for step in range(MAX_STEPS * 3):
    frames.append({
        "agent":     list(agent),
        "delivered": list(delivered),
        "carrying":  carrying,
        "step":      step,
    })
    if all(delivered):
        break

    if carrying is None:
        remaining = [(i, packages[i]) for i in range(3) if not delivered[i]]
        if not remaining: break
        idx, pkg = min(remaining, key=lambda t: euclid(agent, t[1]))
        action   = get_action(agent, pkg, houses[idx], 0)
        agent    = move(agent, action)
        if euclid(agent, packages[idx]) <= PICKUP_RADIUS:
            carrying = idx
            pickup_steps[idx] = step
    else:
        idx    = carrying
        action = get_action(agent, packages[idx], houses[idx], 1)
        agent  = move(agent, action)
        if euclid(agent, houses[idx]) <= DELIVERY_RADIUS:
            delivered[idx]     = True
            deliver_steps[idx] = step
            carrying           = None

frames.append({"agent": list(agent), "delivered": list(delivered),
               "carrying": carrying, "step": len(frames)})

print(f"Trajectory: {len(frames)} frames | Delivered: {sum(delivered)}/3")
for i in range(3):
    if deliver_steps[i]:
        print(f"  Pair {i+1}: picked@{pickup_steps[i]} → delivered@{deliver_steps[i]}")

# ── BUILD FIGURE ──
fig, ax = plt.subplots(figsize=(8, 8))
fig.patch.set_facecolor(BG_COLOR)
ax.set_facecolor(BG_COLOR)
ax.set_xlim(0, WORLD_W)
ax.set_ylim(0, WORLD_H)
ax.set_aspect("equal")
ax.axis("off")

# grid
for gx in range(0, WORLD_W+1, 50):
    ax.axvline(gx, color=GRID_COLOR, linewidth=0.5, zorder=0)
for gy in range(0, WORLD_H+1, 50):
    ax.axhline(gy, color=GRID_COLOR, linewidth=0.5, zorder=0)

# radius rings
for i in range(3):
    c = PAIR_COLORS[i]
    ax.add_patch(plt.Circle(packages[i], PICKUP_RADIUS,
                            color=c, fill=False, linestyle="--", linewidth=1, alpha=0.3, zorder=1))
    ax.add_patch(plt.Circle(houses[i], DELIVERY_RADIUS,
                            color=c, fill=False, linestyle="--", linewidth=1, alpha=0.3, zorder=1))

# house markers
house_markers = []
for i in range(3):
    hx, hy = houses[i]
    m, = ax.plot(hx, hy, "^", color=PAIR_COLORS[i], markersize=20,
                 markeredgecolor="white", markeredgewidth=1.5, zorder=3)
    house_markers.append(m)
    ax.text(hx, hy-30, f"H{i+1}", color=PAIR_COLORS[i],
            fontsize=9, ha="center", fontweight="bold")

# package markers
pkg_markers = []
for i in range(3):
    px, py = packages[i]
    m, = ax.plot(px, py, "s", color=PAIR_COLORS[i], markersize=16,
                 markeredgecolor="white", markeredgewidth=1.5, zorder=3)
    pkg_markers.append(m)
    ax.text(px, py+24, f"P{i+1}", color=PAIR_COLORS[i],
            fontsize=9, ha="center", fontweight="bold")

# trails
trails = [ax.plot([], [], color=PAIR_COLORS[i], linewidth=2,
                  alpha=0.7, zorder=2)[0] for i in range(3)]

# agent
agent_outer, = ax.plot([], [], "o", color="white",  markersize=20, zorder=5)
agent_inner, = ax.plot([], [], "o", color=BG_COLOR, markersize=16, zorder=6)
agent_core,  = ax.plot([], [], "o", color="white",  markersize=7,  zorder=7)

# checkmarks
check_texts = [ax.text(0, 0, "", color="lime", fontsize=20,
                        ha="center", va="center", fontweight="bold", zorder=8)
               for _ in range(3)]

# status
status_txt = ax.text(10, 14, "", color="white", fontsize=11)
score_txt  = ax.text(WORLD_W-10, 14, "", color="#FFD700", fontsize=13,
                     ha="right", fontweight="bold")

current_trail = []

def update(fi):
    if fi >= len(frames): return
    f        = frames[fi]
    ap       = f["agent"]
    dlv      = f["delivered"]
    carrying = f["carrying"]

    # agent
    agent_outer.set_data([ap[0]], [ap[1]])
    agent_inner.set_data([ap[0]], [ap[1]])
    agent_core.set_color(PAIR_COLORS[carrying] if carrying is not None else "#666666")
    agent_core.set_data([ap[0]], [ap[1]])

    # packages
    for i in range(3):
        pkg_markers[i].set_alpha(0.15 if (dlv[i] or carrying == i) else 1.0)

    # houses + checkmarks
    for i in range(3):
        if dlv[i]:
            house_markers[i].set_alpha(0.25)
            hx, hy = houses[i]
            check_texts[i].set_position((hx, hy))
            check_texts[i].set_text("✓")
        else:
            house_markers[i].set_alpha(1.0)

    # trail
    current_trail.append(list(ap))
    if len(current_trail) > 80:
        current_trail.pop(0)

    remaining = [i for i in range(3) if not dlv[i]]
    if carrying is not None:
        tidx = carrying
    elif remaining:
        tidx = min(remaining, key=lambda i: euclid(ap, packages[i]))
    else:
        tidx = 0

    for i, tr in enumerate(trails):
        if i == tidx:
            tr.set_data([p[0] for p in current_trail],
                        [p[1] for p in current_trail])
        else:
            tr.set_data([], [])

    # status text
    score = sum(dlv)
    score_txt.set_text(f"✓ {score}/3")
    if all(dlv):
        status_txt.set_text(f"ALL DELIVERED!  step {f['step']}")
        status_txt.set_color("lime")
    elif carrying is not None:
        status_txt.set_text(f"Delivering P{carrying+1} → H{carrying+1}   step {f['step']}")
        status_txt.set_color(PAIR_COLORS[carrying])
    elif remaining:
        t = min(remaining, key=lambda i: euclid(ap, packages[i]))
        status_txt.set_text(f"Finding P{t+1}   step {f['step']}")
        status_txt.set_color(PAIR_COLORS[t])

ani = FuncAnimation(fig, update, frames=len(frames),
                    interval=120, repeat=True, blit=False)

plt.tight_layout(pad=0)
plt.show()   # ← works locally AND in Colab