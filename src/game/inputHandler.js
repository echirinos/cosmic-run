class InputHandler {
  constructor(game) {
    this.game = game;
    this.keys = {};
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.swipeThreshold = 50;
    this.tapTimeThreshold = 200;
    this.touchStartTime = 0;

    // Initialize input handlers
    this.initKeyboardEvents();

    // Initialize touch events if device has a touch screen
    if (game.deviceCapabilities && game.deviceCapabilities.touchScreen) {
      this.initTouchEvents();
    }
  }

  initKeyboardEvents() {
    // Set up keyboard event listeners
    window.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;

      // Handle one-time key presses here
      if (!this.game.isGameOver && !this.game.isPaused) {
        switch (e.code) {
          case "ArrowLeft":
          case "KeyA":
            this.game.moveLeft(); // Fixed direction
            break;
          case "ArrowRight":
          case "KeyD":
            this.game.moveRight(); // Fixed direction
            break;
          case "ArrowUp":
          case "KeyW":
          case "Space":
            this.game.jump();
            break;
          case "ArrowDown":
          case "KeyS":
            this.game.slide();
            break;
          case "KeyP":
            this.togglePause();
            break;
          case "KeyE":
            this.game.usePowerup();
            break;
        }
      }

      // Handle game restart when game over
      if (this.game.isGameOver && e.code === "Space") {
        this.game.restart();
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
    });
  }

  initTouchEvents() {
    const gameContainer = document.getElementById("game-container");

    // Touch start event
    gameContainer.addEventListener("touchstart", (e) => {
      if (this.game.isGameOver || this.game.isPaused) return;

      const touch = e.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.touchStartTime = Date.now();
    });

    // Touch end event
    gameContainer.addEventListener("touchend", (e) => {
      if (this.game.isGameOver || this.game.isPaused) return;

      const touch = e.changedTouches[0];
      const touchEndX = touch.clientX;
      const touchEndY = touch.clientY;
      const touchEndTime = Date.now();

      const touchDuration = touchEndTime - this.touchStartTime;
      const deltaX = touchEndX - this.touchStartX;
      const deltaY = touchEndY - this.touchStartY;

      // Check if it's a tap (short duration, minimal movement)
      if (
        touchDuration < this.tapTimeThreshold &&
        Math.abs(deltaX) < this.swipeThreshold &&
        Math.abs(deltaY) < this.swipeThreshold
      ) {
        // Determine which third of the screen was tapped
        const screenWidth = window.innerWidth;
        const tapX = touchEndX;

        if (tapX < screenWidth / 3) {
          // Left third of screen - move left
          this.game.moveLeft();
        } else if (tapX > (screenWidth * 2) / 3) {
          // Right third of screen - move right
          this.game.moveRight();
        } else {
          // Middle third of screen - jump
          this.game.jump();
        }
      }
      // Check if it's a swipe (longer movement)
      else if (
        Math.abs(deltaX) > this.swipeThreshold ||
        Math.abs(deltaY) > this.swipeThreshold
      ) {
        // Determine direction of swipe
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          // Horizontal swipe
          if (deltaX > 0) {
            // Right swipe - move right
            this.game.moveRight();
          } else {
            // Left swipe - move left
            this.game.moveLeft();
          }
        } else {
          // Vertical swipe
          if (deltaY > 0) {
            // Down swipe - slide
            this.game.slide();
          } else {
            // Up swipe - jump
            this.game.jump();
          }
        }
      }
    });
  }

  togglePause() {
    if (this.game.isGameOver) return;

    if (this.game.isPaused) {
      this.game.resume();
    } else {
      this.game.pause();
    }

    // Toggle pause UI
    const pauseScreen = document.getElementById("pause-screen");
    if (pauseScreen) {
      pauseScreen.style.display = this.game.isPaused ? "flex" : "none";
    }
  }

  update() {
    // Can be used for continuous input processing if needed
  }
}

module.exports = { InputHandler };
