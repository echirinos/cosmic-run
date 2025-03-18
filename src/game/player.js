const THREE = require("three");

class Player {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.speed = 0.15;
    this.jumpForce = 0.2;
    this.gravity = 0.01;
    this.position = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.targetLane = 0; // -1: left, 0: center, 1: right
    this.currentLane = 0;
    this.laneWidth = 2;
    this.isJumping = false;
    this.isSliding = false;
    this.isDead = false;
    this.forwardDirection = new THREE.Vector3(0, 0, 1); // Running in positive Z direction
    this.shieldActive = false;
    this.health = 3; // Player starts with 3 health points
    this.activePowerup = null; // Currently active powerup

    // Animation states
    this.animationState = {
      running: true,
      jumping: false,
      sliding: false,
      stumbling: false,
      recovering: false,
    };

    // Create astronaut mesh
    this.createAstronautMesh();

    // Position the player mesh and add to scene
    if (this.mesh) {
      this.mesh.position.set(this.position.x, this.position.y, this.position.z);
      this.scene.add(this.mesh);
    } else {
      console.error("Failed to create player mesh");
    }

    // Start running animation
    this.playRunAnimation();

    // Shield timer
    this.shieldTimer = 0;
    this.shieldDuration = 5000; // 5 seconds
  }

  createAstronautMesh() {
    // Create an astronaut character
    const astronaut = new THREE.Group();

    // Body - slightly rounded rectangular prism
    const bodyGeometry = new THREE.BoxGeometry(0.6, 0.8, 0.4);
    const bodyMaterial = new THREE.MeshPhongMaterial({
      color: 0x3399ff,
      specular: 0x111111,
      shininess: 50,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.4;
    astronaut.add(body);
    this.body = body;

    // Head - sphere with helmet visor
    const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const headMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      specular: 0x555555,
      shininess: 70,
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.1;
    astronaut.add(head);
    this.head = head;

    // Helmet visor
    const visorGeometry = new THREE.PlaneGeometry(0.4, 0.2);
    const visorMaterial = new THREE.MeshPhongMaterial({
      color: 0x66ccff,
      specular: 0xffffff,
      shininess: 100,
      transparent: true,
      opacity: 0.7,
    });
    const visor = new THREE.Mesh(visorGeometry, visorMaterial);
    visor.position.set(0, 1.1, 0.35); // Positioned in front of the head
    astronaut.add(visor);

    // Arms
    const armGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.6);
    const armMaterial = new THREE.MeshPhongMaterial({
      color: 0x3399ff,
      specular: 0x111111,
      shininess: 50,
    });

    // Left arm
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.4, 0.6, 0);
    leftArm.rotation.z = Math.PI / 6; // Slightly outward
    astronaut.add(leftArm);
    this.leftArm = leftArm;

    // Right arm
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.4, 0.6, 0);
    rightArm.rotation.z = -Math.PI / 6; // Slightly outward
    astronaut.add(rightArm);
    this.rightArm = rightArm;

    // Legs
    const legGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.7);
    const legMaterial = new THREE.MeshPhongMaterial({
      color: 0x3399ff,
      specular: 0x111111,
      shininess: 50,
    });

    // Left leg
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.2, 0, 0);
    astronaut.add(leftLeg);
    this.leftLeg = leftLeg;

    // Right leg
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.2, 0, 0);
    astronaut.add(rightLeg);
    this.rightLeg = rightLeg;

    // Backpack (oxygen tank)
    const tankGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.6);
    tankGeometry.rotateX(Math.PI / 2); // Rotate to horizontal
    const tankMaterial = new THREE.MeshPhongMaterial({
      color: 0xdddddd,
      specular: 0x666666,
      shininess: 60,
    });
    const tank = new THREE.Mesh(tankGeometry, tankMaterial);
    tank.position.set(0, 0.6, -0.3);
    astronaut.add(tank);

    // Add a light to the astronaut for better visibility
    const light = new THREE.PointLight(0x66ccff, 0.5, 3);
    light.position.set(0, 1, 0);
    astronaut.add(light);

    // Create shield (initially invisible)
    const shieldGeometry = new THREE.SphereGeometry(1, 16, 16);
    const shieldMaterial = new THREE.MeshPhongMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    this.shieldMesh = new THREE.Mesh(shieldGeometry, shieldMaterial);
    this.shieldMesh.visible = false;
    astronaut.add(this.shieldMesh);

    // Set astronaut facing forward
    astronaut.rotation.y = Math.PI; // Face forward (positive Z)

    // Set the mesh property
    this.mesh = astronaut;

    // Debug
    console.log("Player mesh created");

    return astronaut;
  }

  getPosition() {
    return {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
    };
  }

  getSize() {
    return { width: 0.7, height: 1.5, depth: 0.7 };
  }

  getDirection() {
    return this.forwardDirection.clone();
  }

  getRotation() {
    // Return the rotation of the player (for camera following)
    return {
      x: this.mesh ? this.mesh.rotation.x : 0,
      y: this.mesh ? this.mesh.rotation.y : 0,
      z: this.mesh ? this.mesh.rotation.z : 0,
    };
  }

  moveLeft() {
    if (
      this.targetLane > -1 &&
      !this.isDead &&
      !this.animationState.stumbling
    ) {
      this.targetLane--;
    }
  }

  moveRight() {
    if (this.targetLane < 1 && !this.isDead && !this.animationState.stumbling) {
      this.targetLane++;
    }
  }

  jump() {
    if (
      !this.isJumping &&
      !this.isDead &&
      !this.isSliding &&
      !this.animationState.stumbling
    ) {
      this.isJumping = true;
      this.velocity.y = this.jumpForce;
      this.animationState.jumping = true;
      this.animationState.running = false;
      this.playJumpAnimation();
    }
  }

  slide() {
    if (
      !this.isSliding &&
      !this.isDead &&
      !this.isJumping &&
      !this.animationState.stumbling
    ) {
      this.isSliding = true;
      this.animationState.sliding = true;
      this.animationState.running = false;
      this.playSlideAnimation();

      // Auto recover from slide after a delay
      setTimeout(() => {
        if (this.isSliding) {
          this.isSliding = false;
          this.animationState.sliding = false;
          this.animationState.running = true;
        }
      }, 800);
    }
  }

  hit() {
    if (this.shieldActive) {
      // Shield absorbs the hit
      this.deactivateShield();
      return false;
    }

    if (!this.isDead && !this.animationState.stumbling) {
      console.log("Player hit! Health:", this.health);
      this.health--;

      this.animationState.stumbling = true;
      this.animationState.running = false;

      this.playStumbleAnimation();

      // Slow down temporarily
      const originalSpeed = this.speed;
      this.speed *= 0.5;

      // Recover after delay
      setTimeout(() => {
        if (!this.isDead) {
          this.animationState.stumbling = false;
          this.animationState.recovering = true;

          // Restore speed
          setTimeout(() => {
            this.speed = originalSpeed;
            this.animationState.recovering = false;
            this.animationState.running = true;
            this.playRunAnimation();
          }, 500);
        }
      }, 1000);

      return true;
    }
    return false;
  }

  activateShield() {
    this.shieldActive = true;
    this.shieldMesh.visible = true;
    this.shieldTimer = Date.now();
  }

  deactivateShield() {
    this.shieldActive = false;
    this.shieldMesh.visible = false;
  }

  die() {
    if (!this.isDead) {
      this.isDead = true;
      this.animationState.running = false;
      this.animationState.jumping = false;
      this.animationState.sliding = false;
      this.animationState.stumbling = false;

      this.playDeathAnimation();
    }
  }

  playRunAnimation() {
    // Reset animation variables
    this.bobPhase = 0;

    // Animation function that will run on each frame
    const animate = () => {
      if (!this.animationState.running) return;

      // Update bob phase
      this.bobPhase += this.bobSpeed;

      // Body bob up and down slightly
      this.body.position.y = 0.4 + Math.sin(this.bobPhase) * this.bobAmount;

      // Leg animations - alternating forward and backward movement
      this.leftLeg.rotation.x = Math.sin(this.bobPhase) * 0.5; // Swing leg back and forth
      this.rightLeg.rotation.x = Math.sin(this.bobPhase + Math.PI) * 0.5; // Opposite phase

      // Arms swing opposite to legs for natural running motion
      this.leftArm.rotation.x = Math.sin(this.bobPhase + Math.PI) * 0.3;
      this.rightArm.rotation.x = Math.sin(this.bobPhase) * 0.3;

      // Schedule the next frame
      this.runningAnimation = requestAnimationFrame(animate);
    };

    // Start the animation
    this.runningAnimation = requestAnimationFrame(animate);
  }

  playJumpAnimation() {
    // Clear running animation if it's active
    if (this.runningAnimation) {
      cancelAnimationFrame(this.runningAnimation);
      this.runningAnimation = null;
    }

    // Set jump pose
    this.leftLeg.rotation.x = -0.3; // Both legs slightly back
    this.rightLeg.rotation.x = -0.3;
    this.leftArm.rotation.x = -0.5; // Arms up
    this.rightArm.rotation.x = -0.5;

    // Resume running animation after jump is complete
    setTimeout(() => {
      if (!this.isDead && !this.isSliding && !this.animationState.stumbling) {
        this.animationState.running = true;
        this.animationState.jumping = false;
        this.playRunAnimation();
      }
    }, 500);
  }

  playSlideAnimation() {
    // Clear running animation if it's active
    if (this.runningAnimation) {
      cancelAnimationFrame(this.runningAnimation);
      this.runningAnimation = null;
    }

    // Slide pose - lean forward, legs back, arms forward
    this.body.rotation.x = Math.PI / 3; // Lean forward
    this.head.position.z = 0.2; // Move head forward a bit due to leaning
    this.leftLeg.rotation.x = Math.PI / 3; // Legs back
    this.rightLeg.rotation.x = Math.PI / 3;
    this.leftArm.rotation.x = -Math.PI / 4; // Arms forward
    this.rightArm.rotation.x = -Math.PI / 4;

    // Reset pose after slide duration
    setTimeout(() => {
      if (!this.isDead && !this.animationState.stumbling) {
        this.body.rotation.x = 0; // Straighten up
        this.head.position.z = 0; // Reset head position
        this.leftLeg.rotation.x = 0; // Reset legs
        this.rightLeg.rotation.x = 0;
        this.leftArm.rotation.x = 0; // Reset arms
        this.rightArm.rotation.x = 0;

        if (!this.isJumping) {
          this.animationState.running = true;
          this.playRunAnimation();
        }
      }
    }, 800);
  }

  playStumbleAnimation() {
    // Clear running animation if it's active
    if (this.runningAnimation) {
      cancelAnimationFrame(this.runningAnimation);
      this.runningAnimation = null;
    }

    // Stumble animation - tilt forward and flail arms
    this.body.rotation.x = Math.PI / 6; // Tilt forward

    // Animate stumbling over time
    const startTime = Date.now();
    const stumbleDuration = 1000; // 1 second

    const animateStumble = () => {
      if (!this.animationState.stumbling) return;

      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / stumbleDuration, 1);

      // Random arm and leg movements to simulate stumbling
      this.leftArm.rotation.x = Math.sin(t * Math.PI * 4) * 0.5;
      this.rightArm.rotation.x = Math.cos(t * Math.PI * 4) * 0.5;
      this.leftLeg.rotation.x = Math.cos(t * Math.PI * 3) * 0.3;
      this.rightLeg.rotation.x = Math.sin(t * Math.PI * 3) * 0.3;

      if (t < 1) {
        this.stumblingAnimation = requestAnimationFrame(animateStumble);
      } else {
        // End of stumble animation
        this.body.rotation.x = 0;
      }
    };

    this.stumblingAnimation = requestAnimationFrame(animateStumble);
  }

  playDeathAnimation() {
    // Clear any existing animations
    if (this.runningAnimation) cancelAnimationFrame(this.runningAnimation);
    if (this.stumblingAnimation) cancelAnimationFrame(this.stumblingAnimation);

    // Death animation - fall backward and rotate
    const startTime = Date.now();
    const deathDuration = 1000; // 1 second

    const animateDeath = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / deathDuration, 1);

      // Fall backward and rotate
      this.mesh.rotation.x = (t * Math.PI) / 2; // Fall on back
      this.mesh.rotation.y = t * Math.PI * 2; // Spin around
      this.mesh.position.y = Math.max(0, Math.sin(t * Math.PI) * 2); // Small bounce

      if (t < 1) {
        requestAnimationFrame(animateDeath);
      }
    };

    animateDeath();
  }

  update(delta) {
    // Check shield timer
    if (
      this.shieldActive &&
      Date.now() - this.shieldTimer > this.shieldDuration
    ) {
      this.deactivateShield();
    }

    // Handle jumping physics
    if (this.isJumping) {
      this.position.y += this.velocity.y * delta;
      this.velocity.y -= this.gravity * delta;

      // Check if landed
      if (this.position.y <= 0) {
        this.position.y = 0;
        this.velocity.y = 0;
        this.isJumping = false;

        // Resume running if not doing something else
        if (!this.isSliding && !this.animationState.stumbling && !this.isDead) {
          this.animationState.running = true;
          this.animationState.jumping = false;
          this.playRunAnimation();
        }
      }
    }

    // Handle lane changes (left/right movement)
    const targetX = this.targetLane * this.laneWidth;
    const laneChangeSpeed = 0.1 * delta;
    if (Math.abs(this.position.x - targetX) > 0.1) {
      // Move towards target lane
      this.position.x += (targetX - this.position.x) * laneChangeSpeed;
    } else {
      // Snap to exact lane position when close enough
      this.position.x = targetX;
      this.currentLane = this.targetLane;
    }

    // Move forward (if not dead)
    if (!this.isDead) {
      this.position.z += this.speed * delta;
    }

    // Update mesh position
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);

    // Start running animation if not already running and should be
    if (this.animationState.running && !this.runningAnimation && !this.isDead) {
      this.playRunAnimation();
    }
  }

  reset() {
    // Reset position
    this.position = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.targetLane = 0;
    this.currentLane = 0;

    // Reset state
    this.isDead = false;
    this.isJumping = false;
    this.isSliding = false;
    this.health = 3;

    // Reset animations
    this.animationState.running = true;
    this.animationState.jumping = false;
    this.animationState.sliding = false;
    this.animationState.stumbling = false;
    this.animationState.recovering = false;

    // Reset shield
    this.deactivateShield();

    // Reset mesh
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.head.position.z = 0;
    this.leftLeg.rotation.set(0, 0, 0);
    this.rightLeg.rotation.set(0, 0, 0);
    this.leftArm.rotation.set(0, 0, 0);
    this.rightArm.rotation.set(0, 0, 0);

    // Start running animation
    this.playRunAnimation();
  }

  // Use currently active powerup
  usePowerup() {
    // Check if we have an active power-up
    if (this.activePowerup) {
      console.log(`Using powerup: ${this.activePowerup}`);

      // Apply power-up effect based on type
      switch (this.activePowerup) {
        case "shield":
          this.activateShield();
          break;
        case "magnet":
          // Crystal magnet effect is handled in the game class
          if (
            this.gameRef &&
            typeof this.gameRef.activateMagnet === "function"
          ) {
            this.gameRef.activateMagnet();
          }
          break;
        case "speed":
          // Speed boost effect is handled in the game class
          if (
            this.gameRef &&
            typeof this.gameRef.activateSpeedBoost === "function"
          ) {
            this.gameRef.activateSpeedBoost();
          } else {
            // Fallback if game reference is not available
            const originalSpeed = this.speed;
            this.speed *= 1.5;

            // Reset after 5 seconds
            setTimeout(() => {
              this.speed = originalSpeed;
            }, 5000);
          }
          break;
        default:
          console.log("Unknown powerup type");
      }

      // Clear the active powerup after use
      this.activePowerup = null;

      return true; // Power-up was used
    }

    return false; // No power-up available
  }

  // Collect a powerup
  collectPowerup(powerupType) {
    // Store the powerup for later use
    this.activePowerup = powerupType;
    console.log(`Collected powerup: ${powerupType}`);

    // Return true to confirm collection
    return true;
  }
}

module.exports = { Player };
