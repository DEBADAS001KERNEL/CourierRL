# CourierRL — Autonomous Delivery Agent using Deep Reinforcement Learning

CourierRL is a Deep Reinforcement Learning project where an autonomous agent learns to navigate environments, collect packages, and complete deliveries using a custom-designed DQN (Deep Q-Network) architecture.

The project explores dynamic reward-switching behavior, where the same neural policy changes objectives based on an internal pickup state:

* before pickup → optimize movement toward package
* after pickup → optimize movement toward delivery house

The agent was trained from scratch in a custom Python RL environment using:

* PyTorch
* Replay Buffers
* Target Networks
* Bellman Q-Learning
* Reward Shaping

After training, the model was exported to ONNX and deployed directly inside a React + TypeScript procedural city simulation using ONNX Runtime Web and WebAssembly for real-time browser inference.

Key Features:

* Autonomous package delivery agent
* Dynamic reward-switching RL architecture
* Procedural city simulation
* Real-time browser AI inference
* Live Q-value analytics visualization
* Multi-delivery orchestration system
* ONNX deployment pipeline

Tech Stack:
PyTorch • DQN • ONNX • React • TypeScript • ONNX Runtime Web • WebAssembly
