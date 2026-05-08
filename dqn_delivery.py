import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import random
from collections import deque

# ─────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────
WORLD_W        = 500
WORLD_H        = 500
STEP_SIZE      = 40       # bigger → fewer steps to cross world
MAX_DIST       = (WORLD_W**2 + WORLD_H**2) ** 0.5

STATE_DIM      = 7
ACTION_DIM     = 4
HIDDEN_DIM     = 256

LR             = 1e-3
GAMMA          = 0.99
EPSILON_START  = 1.0
EPSILON_END    = 0.02
EPSILON_DECAY  = 0.997
BATCH_SIZE     = 128
BUFFER_SIZE    = 50_000
TARGET_UPDATE  = 10
MAX_STEPS      = 400      # more steps for continuous world
EPISODES       = 3000     # longer training


# ─────────────────────────────────────────
#  ENVIRONMENT
# ─────────────────────────────────────────
def _euclid(ax, ay, bx, by):
    return ((ax - bx)**2 + (ay - by)**2) ** 0.5

def _rand_pos():
    return [random.uniform(0, WORLD_W), random.uniform(0, WORLD_H)]

def _min_spawn_dist(p1, p2, min_d=80):
    return _euclid(p1[0], p1[1], p2[0], p2[1]) > min_d

class DeliveryEnv:
    PICKUP_RADIUS   = 40  # slightly bigger hitbox to match bigger step
    DELIVERY_RADIUS = 40

    def reset(self):
        while True:
            a = _rand_pos()
            p = _rand_pos()
            h = _rand_pos()
            if _min_spawn_dist(a, p) and _min_spawn_dist(p, h) and _min_spawn_dist(a, h):
                break
        self.agent_pos   = a
        self.package_pos = p
        self.house_pos   = h
        self.picked      = 0
        return self._get_state()

    def _get_state(self):
        return np.array([
            self.agent_pos[0]   / WORLD_W,
            self.agent_pos[1]   / WORLD_H,
            self.package_pos[0] / WORLD_W,
            self.package_pos[1] / WORLD_H,
            self.house_pos[0]   / WORLD_W,
            self.house_pos[1]   / WORLD_H,
            float(self.picked),
        ], dtype=np.float32)

    def step(self, action):
        x, y = self.agent_pos
        s = STEP_SIZE
        if   action == 0: y = max(y - s, 0)
        elif action == 1: y = min(y + s, WORLD_H)
        elif action == 2: x = max(x - s, 0)
        elif action == 3: x = min(x + s, WORLD_W)
        self.agent_pos = [x, y]

        reward = 0.0
        done   = False

        if not self.picked:
            dist = _euclid(x, y, self.package_pos[0], self.package_pos[1])
            reward = -(dist / MAX_DIST)
            if dist <= self.PICKUP_RADIUS:
                self.picked = 1
                reward = 1.0
        else:
            dist = _euclid(x, y, self.house_pos[0], self.house_pos[1])
            reward = -(dist / MAX_DIST)
            if dist <= self.DELIVERY_RADIUS:
                reward = 10.0
                done   = True

        reward -= 0.01
        return self._get_state(), reward, done


# ─────────────────────────────────────────
#  DQN NETWORK
# ─────────────────────────────────────────
class DQN(nn.Module):
    def __init__(self, state_dim=STATE_DIM, action_dim=ACTION_DIM, hidden_dim=HIDDEN_DIM):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, action_dim),
        )

    def forward(self, x):
        return self.net(x)


# ─────────────────────────────────────────
#  REPLAY BUFFER
# ─────────────────────────────────────────
class ReplayBuffer:
    def __init__(self, capacity=BUFFER_SIZE):
        self.buffer = deque(maxlen=capacity)

    def push(self, state, action, reward, next_state, done):
        self.buffer.append((state, action, reward, next_state, done))

    def sample(self, batch_size):
        batch = random.sample(self.buffer, batch_size)
        states, actions, rewards, next_states, dones = zip(*batch)
        return (
            torch.FloatTensor(np.array(states)),
            torch.LongTensor(actions),
            torch.FloatTensor(rewards),
            torch.FloatTensor(np.array(next_states)),
            torch.FloatTensor(dones),
        )

    def __len__(self):
        return len(self.buffer)


# ─────────────────────────────────────────
#  AGENT
# ─────────────────────────────────────────
class DQNAgent:
    def __init__(self):
        self.policy_net = DQN()
        self.target_net = DQN()
        self.target_net.load_state_dict(self.policy_net.state_dict())
        self.target_net.eval()
        self.optimizer = optim.Adam(self.policy_net.parameters(), lr=LR)
        self.buffer    = ReplayBuffer()
        self.epsilon   = EPSILON_START

    def select_action(self, state):
        if random.random() < self.epsilon:
            return random.randint(0, ACTION_DIM - 1)
        with torch.no_grad():
            state_t = torch.FloatTensor(state).unsqueeze(0)
            return self.policy_net(state_t).argmax(dim=1).item()

    def train_step(self):
        if len(self.buffer) < BATCH_SIZE:
            return None
        states, actions, rewards, next_states, dones = self.buffer.sample(BATCH_SIZE)
        q_values = self.policy_net(states).gather(1, actions.unsqueeze(1)).squeeze(1)
        with torch.no_grad():
            next_q  = self.target_net(next_states).max(1)[0]
            targets = rewards + GAMMA * next_q * (1 - dones)
        loss = nn.MSELoss()(q_values, targets)
        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()
        return loss.item()

    def decay_epsilon(self):
        self.epsilon = max(EPSILON_END, self.epsilon * EPSILON_DECAY)

    def sync_target(self):
        self.target_net.load_state_dict(self.policy_net.state_dict())


# ─────────────────────────────────────────
#  TRAINING LOOP
# ─────────────────────────────────────────
def train():
    env   = DeliveryEnv()
    agent = DQNAgent()
    episode_rewards = []

    for ep in range(1, EPISODES + 1):
        state        = env.reset()
        total_reward = 0.0

        for _ in range(MAX_STEPS):
            action                   = agent.select_action(state)
            next_state, reward, done = env.step(action)
            agent.buffer.push(state, action, reward, next_state, float(done))
            agent.train_step()
            state        = next_state
            total_reward += reward
            if done:
                break

        agent.decay_epsilon()
        if ep % TARGET_UPDATE == 0:
            agent.sync_target()

        episode_rewards.append(total_reward)

        if ep % 100 == 0:
            avg = np.mean(episode_rewards[-100:])
            print(f"Episode {ep:4d} | Avg Reward (last 100): {avg:7.3f} | Epsilon: {agent.epsilon:.3f}")

    torch.save(agent.policy_net.state_dict(), "dqn_delivery.pth")
    print("\nTraining complete. Model saved to dqn_delivery.pth")
    return agent, episode_rewards


# ─────────────────────────────────────────
#  EVALUATION
# ─────────────────────────────────────────
def evaluate(agent, episodes=10):
    env = DeliveryEnv()
    agent.policy_net.eval()
    successes = 0

    for ep in range(episodes):
        state = env.reset()
        for step in range(MAX_STEPS):
            with torch.no_grad():
                state_t = torch.FloatTensor(state).unsqueeze(0)
                action  = agent.policy_net(state_t).argmax(dim=1).item()
            state, _, done = env.step(action)
            if done:
                successes += 1
                print(f"  Eval ep {ep+1}: delivered in {step+1} steps ✓")
                break
        else:
            print(f"  Eval ep {ep+1}: failed (timeout)")

    print(f"\nSuccess rate: {successes}/{episodes}")


if __name__ == "__main__":
    agent, rewards = train()
    print("\n── Evaluation ──")
    evaluate(agent)