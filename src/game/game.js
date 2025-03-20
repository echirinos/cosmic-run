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
    this.gameSpeed = 0.2; // Reduced starting speed for better playability
    this.initialGameSpeed = 0.2; // Reduced initial speed
    this.maxGameSpeed = 0.6; // Reduced max speed
    this.speedIncreaseRate = 0.00005; // Reduced speed increase rate
    this.distanceMultiplier = 5;
    this.deviceCapabilities = deviceCapabilities || {
      highPerformance: false,
      touchScreen: false,
    };

    // Difficulty settings
    this.currentDifficulty = "easy";
    this.difficultyLevels = {
      easy: { speedThreshold: 0.2, obstacleFrequency: 0.2, obstacleVariety: 1 },
      medium: {
        speedThreshold: 0.4,
        obstacleFrequency: 0.4,
        obstacleVariety: 2,
      },
      hard: { speedThreshold: 0.6, obstacleFrequency: 0.6, obstacleVariety: 3 },
    };

    // Progression tracking
    this.distanceTraveled = 0;
    this.difficultyCheckpoints = [500, 1500, 3000, 5000, 8000]; // Distance checkpoints for difficulty increases
    this.nextCheckpointIndex = 0;

    // Track if game is over
    this.isGameOver = false;
    this.isPaused = false;
    this.isRunning = false;

    // Camera shake parameters
    this.cameraShaking = false;
    this.shakeIntensity = 0;
    this.shakeDuration = 0;
    this.shakeElapsed = 0;
    this.originalCameraPosition = new THREE.Vector3();

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
      70, // Increased from 75 for wider field of view
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    // Position camera higher and further back for better obstacle visibility
    this.cameraOffset = new THREE.Vector3(0, 12, -20); // Even higher and further back for better course vision
    this.cameraLookOffset = new THREE.Vector3(0, 0, 50); // Look much further ahead to see more of the course
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
    this.player.gameRef = this; // Add reference to game for powerup effects and movement

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
    // Use a fixed position to initialize the camera rather than basing it on player position
    // This creates a more stable starting point
    const initialPlayerPosition = this.player.getPosition();
    this.cameraPosition.set(
      0, // Keep centered horizontally
      initialPlayerPosition.y + this.cameraOffset.y,
      initialPlayerPosition.z + this.cameraOffset.z
    );
    this.camera.position.copy(this.cameraPosition);
    this.originalCameraPosition = this.cameraPosition.clone(); // Initialize the reference position

    // Make camera look directly forward
    this.camera.lookAt(new THREE.Vector3(0, 1, initialPlayerPosition.z + 20));

    // Start the animation loop
    this.startGameLoop();

    // Start increasing score over time
    this.scoreInterval = setInterval(() => {
      if (!this.isPaused && !this.isGameOver) {
        this.increaseScore(1);
      }
    }, 100);

    // Add a post-processing composer for visual effects
    this.setupPostProcessing();

    console.log("Game initialized");
  }

  setupLighting() {
    // Clear existing lights
    this.scene.children.forEach((child) => {
      if (child instanceof THREE.Light) {
        this.scene.remove(child);
      }
    });

    // Add ambient light with a blue/purple space hue - brighter to compensate for fewer lights
    const ambientLight = new THREE.AmbientLight(0x223366, 1.0); // Increased from 0.7 to 1.0
    this.scene.add(ambientLight);

    // Single main directional light with shadows
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.3);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;

    // Lower resolution shadows for better performance
    directionalLight.shadow.mapSize.width = 1024; // Reduced from 2048
    directionalLight.shadow.mapSize.height = 1024; // Reduced from 2048
    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -15;
    directionalLight.shadow.camera.right = 15;
    directionalLight.shadow.camera.top = 15;
    directionalLight.shadow.camera.bottom = -15;
    directionalLight.shadow.bias = -0.001;

    this.scene.add(directionalLight);

    // Add color accent light from top-left (less intensive)
    const accentLight = new THREE.DirectionalLight(0xff55aa, 0.4); // Reduced from 0.6
    accentLight.position.set(-5, 8, 2);
    accentLight.castShadow = false; // No shadows for performance
    this.scene.add(accentLight);

    // Player spotlight that moves with the player - simplified for performance
    this.playerLight = new THREE.SpotLight(
      0xffffff,
      1.0, // Reduced from 1.5
      20, // Reduced from 30
      Math.PI / 4.5,
      0.5, // Increased from 0.3 for better performance
      2.0 // Increased for better performance
    );
    this.playerLight.position.set(0, 6, -2);
    this.playerLight.target.position.set(0, 0, 5);
    this.playerLight.castShadow = false; // Disable shadows for better performance
    this.scene.add(this.playerLight);
    this.scene.add(this.playerLight.target);

    // Enable shadows but use a more performant shadow type
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap; // Changed from PCFSoftShadowMap for performance

    console.log("Optimized lighting setup complete");
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
    // Calculate delta time with aggressive capping for improved performance
    const currentTime = performance.now();
    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.05); // Reduced from 0.1 to 0.05
    this.lastTime = currentTime;

    // Skip frame if delta is too small to reduce CPU usage on high refresh rate displays
    if (deltaTime < 0.0025) {
      requestAnimationFrame(this.animate);
      return;
    }

    // Only process updates if the game is not paused
    if (!this.isPaused && !this.isGameOver) {
      // For low-performance devices, use simplified update
      if (this.deviceCapabilities && !this.deviceCapabilities.highPerformance) {
        // One direct update instead of accumulated physics steps
        this.updatePhysics(deltaTime);
      } else {
        // Accumulate time for fixed timestep physics
        this.physicsAccumulator += deltaTime;

        // Limit accumulated physics steps to prevent spiral of death
        const maxSteps = 3;
        let stepsUsed = 0;

        // Update physics at a fixed rate for consistent simulation
        while (
          this.physicsAccumulator >= this.fixedTimeStep &&
          stepsUsed < maxSteps
        ) {
          this.updatePhysics(this.fixedTimeStep);
          this.physicsAccumulator -= this.fixedTimeStep;
          stepsUsed++;
        }

        // If we hit max steps, discard remaining accumulation to prevent lag
        if (
          stepsUsed >= maxSteps &&
          this.physicsAccumulator > this.fixedTimeStep
        ) {
          this.physicsAccumulator = 0;
        }
      }
    }

    // Render the scene - use direct renderer for better performance
    this.renderer.render(this.scene, this.camera);

    // Continue animation loop
    requestAnimationFrame(this.animate);
  }

  updatePhysics(timeStep) {
    if (this.isGameOver || this.isPaused) return;

    // Mark game as running
    if (!this.isRunning) {
      this.isRunning = true;
    }

    // Calculate an optimal frame time to prevent spikes
    const frameTime = Math.min(timeStep, 0.03);

    // Gradually increase game speed - much slower for better stability
    if (this.gameSpeed < this.maxGameSpeed) {
      this.gameSpeed += this.speedIncreaseRate * frameTime * 20;
    }

    // Update distance traveled
    const distanceThisFrame = this.gameSpeed * frameTime * 60;
    this.distanceTraveled += distanceThisFrame;

    // Update player physics - most critical
    this.player.update(frameTime);

    // Update world with current speed
    this.world.update(frameTime, this.gameSpeed, this.player.getPosition());

    // Handle collisions - critical
    this.handleCollisions();

    // Update camera - critical
    this.updateCamera(frameTime);

    // Less critical updates - only do these occasionally based on frame count
    if (this.frameCount % 3 === 0) {
      // Update score based on distance
      const scoreGain = Math.round(distanceThisFrame * this.distanceMultiplier);
      if (scoreGain > 0) {
        this.increaseScore(scoreGain);
      }
    }

    // Very rarely check for difficulty updates
    if (this.frameCount % 10 === 0) {
      // Check for difficulty increase
      this.updateDifficulty();
    }

    // Update camera shake and player light even less frequently
    if (this.frameCount % 5 === 0) {
      // Update camera shake effect (if active)
      if (this.cameraShaking) {
        this.updateCameraShake(frameTime);
      }

      // Update player light (if any)
      this.updatePlayerLight();
    }

    // Increment frame counter
    this.frameCount = (this.frameCount || 0) + 1;
    if (this.frameCount > 1000) this.frameCount = 0;
  }

  updateDifficulty() {
    // Check if we've reached the next difficulty checkpoint
    if (
      this.nextCheckpointIndex < this.difficultyCheckpoints.length &&
      this.distanceTraveled >=
        this.difficultyCheckpoints[this.nextCheckpointIndex]
    ) {
      // Show difficulty increase message
      this.showMessage(`Speed increasing!`, 2000);

      // Trigger camera shake
      this.triggerCameraShake(0.3, 0.5);

      // Flash the screen to indicate difficulty change
      this.flashScreen(new THREE.Color(0x8800ff), 0.5);

      // Increase obstacle frequency in the world
      if (this.gameSpeed >= this.difficultyLevels.hard.speedThreshold) {
        this.currentDifficulty = "hard";
      } else if (
        this.gameSpeed >= this.difficultyLevels.medium.speedThreshold
      ) {
        this.currentDifficulty = "medium";
      }

      // Update world with new difficulty settings
      this.world.setDifficulty(
        this.currentDifficulty,
        this.difficultyLevels[this.currentDifficulty]
      );

      // Move to next checkpoint
      this.nextCheckpointIndex++;
    }
  }

  // Improved collision detection
  handleCollisions() {
    if (this.isGameOver || this.isPaused || !this.player || !this.world) return;

    try {
      // Get player hitbox
      const playerHitbox = this.player.getHitbox();

      // Verify hitbox has required properties
      if (!playerHitbox || !playerHitbox.min || !playerHitbox.max) {
        console.warn("Invalid player hitbox in handleCollisions");
        return;
      }

      // Check collisions with world objects
      const collisions = this.world.checkCollisions(playerHitbox);

      if (collisions && collisions.length > 0) {
        collisions.forEach((collision) => {
          if (collision.type === "obstacle") {
            console.log(
              "Collision with obstacle:",
              collision.object.name || "unnamed obstacle"
            );

            // Player hit by obstacle
            const isDead = this.player.hit();

            // If player died, end the game
            if (isDead) {
              this.endGame();
            } else {
              // Player survived, trigger camera shake
              this.triggerCameraShake(0.5, 0.3);
              this.flashScreen(new THREE.Color(1, 0, 0), 0.3);
              this.showMessage("Ouch!");

              // Update health UI
              this.updateHealthUI();
            }
          } else if (collision.type === "crystal") {
            // Collected a crystal
            this.world.collectItem(collision.object);
            this.increaseCrystals(1);
            this.player.createCollectionEffect(collision.object.position);
          } else if (collision.type === "powerup") {
            // Collected a powerup
            const powerupType =
              collision.object.userData?.powerupType || "unknown";
            this.world.collectItem(collision.object);
            this.player.collectPowerup(powerupType);
            this.showMessage(`${powerupType.toUpperCase()} activated!`);
          }
        });
      }
    } catch (error) {
      console.error("Error in handleCollisions:", error);
    }
  }

  // Simplified camera shake function for better performance
  triggerCameraShake(intensity = 0.2, duration = 0.3) {
    // Skip camera shake for low performance
    if (this.deviceCapabilities && !this.deviceCapabilities.highPerformance) {
      return;
    }

    this.cameraShaking = true;
    this.shakeIntensity = Math.min(intensity, 0.5); // Cap intensity
    this.shakeDuration = Math.min(duration, 0.5); // Cap duration
    this.shakeElapsed = 0;

    // Store original camera position
    if (!this.originalCameraPosition) {
      this.originalCameraPosition = new THREE.Vector3();
      this.originalCameraPosition.copy(this.camera.position);
    }
  }

  updateCameraShake(timeStep) {
    if (!this.cameraShaking) return;

    // Update elapsed time
    this.shakeElapsed += timeStep;

    // If shake duration completed, reset camera position
    if (this.shakeElapsed >= this.shakeDuration) {
      this.cameraShaking = false;
      this.camera.position.copy(this.originalCameraPosition);
      return;
    }

    // Calculate shake amount with easing out - simpler calculation
    const progress = this.shakeElapsed / this.shakeDuration;
    const shakeAmount = this.shakeIntensity * (1 - progress);

    // Apply simplified shake to camera - only on x/y for better performance
    this.camera.position.set(
      this.originalCameraPosition.x + (Math.random() - 0.5) * shakeAmount,
      this.originalCameraPosition.y + (Math.random() - 0.5) * shakeAmount,
      this.originalCameraPosition.z
    );
  }

  // Completely revised camera update for more stability
  updateCamera(delta) {
    if (!this.player || !this.camera) return;

    // Get player position
    const playerPosition = this.player.getPosition();

    // Fixed camera position approach - much more stable
    // Camera follows player only on Z-axis with minimal X offset
    const targetCameraPos = new THREE.Vector3(
      playerPosition.x * 0.1, // Only 10% of player's horizontal movement
      this.cameraOffset.y, // Fixed height
      playerPosition.z + this.cameraOffset.z // Follow on Z-axis
    );

    // Add minimal jump movement
    if (this.player.isJumping) {
      targetCameraPos.y += playerPosition.y * 0.15; // Only 15% of jump height
    }

    // Very slow interpolation for smooth, stable camera
    if (!this.cameraShaking) {
      if (!this.originalCameraPosition) {
        this.originalCameraPosition = new THREE.Vector3();
        this.originalCameraPosition.copy(targetCameraPos);
      } else {
        // Super smooth interpolation - much slower for stability
        this.originalCameraPosition.x +=
          (targetCameraPos.x - this.originalCameraPosition.x) * (delta * 0.8);
        this.originalCameraPosition.y +=
          (targetCameraPos.y - this.originalCameraPosition.y) * (delta * 0.8);
        this.originalCameraPosition.z +=
          (targetCameraPos.z - this.originalCameraPosition.z) * (delta * 1.5);
      }
      this.camera.position.copy(this.originalCameraPosition);
    }

    // Always look straight ahead at a fixed point
    this.camera.lookAt(
      new THREE.Vector3(0, playerPosition.y * 0.1 + 1, playerPosition.z + 15)
    );
  }

  // Improved end game function with proper death sequence
  endGame() {
    if (this.isGameOver) return;

    this.isGameOver = true;
    this.isRunning = false;

    console.log("Game over! Final score:", this.score);

    // Play death effects
    this.triggerCameraShake(1.0, 1.0);
    this.flashScreen(new THREE.Color(1, 0, 0), 1.0);

    // Set game-over UI elements
    this.showMessage("GAME OVER", 5000);

    // Create death particle effect
    if (this.player && this.player.mesh) {
      this.createDeathEffect(this.player.getPosition());
    }

    // Show game over screen after a delay
    setTimeout(() => {
      this.showGameOverScreen();
    }, 1500);
  }

  // Create death effect
  createDeathEffect(position) {
    // Create explosion-like particle effect
    const particleCount = 50;
    const particles = new THREE.Group();

    for (let i = 0; i < particleCount; i++) {
      const size = 0.1 + Math.random() * 0.2;
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(size, 8, 8),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(
            0.8 + Math.random() * 0.2,
            0.2 + Math.random() * 0.2,
            0.1 + Math.random() * 0.1
          ),
          transparent: true,
          opacity: 0.8,
        })
      );

      // Random position around the player
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 1;
      particle.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        (Math.random() - 0.5) * radius
      );

      // Random velocity
      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        0.1 + Math.random() * 0.2,
        (Math.random() - 0.5) * 0.2
      );

      // Random rotation speed
      particle.userData.rotationSpeed = new THREE.Vector3(
        Math.random() * 0.2,
        Math.random() * 0.2,
        Math.random() * 0.2
      );

      particles.add(particle);
    }

    // Add to scene
    particles.position.copy(position);
    this.scene.add(particles);

    // Animate particles
    let lifetime = 0;

    const animateParticles = () => {
      lifetime += 1 / 60;

      particles.children.forEach((particle) => {
        // Move particle
        particle.position.add(particle.userData.velocity);

        // Rotate particle
        particle.rotation.x += particle.userData.rotationSpeed.x;
        particle.rotation.y += particle.userData.rotationSpeed.y;
        particle.rotation.z += particle.userData.rotationSpeed.z;

        // Apply gravity
        particle.userData.velocity.y -= 0.01;

        // Fade out
        particle.material.opacity = 0.8 * (1 - lifetime);
      });

      if (lifetime < 1 && !this.isGameOver) {
        requestAnimationFrame(animateParticles);
      } else {
        // Remove particles
        this.scene.remove(particles);

        // Dispose of resources
        particles.children.forEach((particle) => {
          particle.geometry.dispose();
          particle.material.dispose();
        });
      }
    };

    animateParticles();
  }

  // Improved flash screen function
  flashScreen(color, duration = 0.3) {
    // Create overlay if it doesn't exist
    if (!this.flashOverlay) {
      this.flashOverlay = document.createElement("div");
      this.flashOverlay.style.position = "absolute";
      this.flashOverlay.style.top = "0";
      this.flashOverlay.style.left = "0";
      this.flashOverlay.style.width = "100%";
      this.flashOverlay.style.height = "100%";
      this.flashOverlay.style.pointerEvents = "none";
      this.flashOverlay.style.zIndex = "1000";
      this.flashOverlay.style.transition = "opacity 0.3s ease-out";
      this.flashOverlay.style.opacity = "0";

      document.getElementById("game-container").appendChild(this.flashOverlay);
    }

    // Set color and show the overlay
    const hexColor = color.getHexString();
    this.flashOverlay.style.backgroundColor = `#${hexColor}`;
    this.flashOverlay.style.opacity = "0.6";

    // Hide it after the duration
    setTimeout(() => {
      this.flashOverlay.style.opacity = "0";
    }, duration * 1000);
  }

  setupPostProcessing() {
    // Skip post-processing completely for better performance
    console.log("Post-processing disabled for better performance");
    this.composer = null;
    return;

    /* Original code disabled for performance
    // Skip for low performance devices
    if (
      this.deviceCapabilities &&
      this.deviceCapabilities.highPerformance === false
    ) {
      console.log("Skipping post-processing setup for low performance device");
      return;
    }

    // Import effects if available
    try {
      const {
        EffectComposer,
      } = require("three/examples/jsm/postprocessing/EffectComposer.js");
      const {
        RenderPass,
      } = require("three/examples/jsm/postprocessing/RenderPass.js");
      const {
        UnrealBloomPass,
      } = require("three/examples/jsm/postprocessing/UnrealBloomPass.js");
      const {
        ShaderPass,
      } = require("three/examples/jsm/postprocessing/ShaderPass.js");
      const {
        FXAAShader,
      } = require("three/examples/jsm/shaders/FXAAShader.js");

      // Create composer
      this.composer = new EffectComposer(this.renderer);

      // Add render pass
      const renderPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(renderPass);

      // Add bloom pass for glow effects
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.5, // strength
        0.4, // radius
        0.85 // threshold
      );
      this.composer.addPass(bloomPass);

      // Add anti-aliasing pass
      const fxaaPass = new ShaderPass(FXAAShader);
      fxaaPass.uniforms.resolution.value.set(
        1 / window.innerWidth,
        1 / window.innerHeight
      );
      this.composer.addPass(fxaaPass);

      console.log("Post-processing setup complete");
    } catch (error) {
      console.warn("Could not initialize post-processing:", error);
      this.composer = null;
    }
    */
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

  // Update player light to follow the player - simplified for performance
  updatePlayerLight() {
    if (!this.player) return;

    const pos = this.player.getPosition();

    // Update only the main player spotlight for performance
    if (this.playerLight) {
      this.playerLight.position.set(pos.x, pos.y + 6, pos.z - 3);
      this.playerLight.target.position.set(pos.x, pos.y, pos.z + 8);
    }
  }

  showMessage(text, duration = 2000) {
    this.messageElement.textContent = text;
    this.messageElement.style.opacity = "1";

    setTimeout(() => {
      this.messageElement.style.opacity = "0";
    }, duration);
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
    console.log("Restarting game...");

    // Reset game state
    this.score = 0;
    this.crystals = 0;
    this.gameSpeed = this.initialGameSpeed;
    this.distanceTraveled = 0;
    this.isGameOver = false;
    this.isPaused = false;
    this.isRunning = false;

    // Reset difficulty
    this.currentDifficulty = "easy";
    this.nextCheckpointIndex = 0;

    // Reset player
    this.player.reset();

    // Reset world
    this.world.reset();

    // Reset camera position
    this.camera.position.copy(this.cameraOffset);

    // Update UI
    this.updateHealthUI();

    // Hide game over screen
    const gameOverScreen = document.getElementById("game-over-screen");
    if (gameOverScreen) {
      gameOverScreen.style.display = "none";
    }

    // Show a "Get Ready" message
    this.showMessage("Get Ready!", 2000);

    // Play start sound if available
    if (window.sound && window.sound.start) {
      window.sound.start.play();
    }

    console.log("Game restarted!");
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
      this.player.moveRight();
    }
  }

  moveRight() {
    if (!this.isGameOver && !this.isPaused) {
      this.player.moveLeft();
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
