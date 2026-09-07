# Roblox In-Game UDP Networking APIs & Engine Architecture

- LAST UPDATED: Sep 6th 2026

## Overview

Roblox does not expose raw BSD/POSIX UDP socket primitives directly to developer scripts. Instead, the engine abstracts its peer-to-peer and client-server datagram transport layer—historically and architecturally based on a customized fork of **RakNet**—into discrete application-level messaging classes, core connection services, and replication managers.

Network communication occurs over dynamic UDP port ranges (**49152–65535**). Active sessions multiplex continuous physics replication, data model delta synchronization, engine heartbeats/keep-alives, and remote procedure calls (RPCs) across this underlying transport.

---

## 1. Application-Level Transport APIs

These developer-facing primitives allow Luau scripts to exchange discrete packets across the network boundary, mapping directly to reliable or unreliable transport policies.

### `UnreliableRemoteEvent`
* **Official Documentation:** [https://create.roblox.com/docs/reference/engine/classes/UnreliableRemoteEvent](https://create.roblox.com/docs/reference/engine/classes/UnreliableRemoteEvent)
* **Delivery Semantics:** Unreliable, unordered datagram transmission. Corresponds to raw UDP packet dispatch; dropped or out-of-sequence packets are discarded without retransmission or acknowledgment.
* **Payload Budget:** Strict limit of **1,000 bytes** per packet. Payloads exceeding this threshold are dropped immediately at the engine layer.
* **Throughput / Rate Limiting:** Subject to client-to-server rate limits of approximately **500 requests per second** across remote events. Exceeding ~60 Hz per-client dispatch can trigger engine-level spam warnings and selective throttling.
* **Key Methods & Events:**
  * `FireServer(...)` — Client-to-server dispatch.
  * `FireClient(player, ...)` — Targeted server-to-client dispatch.
  * `FireAllClients(...)` — Server-to-all-clients multicast.
  * `OnServerEvent(player, ...)` / `OnClientEvent(...)` — Event receivers.

### `RemoteEvent`
* **Official Documentation:** [https://create.roblox.com/docs/reference/engine/classes/RemoteEvent](https://create.roblox.com/docs/reference/engine/classes/RemoteEvent)
* **Delivery Semantics:** Reliable, ordered messaging. Dropped datagrams trigger transport-level retransmissions and can cause head-of-line blocking for subsequent packets on that stream.
* **Payload Budget:** Max payload size ~50 KB per call, though best practice caps payloads below standard MTU sizes (~1 KB) to prevent packet fragmentation.
* **Throughput / Rate Limiting:** Bound to an internal invocation queue (defaulting to 256 pending calls) before invocation drops occur.

### `RemoteFunction`
* **Official Documentation:** [https://create.roblox.com/docs/reference/engine/classes/RemoteFunction](https://create.roblox.com/docs/reference/engine/classes/RemoteFunction)
* **Delivery Semantics:** Reliable two-way RPC with synchronous thread yielding until the peer returns a value or the connection terminates.
* **Key Methods & Callbacks:**
  * `InvokeServer(...)` / `InvokeClient(player, ...)`
  * `OnServerInvoke` / `OnClientInvoke`

---

## 2. Low-Level Connection & Replication Engine APIs

These classes represent internal network sockets, peer negotiation sessions, and the serialization engines responsible for continuous game synchronization. Most operate under engine-level security permissions (`RobloxScriptSecurity` or read-only access).

### `NetworkPeer`
* **Official Documentation:** [https://create.roblox.com/docs/reference/engine/classes/NetworkPeer](https://create.roblox.com/docs/reference/engine/classes/NetworkPeer)
* **Role:** Abstract base class for network session endpoints (`NetworkClient` and `NetworkServer`).
* **Transport Controls:** Exposes methods such as `SetOutgoingKBPSLimit(limit)` (`PluginSecurity`) to throttle aggregate outbound network bandwidth.

### `NetworkClient`
* **Official Documentation:** [https://create.roblox.com/docs/reference/engine/classes/NetworkClient](https://create.roblox.com/docs/reference/engine/classes/NetworkClient)
* **Role:** Core service running on client instances that initiates and maintains the active UDP socket session with a server.
* **Key Events:**
  * `ConnectionAccepted(peer, replicator)` — Fires when the UDP handshake completes successfully. Returns the server endpoint string (`IP|Port`) and the client's `ClientReplicator` instance.
  * `ConnectionFailed(peer, code)` — Fires if connection handshake fails or times out.

### `NetworkServer`
* **Official Documentation:** [https://create.roblox.com/docs/reference/engine/classes/NetworkServer](https://create.roblox.com/docs/reference/engine/classes/NetworkServer)
* **Role:** Server-side singleton engine service that binds to the local host port, listens for incoming UDP connection handshakes, and coordinates per-player replication channels.

### `NetworkReplicator`
* **Official Documentation:** [https://create.roblox.com/docs/reference/engine/classes/NetworkReplicator](https://create.roblox.com/docs/reference/engine/classes/NetworkReplicator)
* **Role:** The core serialization engine bridging the data model and the UDP wire protocol. Manages differential state replication, instance creation/removal, property mutation replication, and RPC packetization.
* **Subclasses:**
  * `ClientReplicator` ([Docs](https://create.roblox.com/docs/reference/engine/classes/ClientReplicator)) — Client-side replicator instance.
  * `ServerReplicator` ([Docs](https://create.roblox.com/docs/reference/engine/classes/ServerReplicator)) — Server-side replicator handling one specific connected client.
* **Key Methods:**
  * `GetPlayer()` — Returns the `Player` instance bound to the network replication stream.

---

## 3. Network Simulation & Diagnostic APIs

Used to measure socket performance, monitor datagram throughput, or simulate adverse network conditions (packet loss, latency jitter) directly within Roblox Studio.

### `NetworkSettings`
* **Official Documentation:** [https://create.roblox.com/docs/reference/engine/classes/NetworkSettings](https://create.roblox.com/docs/reference/engine/classes/NetworkSettings)
* **Access:** `settings():GetService("NetworkSettings")`
* **Simulation Properties:**
  * `InboundNetworkLossPercent` — Injects synthetic UDP packet loss for incoming server-to-client traffic (capped at 0.5% in standard studio settings).
  * `InboundNetworkJitterMs` — Adds latency variance to incoming datagram arrivals.
  * `InboundNetworkMinDelayMs` — Configures baseline latency overhead.
  * `IncomingReplicationLag` — Artificially buffers and delays the unpacking of incoming replication packets (units in seconds).
  * `OutboundNetworkJitterMs` / `OutboundNetworkMinDelayMs` — Configures jitter and delay for outbound client-to-server packets.

### `Stats`
* **Official Documentation:** [https://create.roblox.com/docs/reference/engine/classes/Stats](https://create.roblox.com/docs/reference/engine/classes/Stats)
* **Access:** `game:GetService("Stats")`
* **Throughput Metrics:**
  * `DataReceiveKbps` — Current rate of inbound data payload over the UDP socket.
  * `DataSendKbps` — Current rate of outbound data payload.
  * `PhysicsReceiveKbps` / `PhysicsSendKbps` — Bandwidth dedicated to distributed physics engine replication datagrams.
  * `HeartbeatTimeMs` — Real-time frame simulation budget.

---

## 4. Replication Lifecycle & Frame Synchronization

### `RunService`
* **Official Documentation:** [https://create.roblox.com/docs/reference/engine/classes/RunService](https://create.roblox.com/docs/reference/engine/classes/RunService)
* **Network Role:** Manages task scheduling phases. Network replication runs at fixed phases within the frame pipeline:
  * `Heartbeat`: Fires after the physics step completes. Immediately following the `Heartbeat` phase, the engine's internal network replicator jobs batch, serialize, and transmit pending replication updates and remote events across the UDP transport layer.

---

## Quick Reference Summary

| Class Name | Layer / Category | Primary Role | Official Documentation URL |
| :--- | :--- | :--- | :--- |
| `UnreliableRemoteEvent` | Application RPC | Unreliable, unordered datagrams (1,000-byte cap) | [UnreliableRemoteEvent Docs](https://create.roblox.com/docs/reference/engine/classes/UnreliableRemoteEvent) |
| `RemoteEvent` | Application RPC | Reliable, ordered messaging and state events | [RemoteEvent Docs](https://create.roblox.com/docs/reference/engine/classes/RemoteEvent) |
| `RemoteFunction` | Application RPC | Synchronous two-way request/response RPC | [RemoteFunction Docs](https://create.roblox.com/docs/reference/engine/classes/RemoteFunction) |
| `NetworkClient` | Transport Engine | Client socket session and handshake manager | [NetworkClient Docs](https://create.roblox.com/docs/reference/engine/classes/NetworkClient) |
| `NetworkServer` | Transport Engine | Server listening socket and client connection manager | [NetworkServer Docs](https://create.roblox.com/docs/reference/engine/classes/NetworkServer) |
| `NetworkReplicator` | Replication Core | Packet serialization, delta compression, and dispatch | [NetworkReplicator Docs](https://create.roblox.com/docs/reference/engine/classes/NetworkReplicator) |
| `ClientReplicator` | Replication Core | Client-side instance of `NetworkReplicator` | [ClientReplicator Docs](https://create.roblox.com/docs/reference/engine/classes/ClientReplicator) |
| `ServerReplicator` | Replication Core | Server-side instance of `NetworkReplicator` per client | [ServerReplicator Docs](https://create.roblox.com/docs/reference/engine/classes/ServerReplicator) |
| `NetworkPeer` | Base Transport | Base class for network endpoints with bandwidth caps | [NetworkPeer Docs](https://create.roblox.com/docs/reference/engine/classes/NetworkPeer) |
| `NetworkSettings` | Diagnostics & Sim | Packet loss, jitter, and replication lag simulation | [NetworkSettings Docs](https://create.roblox.com/docs/reference/engine/classes/NetworkSettings) |
| `Stats` | Diagnostics | Bandwidth telemetry (send/receive Kbps, physics rate) | [Stats Docs](https://create.roblox.com/docs/reference/engine/classes/Stats) |
| `RunService` | Engine Lifecycle | Frame scheduling and end-of-frame network dispatch | [RunService Docs](https://create.roblox.com/docs/reference/engine/classes/RunService) |
