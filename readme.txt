# CourierRL — Autonomous Delivery Agent using Deep Reinforcement Learning

CourierRL is a Deep Reinforcement Learning project where an autonomous agent learns to navigate environments, collect packages, and complete deliveries using a custom-designed DQN (Deep Q-Network) architecture.

The project explores a dynamic reward-switching mechanism where the same neural policy changes objectives based on an internal pickup state:

* before pickup → optimize movement toward package
* after pickup → optimize movement toward delivery house

Instead of using hardcoded navigation or classical pathfinding algorithms, the agent learns delivery behavior entirely through:

* reinforcement learning
* reward shaping
* exploration
* long-term Q-value optimization

---

## Core RL Design

The state representation:

```python
[
 agent_x,
 agent_y,
 package_x,
 package_y,
 house_x,
 house_y,
 picked
]
```

Reward function:

* negative reward proportional to distance from current objective
* positive pickup bonus after collecting package
* large terminal reward after successful delivery
* small step penalty to encourage faster routes

This allows a single neural policy to learn:

* searching behavior
* pickup behavior
* delivery behavior

using only state transitions and reward optimization.

---

## Training Architecture

The agent was trained from scratch inside a custom Python reinforcement learning environment using:

* PyTorch
* Replay Buffers
* Target Networks
* Bellman Q-Learning
* Epsilon-Greedy Exploration
* Reward Shaping

The trained model was later exported to ONNX for browser deployment.

---

## Browser AI Deployment

After training, the model was exported to ONNX and deployed directly inside a React + TypeScript procedural city simulation using:

* ONNX Runtime Web
* WebAssembly
* Real-time browser inference

The AI runs completely client-side without requiring a Python backend.

---

## Features

* Autonomous package delivery agent
* Dynamic reward-switching RL architecture
* Procedural city simulation
* Real-time browser AI inference
* Live Q-value analytics visualization
* Multi-delivery orchestration system
* ONNX deployment pipeline
* Explainable RL behavior visualization

---

## Training Results

Initial model:

* ~5/10 success rate

Improved model:

* ~9/10 success rate

The final agent demonstrated:

* stable autonomous navigation
* faster delivery behavior
* better policy generalization
* improved reward optimization

---

## Tech Stack

* PyTorch
* Deep Q Networks (DQN)
* ONNX
* React
* TypeScript
* ONNX Runtime Web
* WebAssembly

---

## Research & Design Notes

One of the most interesting aspects of this project was designing the reward architecture, state representation, and behavioral transition logic entirely from first principles.

The agent was not given:

* hardcoded delivery logic
* scripted navigation
* predefined paths

Instead, the policy learned sequential delivery behavior entirely through dynamic rewards and future Q-value optimization.

---

## Future Scope

I believe systems like this can eventually contribute toward:

* robotic delivery systems
* autonomous navigation agents
* warehouse logistics optimization
* smart movement intelligence
* autonomous vehicle planning
* multi-agent coordination systems
* exploration and space-navigation environments

---

## Development Note

I used Claude as a coding partner during development for assistance with some implementation and frontend integration tasks. However, the overall reinforcement learning design, reward architecture, state representation, behavioral transition logic, training approach, and mathematical RL concepts were designed and engineered by me from first principles.
