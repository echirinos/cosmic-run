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
    this.offlineLeaderboard = this.loadLocalLeaderboard();
    this.lastLeaderboardUpdate = 0;

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
    // Combine remote and local player data
    let allPlayers = Object.values(this.remotePlayers).slice();

    // Add local player
    allPlayers.push({
      username: this.username,
      peerId: this.peerId,
      score: this.localScore || 0,
      crystals: this.localCrystals || 0,
      isLocal: true,
      lastUpdate: Date.now(),
    });

    // Sort by score (descending)
    allPlayers.sort((a, b) => b.score - a.score);

    // Filter out inactive players (no updates in last 30 seconds)
    const activeTimeout = Date.now() - 30000;
    allPlayers = allPlayers.filter(
      (player) => player.isLocal || player.lastUpdate > activeTimeout
    );

    // Update leaderboard data
    this.leaderboard = allPlayers.slice(0, 10); // Top 10 only

    // If offline or very few online players, merge with stored local leaderboard
    if (!this.isConnected() || this.leaderboard.length < 3) {
      this.mergeWithOfflineLeaderboard();
    }

    // Trigger leaderboard update event
    this.trigger("leaderboardUpdate", this.leaderboard);
  }

  // Load locally stored leaderboard
  loadLocalLeaderboard() {
    try {
      const savedLeaderboard = localStorage.getItem(
        "cosmic_runner_leaderboard"
      );
      if (savedLeaderboard) {
        return JSON.parse(savedLeaderboard);
      }
    } catch (e) {
      console.error("Failed to load local leaderboard:", e);
    }
    return [];
  }

  // Save score to local leaderboard
  saveLocalScore(username, score, distance) {
    try {
      let leaderboard = this.loadLocalLeaderboard();

      // Add new score
      leaderboard.push({
        username,
        score,
        distance,
        timestamp: Date.now(),
      });

      // Sort by score (descending)
      leaderboard.sort((a, b) => b.score - a.score);

      // Keep only top 10 scores
      leaderboard = leaderboard.slice(0, 10);

      // Save back to storage
      localStorage.setItem(
        "cosmic_runner_leaderboard",
        JSON.stringify(leaderboard)
      );

      // Update our cached copy
      this.offlineLeaderboard = leaderboard;

      // Update displayed leaderboard if needed
      if (!this.isConnected()) {
        this.updateLeaderboard();
      }
    } catch (e) {
      console.error("Failed to save local score:", e);
    }
  }

  // Merge online and offline leaderboards
  mergeWithOfflineLeaderboard() {
    // Start with current online players
    let mergedLeaderboard = this.leaderboard.slice();

    // Add offline records that aren't already in the leaderboard
    this.offlineLeaderboard.forEach((offlineEntry) => {
      // Don't add duplicate entries for the same user
      const existingEntryIndex = mergedLeaderboard.findIndex(
        (entry) => entry.username === offlineEntry.username
      );

      if (existingEntryIndex === -1) {
        // Convert offline entry format to match online format
        mergedLeaderboard.push({
          username: offlineEntry.username,
          score: offlineEntry.score,
          crystals: 0, // We don't store this in offline leaderboard
          isOfflineEntry: true,
          timestamp: offlineEntry.timestamp,
        });
      } else if (
        offlineEntry.score > mergedLeaderboard[existingEntryIndex].score
      ) {
        // If offline score is better, update the existing entry
        mergedLeaderboard[existingEntryIndex].score = offlineEntry.score;
        mergedLeaderboard[existingEntryIndex].timestamp =
          offlineEntry.timestamp;
      }
    });

    // Resort by score
    mergedLeaderboard.sort((a, b) => b.score - a.score);

    // Keep top 10
    this.leaderboard = mergedLeaderboard.slice(0, 10);
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

  // New update method that takes player object, score and crystals
  update(player, score, crystals) {
    const now = Date.now();

    // Rate limit updates to reduce network traffic
    if (now - this.lastUpdateTime < this.updateInterval) {
      return;
    }

    this.lastUpdateTime = now;

    // If connected to multiplayer, send position updates
    if (this.isConnected()) {
      this.updatePlayerPosition(
        player.getPosition(),
        player.getRotation(),
        player.getState(),
        score,
        crystals
      );
    }

    // Update local leaderboard regularly
    if (now - this.lastLeaderboardUpdate > 5000) {
      // Every 5 seconds
      this.lastLeaderboardUpdate = now;
      this.updateLeaderboard();
    }
  }

  formatLeaderboardDate(timestamp) {
    if (!timestamp) return "";

    const date = new Date(timestamp);
    const now = new Date();

    // If today, just show time
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    // If this year, show month and day
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }

    // Otherwise show full date
    return date.toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
}

module.exports = { MultiplayerManager };
