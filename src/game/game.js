const THREE = require("three");
const { Player } = require("./player");
const { World } = require("./world");
const { MultiplayerManager } = require("./multiplayer");

class Game {
  constructor(username) {
    // Player information
    this.username = username;

    // Game state
    this.score = 0;
    this.crystals = 0;
    this.gameSpeed = 0.2;
    this.isGameOver = false;
    this.isPaused = false;

    // Game metrics
    this.distanceTraveled = 0;

    // Event listeners
    this.eventListeners = {};

    // UI elements
    this.scoreElement = document.getElementById("score-value");
    this.crystalElement = document.getElementById("crystal-value");
    this.multiplayerStatusElement =
      document.getElementById("multiplayer-status");
    this.leaderboardElement = document.getElementById("leaderboard-list");

    // Three.js components
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();

    // Game components
    this.player = null;
    this.world = null;
    this.multiplayerManager = null;
  }

  init() {
    // Initialize Three.js scene
    this.initThreeJS();

    // Create player
    this.player = new Player(this.scene, this.camera);

    // Create world
    this.world = new World(this.scene);

    // Initialize multiplayer
    this.multiplayerManager = new MultiplayerManager(this.username, this.scene);
    this.multiplayerManager.init();

    // Set multiplayer status
    this.multiplayerManager.on("statusUpdate", (status) => {
      this.multiplayerStatusElement.textContent = status;
    });

    // Update leaderboard
    this.multiplayerManager.on("leaderboardUpdate", (leaderboard) => {
      this.updateLeaderboard(leaderboard);
    });

    // Start animation loop
    this.animate();

    // Start increasing score over time
    this.scoreInterval = setInterval(() => {
      if (!this.isPaused && !this.isGameOver) {
        this.increaseScore(1);
      }
    }, 100);
  }

  initThreeJS() {
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // Create fog for depth effect
    this.scene.fog = new THREE.FogExp2(0x000000, 0.01);

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 2, 5);
    this.camera.lookAt(0, 0, -10);

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio > 1 ? 2 : 1);
    document
      .getElementById("game-container")
      .appendChild(this.renderer.domElement);

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    this.scene.add(ambientLight);

    // Add directional light (sun-like)
    const directionalLight = new THREE.DirectionalLight(0x9999ff, 2);
    directionalLight.position.set(1, 1, 0.5);
    this.scene.add(directionalLight);

    // Add point lights for dramatic effect
    const pointLight1 = new THREE.PointLight(0x00ffff, 1, 50);
    pointLight1.position.set(0, 10, -15);
    this.scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xff00ff, 1, 50);
    pointLight2.position.set(-15, 5, -5);
    this.scene.add(pointLight2);
  }

  animate() {
    if (this.isGameOver) return;

    requestAnimationFrame(this.animate.bind(this));

    if (!this.isPaused) {
      const delta = this.clock.getDelta();

      // Update game speed (increases over time)
      this.gameSpeed = Math.min(0.8, 0.2 + this.score * 0.0001);

      // Update distance traveled
      this.distanceTraveled += this.gameSpeed;

      // Update player
      this.player.update(delta);

      // Update world and check collisions
      const collisions = this.world.update(
        delta,
        this.gameSpeed,
        this.player.getPosition()
      );
      this.handleCollisions(collisions);

      // Update multiplayer
      if (this.multiplayerManager.isConnected()) {
        this.multiplayerManager.updatePlayerPosition(
          this.player.getPosition(),
          this.player.getRotation(),
          this.player.getState(),
          this.score,
          this.crystals
        );
      }
    }

    // Render scene
    this.renderer.render(this.scene, this.camera);
  }

  handleCollisions(collisions) {
    if (!collisions || this.player.isInvincible()) return;

    // Handle obstacle collisions
    if (collisions.obstacle) {
      if (!this.player.isShielded()) {
        this.gameOver();
      } else {
        this.player.removeShield();
      }
    }

    // Handle crystal collisions
    if (collisions.crystal) {
      this.increaseCrystals(collisions.crystal);
      this.increaseScore(collisions.crystal * 10);
    }

    // Handle power-up collisions
    if (collisions.powerup) {
      switch (collisions.powerupType) {
        case "shield":
          this.player.addShield();
          break;
        case "magnet":
          this.player.activateMagnet();
          break;
        case "speed":
          this.player.activateSpeedBoost();
          break;
      }
    }
  }

  moveLeft() {
    if (!this.isGameOver && !this.isPaused) {
      this.player.moveLeft();
    }
  }

  moveRight() {
    if (!this.isGameOver && !this.isPaused) {
      this.player.moveRight();
    }
  }

  jump() {
    if (!this.isGameOver && !this.isPaused) {
      this.player.jump();
    }
  }

  slide() {
    if (!this.isGameOver && !this.isPaused) {
      this.player.slide();
    }
  }

  usePowerup() {
    if (!this.isGameOver && !this.isPaused) {
      this.player.usePowerup();
    }
  }

  increaseScore(amount) {
    this.score += amount;
    this.scoreElement.textContent = this.score;
  }

  increaseCrystals(amount) {
    this.crystals += amount;
    this.crystalElement.textContent = this.crystals;
  }

  updateLeaderboard(leaderboard) {
    // Clear current leaderboard
    this.leaderboardElement.innerHTML = "";

    // Add top 5 players to leaderboard
    leaderboard.slice(0, 5).forEach((player, index) => {
      const li = document.createElement("li");
      li.textContent = `${index + 1}. ${player.username}: ${player.score}`;

      // Highlight current player
      if (player.username === this.username) {
        li.style.color = "#00ffff";
        li.style.fontWeight = "bold";
      }

      this.leaderboardElement.appendChild(li);
    });
  }

  handleResize() {
    // Update camera aspect ratio
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    // Update renderer size
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  pause() {
    this.isPaused = true;
    this.clock.stop();
  }

  resume() {
    this.isPaused = false;
    this.clock.start();
  }

  gameOver() {
    this.isGameOver = true;
    clearInterval(this.scoreInterval);

    // Disconnect from multiplayer
    if (this.multiplayerManager) {
      this.multiplayerManager.disconnect();
    }

    // Trigger game over event
    this.trigger("gameOver", this.score, this.crystals);
  }

  restart() {
    // Reset game state
    this.score = 0;
    this.crystals = 0;
    this.gameSpeed = 0.2;
    this.isGameOver = false;
    this.isPaused = false;
    this.distanceTraveled = 0;

    // Update UI
    this.scoreElement.textContent = "0";
    this.crystalElement.textContent = "0";

    // Reset player
    this.player.reset();

    // Reset world
    this.world.reset();

    // Reconnect to multiplayer
    this.multiplayerManager.init();

    // Start animation loop
    this.clock = new THREE.Clock();
    this.animate();

    // Restart score interval
    this.scoreInterval = setInterval(() => {
      if (!this.isPaused && !this.isGameOver) {
        this.increaseScore(1);
      }
    }, 100);
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

module.exports = { Game };
