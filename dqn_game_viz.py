import torch
import torch.nn as nn
import numpy as np
import random
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.animation import FuncAnimation
from collections import deque

# ─────────────────────────────────────────
#  CONFIG (must match training)
# ─────────────────────────────────────────
WORLD_W        = 500
WORLD_H        = 500
STEP_SIZE      = 40
MAX_DIST       = (WORLD_W**2 + WORLD_H**2) ** 0.5
STATE_DIM      = 7
ACTION_DIM     = 4
HIDDEN_DIM     = 256
MAX_STEPS      = 400
PICKUP_RADIUS  = 40
DELIVERY_RADIUS= 40

# ─────────────────────────────────────────
#  DQN NETWORK (same arch as training)
# ─────────────────────────────────────────
class DQN(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(STATE_DIM, HIDDEN_DIM), nn.ReLU(),
            nn.Linear(HIDDEN_DIM, HIDDEN_DIM), nn.ReLU(),
            nn.Linear(HIDDEN_DIM, ACTION_DIM),
        )
    def forward(self, x):
        return self.net(x)

# ─────────────────────────────────────────
#  HELPERS
# ─────────────────────────────────────────
def _euclid(ax, ay, bx, by):
    return ((ax-bx)**2 + (ay-by)**2)**0.5

def _rand_pos():
    return [random.uniform(0, WORLD_W), random.uniform(0, WORLD_H)]

def _far_enough(p1, p2, min_d=80):
    return _euclid(p1[0], p1[1], p2[0], p2[1]) > min_d

def get_state(agent_pos, package_pos, house_pos, picked):
    return np.array([
        agent_pos[0]/WORLD_W, agent_pos[1]/WORLD_H,
        package_pos[0]/WORLD_W, package_pos[1]/WORLD_H,
        house_pos[0]/WORLD_W, house_pos[1]/WORLD_H,
        float(picked),
    ], dtype=np.float32)

def spawn_episode():
    while True:
        a = _rand_pos(); p = _rand_pos(); h = _rand_pos()
        if _far_enough(a,p) and _far_enough(p,h) and _far_enough(a,h):
            return a, p, h

# ─────────────────────────────────────────
#  LOAD TRAINED MODEL
# ─────────────────────────────────────────
model = DQN()
model.load_state_dict(torch.load("dqn_delivery.pth", map_location="cpu"))
model.eval()

def get_action(state):
    with torch.no_grad():
        t = torch.FloatTensor(state).unsqueeze(0)
        return model(t).argmax(dim=1).item()

# ─────────────────────────────────────────
#  RUN ONE EPISODE, COLLECT TRAJECTORY
# ─────────────────────────────────────────
agent_pos, package_pos, house_pos = spawn_episode()
picked = 0
trajectory = [list(agent_pos)]
pickup_step = None
delivered   = False

for step in range(MAX_STEPS):
    state  = get_state(agent_pos, package_pos, house_pos, picked)
    action = get_action(state)

    x, y = agent_pos
    s = STEP_SIZE
    if   action == 0: y = max(y - s, 0)
    elif action == 1: y = min(y + s, WORLD_H)
    elif action == 2: x = max(x - s, 0)
    elif action == 3: x = min(x + s, WORLD_W)
    agent_pos = [x, y]
    trajectory.append(list(agent_pos))

    if not picked:
        if _euclid(x, y, package_pos[0], package_pos[1]) <= PICKUP_RADIUS:
            picked = 1
            pickup_step = step
    else:
        if _euclid(x, y, house_pos[0], house_pos[1]) <= DELIVERY_RADIUS:
            delivered = True
            break

# ─────────────────────────────────────────
#  ANIMATE
# ─────────────────────────────────────────
fig, ax = plt.subplots(figsize=(6, 6))
ax.set_xlim(0, WORLD_W)
ax.set_ylim(0, WORLD_H)
ax.set_facecolor("#1a1a2e")
fig.patch.set_facecolor("#1a1a2e")
ax.set_title("DQN Delivery Agent", color="white", fontsize=13)
ax.tick_params(colors="white")
for spine in ax.spines.values():
    spine.set_edgecolor("#444")

# Draw pickup radius ring around package
pkg_ring = plt.Circle((package_pos[0], package_pos[1]), PICKUP_RADIUS,
                       color="#00d2ff", fill=False, linestyle="--", linewidth=1, alpha=0.4)
ax.add_patch(pkg_ring)

# Draw delivery radius ring around house
house_ring = plt.Circle((house_pos[0], house_pos[1]), DELIVERY_RADIUS,
                         color="#f5a623", fill=False, linestyle="--", linewidth=1, alpha=0.4)
ax.add_patch(house_ring)

# Static markers
ax.plot(*package_pos, "s", color="#00d2ff", markersize=14, label="Package", zorder=3)
ax.plot(*house_pos,   "^", color="#f5a623", markersize=14, label="House",   zorder=3)
ax.legend(facecolor="#2a2a3e", labelcolor="white", loc="upper right")

# Trail line
trail_x = [trajectory[0][0]]
trail_y = [trajectory[0][1]]
trail_phase1, = ax.plot([], [], color="#00d2ff", linewidth=1.2, alpha=0.5)
trail_phase2, = ax.plot([], [], color="#f5a623", linewidth=1.2, alpha=0.5)
agent_dot,    = ax.plot([], [], "o", color="white", markersize=10, zorder=5)
status_txt    = ax.text(10, WORLD_H - 20, "", color="white", fontsize=10)
step_txt      = ax.text(10, WORLD_H - 40, "", color="#aaa",   fontsize=9)

pickup_marker = ax.plot([], [], "*", color="lime", markersize=16, zorder=6)[0]

def update(frame):
    if frame >= len(trajectory):
        return

    pos = trajectory[frame]

    # Split trail into phase 1 and phase 2
    if pickup_step is not None and frame > pickup_step:
        p1 = trajectory[:pickup_step+2]
        p2 = trajectory[pickup_step+1:frame+1]
        trail_phase1.set_data([p[0] for p in p1], [p[1] for p in p1])
        trail_phase2.set_data([p[0] for p in p2], [p[1] for p in p2])
        if frame == pickup_step + 1:
            pickup_marker.set_data([trajectory[pickup_step+1][0]], [trajectory[pickup_step+1][1]])
        status = "Phase 2 — heading to house"
    else:
        trail_phase1.set_data([p[0] for p in trajectory[:frame+1]],
                              [p[1] for p in trajectory[:frame+1]])
        trail_phase2.set_data([], [])
        status = "Phase 1 — finding package"

    if delivered and frame == len(trajectory) - 1:
        status = "DELIVERED!"
        agent_dot.set_color("lime")

    agent_dot.set_data([pos[0]], [pos[1]])
    status_txt.set_text(status)
    step_txt.set_text(f"Step {frame}")

ani = FuncAnimation(fig, update, frames=len(trajectory), interval=120, repeat=False)
plt.tight_layout()
plt.show()

result = "DELIVERED!" if delivered else "TIMEOUT"
pickup_info = f"pickup at step {pickup_step}" if pickup_step is not None else "never picked up"
print(f"\nResult: {result} | {pickup_info} | total steps: {len(trajectory)-1}")