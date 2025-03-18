const THREE = require("three");
const { Game } = require("./game/game");

// Track time for game loop
let lastTime = performance.now();
let physicsAccumulator = 0;
let frameCount = 0;
let game;

document.addEventListener("DOMContentLoaded", () => {
  // Initialize loading screen handlers
  const loadingScreen = document.getElementById("loading-screen");
  const startButton = document.getElementById("start-button");
  const usernameInput = document.getElementById("username-input");
  const tutorialOverlay = document.getElementById("tutorial-overlay");

  // Start button handler
  startButton.addEventListener("click", () => {
    // Get username if provided
    const username = usernameInput.value || "Player";

    // Hide loading screen
    loadingScreen.style.opacity = "0";
    setTimeout(() => {
      loadingScreen.style.display = "none";
    }, 500);

    // Hide tutorial if visible
    if (tutorialOverlay) {
      tutorialOverlay.style.display = "none";
      tutorialOverlay.classList.add("hidden");
    }

    // Initialize game
    initGame(username);
  });

  function initGame(username) {
    // Create renderer
    const renderer = createRenderer();

    // Initialize the game with the renderer and username
    game = new Game(renderer, username);

    // Start the game loop
    lastTime = performance.now();
    requestAnimationFrame(optimizedGameLoop);

    console.log("Game started with username:", username);
  }

  function createRenderer() {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMappingExposure = 0.8;

    // Add renderer to DOM
    const gameContainer = document.getElementById("game-container");
    if (gameContainer) {
      gameContainer.appendChild(renderer.domElement);
    }

    return renderer;
  }

  // Game loop optimization
  function optimizedGameLoop(time) {
    // Calculate accurate delta time with maximum value to prevent large jumps
    const currentTime = performance.now();
    const deltaTime = Math.min(currentTime - lastTime, 100) / 1000;
    lastTime = currentTime;

    // Only update physics at a fixed rate
    physicsAccumulator += deltaTime;
    const fixedTimeStep = 1 / 60; // 60 updates per second

    while (physicsAccumulator >= fixedTimeStep) {
      updatePhysics(fixedTimeStep);
      physicsAccumulator -= fixedTimeStep;
    }

    // Render at full framerate
    renderScene();

    // Reset renderer info every few frames to avoid memory growth
    frameCount++;
    if (frameCount % 30 === 0) {
      if (game && game.renderer) {
        game.renderer.info.reset();
      }
    }

    requestAnimationFrame(optimizedGameLoop);
  }

  // Physics update function
  function updatePhysics(timeStep) {
    if (game && game.isRunning && !game.isPaused) {
      // The game class will handle updating physics with correct player position
      game.updatePhysics(timeStep);
    }
  }

  // Render function
  function renderScene() {
    if (game && game.renderer && game.scene && game.camera) {
      game.renderer.render(game.scene, game.camera);
    }
  }
});
