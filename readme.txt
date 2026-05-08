# CourierRL — Autonomous Delivery Agent using Deep Reinforcement Learning

CourierRL is a Deep Reinforcement Learning project where an autonomous agent learns to navigate environments, collect packages, and complete deliveries using a custom-designed DQN (Deep Q-Network) architecture.

The project explores a dynamic reward-switching mechanism where the same neural policy changes objectives based on an internal pickup state:

* before pickup → optimize movement toward package
* after pickup → optimize movement toward delivery house

The agent was trained from scratch inside a custom Python reinforcement learning environment using:

* PyTorch
* Replay Buffers
* Target Networks
* Bellman Q-Learning
* Reward Shaping

After training, the model was exported to ONNX and deployed directly inside a React + TypeScript procedural city simulation using ONNX Runtime Web and WebAssembly for real-time browser inference.

## Key Features

* Autonomous package delivery agent
* Dynamic reward-switching RL architecture
* Procedural city simulation
* Real-time browser AI inference
* Live Q-value analytics visualization
* Multi-delivery orchestration system
* ONNX deployment pipeline

## Tech Stack

PyTorch • DQN • ONNX • React • TypeScript • ONNX Runtime Web • WebAssembly

## Research & Design Notes

One of the most interesting parts of this project was designing the reward architecture, state representation, and behavioral transition logic entirely from first principles.

The agent was not given any hardcoded navigation or pathfinding rules. Instead, the system learns sequential delivery behavior purely through:

* reinforcement learning
* reward shaping
* dynamic objective switching
* long-term Q-value optimization

Reward function:

* negative reward proportional to distance from current objective
* positive pickup bonus after collecting package
* large terminal reward after successful delivery
* small step penalty to encourage faster routes

This allowed a single neural policy to learn:

* searching behavior
* pickup behavior
* delivery behavior

using only state transitions and reward optimization.

## Future Scope

I believe systems like this can eventually contribute toward:

* robotic delivery systems
* autonomous navigation agents
* warehouse logistics optimization
* smart movement intelligence
* autonomous vehicle planning
* multi-agent coordination systems
* exploration and space-navigation environments

## Development Note

I used Claude as a coding partner during development for assistance with some implementation and frontend integration tasks. However, the overall reinforcement learning design, reward architecture, state representation, behavioral transition logic, training approach, and mathematical RL concepts were designed and engineered by me from first principles.
