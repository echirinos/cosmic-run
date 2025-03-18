const THREE = require("three");
const { Player } = require("./player");
const { World } = require("./world");
const { MultiplayerManager } = require("./multiplayer");

class Game {
  constructor(username, deviceCapabilities = null) {
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

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.deviceCapabilities.highPerformance,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000);
    document
      .getElementById("game-container")
      .appendChild(this.renderer.domElement);

    // Setup lighting directly instead of calling a method
    this.setupLightingDirect();

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
    this.multiplayerManager = null;

    // Create leaderboard
    this.leaderboard = [];

    // Powerup states
    this.magnetActive = false;
    this.magnetTimer = null;
    this.speedBoostTimer = null;

    // Start animation loop
    this.animate = this.animate.bind(this);

    // Initialize camera position
    this.cameraPosition = new THREE.Vector3();
    this.cameraPosition.copy(this.player.getPosition()).add(this.cameraOffset);
    this.camera.position.copy(this.cameraPosition);

    // Start the animation loop
    this.animate();

    // Start increasing score over time
    this.scoreInterval = setInterval(() => {
      if (!this.isPaused && !this.isGameOver) {
        this.increaseScore(1);
      }
    }, 100);
  }

  setupLightingDirect() {
    // Add ambient light for overall scene brightness
    const ambientLight = new THREE.AmbientLight(0x666666, 0.7);
    this.scene.add(ambientLight);

    // Add directional light (sun-like) with more intensity
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);

    // Add point light for highlights directly above the player
    const pointLight1 = new THREE.PointLight(0x00ffff, 2, 50);
    pointLight1.position.set(0, 10, 0);
    this.scene.add(pointLight1);

    // Add second point light for color variation
    const pointLight2 = new THREE.PointLight(0xff00ff, 1, 50);
    pointLight2.position.set(-15, 5, -5);
    this.scene.add(pointLight2);

    console.log("Lighting setup complete");
  }

  // Alias for backward compatibility
  setupLighting() {
    this.setupLightingDirect();
  }

  init() {
    // Initialize Three.js scene
    this.initThreeJS();

    // Create player
    this.player = new Player(this.scene, this.camera);

    // Create world
    this.world = new World(this.scene);

    // Initialize multiplayer if available
    if (typeof MultiplayerManager !== "undefined") {
      this.multiplayerManager = new MultiplayerManager(
        this.username,
        this.scene
      );
      this.multiplayerManager.init();

      // Set multiplayer status
      this.multiplayerManager.on("statusUpdate", (status) => {
        if (this.multiplayerStatusElement) {
          this.multiplayerStatusElement.textContent = status;
        }
      });

      // Update leaderboard
      this.multiplayerManager.on("leaderboardUpdate", (leaderboard) => {
        this.updateLeaderboard(leaderboard);
      });
    }

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

    // Create fog for depth effect - adjust based on capabilities
    const fogDensity = this.deviceCapabilities.highPerformance ? 0.008 : 0.01;
    this.scene.fog = new THREE.FogExp2(0x000000, fogDensity);

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      this.deviceCapabilities.highPerformance ? 1000 : 100
    );

    // Set initial camera position behind player (FIXED: position camera behind player, not in front)
    this.cameraOffset = new THREE.Vector3(0, 3, -8); // Changed from (0, 2.5, 6) to position behind player
    this.cameraLookOffset = new THREE.Vector3(0, 0.5, 10); // Changed from (0, 0.5, -10) to look forward
    this.cameraPosition = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();

    // Camera smoothing parameters
    this.cameraSmoothFactor = 5;
    this.cameraTilt = 0;
    this.cameraShakeAmount = 0;

    // Create renderer with adaptive settings
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.deviceCapabilities.highPerformance,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // Set pixel ratio based on device capability
    this.renderer.setPixelRatio(
      this.deviceCapabilities.highPerformance
        ? 1
        : window.devicePixelRatio > 1
        ? 2
        : 1
    );

    document
      .getElementById("game-container")
      .appendChild(this.renderer.domElement);

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    this.scene.add(ambientLight);

    // Add directional light (sun-like)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);

    // Add point light for highlights
    const pointLight1 = new THREE.PointLight(0x00ffff, 1, 50);
    pointLight1.position.set(0, 10, 10);
    this.scene.add(pointLight1);

    // Add second point light for color variation if device supports it
    if (this.deviceCapabilities.highPerformance) {
      const pointLight2 = new THREE.PointLight(0xff00ff, 0.5, 50);
      pointLight2.position.set(-15, 5, -5);
      this.scene.add(pointLight2);
    }
  }

  setupPowerAwareRendering() {
    // Check if Battery API is available
    if ("getBattery" in navigator) {
      navigator.getBattery().then((battery) => {
        // Initial check
        this.adjustPerformanceForBattery(battery.level, battery.charging);

        // Listen for changes
        battery.addEventListener("levelchange", () => {
          this.adjustPerformanceForBattery(battery.level, battery.charging);
        });

        battery.addEventListener("chargingchange", () => {
          this.adjustPerformanceForBattery(battery.level, battery.charging);
        });
      });
    }
  }

  adjustPerformanceForBattery(level, isCharging) {
    // Conservative settings when battery is low and not charging
    if (level < 0.2 && !isCharging) {
      // Reduce frame rate
      this.targetFPS = 30;

      // Reduce draw distance
      if (this.world) {
        this.world.setDrawDistance(30);
      }

      // Disable non-essential effects
      this.disableParticles = true;

      console.log("Low battery mode activated");
    } else {
      // Normal settings
      this.targetFPS = 60;

      if (this.world) {
        this.world.setDrawDistance(
          this.deviceCapabilities.highPerformance ? 1000 : 100
        );
      }

      this.disableParticles = this.deviceCapabilities.highPerformance;
    }
  }

  animate() {
    if (this.isGameOver) return;

    requestAnimationFrame(this.animate.bind(this));

    if (!this.isPaused) {
      const delta = this.clock.getDelta();

      // FPS throttling for battery saving
      this.fpsCounter.frames++;
      const now = performance.now();
      if (now > this.fpsCounter.lastTime + 1000) {
        this.fpsCounter.fps = this.fpsCounter.frames;
        this.fpsCounter.frames = 0;
        this.fpsCounter.lastTime = now;
      }

      // Skip frames if we're running too fast (for battery saving)
      if (this.targetFPS < 60 && this.fpsCounter.fps > this.targetFPS) {
        const skipProbability = 1 - this.targetFPS / this.fpsCounter.fps;
        if (Math.random() < skipProbability) {
          return;
        }
      }

      // Update game speed (increases over time)
      this.gameSpeed = Math.min(0.8, 0.2 + this.score * 0.0001);

      // Update distance traveled
      this.distanceTraveled += this.gameSpeed;

      // Update player
      this.player.update(delta);

      // Update world and check collisions
      const collisionResult = this.world.checkCollisions(
        this.player.getPosition()
      );

      // Handle collisions
      this.handleCollisions(collisionResult);

      // Update camera position with smooth follow
      this.updateCamera(delta);

      // Update multiplayer data if available
      if (
        this.multiplayerManager &&
        typeof this.multiplayerManager.update === "function"
      ) {
        this.multiplayerManager.update(this.player, this.score, this.crystals);
      }

      // Render the scene
      this.renderer.render(this.scene, this.camera);
    }
  }

  handleCollisions(collisionResult) {
    if (this.isGameOver) return;

    // Handle obstacle collisions
    if (collisionResult.obstacleHit) {
      console.log("Player hit obstacle!");

      // Check if player hit affects the player (returns true if player was damaged)
      if (this.player.hit()) {
        // Flash screen red for hit feedback
        this.flashScreen(0xff0000);

        // Trigger camera shake
        this.triggerCameraShake(0.3);

        // Play hit sound
        this.playSound("hit");

        // Update UI health indicators
        this.updateHealthUI();

        // Check if player has died from this hit
        if (this.player.health <= 0) {
          this.player.die();
          this.endGame();
        }
      } else {
        // Shield absorbed hit
        this.flashScreen(0x00ffff);
        this.playSound("shield");
      }
    }

    // Handle crystal collection
    if (collisionResult.crystalsCollected > 0) {
      this.increaseCrystals(collisionResult.crystalsCollected);
      this.score += collisionResult.crystalsCollected * 10;
      this.scoreElement.textContent = this.score;

      // Play collection sound
      this.playSound("crystal");
    }

    // Handle powerup collection
    if (collisionResult.powerupCollected) {
      const powerupType = collisionResult.powerupType;

      // Let the player collect the powerup
      if (this.player.collectPowerup(powerupType)) {
        switch (powerupType) {
          case "shield":
            this.showMessage("Shield collected! Press SPACE to use");
            break;
          case "magnet":
            this.showMessage("Crystal magnet collected! Press SPACE to use");
            break;
          case "speed":
            this.showMessage("Speed boost collected! Press SPACE to use");
            break;
          default:
            this.showMessage(`${powerupType} collected! Press SPACE to use`);
        }

        // Play powerup collection sound
        this.playSound("powerup");
      }
    }
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

  endGame() {
    if (this.isGameOver) return;

    this.isGameOver = true;
    clearInterval(this.scoreInterval);

    // Show game over screen
    this.showGameOverScreen();

    // Trigger intense camera shake
    this.triggerCameraShake(0.5);

    // Stop music if playing
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
    }

    // Play game over sound
    this.playSound("gameOver");

    // Disconnect from multiplayer
    if (this.multiplayerManager) {
      this.multiplayerManager.disconnect();
    }

    // Trigger game over event
    this.trigger("gameOver", this.score, this.crystals);
  }

  createExplosionEffect(position) {
    // Create particle system for explosion
    const particleCount = 50;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = position.x;
      positions[i3 + 1] = position.y;
      positions[i3 + 2] = position.z;

      // Random colors (orange/red for explosion)
      colors[i3] = 1.0; // R
      colors[i3 + 1] = 0.5 + Math.random() * 0.5; // G
      colors[i3 + 2] = Math.random() * 0.3; // B

      sizes[i] = 0.1 + Math.random() * 0.2;

      // Random velocity in sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 0.2 + Math.random() * 0.3;
      velocities.push({
        x: speed * Math.sin(phi) * Math.cos(theta),
        y: speed * Math.sin(phi) * Math.sin(theta),
        z: speed * Math.cos(phi),
      });
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 1,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);

    // Animate explosion
    const duration = 1.5; // seconds
    let time = 0;

    const animateExplosion = () => {
      time += 1 / 60;

      if (time < duration) {
        const positions = particles.geometry.attributes.position.array;
        const sizes = particles.geometry.attributes.size.array;

        for (let i = 0; i < particleCount; i++) {
          const i3 = i * 3;
          positions[i3] += velocities[i].x;
          positions[i3 + 1] += velocities[i].y;
          positions[i3 + 2] += velocities[i].z;

          // Add gravity and drag
          velocities[i].y -= 0.01;
          velocities[i].x *= 0.98;
          velocities[i].y *= 0.98;
          velocities[i].z *= 0.98;

          // Fade out particles
          sizes[i] *= 0.99;
        }

        particles.geometry.attributes.position.needsUpdate = true;
        particles.geometry.attributes.size.needsUpdate = true;
        material.opacity = 1 - time / duration;

        requestAnimationFrame(animateExplosion);
      } else {
        this.scene.remove(particles);
        geometry.dispose();
        material.dispose();
      }
    };

    animateExplosion();
  }

  showGameOverScreen() {
    const gameOverScreen = document.getElementById("game-over");
    const finalScore = document.getElementById("final-score");
    const countdownElement = document.createElement("div");
    countdownElement.id = "restart-countdown";
    countdownElement.style.fontSize = "24px";
    countdownElement.style.marginTop = "20px";
    gameOverScreen.appendChild(countdownElement);

    // Update final score display
    finalScore.innerHTML = `
      FINAL SCORE: ${this.score}<br>
      CRYSTALS COLLECTED: ${this.crystals}<br>
      DISTANCE TRAVELED: ${Math.floor(this.distanceTraveled)}m
    `;

    // Show game over screen with fade in
    gameOverScreen.style.opacity = "0";
    gameOverScreen.classList.remove("hidden");
    setTimeout(() => {
      gameOverScreen.style.opacity = "1";
    }, 100);

    // Add restart countdown
    let countdown = 3;
    const updateCountdown = () => {
      if (countdown > 0) {
        countdownElement.textContent = `Restarting in ${countdown}...`;
        countdown--;
        setTimeout(updateCountdown, 1000);
      } else {
        countdownElement.remove();
      }
    };
    updateCountdown();
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

  turnLeft() {
    if (!this.isGameOver && !this.isPaused) {
      this.player.turnLeft();
      this.triggerCameraShake(0.2);
    }
  }

  turnRight() {
    if (!this.isGameOver && !this.isPaused) {
      this.player.turnRight();
      this.triggerCameraShake(0.2);
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
        // Play powerup sound
        this.playSound("powerup-use");
      } else {
        // Show message that no powerup is available
        this.showMessage("No powerup available");
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

  // Update camera position to follow player (temple run style)
  updateCamera(delta) {
    const playerPos = this.player.getPosition();
    const playerDirection = this.player.getDirection();

    // Calculate target camera position based on player forward direction
    const cameraPositionTarget = new THREE.Vector3();
    cameraPositionTarget.copy(playerPos);

    // Adjust camera offset based on player direction
    const rotatedOffset = this.cameraOffset.clone();
    rotatedOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerDirection.y);
    cameraPositionTarget.add(rotatedOffset);

    // Apply smooth camera movement
    if (!this.cameraPosition) {
      this.cameraPosition = new THREE.Vector3();
    }
    this.cameraPosition.lerp(
      cameraPositionTarget,
      delta * (this.cameraSmoothFactor || 5)
    );

    // Apply camera tilt during turns
    const targetTilt = this.player.isTurning
      ? this.player.turnDirection * 0.15
      : 0;

    // Initialize if not already set
    if (this.cameraTilt === undefined) {
      this.cameraTilt = 0;
    }

    this.cameraTilt = THREE.MathUtils.lerp(
      this.cameraTilt,
      targetTilt,
      delta * 3
    );

    // Calculate camera look target (look ahead of player)
    const lookTarget = new THREE.Vector3();
    lookTarget.copy(playerPos);

    // Rotate look offset based on player direction
    const rotatedLookOffset = this.cameraLookOffset.clone();
    rotatedLookOffset.applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      playerDirection.y
    );
    lookTarget.add(rotatedLookOffset);

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

    // Apply tilt
    this.camera.rotateZ(this.cameraTilt);
  }

  // Trigger camera shake effect (for impacts, explosions, etc.)
  triggerCameraShake(intensity = 0.2) {
    // Save original camera position
    if (!this.cameraOriginalPos) {
      this.cameraOriginalPos = {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      };
    }

    // Set up shake parameters
    const duration = 500; // ms
    const startTime = Date.now();

    // Cancel any ongoing shake
    if (this.cameraShakeId) {
      cancelAnimationFrame(this.cameraShakeId);
    }

    // Shake animation function
    const shake = () => {
      const elapsed = Date.now() - startTime;

      if (elapsed < duration) {
        // Calculate shake intensity based on remaining time
        const currentIntensity = intensity * (1 - elapsed / duration);

        // Apply random offset to camera
        this.camera.position.x =
          this.cameraOriginalPos.x + (Math.random() * 2 - 1) * currentIntensity;
        this.camera.position.y =
          this.cameraOriginalPos.y + (Math.random() * 2 - 1) * currentIntensity;

        // Continue shaking
        this.cameraShakeId = requestAnimationFrame(shake);
      } else {
        // Reset camera position
        this.camera.position.x = this.cameraOriginalPos.x;
        this.camera.position.y = this.cameraOriginalPos.y;
        this.cameraShakeId = null;
      }
    };

    // Start shake animation
    this.cameraShakeId = requestAnimationFrame(shake);
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

  showMessage(text, duration = 2000) {
    this.messageElement.textContent = text;
    this.messageElement.style.opacity = "1";

    setTimeout(() => {
      this.messageElement.style.opacity = "0";
    }, duration);
  }

  activateMagnet() {
    this.magnetActive = true;
    this.showMessage("Crystal magnet activated!");

    // Set a timer to deactivate the magnet after 10 seconds
    if (this.magnetTimer) {
      clearTimeout(this.magnetTimer);
    }

    this.magnetTimer = setTimeout(() => {
      this.magnetActive = false;
      this.showMessage("Crystal magnet deactivated");
    }, 10000);
  }

  // Activate speed boost power-up
  activateSpeedBoost() {
    // Store original speed
    this.originalGameSpeed = this.gameSpeed;

    // Boost game speed
    this.gameSpeed *= 1.5;
    this.showMessage("Speed boost activated!");

    // Set a timer to deactivate the speed boost after 5 seconds
    if (this.speedBoostTimer) {
      clearTimeout(this.speedBoostTimer);
    }

    this.speedBoostTimer = setTimeout(() => {
      this.gameSpeed = this.originalGameSpeed;
      this.showMessage("Speed boost deactivated");
    }, 5000);
  }

  playSound(soundType) {
    // If browser doesn't support audio API or sounds are disabled, just return
    if (!window.AudioContext && !window.webkitAudioContext) return;

    // Play specified sound
    switch (soundType) {
      case "hit":
        // Play hit sound and vibrate device if supported
        if (navigator.vibrate) navigator.vibrate(100);
        break;
      case "crystal":
        // Play crystal collect sound
        if (navigator.vibrate) navigator.vibrate(20);
        break;
      case "powerup":
        // Play powerup collect sound
        if (navigator.vibrate) navigator.vibrate([30, 30, 30]);
        break;
      case "shield":
        // Play shield block sound
        if (navigator.vibrate) navigator.vibrate(50);
        break;
    }

    // Add sound implementation later when audio assets are available
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
}

module.exports = { Game };
