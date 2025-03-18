const THREE = require("three");
const { Player } = require("./player");
const { World } = require("./world");
const { MultiplayerManager } = require("./multiplayer");
const { InputHandler } = require("./inputHandler");

class Game {
  constructor(renderer, username = "Player", deviceCapabilities = null) {
    // Player information
    this.username = username || "Player";
    this.score = 0;
    this.crystals = 0;
    this.gameSpeed = 0.2;
    this.deviceCapabilities = deviceCapabilities || {
      highPerformance: false,
      touchScreen: false,
    };

    // Track if game is over
    this.isGameOver = false;
    this.isPaused = false;

    // Event system
    this.eventListeners = {};

    // Performance monitoring
    this.fpsCounter = {
      frames: 0,
      lastTime: performance.now(),
      fps: 60,
    };
    this.targetFPS = this.deviceCapabilities.highPerformance ? 60 : 30;

    // Clock for timing
    this.clock = new THREE.Clock();

    // Initialize Three.js components
    this.scene = new THREE.Scene();

    // Add fog for depth perception and performance optimization (improved visibility)
    this.scene.fog = new THREE.Fog(0x000033, 20, 100);

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.cameraOffset = new THREE.Vector3(0, 5, -12); // Position camera higher and further back
    this.cameraLookOffset = new THREE.Vector3(0, 0, 20); // Look further ahead
    this.cameraOriginalPos = null; // For camera shake
    this.cameraShakeId = null;
    this.cameraShakeAmount = 0;

    // Initialize renderer
    this.renderer = renderer;

    // Setup lighting
    this.setupLighting();

    // Create world
    this.world = new World(this.scene);

    // Create player
    this.player = new Player(this.scene);
    this.player.gameRef = this; // Add reference to game for powerup effects

    // Distance traveled (for score)
    this.distanceTraveled = 0;

    // Set up UI
    this.setupUI();

    // Set up health UI elements
    this.healthElements = [];
    for (let i = 0; i < 3; i++) {
      const heartElement = document.createElement("div");
      heartElement.className = "health-heart";
      heartElement.innerHTML = "❤️";
      heartElement.style.position = "absolute";
      heartElement.style.top = "10px";
      heartElement.style.left = 10 + i * 30 + "px";
      heartElement.style.fontSize = "24px";
      heartElement.style.color = "#ff0000";
      heartElement.style.zIndex = "100";
      document.getElementById("game-container").appendChild(heartElement);
      this.healthElements.push(heartElement);
    }

    // Multiplayer
    this.multiplayerManager = new MultiplayerManager(this, this.username);

    // Create leaderboard
    this.leaderboard = [];

    // Powerup states
    this.magnetActive = false;
    this.magnetTimer = null;
    this.speedBoostTimer = null;

    // Initialize performance variables
    this.lastTime = performance.now();
    this.physicsAccumulator = 0;
    this.fixedTimeStep = 1 / 60; // 60 physics updates per second
    this.maxDeltaTime = 0.1; // Cap delta time to prevent large jumps

    // Initialize input handler
    this.inputHandler = new InputHandler(this);

    // Set up event listeners
    window.addEventListener("resize", this.onWindowResize.bind(this));

    // Initialize camera position
    this.cameraPosition = new THREE.Vector3();
    this.cameraPosition.copy(this.player.getPosition()).add(this.cameraOffset);
    this.camera.position.copy(this.cameraPosition);

    // Start the animation loop
    this.startGameLoop();

    // Start increasing score over time
    this.scoreInterval = setInterval(() => {
      if (!this.isPaused && !this.isGameOver) {
        this.increaseScore(1);
      }
    }, 100);

    console.log("Game initialized");
  }

  setupLighting() {
    // Clear existing lights
    this.scene.children.forEach((child) => {
      if (child instanceof THREE.Light) {
        this.scene.remove(child);
      }
    });

    // Add ambient light with a blue/purple space hue
    const ambientLight = new THREE.AmbientLight(0x223366, 0.7);
    this.scene.add(ambientLight);

    // Main directional light - from top right (sun-like)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.3);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;

    // Better shadow settings for directional light
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -15;
    directionalLight.shadow.camera.right = 15;
    directionalLight.shadow.camera.top = 15;
    directionalLight.shadow.camera.bottom = -15;
    directionalLight.shadow.bias = -0.001;

    this.scene.add(directionalLight);

    // Add color accent light from top-left (contrast)
    const accentLight = new THREE.DirectionalLight(0xff55aa, 0.6);
    accentLight.position.set(-5, 8, 2);
    this.scene.add(accentLight);

    // Add under-lighting from below (space glow effect)
    const bottomLight = new THREE.PointLight(0x3366ff, 0.8, 30);
    bottomLight.position.set(0, -3, -5);
    this.scene.add(bottomLight);

    // Add rim lighting from behind (dramatic silhouette)
    const rimLight = new THREE.PointLight(0x00ffff, 0.6, 20);
    rimLight.position.set(0, 5, -12);
    this.scene.add(rimLight);

    // Track edge lights - left and right
    const leftEdgeLight = new THREE.PointLight(0x00ffaa, 1.0, 15);
    leftEdgeLight.position.set(-5, 0.5, 0);
    this.scene.add(leftEdgeLight);

    const rightEdgeLight = new THREE.PointLight(0x00ffaa, 1.0, 15);
    rightEdgeLight.position.set(5, 0.5, 0);
    this.scene.add(rightEdgeLight);

    // Moving track lights that follow player position
    this.leftTrackLight = new THREE.PointLight(0x00aaff, 0.7, 10);
    this.rightTrackLight = new THREE.PointLight(0x00aaff, 0.7, 10);
    this.scene.add(this.leftTrackLight);
    this.scene.add(this.rightTrackLight);

    // Player spotlight that moves with the player - improved for better focus
    this.playerLight = new THREE.SpotLight(
      0xffffff,
      1.5,
      30,
      Math.PI / 4.5,
      0.3, // Sharper focus
      1.5 // Faster falloff for better definition
    );
    this.playerLight.position.set(0, 6, -2);
    this.playerLight.target.position.set(0, 0, 5);
    this.scene.add(this.playerLight);
    this.scene.add(this.playerLight.target);

    // Add volumetric light beam for dramatic effect
    this.volumetricLight = new THREE.SpotLight(
      0xaaddff,
      0.8,
      50,
      Math.PI / 6,
      0.5,
      1
    );
    this.volumetricLight.position.set(0, 20, 0);
    this.volumetricLight.target.position.set(0, 0, 10);
    this.scene.add(this.volumetricLight);
    this.scene.add(this.volumetricLight.target);

    // Enable shadows for renderer
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    console.log("Enhanced lighting setup complete");
  }

  onWindowResize() {
    // Update camera aspect ratio
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    // Update renderer size
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  startGameLoop() {
    console.log("Starting game loop...");

    // Initialize the player at the start position
    if (this.player) {
      this.player.reset();

      // Make sure the camera is positioned correctly based on the player
      this.updateCamera(0);
    }

    // Initialize the world
    if (this.world) {
      // Ensure the world has the current player position
      const playerPosition = this.player.getPosition();
      console.log("Initial player position:", playerPosition);

      // Reset world if needed
      if (this.isGameOver) {
        this.world.reset();
      }
    }

    // Set game state
    this.isRunning = true;
    this.isPaused = false;
    this.isGameOver = false;

    // Bind and start the animation loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);

    console.log("Game loop started");
  }

  animate(time) {
    if (!this.isRunning) return;

    // Calculate delta time with a maximum value to prevent large jumps after tab switch
    const currentTime = performance.now();
    const deltaTime = Math.min(
      (currentTime - this.lastTime) / 1000,
      this.maxDeltaTime
    );
    this.lastTime = currentTime;

    // Only process updates if the game is not paused
    if (!this.isPaused && !this.isGameOver) {
      // Accumulate time for fixed timestep physics
      this.physicsAccumulator += deltaTime;

      // Update physics at a fixed rate for consistent simulation
      while (this.physicsAccumulator >= this.fixedTimeStep) {
        this.updatePhysics(this.fixedTimeStep);
        this.physicsAccumulator -= this.fixedTimeStep;
      }

      // Update player light
      this.updatePlayerLight();
    }

    // Render the scene
    this.renderer.render(this.scene, this.camera);

    // Continue animation loop
    requestAnimationFrame(this.animate);
  }

  updatePhysics(timeStep) {
    if (this.isPaused) return;

    // Update player first to get latest position
    if (this.player) {
      this.player.update(timeStep * this.gameSpeed);
    }

    // Update world with player position
    if (this.world && this.player) {
      const playerPosition = this.player.getPosition();
      this.world.update(timeStep, this.gameSpeed, playerPosition);
    }

    // Update camera
    this.updateCamera(timeStep);

    // Check player health
    if (this.player && this.player.health <= 0 && !this.player.isDead) {
      this.endGame();
    }

    // Update game state
    this.distanceTraveled += timeStep * 5 * this.gameSpeed;
  }

  // Update camera position to follow player
  updateCamera(delta) {
    if (!this.player) return;

    const playerPos = this.player.getPosition();

    // Calculate target camera position based on player
    const cameraPositionTarget = new THREE.Vector3();
    cameraPositionTarget.copy(playerPos);
    cameraPositionTarget.add(this.cameraOffset);

    // Apply smooth camera movement
    this.cameraPosition.lerp(cameraPositionTarget, delta * 5);

    // Look at a point ahead of the player
    const lookTarget = new THREE.Vector3();
    lookTarget.copy(playerPos);
    lookTarget.z += 10; // Look AHEAD of the player

    // Apply camera shake if active
    if (this.cameraShakeAmount > 0) {
      this.cameraPosition.x += (Math.random() - 0.5) * this.cameraShakeAmount;
      this.cameraPosition.y += (Math.random() - 0.5) * this.cameraShakeAmount;
      this.cameraShakeAmount *= 0.95; // Decay shake effect

      if (this.cameraShakeAmount < 0.01) {
        this.cameraShakeAmount = 0;
      }
    }

    // Update camera position and rotation
    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(lookTarget);
  }

  // Trigger camera shake effect (for impacts, explosions, etc.)
  triggerCameraShake(intensity = 0.2) {
    this.cameraShakeAmount = intensity;
  }

  setupUI() {
    // Create score display
    this.scoreElement = document.createElement("div");
    this.scoreElement.id = "score-value";
    this.scoreElement.style.position = "absolute";
    this.scoreElement.style.top = "10px";
    this.scoreElement.style.right = "20px";
    this.scoreElement.style.color = "white";
    this.scoreElement.style.fontSize = "24px";
    this.scoreElement.style.fontFamily = "Arial, sans-serif";
    this.scoreElement.style.zIndex = "100";
    this.scoreElement.textContent = "0";
    document.getElementById("game-container").appendChild(this.scoreElement);

    // Create crystal counter
    this.crystalElement = document.createElement("div");
    this.crystalElement.id = "crystal-value";
    this.crystalElement.style.position = "absolute";
    this.crystalElement.style.top = "40px";
    this.crystalElement.style.right = "20px";
    this.crystalElement.style.color = "#00ffff";
    this.crystalElement.style.fontSize = "20px";
    this.crystalElement.style.fontFamily = "Arial, sans-serif";
    this.crystalElement.style.zIndex = "100";
    this.crystalElement.textContent = "💎 0";
    document.getElementById("game-container").appendChild(this.crystalElement);

    // Create message display
    this.messageElement = document.createElement("div");
    this.messageElement.id = "message";
    this.messageElement.style.position = "absolute";
    this.messageElement.style.top = "50%";
    this.messageElement.style.left = "50%";
    this.messageElement.style.transform = "translate(-50%, -50%)";
    this.messageElement.style.color = "white";
    this.messageElement.style.fontSize = "24px";
    this.messageElement.style.fontFamily = "Arial, sans-serif";
    this.messageElement.style.zIndex = "100";
    this.messageElement.style.textAlign = "center";
    this.messageElement.style.opacity = "0";
    this.messageElement.style.transition = "opacity 0.5s ease";
    document.getElementById("game-container").appendChild(this.messageElement);

    // Create leaderboard display
    const leaderboardContainer = document.createElement("div");
    leaderboardContainer.id = "leaderboard-container";
    leaderboardContainer.style.position = "absolute";
    leaderboardContainer.style.top = "10px";
    leaderboardContainer.style.left = "10px";
    leaderboardContainer.style.color = "white";
    leaderboardContainer.style.fontSize = "16px";
    leaderboardContainer.style.fontFamily = "Arial, sans-serif";
    leaderboardContainer.style.zIndex = "100";
    leaderboardContainer.style.backgroundColor = "rgba(0,0,0,0.5)";
    leaderboardContainer.style.padding = "10px";
    leaderboardContainer.style.borderRadius = "5px";
    leaderboardContainer.style.maxWidth = "200px";

    const leaderboardTitle = document.createElement("div");
    leaderboardTitle.textContent = "Leaderboard";
    leaderboardTitle.style.marginBottom = "5px";
    leaderboardTitle.style.fontWeight = "bold";
    leaderboardContainer.appendChild(leaderboardTitle);

    this.leaderboardElement = document.createElement("ul");
    this.leaderboardElement.id = "leaderboard-list";
    this.leaderboardElement.style.listStyleType = "none";
    this.leaderboardElement.style.padding = "0";
    this.leaderboardElement.style.margin = "0";
    leaderboardContainer.appendChild(this.leaderboardElement);

    document.getElementById("game-container").appendChild(leaderboardContainer);
  }

  // Update player light to follow the player
  updatePlayerLight() {
    if (!this.player) return;

    const pos = this.player.getPosition();

    // Main player spotlight follows player from behind and above
    if (this.playerLight) {
      this.playerLight.position.set(pos.x, pos.y + 6, pos.z - 3);
      this.playerLight.target.position.set(pos.x, pos.y, pos.z + 8);
    }

    // Update track edge lights to follow player position
    if (this.leftTrackLight) {
      this.leftTrackLight.position.set(pos.x - 4, pos.y + 0.5, pos.z);
    }

    if (this.rightTrackLight) {
      this.rightTrackLight.position.set(pos.x + 4, pos.y + 0.5, pos.z);
    }

    // Update volumetric light to follow player loosely
    if (this.volumetricLight) {
      // Move more slowly for a dramatic effect
      const targetX = pos.x * 0.3; // Dampen motion for smoother effect
      const currentX = this.volumetricLight.position.x;
      this.volumetricLight.position.x += (targetX - currentX) * 0.05;
      this.volumetricLight.position.z = pos.z - 5;
      this.volumetricLight.target.position.set(pos.x, pos.y, pos.z + 15);
    }

    // Optional: Add light color based on player's movement state
    if (this.player.isJumping && this.leftTrackLight && this.rightTrackLight) {
      // Change colors during jumps for dramatic effect
      this.leftTrackLight.color.set(0x00ffff);
      this.rightTrackLight.color.set(0x00ffff);
      this.leftTrackLight.intensity = 1.0;
      this.rightTrackLight.intensity = 1.0;
    } else if (
      this.player.isSliding &&
      this.leftTrackLight &&
      this.rightTrackLight
    ) {
      // Orange glow during slides
      this.leftTrackLight.color.set(0xff6600);
      this.rightTrackLight.color.set(0xff6600);
      this.leftTrackLight.intensity = 1.2;
      this.rightTrackLight.intensity = 1.2;
    } else if (this.leftTrackLight && this.rightTrackLight) {
      // Reset to default color
      this.leftTrackLight.color.set(0x00aaff);
      this.rightTrackLight.color.set(0x00aaff);
      this.leftTrackLight.intensity = 0.7;
      this.rightTrackLight.intensity = 0.7;
    }
  }

  handleCollisions() {
    // This will be implemented by the world and player
  }

  showMessage(text, duration = 2000) {
    this.messageElement.textContent = text;
    this.messageElement.style.opacity = "1";

    setTimeout(() => {
      this.messageElement.style.opacity = "0";
    }, duration);
  }

  flashScreen(color) {
    // Create a full-screen flash effect when player gets hit
    const flash = document.createElement("div");
    flash.style.position = "fixed";
    flash.style.top = "0";
    flash.style.left = "0";
    flash.style.width = "100%";
    flash.style.height = "100%";
    flash.style.backgroundColor = "#" + color.toString(16).padStart(6, "0");
    flash.style.opacity = "0.5";
    flash.style.pointerEvents = "none";
    flash.style.zIndex = "1000";
    flash.style.transition = "opacity 0.3s ease-out";

    document.body.appendChild(flash);

    // Fade out and remove
    setTimeout(() => {
      flash.style.opacity = "0";
      setTimeout(() => {
        document.body.removeChild(flash);
      }, 300);
    }, 50);
  }

  updateHealthUI() {
    // Update health UI elements (hearts or health bar)
    if (this.healthElements) {
      for (let i = 0; i < this.healthElements.length; i++) {
        this.healthElements[i].style.visibility =
          i < this.player.health ? "visible" : "hidden";
      }
    }
  }

  increaseScore(amount) {
    this.score += amount;
    this.scoreElement.textContent = this.score;
  }

  increaseCrystals(amount) {
    this.crystals += amount;
    this.crystalElement.textContent = `💎 ${this.crystals}`;
  }

  updateLeaderboard(leaderboard) {
    // Safety check - make sure we have a leaderboard element
    if (!this.leaderboardElement) return;

    // Clear current leaderboard
    this.leaderboardElement.innerHTML = "";

    // Safety check - make sure leaderboard is an array
    if (!Array.isArray(leaderboard)) return;

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

  pause() {
    this.isPaused = true;
    this.clock.stop();
  }

  resume() {
    this.isPaused = false;
    this.clock.start();
  }

  endGame() {
    if (this.isGameOver) return;

    this.isGameOver = true;
    clearInterval(this.scoreInterval);

    // Show game over screen
    this.showGameOverScreen();

    // Trigger intense camera shake
    this.triggerCameraShake(0.5);

    // Disconnect from multiplayer
    if (this.multiplayerManager) {
      this.multiplayerManager.disconnect();
    }

    // Trigger game over event
    this.trigger("gameOver", this.score, this.crystals);
  }

  showGameOverScreen() {
    const gameOverScreen = document.getElementById("game-over");
    if (!gameOverScreen) return;

    const finalScore = document.getElementById("final-score");
    if (finalScore) {
      finalScore.innerHTML = `
        FINAL SCORE: ${this.score}<br>
        CRYSTALS COLLECTED: ${this.crystals}<br>
        DISTANCE TRAVELED: ${Math.floor(this.distanceTraveled)}m
      `;
    }

    // Show game over screen with fade in
    gameOverScreen.style.opacity = "0";
    gameOverScreen.classList.remove("hidden");
    setTimeout(() => {
      gameOverScreen.style.opacity = "1";
    }, 100);
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
    this.crystalElement.textContent = "💎 0";

    // Reset player
    this.player.reset();

    // Reset world
    this.world.reset();

    // Reconnect to multiplayer if available
    if (
      this.multiplayerManager &&
      typeof this.multiplayerManager.init === "function"
    ) {
      this.multiplayerManager.init();
    }

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
    if (this.player && !this.isGameOver && !this.isPaused) {
      // Delegate to player's usePowerup method
      const used = this.player.usePowerup();

      if (used) {
        // Show message
        this.showMessage("Powerup activated!");
      } else {
        // Show message that no powerup is available
        this.showMessage("No powerup available");
      }
    }
  }
}

module.exports = { Game };
