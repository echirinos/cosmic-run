require("../style.css");
const { Game } = require("./game/game");

// Wait for DOM content to load
document.addEventListener("DOMContentLoaded", () => {
  const loadingScreen = document.getElementById("loading-screen");
  const startButton = document.getElementById("start-button");
  const usernameInput = document.getElementById("username-input");
  const restartButton = document.getElementById("restart-button");
  const gameOverScreen = document.getElementById("game-over");

  let game;

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
      game = new Game(username);
      game.init();

      // Listen for game over event
      game.on("gameOver", (finalScore, crystalsCollected) => {
        displayGameOver(finalScore, crystalsCollected);
      });
    }, 500);
  });

  // Restart the game
  restartButton.addEventListener("click", () => {
    gameOverScreen.classList.add("hidden");
    if (game) {
      game.restart();
    }
  });

  // Display game over screen
  function displayGameOver(score, crystals) {
    document.getElementById("final-score").innerHTML = `
            SCORE: ${score}<br>
            CRYSTALS: ${crystals}
        `;
    gameOverScreen.classList.remove("hidden");
  }

  // Handle keyboard controls
  window.addEventListener("keydown", (e) => {
    if (!game) return;

    switch (e.key) {
      case "ArrowLeft":
        game.moveLeft();
        break;
      case "ArrowRight":
        game.moveRight();
        break;
      case "ArrowUp":
        game.jump();
        break;
      case "ArrowDown":
        game.slide();
        break;
      case " ":
        game.usePowerup();
        break;
    }
  });

  // Handle touch controls for mobile
  setupTouchControls();

  function setupTouchControls() {
    const mobileControls = document.getElementById("mobile-controls");

    // Check if device is mobile
    if (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      )
    ) {
      mobileControls.classList.remove("hidden");

      // Add touch event listeners for swipe controls
      let touchStartX = 0;
      let touchStartY = 0;

      window.addEventListener("touchstart", (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
      });

      window.addEventListener("touchend", (e) => {
        if (!game) return;

        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;

        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        // Detect swipe direction
        if (Math.abs(diffX) > Math.abs(diffY)) {
          // Horizontal swipe
          if (diffX > 50) {
            game.moveRight();
          } else if (diffX < -50) {
            game.moveLeft();
          }
        } else {
          // Vertical swipe
          if (diffY > 50) {
            game.slide();
          } else if (diffY < -50) {
            game.jump();
          }
        }
      });

      // Setup buttons
      document
        .getElementById("left-button")
        .addEventListener("touchend", () => game && game.moveLeft());
      document
        .getElementById("right-button")
        .addEventListener("touchend", () => game && game.moveRight());
      document
        .getElementById("jump-button")
        .addEventListener("touchend", () => game && game.jump());
      document
        .getElementById("slide-button")
        .addEventListener("touchend", () => game && game.slide());
    }
  }

  // Handle window resize
  window.addEventListener("resize", () => {
    if (game) {
      game.handleResize();
    }
  });
});
