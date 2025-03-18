const THREE = require("three");
const Peer = require("peerjs");

class MultiplayerManager {
  constructor(username, scene) {
    this.username = username;
    this.scene = scene;

    // PeerJS connection
    this.peer = null;
    this.peerId = null;
    this.connections = [];
    this.roomId = "cosmic-runner-default-room";

    // Room server for discovery (using a mock server for simplicity)
    this.roomServer = null;

    // Players in the game
    this.remotePlayers = {};
    this.playerMeshes = {};

    // Leaderboard data
    this.leaderboard = [];

    // Connection status
    this.connected = false;

    // Event listeners
    this.eventListeners = {};

    // Last update time for rate limiting
    this.lastUpdateTime = 0;
    this.updateInterval = 50; // ms
  }

  init() {
    try {
      // Create a new peer with a random ID
      this.peer = new Peer({
        debug: 1,
        config: {
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        },
      });

      // Set up event handlers
      this.setupPeerEvents();

      // Update status
      this.trigger("statusUpdate", "Connecting to multiplayer...");
    } catch (error) {
      console.error("Failed to initialize PeerJS:", error);
      this.trigger(
        "statusUpdate",
        "Multiplayer unavailable. Playing in single player mode."
      );
    }
  }

  setupPeerEvents() {
    // When peer is created successfully
    this.peer.on("open", (id) => {
      this.peerId = id;
      this.connected = true;
      this.trigger("statusUpdate", "Connected to multiplayer");

      // Create a simple player record
      const playerData = {
        username: this.username,
        peerId: this.peerId,
        score: 0,
        crystals: 0,
      };

      // Join room to find other players
      this.joinRoom(playerData);
    });

    // When a new connection is established
    this.peer.on("connection", (conn) => {
      this.setupConnectionEvents(conn);
      this.connections.push(conn);
    });

    // Handle errors
    this.peer.on("error", (err) => {
      console.error("PeerJS error:", err);
      if (err.type === "peer-unavailable") {
        // If a peer is unavailable, it's not critical
        return;
      }

      // For critical errors, switch to single player
      this.trigger(
        "statusUpdate",
        "Multiplayer error. Playing in single player mode."
      );
      this.connected = false;
    });

    // Handle disconnections
    this.peer.on("disconnected", () => {
      this.trigger("statusUpdate", "Disconnected from multiplayer server.");

      // Try to reconnect
      setTimeout(() => {
        if (this.peer && !this.connected) {
          this.peer.reconnect();
        }
      }, 3000);
    });
  }

  setupConnectionEvents(conn) {
    // When connection is established
    conn.on("open", () => {
      console.log(`Connected to peer: ${conn.peer}`);

      // Send our current state
      conn.send({
        type: "player_info",
        username: this.username,
        peerId: this.peerId,
      });
    });

    // When data is received
    conn.on("data", (data) => {
      this.handlePeerData(conn.peer, data);
    });

    // When connection is closed
    conn.on("close", () => {
      console.log(`Disconnected from peer: ${conn.peer}`);

      // Remove player mesh if exists
      if (this.playerMeshes[conn.peer]) {
        this.scene.remove(this.playerMeshes[conn.peer]);
        delete this.playerMeshes[conn.peer];
      }

      // Remove from remote players
      delete this.remotePlayers[conn.peer];

      // Remove from connections
      this.connections = this.connections.filter((c) => c.peer !== conn.peer);

      // Update leaderboard
      this.updateLeaderboard();
    });
  }

  joinRoom(playerData) {
    // In a real implementation, this would connect to a signaling server
    // For simplicity, we'll simulate direct connections with known peers

    // This would normally be fetched from a server
    const mockRoom = {
      id: this.roomId,
      peers: [], // Would be populated by a real server
    };

    // Connect to each peer in the room
    mockRoom.peers.forEach((peerId) => {
      if (peerId !== this.peerId) {
        this.connectToPeer(peerId);
      }
    });

    // In a real implementation, the room service would notify other peers about us
    // For now, we'll just update our status
    this.trigger("statusUpdate", `Connected to room: ${this.roomId}`);
  }

  connectToPeer(peerId) {
    try {
      // Connect to the remote peer
      const conn = this.peer.connect(peerId, {
        reliable: true,
      });

      // Set up event handlers for this connection
      this.setupConnectionEvents(conn);

      // Add to our list of connections
      this.connections.push(conn);

      return true;
    } catch (error) {
      console.error(`Failed to connect to peer ${peerId}:`, error);
      return false;
    }
  }

  handlePeerData(peerId, data) {
    switch (data.type) {
      case "player_info":
        // Add or update player in our list
        this.remotePlayers[peerId] = {
          username: data.username,
          peerId: peerId,
          score: data.score || 0,
          crystals: data.crystals || 0,
          lastUpdate: Date.now(),
        };
        break;

      case "player_update":
        // Update player position and state
        if (this.remotePlayers[peerId]) {
          // Update player data
          this.remotePlayers[peerId].position = data.position;
          this.remotePlayers[peerId].rotation = data.rotation;
          this.remotePlayers[peerId].state = data.state;
          this.remotePlayers[peerId].score = data.score || 0;
          this.remotePlayers[peerId].crystals = data.crystals || 0;
          this.remotePlayers[peerId].lastUpdate = Date.now();

          // Create or update player mesh
          this.updateRemotePlayerMesh(peerId);
        } else {
          // If we don't know this player yet, request their info
          const conn = this.connections.find((c) => c.peer === peerId);
          if (conn) {
            conn.send({
              type: "request_player_info",
            });
          }
        }

        // Update leaderboard
        this.updateLeaderboard();
        break;

      case "request_player_info":
        // Send our player info to the requesting peer
        const conn = this.connections.find((c) => c.peer === peerId);
        if (conn) {
          conn.send({
            type: "player_info",
            username: this.username,
            peerId: this.peerId,
            score: 0,
            crystals: 0,
          });
        }
        break;

      default:
        console.warn(`Unknown data type received: ${data.type}`);
    }
  }

  updateRemotePlayerMesh(peerId) {
    const player = this.remotePlayers[peerId];

    if (!player || !player.position) return;

    // Create player mesh if it doesn't exist
    if (!this.playerMeshes[peerId]) {
      const playerGroup = new THREE.Group();

      // Create a simplified astronaut
      // Body
      const bodyGeometry = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
      const bodyMaterial = new THREE.MeshPhongMaterial({
        color: this.getPlayerColor(peerId),
        specular: 0x111111,
        shininess: 30,
      });

      const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
      body.position.y = 1;
      playerGroup.add(body);

      // Helmet
      const helmetGeometry = new THREE.SphereGeometry(0.5, 16, 16);
      const helmetMaterial = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        specular: 0x444444,
        shininess: 100,
      });

      const helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
      helmet.position.y = 1.75;
      playerGroup.add(helmet);

      // Add username label
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = 256;
      canvas.height = 64;
      context.font = "24px Arial";
      context.fillStyle = "#FFFFFF";
      context.textAlign = "center";
      context.fillText(player.username, 128, 24);

      const texture = new THREE.CanvasTexture(canvas);
      const labelMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
      });

      const label = new THREE.Sprite(labelMaterial);
      label.position.y = 2.5;
      label.scale.set(2, 0.5, 1);
      playerGroup.add(label);

      // Add player mesh to scene
      this.scene.add(playerGroup);
      this.playerMeshes[peerId] = playerGroup;
    }

    // Update position and rotation
    const mesh = this.playerMeshes[peerId];

    // Position the remote player alongside the track
    // Offset to the side so they don't overlap with the main player
    mesh.position.set(
      player.position.x + 4, // Offset to the right
      player.position.y,
      player.position.z - 10 // Offset behind
    );

    mesh.rotation.set(player.rotation.x, player.rotation.y, player.rotation.z);
  }

  updatePlayerPosition(position, rotation, state, score, crystals) {
    if (!this.connected || this.connections.length === 0) return;

    // Rate limit updates to reduce network traffic
    const now = Date.now();
    if (now - this.lastUpdateTime < this.updateInterval) return;
    this.lastUpdateTime = now;

    // Send update to all connections
    const updateData = {
      type: "player_update",
      position,
      rotation,
      state,
      score,
      crystals,
    };

    this.connections.forEach((conn) => {
      try {
        if (conn.open) {
          conn.send(updateData);
        }
      } catch (error) {
        console.error(`Failed to send update to peer ${conn.peer}:`, error);
      }
    });

    // Update our local leaderboard entry
    this.updateLocalPlayer(score, crystals);
  }

  updateLocalPlayer(score, crystals) {
    // Update our entry in the leaderboard
    const localPlayerEntry = this.leaderboard.find(
      (entry) => entry.peerId === this.peerId
    );

    if (localPlayerEntry) {
      localPlayerEntry.score = score;
      localPlayerEntry.crystals = crystals;
    } else {
      this.leaderboard.push({
        username: this.username,
        peerId: this.peerId,
        score: score,
        crystals: crystals,
      });
    }

    // Update the leaderboard display
    this.updateLeaderboard();
  }

  updateLeaderboard() {
    // Create leaderboard data from local and remote players
    const leaderboardData = [];

    // Add local player
    leaderboardData.push({
      username: this.username,
      peerId: this.peerId,
      score: 0, // Will be updated by the game
      crystals: 0,
    });

    // Add remote players
    Object.values(this.remotePlayers).forEach((player) => {
      leaderboardData.push({
        username: player.username,
        peerId: player.peerId,
        score: player.score || 0,
        crystals: player.crystals || 0,
      });
    });

    // Sort by score
    leaderboardData.sort((a, b) => b.score - a.score);

    this.leaderboard = leaderboardData;
    this.trigger("leaderboardUpdate", this.leaderboard);
  }

  disconnect() {
    if (this.peer) {
      // Close all connections
      this.connections.forEach((conn) => {
        if (conn.open) {
          conn.close();
        }
      });

      // Disconnect peer
      this.peer.disconnect();
      this.connected = false;
    }

    // Remove all remote player meshes
    Object.keys(this.playerMeshes).forEach((peerId) => {
      this.scene.remove(this.playerMeshes[peerId]);
    });

    this.playerMeshes = {};
    this.remotePlayers = {};
    this.connections = [];

    this.trigger("statusUpdate", "Disconnected from multiplayer");
  }

  getPlayerColor(peerId) {
    // Generate a consistent color based on peerId
    let hash = 0;
    for (let i = 0; i < peerId.length; i++) {
      hash = peerId.charCodeAt(i) + ((hash << 5) - hash);
    }

    const colors = [
      0xff5555, 0x55ff55, 0x5555ff, 0xffff55, 0xff55ff, 0x55ffff, 0xff9955,
      0x55ff99, 0x9955ff,
    ];

    return colors[Math.abs(hash) % colors.length];
  }

  isConnected() {
    return this.connected && this.peer && !this.peer.destroyed;
  }

  // Event system
  on(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  trigger(event, ...args) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach((callback) => callback(...args));
    }
  }
}

module.exports = { MultiplayerManager };
