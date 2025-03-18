require("../style.css");
const { Game } = require("./game/game");
const nipplejs = require("nipplejs");

// Wait for DOM content to load
document.addEventListener("DOMContentLoaded", () => {
  const loadingScreen = document.getElementById("loading-screen");
  const startButton = document.getElementById("start-button");
  const usernameInput = document.getElementById("username-input");
  const restartButton = document.getElementById("restart-button");
  const gameOverScreen = document.getElementById("game-over");
  const mobileControls = document.getElementById("mobile-controls");
  const settingsButton = document.getElementById("settings-button");
  const settingsPanel = document.getElementById("settings-panel");
  const accelerometerToggle = document.getElementById("accelerometer-toggle");
  const sensitivitySlider = document.getElementById("sensitivity-slider");

  let game;
  let highScore = localStorage.getItem("highScore") || 0;
  let bestDistance = localStorage.getItem("bestDistance") || 0;
  let joystick = null;
  let deviceCapabilities = detectDeviceCapabilities();

  // Initialize the game when the start button is clicked
  startButton.addEventListener("click", () => {
    const username =
      usernameInput.value.trim() ||
      "Player_" + Math.floor(Math.random() * 1000);

    // Hide the loading screen with a fade effect
    loadingScreen.style.opacity = "0";
    setTimeout(() => {
      loadingScreen.style.display = "none";

      // Initialize and start the game
      game = new Game(username, deviceCapabilities);
      // No need to call game.init() as the Game constructor now starts the game automatically

      // Setup controls based on device
      setupAdaptiveControls();

      // Listen for game over event
      game.on("gameOver", (finalScore, crystalsCollected) => {
        // Update high scores
        if (finalScore > highScore) {
          highScore = finalScore;
          localStorage.setItem("highScore", highScore);
        }

        const distance = Math.floor(game.distanceTraveled);
        if (distance > bestDistance) {
          bestDistance = distance;
          localStorage.setItem("bestDistance", bestDistance);
        }

        saveLeaderboardScore(username, finalScore, distance);
        displayGameOver(finalScore, crystalsCollected, distance);
      });
    }, 500);
  });

  // Restart the game
  restartButton.addEventListener("click", () => {
    gameOverScreen.classList.add("hidden");
    if (game) {
      game.restart();
      // Re-setup mobile controls if needed
      if (isMobileDevice()) {
        setupNippleJSControls();
      }
    }
  });

  // Display game over screen
  function displayGameOver(score, crystals, distance) {
    document.getElementById("final-score").innerHTML = `
      SCORE: ${score}<br>
      HIGH SCORE: ${highScore}<br>
      CRYSTALS: ${crystals}<br>
      DISTANCE: ${distance}m<br>
      BEST DISTANCE: ${bestDistance}m
    `;
    gameOverScreen.classList.remove("hidden");
  }

  // Handle keyboard controls
  const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
    ArrowDown: false,
    KeyA: false,
    KeyD: false,
    KeyW: false,
    KeyS: false,
    KeyQ: false,
    KeyE: false,
    Space: false,
  };

  window.addEventListener("keydown", (e) => {
    if (!game) return;
    keys[e.code] = true;

    switch (e.code) {
      case "ArrowLeft":
      case "KeyA":
        game.moveLeft();
        break;
      case "ArrowRight":
      case "KeyD":
        game.moveRight();
        break;
      case "ArrowUp":
      case "KeyW":
        game.jump();
        break;
      case "ArrowDown":
      case "KeyS":
        game.slide();
        break;
      case "KeyQ":
        game.turnLeft();
        break;
      case "KeyE":
        game.turnRight();
        break;
      case "Space":
        game.usePowerup();
        break;
    }
  });

  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  // Detect if this is a mobile device
  function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }

  // Detect device capabilities for performance optimization
  function detectDeviceCapabilities() {
    const capabilities = {
      isLowEnd: false,
      maxTextureSize: 1024,
      particleMultiplier: 1.0,
      drawDistance: 100,
      shadows: true,
      postProcessing: true,
    };

    // Check for mobile device
    if (isMobileDevice()) {
      capabilities.isLowEnd = true;
      capabilities.maxTextureSize = 512;
      capabilities.particleMultiplier = 0.5;
      capabilities.drawDistance = 50;
      capabilities.shadows = false;
      capabilities.postProcessing = false;

      // Further reduce settings for older devices
      if (window.navigator.hardwareConcurrency <= 4) {
        capabilities.particleMultiplier = 0.3;
        capabilities.drawDistance = 30;
      }
    }

    // Fine tune based on screen resolution
    const pixelRatio = window.devicePixelRatio || 1;
    const screenWidth = window.innerWidth * pixelRatio;

    if (screenWidth < 768) {
      capabilities.maxTextureSize = Math.min(capabilities.maxTextureSize, 256);
    }

    return capabilities;
  }

  // Setup NippleJS joystick controls
  function setupNippleJSControls() {
    // Remove previous joystick if it exists
    if (joystick) {
      joystick.destroy();
    }

    // Create joystick container if it doesn't exist
    let joystickContainer = document.getElementById("joystick-container");
    if (!joystickContainer) {
      joystickContainer = document.createElement("div");
      joystickContainer.id = "joystick-container";
      document.getElementById("game-container").appendChild(joystickContainer);
    }

    // Configure joystick options
    const options = {
      zone: joystickContainer,
      color: "rgba(0, 200, 255, 0.5)",
      size: 120,
      threshold: 0.1,
      fadeTime: 100,
      multitouch: true,
      maxNumberOfNipples: 1,
      dataOnly: false,
      position: { left: "50%", bottom: "80px" },
      mode: "static",
      restOpacity: 0.5,
      catchDistance: 150,
      lockX: false,
      lockY: false,
    };

    // Create the joystick
    joystick = nipplejs.create(options);

    // Handle joystick events
    joystick.on("move", (evt, data) => {
      if (game) {
        // Handle left/right movement
        if (data.direction) {
          if (data.direction.x === "left" && Math.abs(data.vector.x) > 0.5) {
            game.moveLeft();
          } else if (
            data.direction.x === "right" &&
            Math.abs(data.vector.x) > 0.5
          ) {
            game.moveRight();
          }

          // Handle up/down movement
          if (data.direction.y === "up" && Math.abs(data.vector.y) > 0.7) {
            game.jump();
          } else if (
            data.direction.y === "down" &&
            Math.abs(data.vector.y) > 0.7
          ) {
            game.slide();
          }
        }
      }
    });

    // Long press for power-up
    let pressTimer;
    joystick.on("start", () => {
      if (!pressTimer) {
        pressTimer = setTimeout(() => {
          if (game) game.usePowerup();
        }, 800);
      }
    });

    joystick.on("end", () => {
      clearTimeout(pressTimer);
      pressTimer = null;
    });

    return joystick;
  }

  // Setup touch gestures as backup
  function setupTouchGestures() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    // For tap controls
    const leftThird = window.innerWidth / 3;
    const rightThird = (window.innerWidth * 2) / 3;

    // Touch start handler
    window.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    });

    // Touch end handler for swipes
    window.addEventListener("touchend", (e) => {
      if (!game) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const touchEndTime = Date.now();

      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;
      const duration = touchEndTime - touchStartTime;

      // Quick taps in screen zones
      if (duration < 300 && Math.abs(diffX) < 30 && Math.abs(diffY) < 30) {
        // Tap in left third = move left
        if (touchEndX < leftThird) {
          game.moveLeft();
        }
        // Tap in right third = move right
        else if (touchEndX > rightThird) {
          game.moveRight();
        }
        // Tap in middle = jump
        else {
          game.jump();
        }
        return;
      }

      // Swipe detection for longer movements
      if (duration < 300) {
        // Horizontal swipe
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 60) {
          if (diffX > 0) {
            game.moveRight();
          } else {
            game.moveLeft();
          }
        }
        // Vertical swipe
        else if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 60) {
          if (diffY > 0) {
            game.slide();
          } else {
            game.jump();
          }
        }
      }
    });

    // Double tap for power-ups
    let lastTap = 0;
    window.addEventListener("touchend", (e) => {
      const currentTime = Date.now();
      const tapLength = currentTime - lastTap;
      if (tapLength < 300 && tapLength > 0) {
        if (game) game.usePowerup();
        e.preventDefault();
      }
      lastTap = currentTime;
    });
  }

  // Setup tilt controls
  function setupTiltControls() {
    if (!window.DeviceOrientationEvent) return;

    window.addEventListener("deviceorientation", (e) => {
      if (!game || !game.player) return;
      if (!game.player.mobileControls.accelerometer) return;

      // Use gamma value (left to right tilt)
      const tilt = e.gamma;
      const sensitivity = game.player.mobileControls.accelerometerSensitivity;

      // Move based on tilt amount
      if (Math.abs(tilt) > sensitivity) {
        if (tilt > 0) {
          game.moveRight();
        } else {
          game.moveLeft();
        }
      }
    });
  }

  // Setup mobile UI elements
  function createMobileUI() {
    const gameContainer = document.getElementById("game-container");

    // Add mobile class for CSS adjustments
    document.body.classList.add("mobile-device");

    // Create touch indicators
    const touchIndicators = document.createElement("div");
    touchIndicators.id = "touch-indicators";
    touchIndicators.innerHTML = `
      <div class="swipe-indicator left">←</div>
      <div class="swipe-indicator right">→</div>
      <div class="swipe-indicator up">↑</div>
      <div class="swipe-indicator down">↓</div>
    `;
    gameContainer.appendChild(touchIndicators);

    // Create floating action button for pause
    const pauseButton = document.createElement("button");
    pauseButton.id = "pause-button";
    pauseButton.innerHTML = "❚❚";
    gameContainer.appendChild(pauseButton);

    // Add event listener
    pauseButton.addEventListener("touchend", (e) => {
      e.preventDefault();
      if (game) {
        if (game.isPaused) {
          game.resume();
        } else {
          game.pause();
        }
      }
    });
  }

  // Handle mobile browser quirks
  function handleMobileBrowserQuirks() {
    // Prevent pinch zoom
    document.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length > 1) {
          e.preventDefault();
        }
      },
      { passive: false }
    );

    // Handle iOS Safari full screen issues
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      // Fix for iOS height calculation
      const setIOSHeight = () => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty("--vh", `${vh}px`);
      };

      window.addEventListener("resize", setIOSHeight);
      window.addEventListener("orientationchange", setIOSHeight);
      setIOSHeight();
    }

    // Handle Android Chrome fullscreen issues
    const isAndroid = /Android/.test(navigator.userAgent);
    if (isAndroid) {
      // Fix for Android height calculation with address bar
      window.addEventListener("resize", () => {
        if (document.activeElement.tagName === "INPUT") {
          window.setTimeout(function () {
            document.activeElement.scrollIntoView();
          }, 0);
        }
      });
    }
  }

  // Setup PWA support
  function setupPWASupport() {
    let deferredPrompt;

    // Check if the app can be installed
    window.addEventListener("beforeinstallprompt", (e) => {
      // Prevent Chrome 67+ from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later
      deferredPrompt = e;

      // Show installation button after a short delay
      setTimeout(() => {
        if (deferredPrompt) {
          const installButton = document.createElement("button");
          installButton.id = "install-button";
          installButton.innerText = "Add to Home Screen";
          document.body.appendChild(installButton);

          installButton.addEventListener("click", () => {
            // Show the prompt
            deferredPrompt.prompt();

            // Wait for the user to respond to the prompt
            deferredPrompt.userChoice.then((choiceResult) => {
              if (choiceResult.outcome === "accepted") {
                console.log("User accepted the install prompt");
              }
              deferredPrompt = null;
              installButton.remove();
            });
          });
        }
      }, 5000);
    });
  }

  // Save score to leaderboard
  function saveLeaderboardScore(username, score, distance) {
    try {
      // Get existing leaderboard
      let leaderboard = JSON.parse(
        localStorage.getItem("cosmic_runner_leaderboard") || "[]"
      );

      // Add new score
      leaderboard.push({
        username: username,
        score: score,
        distance: distance,
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
    } catch (e) {
      console.error("Error saving to leaderboard:", e);
    }
  }

  // Adaptive controls setup based on device
  function setupAdaptiveControls() {
    if (isMobileDevice()) {
      mobileControls.classList.remove("hidden");
      settingsButton.classList.remove("hidden");
      createMobileUI();
      handleMobileBrowserQuirks();
      setupPWASupport();

      // Show settings panel button on mobile
      settingsButton.addEventListener("click", () => {
        settingsPanel.classList.toggle("hidden");
      });

      accelerometerToggle.addEventListener("change", () => {
        if (game) {
          const enabled = game.player.toggleAccelerometer();
          // Update UI to reflect accelerometer state
          document.getElementById("tilt-controls").style.display = enabled
            ? "block"
            : "none";
        }
      });

      sensitivitySlider.addEventListener("input", () => {
        if (game) {
          game.player.setAccelerometerSensitivity(
            parseFloat(sensitivitySlider.value)
          );
        }
      });

      // Setup all mobile control schemes
      setupNippleJSControls();
      setupTouchGestures();
      setupTiltControls();

      // Traditional touch button controls - retain existing event listeners
      document
        .getElementById("left-button")
        .addEventListener("touchstart", (e) => {
          e.preventDefault();
          if (game) game.moveLeft();
        });

      document
        .getElementById("right-button")
        .addEventListener("touchstart", (e) => {
          e.preventDefault();
          if (game) game.moveRight();
        });

      document
        .getElementById("jump-button")
        .addEventListener("touchstart", (e) => {
          e.preventDefault();
          if (game) game.jump();
        });

      document
        .getElementById("slide-button")
        .addEventListener("touchstart", (e) => {
          e.preventDefault();
          if (game) game.slide();
        });

      document
        .getElementById("turn-left-button")
        .addEventListener("touchstart", (e) => {
          e.preventDefault();
          if (game) game.turnLeft();
        });

      document
        .getElementById("turn-right-button")
        .addEventListener("touchstart", (e) => {
          e.preventDefault();
          if (game) game.turnRight();
        });

      document
        .getElementById("powerup-button")
        .addEventListener("touchstart", (e) => {
          e.preventDefault();
          if (game) game.usePowerup();
        });
    } else {
      // Desktop - just use keyboard controls
      setupKeyboardControls();
    }
  }

  // Keyboard controls for desktop
  function setupKeyboardControls() {
    // Already handled by keydown/keyup event listeners
  }

  // Handle window resize
  window.addEventListener("resize", () => {
    if (game) {
      game.handleResize();

      // Reposition joystick if needed
      if (joystick && isMobileDevice()) {
        joystick.destroy();
        setupNippleJSControls();
      }
    }
  });

  // Handle visibility change (pause/resume)
  document.addEventListener("visibilitychange", () => {
    if (game) {
      if (document.hidden) {
        game.pause();
      } else {
        game.resume();
      }
    }
  });
});
