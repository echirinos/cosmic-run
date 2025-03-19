const THREE = require("three");

class Player {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.speed = 0.15;
    this.jumpForce = 0.3; // Increased for better jump feel
    this.gravity = 0.015; // Increased for more responsive physics
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
    this.canBeHit = true; // Invulnerability flag
    this.invulnerabilityTime = 1000; // 1 second of invulnerability after hit

    // Collision detection variables
    this.hitbox = {
      standing: { width: 0.8, height: 1.8, depth: 0.8 },
      sliding: { width: 0.8, height: 0.9, depth: 1.2 },
    };

    // Visual hitbox for debugging
    this.hitboxMesh = null;
    this.debugMode = false;

    // Animation states with timing
    this.animationState = {
      running: true,
      jumping: false,
      sliding: false,
      stumbling: false,
      recovering: false,
      current: "running",
      transitionTime: 0,
      transitionDuration: 0.3, // Seconds for smooth transitions
    };

    // Animation timing variables
    this.runCycle = 0;
    this.jumpCycle = 0;
    this.slideCycle = 0;
    this.deathCycle = 0;

    // Limb references for animations
    this.limbs = {
      leftArm: null,
      rightArm: null,
      leftLeg: null,
      rightLeg: null,
      torso: null,
    };

    // Create astronaut mesh
    this.createAstronautMesh();

    // Position the player mesh and add to scene
    if (this.mesh) {
      this.mesh.position.set(this.position.x, this.position.y, this.position.z);
      this.scene.add(this.mesh);

      // Create debug hitbox if in debug mode
      if (this.debugMode) {
        this.createDebugHitbox();
      }
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
    // Create a more detailed astronaut
    const astronaut = new THREE.Group();

    // Body - using more detailed shape
    const bodyGeometry = new THREE.CapsuleGeometry(0.4, 0.8, 8, 16);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.7,
      emissive: 0x222222,
      emissiveIntensity: 0.1,
    });

    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.8;
    body.castShadow = true;
    astronaut.add(body);
    this.body = body;

    // Helmet with reflective visor
    const helmetGeometry = new THREE.SphereGeometry(0.5, 24, 24);
    const helmetMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.1,
      metalness: 0.8,
      emissive: 0x222222,
      emissiveIntensity: 0.1,
    });

    const helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
    helmet.position.y = 1.7;
    helmet.castShadow = true;
    astronaut.add(helmet);

    // Visor (with more realistic shape and reflective properties)
    const visorGeometry = new THREE.SphereGeometry(
      0.48,
      24,
      24,
      Math.PI / 4,
      Math.PI / 2,
      Math.PI / 4,
      Math.PI / 2
    );
    const visorMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x000066,
      roughness: 0.1,
      metalness: 1.0,
      reflectivity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.2,
      transparent: true,
      opacity: 0.9,
    });

    const visor = new THREE.Mesh(visorGeometry, visorMaterial);
    visor.position.set(0, 1.7, 0.1);
    visor.castShadow = true;
    astronaut.add(visor);

    // Backpack
    const backpackGeometry = new THREE.BoxGeometry(0.7, 0.9, 0.4);
    const backpackMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.6,
      metalness: 0.5,
    });

    const backpack = new THREE.Mesh(backpackGeometry, backpackMaterial);
    backpack.position.set(0, 0.8, -0.4);
    backpack.castShadow = true;
    astronaut.add(backpack);

    // Add details to backpack
    const detailMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.5,
      metalness: 0.6,
    });

    // Control panel
    const panelGeometry = new THREE.BoxGeometry(0.4, 0.2, 0.05);
    const panel = new THREE.Mesh(panelGeometry, detailMaterial);
    panel.position.set(0, 1.0, -0.2);
    backpack.add(panel);

    // Add oxygen tanks
    const tankGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 16);
    const tankMaterial = new THREE.MeshStandardMaterial({
      color: 0xbbbbbb,
      roughness: 0.2,
      metalness: 0.8,
    });

    const leftTank = new THREE.Mesh(tankGeometry, tankMaterial);
    leftTank.position.set(-0.2, 0, -0.1);
    backpack.add(leftTank);

    const rightTank = new THREE.Mesh(tankGeometry, tankMaterial);
    rightTank.position.set(0.2, 0, -0.1);
    backpack.add(rightTank);

    // Add limbs with better joints
    this.addLimbs(astronaut);

    // Add light effects
    this.addLightEffects(astronaut);

    // Set initial position
    astronaut.position.set(0, 0, 0);

    // Set mesh
    this.mesh = astronaut;

    return astronaut;
  }

  // Add limbs with better articulation
  addLimbs(astronaut) {
    // Body components for animations
    const limbMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.5,
      metalness: 0.7,
    });

    // Arms
    const armGeometry = new THREE.CapsuleGeometry(0.1, 0.5, 8, 8);

    const leftArm = new THREE.Mesh(armGeometry, limbMaterial);
    leftArm.position.set(0.5, 1.2, 0);
    leftArm.rotation.z = -Math.PI / 8;
    astronaut.add(leftArm);
    this.limbs.leftArm = leftArm;

    const rightArm = new THREE.Mesh(armGeometry, limbMaterial);
    rightArm.position.set(-0.5, 1.2, 0);
    rightArm.rotation.z = Math.PI / 8;
    astronaut.add(rightArm);
    this.limbs.rightArm = rightArm;

    // Legs
    const legGeometry = new THREE.CapsuleGeometry(0.12, 0.6, 8, 8);

    const leftLeg = new THREE.Mesh(legGeometry, limbMaterial);
    leftLeg.position.set(0.2, 0.3, 0);
    astronaut.add(leftLeg);
    this.limbs.leftLeg = leftLeg;

    const rightLeg = new THREE.Mesh(legGeometry, limbMaterial);
    rightLeg.position.set(-0.2, 0.3, 0);
    astronaut.add(rightLeg);
    this.limbs.rightLeg = rightLeg;

    // Store reference to torso/body
    this.limbs.torso = this.body;

    return astronaut;
  }

  // Add light effects to the astronaut
  addLightEffects(astronaut) {
    // Add stronger glow to the suit for better visibility
    const bodyGlow = new THREE.PointLight(0x6699ff, 0.5, 2);
    bodyGlow.position.set(0, 1, 0);
    astronaut.add(bodyGlow);

    // Add brighter backpack lights
    const backpackLight1 = new THREE.PointLight(0xff0000, 0.5, 1);
    backpackLight1.position.set(-0.2, 0.8, -0.6);
    astronaut.add(backpackLight1);

    const backpackLight2 = new THREE.PointLight(0x00ff00, 0.5, 1);
    backpackLight2.position.set(0.2, 0.8, -0.6);
    astronaut.add(backpackLight2);

    // Add helmet visor glow
    const helmetLight = new THREE.PointLight(0x00ccff, 0.8, 1.5);
    helmetLight.position.set(0, 1.7, 0.1);
    astronaut.add(helmetLight);

    // Create shield effect
    this.createShieldEffect(astronaut);

    // Add powerup indicator light
    this.createPowerupIndicator(astronaut);
  }

  // Create powerup indicator that shows when player has an active powerup
  createPowerupIndicator(astronaut) {
    // Create a ring that will glow when a powerup is available
    const ringGeometry = new THREE.RingGeometry(0.8, 0.9, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });

    this.powerupRing = new THREE.Mesh(ringGeometry, ringMaterial);
    this.powerupRing.rotation.x = Math.PI / 2;
    this.powerupRing.position.y = 0.05;
    astronaut.add(this.powerupRing);

    // Add a pulsing light for the powerup
    this.powerupLight = new THREE.PointLight(0xffff00, 0, 3);
    this.powerupLight.position.set(0, 0.2, 0);
    astronaut.add(this.powerupLight);
  }

  // Create better shield effect
  createShieldEffect(astronaut) {
    // Shield sphere - now brighter and more visible
    const shieldGeometry = new THREE.SphereGeometry(1.2, 32, 32);
    const shieldMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x00aaff,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.4,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      side: THREE.DoubleSide,
      envMapIntensity: 0.8,
    });

    this.shield = new THREE.Mesh(shieldGeometry, shieldMaterial);
    this.shield.position.y = 0.8;
    this.shield.scale.set(1, 1, 1);
    this.shield.visible = false;
    astronaut.add(this.shield);

    // Enhanced shield glow effect
    const shieldLight = new THREE.PointLight(0x00aaff, 2.0, 4);
    shieldLight.position.y = 1;
    this.shield.add(shieldLight);

    // Add hexagon pattern to shield
    const hexPattern = () => {
      const hexGroup = new THREE.Group();
      const hexGeometry = new THREE.CircleGeometry(0.2, 6);
      const hexMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      });

      // Create a pattern of hexagons
      const positions = [
        [0, 0, 1.2],
        [0.8, 0.8, 0.8],
        [-0.8, 0.8, 0.8],
        [0.8, -0.8, 0.8],
        [-0.8, -0.8, 0.8],
        [0, 1.1, 0.5],
        [0, -1.1, 0.5],
        [1.1, 0, 0.5],
        [-1.1, 0, 0.5],
      ];

      positions.forEach((pos) => {
        const hex = new THREE.Mesh(hexGeometry, hexMaterial.clone());
        hex.position.set(pos[0], pos[1], pos[2]);
        hex.lookAt(0, 0, 0);
        hexGroup.add(hex);
      });

      return hexGroup;
    };

    this.shieldPattern = hexPattern();
    this.shieldPattern.visible = false;
    astronaut.add(this.shieldPattern);

    // Shield impact effect (particles)
    const particleGeometry = new THREE.BufferGeometry();
    const particleCount = 30;
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i++) {
      positions[i] = 0;
    }

    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );

    const particleMaterial = new THREE.PointsMaterial({
      color: 0x00ffff,
      size: 0.15,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    this.shieldParticles = new THREE.Points(particleGeometry, particleMaterial);
    this.shieldParticles.visible = false;
    astronaut.add(this.shieldParticles);

    // Add shield animation
    const animateShield = () => {
      if (this.shield.visible) {
        this.shield.rotation.y += 0.01;
        this.shield.rotation.z += 0.005;
        this.shield.material.opacity = 0.3 + Math.sin(Date.now() * 0.003) * 0.1;
      }

      if (this.shieldPattern.visible) {
        this.shieldPattern.rotation.y += 0.02;
      }

      requestAnimationFrame(animateShield);
    };

    animateShield();
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
      console.log(
        `Moving left from lane ${this.currentLane} to ${this.targetLane - 1}`
      );
      this.targetLane--;

      // Optional: add a small visual tilt when changing lanes
      if (this.body) {
        this.body.rotation.z = 0.1; // Slight tilt to the right when moving left
        setTimeout(() => {
          this.body.rotation.z = 0; // Reset after a short delay
        }, 150);
      }
    }
  }

  moveRight() {
    if (this.targetLane < 1 && !this.isDead && !this.animationState.stumbling) {
      console.log(
        `Moving right from lane ${this.currentLane} to ${this.targetLane + 1}`
      );
      this.targetLane++;

      // Optional: add a small visual tilt when changing lanes
      if (this.body) {
        this.body.rotation.z = -0.1; // Slight tilt to the left when moving right
        setTimeout(() => {
          this.body.rotation.z = 0; // Reset after a short delay
        }, 150);
      }
    }
  }

  jump() {
    if (this.isJumping || this.isDead) return;

    this.isJumping = true;
    this.velocity.y = this.jumpForce;

    // Transition to jumping animation state
    this.animationState.current = "jumping";
    this.animationState.running = false;
    this.animationState.jumping = true;
    this.animationState.sliding = false;
    this.animationState.transitionTime = 0;

    // Start jump animation
    this.playJumpAnimation();

    // Play jump sound effect if we had audio
    // this.playSound('jump');
  }

  slide() {
    if (this.isSliding || this.isDead) return;

    this.isSliding = true;

    // Transition to sliding animation state
    this.animationState.current = "sliding";
    this.animationState.running = false;
    this.animationState.jumping = false;
    this.animationState.sliding = true;
    this.animationState.transitionTime = 0;

    // Start slide animation
    this.playSlideAnimation();

    // Play slide sound effect if we had audio
    // this.playSound('slide');

    // Set a timeout to end sliding
    setTimeout(() => {
      if (this.isDead) return;

      this.isSliding = false;

      // Transition back to running state
      this.animationState.current = "running";
      this.animationState.running = true;
      this.animationState.sliding = false;
      this.animationState.transitionTime = 0;

      // Resume running animation
      this.playRunAnimation();
    }, 1000); // Slide duration: 1 second
  }

  hit() {
    if (this.shieldActive || !this.canBeHit || this.isDead) return false;

    // Player takes damage
    this.health -= 1;

    // Flash the player to indicate damage
    this.flashDamage();

    // Set invulnerability for a short time
    this.canBeHit = false;
    setTimeout(() => {
      this.canBeHit = true;
    }, this.invulnerabilityTime);

    if (this.health <= 0) {
      // Player dies
      this.die();
      return true;
    } else {
      // Player stumbles
      this.playStumbleAnimation();
      return false;
    }
  }

  flashDamage() {
    if (!this.mesh) return;

    // Flash red to indicate damage
    const originalMaterials = [];
    this.mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        originalMaterials.push({
          mesh: child,
          material: child.material.clone(),
        });

        // Create red material
        const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        child.material = flashMaterial;
      }
    });

    // Restore original materials after a short time
    setTimeout(() => {
      originalMaterials.forEach((item) => {
        item.mesh.material = item.material;
      });
    }, 200);
  }

  die() {
    if (this.isDead) return;

    this.isDead = true;
    this.velocity.y = 0.2; // Small upward bounce on death

    // Update animation state
    this.animationState.current = "dead";
    this.animationState.running = false;
    this.animationState.jumping = false;
    this.animationState.sliding = false;

    // Play death animation
    this.playDeathAnimation();
  }

  playRunAnimation() {
    if (this.isDead) return;

    // Reset animation cycles
    this.runCycle = 0;

    const animateRun = () => {
      if (!this.mesh || this.isDead || !this.animationState.running) return;

      this.runCycle += 0.1;
      const cycle = Math.sin(this.runCycle * 5);

      // Arm swing
      if (this.limbs.leftArm && this.limbs.rightArm) {
        this.limbs.leftArm.rotation.x = cycle * 0.5;
        this.limbs.rightArm.rotation.x = -cycle * 0.5;
      }

      // Leg movement
      if (this.limbs.leftLeg && this.limbs.rightLeg) {
        this.limbs.leftLeg.rotation.x = -cycle * 0.5;
        this.limbs.rightLeg.rotation.x = cycle * 0.5;
      }

      // Subtle body bob
      if (this.limbs.torso) {
        this.limbs.torso.position.y = Math.abs(cycle) * 0.05 + 0.8;
      }

      // Breathing effect for helmet
      if (this.helmet) {
        this.helmet.scale.y = 1 + Math.sin(this.runCycle * 2) * 0.01;
      }

      requestAnimationFrame(animateRun);
    };

    animateRun();
  }

  playJumpAnimation() {
    if (this.isDead) return;

    // Reset animation cycles
    this.jumpCycle = 0;

    const animateJump = () => {
      if (!this.mesh || this.isDead) return;

      this.jumpCycle += 0.1;

      // Initial jump pose - arms up, legs tucked
      if (this.jumpCycle < 1) {
        // Arms up position
        if (this.limbs.leftArm && this.limbs.rightArm) {
          this.limbs.leftArm.rotation.x =
            (-Math.PI / 4) * Math.min(this.jumpCycle, 1);
          this.limbs.rightArm.rotation.x =
            (-Math.PI / 4) * Math.min(this.jumpCycle, 1);
        }

        // Legs tucked position
        if (this.limbs.leftLeg && this.limbs.rightLeg) {
          this.limbs.leftLeg.rotation.x =
            (Math.PI / 6) * Math.min(this.jumpCycle, 1);
          this.limbs.rightLeg.rotation.x =
            (Math.PI / 6) * Math.min(this.jumpCycle, 1);
        }
      }
      // Midair pose
      else if (this.jumpCycle < 3) {
        // Hold the position
      }
      // Landing preparation
      else if (this.velocity.y < 0 && this.position.y < 0.5) {
        // Prepare for landing - extend legs
        if (this.limbs.leftLeg && this.limbs.rightLeg) {
          this.limbs.leftLeg.rotation.x = 0;
          this.limbs.rightLeg.rotation.x = 0;
        }

        // Arms for balance
        if (this.limbs.leftArm && this.limbs.rightArm) {
          this.limbs.leftArm.rotation.x = -Math.PI / 6;
          this.limbs.rightArm.rotation.x = -Math.PI / 6;
        }
      }

      if (this.isJumping) {
        requestAnimationFrame(animateJump);
      } else {
        // Transition back to running animation
        this.playRunAnimation();
      }
    };

    animateJump();
  }

  playSlideAnimation() {
    if (this.isDead) return;

    // Reset animation cycles
    this.slideCycle = 0;

    const animateSlide = () => {
      if (!this.mesh || this.isDead || !this.isSliding) return;

      this.slideCycle += 0.1;

      // Slide pose - body down, arms forward
      if (this.limbs.torso) {
        // Lower the body for sliding
        this.limbs.torso.rotation.x = Math.PI / 3;
        this.limbs.torso.position.y = 0.4;
        this.limbs.torso.position.z = 0.3;
      }

      // Arms forward
      if (this.limbs.leftArm && this.limbs.rightArm) {
        this.limbs.leftArm.rotation.x = Math.PI / 2;
        this.limbs.rightArm.rotation.x = Math.PI / 2;

        // Position arms forward
        this.limbs.leftArm.position.z = 0.3;
        this.limbs.rightArm.position.z = 0.3;
      }

      // Legs straight back
      if (this.limbs.leftLeg && this.limbs.rightLeg) {
        this.limbs.leftLeg.rotation.x = -Math.PI / 6;
        this.limbs.rightLeg.rotation.x = -Math.PI / 6;
      }

      // Continue animation if still sliding
      if (this.isSliding) {
        requestAnimationFrame(animateSlide);
      } else {
        // Reset positions when done sliding
        if (this.limbs.torso) {
          this.limbs.torso.rotation.x = 0;
          this.limbs.torso.position.y = 0.8;
          this.limbs.torso.position.z = 0;
        }

        if (this.limbs.leftArm && this.limbs.rightArm) {
          this.limbs.leftArm.position.z = 0;
          this.limbs.rightArm.position.z = 0;
        }

        // Transition back to running
        this.playRunAnimation();
      }
    };

    animateSlide();
  }

  playStumbleAnimation() {
    if (this.isDead) return;

    // Set stumbling state
    this.animationState.stumbling = true;
    this.animationState.running = false;

    const animateStumble = () => {
      if (!this.mesh || this.isDead) return;

      // Random stumble motion
      if (this.limbs.torso) {
        this.limbs.torso.rotation.z = Math.sin(Date.now() / 50) * 0.2;
        this.limbs.torso.rotation.x = Math.sin(Date.now() / 70) * 0.1;
      }

      // Arms flailing
      if (this.limbs.leftArm && this.limbs.rightArm) {
        this.limbs.leftArm.rotation.z =
          Math.sin(Date.now() / 40) * 0.3 - Math.PI / 8;
        this.limbs.rightArm.rotation.z =
          -Math.sin(Date.now() / 40) * 0.3 + Math.PI / 8;
        this.limbs.leftArm.rotation.x = Math.sin(Date.now() / 60) * 0.4;
        this.limbs.rightArm.rotation.x = -Math.sin(Date.now() / 60) * 0.4;
      }

      // Legs stumbling
      if (this.limbs.leftLeg && this.limbs.rightLeg) {
        this.limbs.leftLeg.rotation.x = Math.sin(Date.now() / 50) * 0.3;
        this.limbs.rightLeg.rotation.x = -Math.sin(Date.now() / 50) * 0.3;
      }

      if (this.animationState.stumbling) {
        requestAnimationFrame(animateStumble);
      }
    };

    animateStumble();

    // Recover after a short time
    setTimeout(() => {
      this.animationState.stumbling = false;
      this.animationState.running = true;

      // Reset rotations
      if (this.limbs.torso) {
        this.limbs.torso.rotation.z = 0;
        this.limbs.torso.rotation.x = 0;
      }

      // Transition back to running
      this.playRunAnimation();
    }, 1000);
  }

  playDeathAnimation() {
    if (!this.mesh) return;

    const animateDeath = () => {
      this.deathCycle += 0.1;

      // Fall backwards and spin slightly
      this.mesh.rotation.x = Math.min(this.deathCycle * 0.1, Math.PI / 2);
      this.mesh.rotation.z = this.deathCycle * 0.05;

      // Limbs splayed out
      if (this.limbs.leftArm && this.limbs.rightArm) {
        this.limbs.leftArm.rotation.z = Math.min(
          this.deathCycle * 0.2,
          Math.PI / 2
        );
        this.limbs.rightArm.rotation.z = Math.min(
          -this.deathCycle * 0.2,
          -Math.PI / 2
        );
      }

      if (this.limbs.leftLeg && this.limbs.rightLeg) {
        this.limbs.leftLeg.rotation.z = Math.min(
          this.deathCycle * 0.1,
          Math.PI / 6
        );
        this.limbs.rightLeg.rotation.z = Math.min(
          -this.deathCycle * 0.1,
          -Math.PI / 6
        );
      }

      // Continue animation if still in death animation
      if (this.isDead && this.deathCycle < 30) {
        requestAnimationFrame(animateDeath);
      }
    };

    // Start death animation
    this.deathCycle = 0;
    animateDeath();
  }

  update(delta) {
    if (!this.mesh) return;

    // Apply physics
    if (!this.isDead) {
      // Lane movement
      const laneX = this.targetLane * this.laneWidth;
      const lerpFactor = 0.2; // Smoother lane transitions
      this.position.x += (laneX - this.position.x) * lerpFactor;

      // Move forward based on game speed
      if (this.gameRef) {
        this.position.z += this.gameRef.gameSpeed * delta * 60;
      }

      // Apply gravity if jumping
      if (this.isJumping) {
        this.velocity.y -= this.gravity;
        this.position.y += this.velocity.y;

        // Check if landed
        if (this.position.y <= 0) {
          this.position.y = 0;
          this.velocity.y = 0;
          this.isJumping = false;

          // Transition back to running
          if (!this.isSliding && !this.isDead) {
            this.animationState.jumping = false;
            this.animationState.running = true;
            this.animationState.current = "running";

            // Play landing effect
            this.createLandingEffect();
          }
        }
      }
    } else {
      // Death physics - fall down
      this.velocity.y -= this.gravity * 0.5;
      this.position.y += this.velocity.y;

      // Stop at ground level
      if (this.position.y < -2) {
        this.position.y = -2;
        this.velocity.y = 0;
      }
    }

    // Animation state transition blending
    if (
      this.animationState.transitionTime <
      this.animationState.transitionDuration
    ) {
      this.animationState.transitionTime += delta;
    }

    // Update player position
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);

    // Update hitbox position for collision detection
    this.updateHitboxPosition();

    // Update shield effect if active
    if (this.shieldActive) {
      this.shieldTimer -= delta * 1000;
      if (this.shieldTimer <= 0) {
        this.deactivateShield();
      }
    }
  }

  createLandingEffect() {
    if (!this.mesh) return;

    // Create dust particles around feet
    const particleCount = 15;
    const particles = new THREE.Group();

    for (let i = 0; i < particleCount; i++) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.05 + Math.random() * 0.05, 8, 8),
        new THREE.MeshBasicMaterial({
          color: 0xcccccc,
          transparent: true,
          opacity: 0.7,
        })
      );

      // Random position around the feet
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.3 + Math.random() * 0.3;
      particle.position.set(
        Math.cos(angle) * radius,
        0.05,
        Math.sin(angle) * radius
      );

      // Random velocity
      particle.userData.velocity = {
        x: (Math.random() - 0.5) * 0.05,
        y: 0.02 + Math.random() * 0.03,
        z: (Math.random() - 0.5) * 0.05,
      };

      particles.add(particle);
    }

    // Add to scene
    particles.position.copy(this.mesh.position);
    particles.position.y = 0;
    this.scene.add(particles);

    // Animate particles
    let lifetime = 0;

    const animateParticles = () => {
      lifetime += 1 / 60;

      particles.children.forEach((particle) => {
        // Move particle
        particle.position.x += particle.userData.velocity.x;
        particle.position.y += particle.userData.velocity.y;
        particle.position.z += particle.userData.velocity.z;

        // Apply gravity
        particle.userData.velocity.y -= 0.001;

        // Fade out
        particle.material.opacity = 0.7 * (1 - lifetime);
      });

      if (lifetime < 1) {
        requestAnimationFrame(animateParticles);
      } else {
        // Remove particles
        this.scene.remove(particles);
      }
    };

    animateParticles();
  }

  // Get the current hitbox for collision detection
  getHitbox() {
    // Ensure hitbox exists
    if (!this.hitbox) {
      // If hitbox isn't initialized yet, provide sensible defaults
      this.hitbox = {
        standing: { width: 0.8, height: 1.8, depth: 0.8 },
        sliding: { width: 0.8, height: 0.9, depth: 1.2 },
      };
    }

    const box = this.isSliding ? this.hitbox.sliding : this.hitbox.standing;

    // Y offset for sliding
    const yOffset = this.isSliding ? -0.45 : 0;

    // Ensure position exists
    if (!this.position) {
      this.position = { x: 0, y: 0, z: 0 };
    }

    return {
      min: {
        x: this.position.x - box.width / 2,
        y: this.position.y + yOffset,
        z: this.position.z - box.depth / 2,
      },
      max: {
        x: this.position.x + box.width / 2,
        y: this.position.y + yOffset + box.height,
        z: this.position.z + box.depth / 2,
      },
      width: box.width,
      height: box.height,
      depth: box.depth,
    };
  }

  createDebugHitbox() {
    // Remove any existing hitbox
    if (this.hitboxMesh) {
      this.scene.remove(this.hitboxMesh);
    }

    // Create a wireframe box representing the hitbox
    const hitboxSize = this.isSliding
      ? this.hitbox.sliding
      : this.hitbox.standing;
    const hitboxGeometry = new THREE.BoxGeometry(
      hitboxSize.width,
      hitboxSize.height,
      hitboxSize.depth
    );
    const hitboxMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });

    this.hitboxMesh = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
    this.scene.add(this.hitboxMesh);

    // Update position
    this.updateHitboxPosition();
  }

  updateHitboxPosition() {
    if (!this.hitboxMesh || !this.debugMode) return;

    const hitboxSize = this.isSliding
      ? this.hitbox.sliding
      : this.hitbox.standing;
    this.hitboxMesh.scale.set(
      hitboxSize.width,
      hitboxSize.height,
      hitboxSize.depth
    );

    // Position the hitbox at player position with y offset for sliding
    const yOffset = this.isSliding ? -0.45 : 0;
    this.hitboxMesh.position.set(
      this.position.x,
      this.position.y + yOffset + hitboxSize.height / 2,
      this.position.z
    );
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

      // Hide powerup indicator
      if (this.powerupRing && this.powerupLight) {
        this.powerupRing.material.opacity = 0;
        this.powerupLight.intensity = 0;
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

    // Show visual indicator that powerup is available
    if (this.powerupRing && this.powerupLight) {
      // Set color based on powerup type
      let color;
      switch (powerupType) {
        case "shield":
          color = 0x00aaff; // Blue
          break;
        case "magnet":
          color = 0xff00ff; // Magenta
          break;
        case "speed":
          color = 0xffaa00; // Orange
          break;
        default:
          color = 0xffff00; // Yellow (default)
      }

      // Apply color to indicator
      this.powerupRing.material.color.set(color);
      this.powerupLight.color.set(color);

      // Show indicator
      this.powerupRing.material.opacity = 0.7;
      this.powerupLight.intensity = 1.0;

      // Create collection effect animation
      const animatePowerupCollection = () => {
        this.powerupRing.scale.set(
          1 + Math.sin(Date.now() * 0.005) * 0.1,
          1 + Math.sin(Date.now() * 0.005) * 0.1,
          1
        );

        requestAnimationFrame(animatePowerupCollection);
      };

      animatePowerupCollection();
    }

    // Return true to confirm collection
    return true;
  }

  createCollectionEffect(position) {
    // Create particle system for crystal collection effect
    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    // Initialize particle positions at collision point
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = position.x;
      positions[i3 + 1] = position.y;
      positions[i3 + 2] = position.z;

      sizes[i] = 0.1 + Math.random() * 0.2;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    // Create shader material for better particles
    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(0x00ffff) },
        pointTexture: { value: this.createParticleTexture() },
      },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = vec3(0.0, 1.0, 1.0);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(color * vColor, 1.0);
          gl_FragColor = gl_FragColor * texture2D(pointTexture, gl_PointCoord);
          if (gl_FragColor.a < 0.1) discard;
        }
      `,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      transparent: true,
    });

    // Create the particle system
    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);

    // Animate particles expanding outward
    const velocities = [];
    for (let i = 0; i < particleCount; i++) {
      // Random velocity in all directions
      const speed = 0.05 + Math.random() * 0.1;
      const angle = Math.random() * Math.PI * 2;
      const angle2 = Math.random() * Math.PI * 2;

      velocities.push({
        x: Math.sin(angle) * Math.cos(angle2) * speed,
        y: Math.sin(angle) * Math.sin(angle2) * speed,
        z: Math.cos(angle) * speed,
      });
    }

    // Add light flash
    const flash = new THREE.PointLight(0x00ffff, 2, 10);
    flash.position.copy(position);
    this.scene.add(flash);

    // Animation function
    let frameCount = 0;
    const animateParticles = () => {
      frameCount++;

      const positions = particles.geometry.attributes.position.array;
      const sizes = particles.geometry.attributes.size.array;

      // Update particle positions and sizes
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;

        // Move particles
        positions[i3] += velocities[i].x;
        positions[i3 + 1] += velocities[i].y;
        positions[i3 + 2] += velocities[i].z;

        // Gradually reduce particle size
        sizes[i] *= 0.97;
      }

      // Reduce flash intensity
      flash.intensity *= 0.9;

      // Update geometry attributes
      particles.geometry.attributes.position.needsUpdate = true;
      particles.geometry.attributes.size.needsUpdate = true;

      // Continue animation for 30 frames
      if (frameCount < 30) {
        requestAnimationFrame(animateParticles);
      } else {
        // Clean up
        this.scene.remove(particles);
        this.scene.remove(flash);
        geometry.dispose();
        material.dispose();
      }
    };

    // Start animation
    requestAnimationFrame(animateParticles);
  }

  // Create particle texture for better-looking particles
  createParticleTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;

    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      0,
      canvas.width / 2,
      canvas.height / 2,
      canvas.width / 2
    );

    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.1, "rgba(200,255,255,0.8)");
    gradient.addColorStop(0.5, "rgba(50,200,255,0.3)");
    gradient.addColorStop(1, "rgba(0,100,200,0)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
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
    this.health = 3; // Reset health to maximum
    this.canBeHit = true;

    // Reset animation states
    this.animationState = {
      running: true,
      jumping: false,
      sliding: false,
      stumbling: false,
      recovering: false,
      current: "running",
      transitionTime: 0,
      transitionDuration: 0.3,
    };

    // Reset animation cycles
    this.runCycle = 0;
    this.jumpCycle = 0;
    this.slideCycle = 0;
    this.deathCycle = 0;

    // Reset mesh positions and rotations
    if (this.mesh) {
      this.mesh.position.set(0, 0, 0);
      this.mesh.rotation.set(0, 0, 0);

      // Reset any visual effects
      if (this.shield) {
        this.shield.visible = false;
      }

      if (this.shieldPattern) {
        this.shieldPattern.visible = false;
      }

      // Reset limb positions
      if (this.limbs.torso) {
        this.limbs.torso.position.y = 0.8;
        this.limbs.torso.position.z = 0;
        this.limbs.torso.rotation.x = 0;
        this.limbs.torso.rotation.z = 0;
      }

      if (this.limbs.leftArm && this.limbs.rightArm) {
        this.limbs.leftArm.rotation.x = 0;
        this.limbs.leftArm.rotation.z = -Math.PI / 8;
        this.limbs.rightArm.rotation.x = 0;
        this.limbs.rightArm.rotation.z = Math.PI / 8;
        this.limbs.leftArm.position.z = 0;
        this.limbs.rightArm.position.z = 0;
      }

      if (this.limbs.leftLeg && this.limbs.rightLeg) {
        this.limbs.leftLeg.rotation.x = 0;
        this.limbs.leftLeg.rotation.z = 0;
        this.limbs.rightLeg.rotation.x = 0;
        this.limbs.rightLeg.rotation.z = 0;
      }
    }

    // Reset shield status
    this.shieldActive = false;
    this.shieldTimer = 0;

    // Reset powerup status
    this.activePowerup = null;

    // Reset powerup indicator if exists
    if (this.powerupRing && this.powerupLight) {
      this.powerupRing.material.opacity = 0;
      this.powerupLight.intensity = 0;
    }

    // Start running animation
    this.playRunAnimation();

    console.log("Player reset complete");
  }
}

module.exports = { Player };
