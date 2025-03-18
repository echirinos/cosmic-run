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
    this.helmet = helmet;

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
    // Arms
    const armMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.6,
      emissive: 0x222222,
      emissiveIntensity: 0.1,
    });

    // Left arm
    this.leftArm = new THREE.Group();

    const leftUpperArmGeometry = new THREE.CapsuleGeometry(0.15, 0.5, 8, 8);
    const leftUpperArm = new THREE.Mesh(leftUpperArmGeometry, armMaterial);
    leftUpperArm.position.y = -0.25;
    leftUpperArm.castShadow = true;
    this.leftArm.add(leftUpperArm);

    const leftLowerArmGeometry = new THREE.CapsuleGeometry(0.12, 0.5, 8, 8);
    const leftLowerArm = new THREE.Mesh(leftLowerArmGeometry, armMaterial);
    leftLowerArm.position.y = -0.8;
    leftLowerArm.castShadow = true;
    this.leftArm.add(leftLowerArm);

    // Position the whole arm
    this.leftArm.position.set(-0.5, 1.3, 0);
    astronaut.add(this.leftArm);

    // Right arm (mirror of left)
    this.rightArm = new THREE.Group();

    const rightUpperArmGeometry = new THREE.CapsuleGeometry(0.15, 0.5, 8, 8);
    const rightUpperArm = new THREE.Mesh(rightUpperArmGeometry, armMaterial);
    rightUpperArm.position.y = -0.25;
    rightUpperArm.castShadow = true;
    this.rightArm.add(rightUpperArm);

    const rightLowerArmGeometry = new THREE.CapsuleGeometry(0.12, 0.5, 8, 8);
    const rightLowerArm = new THREE.Mesh(rightLowerArmGeometry, armMaterial);
    rightLowerArm.position.y = -0.8;
    rightLowerArm.castShadow = true;
    this.rightArm.add(rightLowerArm);

    // Position the whole arm
    this.rightArm.position.set(0.5, 1.3, 0);
    astronaut.add(this.rightArm);

    // Legs
    // Left leg
    this.leftLeg = new THREE.Group();

    const leftUpperLegGeometry = new THREE.CapsuleGeometry(0.18, 0.6, 8, 8);
    const leftUpperLeg = new THREE.Mesh(leftUpperLegGeometry, armMaterial);
    leftUpperLeg.position.y = -0.3;
    leftUpperLeg.castShadow = true;
    this.leftLeg.add(leftUpperLeg);

    const leftLowerLegGeometry = new THREE.CapsuleGeometry(0.15, 0.6, 8, 8);
    const leftLowerLeg = new THREE.Mesh(leftLowerLegGeometry, armMaterial);
    leftLowerLeg.position.y = -0.9;
    leftLowerLeg.castShadow = true;
    this.leftLeg.add(leftLowerLeg);

    // Left foot
    const leftFootGeometry = new THREE.BoxGeometry(0.2, 0.1, 0.3);
    const leftFoot = new THREE.Mesh(leftFootGeometry, armMaterial);
    leftFoot.position.set(0, -1.3, 0.05);
    leftFoot.castShadow = true;
    this.leftLeg.add(leftFoot);

    // Position the whole leg
    this.leftLeg.position.set(-0.2, 0.3, 0);
    astronaut.add(this.leftLeg);

    // Right leg (mirror of left)
    this.rightLeg = new THREE.Group();

    const rightUpperLegGeometry = new THREE.CapsuleGeometry(0.18, 0.6, 8, 8);
    const rightUpperLeg = new THREE.Mesh(rightUpperLegGeometry, armMaterial);
    rightUpperLeg.position.y = -0.3;
    rightUpperLeg.castShadow = true;
    this.rightLeg.add(rightUpperLeg);

    const rightLowerLegGeometry = new THREE.CapsuleGeometry(0.15, 0.6, 8, 8);
    const rightLowerLeg = new THREE.Mesh(rightLowerLegGeometry, armMaterial);
    rightLowerLeg.position.y = -0.9;
    rightLowerLeg.castShadow = true;
    this.rightLeg.add(rightLowerLeg);

    // Right foot
    const rightFootGeometry = new THREE.BoxGeometry(0.2, 0.1, 0.3);
    const rightFoot = new THREE.Mesh(rightFootGeometry, armMaterial);
    rightFoot.position.set(0, -1.3, 0.05);
    rightFoot.castShadow = true;
    this.rightLeg.add(rightFoot);

    // Position the whole leg
    this.rightLeg.position.set(0.2, 0.3, 0);
    astronaut.add(this.rightLeg);
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
    if (
      !this.isJumping &&
      !this.isDead &&
      !this.isSliding &&
      !this.animationState.stumbling
    ) {
      console.log("Player jumping!");
      this.isJumping = true;

      // Increased jump force for more satisfying jumps
      this.velocity.y = this.jumpForce * 1.2;

      this.animationState.jumping = true;
      this.isRunning = false;

      // Play jump sound if available
      if (window.sound && window.sound.jump) {
        window.sound.jump.play();
      }

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
      this.isRunning = false;
      this.playSlideAnimation();

      // Auto recover from slide after a delay
      setTimeout(() => {
        if (this.isSliding) {
          this.isSliding = false;
          this.animationState.sliding = false;
          this.isRunning = true;
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
      this.isRunning = false;

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
            this.isRunning = true;
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
    this.shield.visible = true;
    this.shieldPattern.visible = true;
    this.shieldTimer = Date.now();

    // Add shield activation effect
    const createShieldActivation = () => {
      // Create expanding ring effect
      const ringGeometry = new THREE.RingGeometry(0.1, 0.2, 32);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      });

      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.y = 0.8;
      ring.rotation.x = Math.PI / 2;
      this.mesh.add(ring);

      // Animation
      let scale = 1;
      const animateRing = () => {
        scale += 0.2;
        ring.scale.set(scale, scale, scale);
        ringMaterial.opacity -= 0.04;

        if (ringMaterial.opacity > 0) {
          requestAnimationFrame(animateRing);
        } else {
          this.mesh.remove(ring);
          ringGeometry.dispose();
          ringMaterial.dispose();
        }
      };

      animateRing();
    };

    createShieldActivation();
  }

  deactivateShield() {
    this.shieldActive = false;
    this.shield.visible = false;
    this.shieldPattern.visible = false;

    // Create shield deactivation effect
    const createDeactivationEffect = () => {
      // Particles flying outward
      const particleCount = 20;
      const particleGeometry = new THREE.BufferGeometry();
      const particlePositions = new Float32Array(particleCount * 3);
      const particleSizes = new Float32Array(particleCount);

      // Initialize at shield position
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const phi = Math.random() * Math.PI * 2;
        const theta = Math.random() * Math.PI;

        particlePositions[i3] = Math.sin(theta) * Math.cos(phi) * 1.2;
        particlePositions[i3 + 1] = Math.sin(theta) * Math.sin(phi) * 1.2 + 0.8;
        particlePositions[i3 + 2] = Math.cos(theta) * 1.2;

        particleSizes[i] = 0.1 + Math.random() * 0.1;
      }

      particleGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(particlePositions, 3)
      );
      particleGeometry.setAttribute(
        "size",
        new THREE.BufferAttribute(particleSizes, 1)
      );

      const particleMaterial = new THREE.PointsMaterial({
        color: 0x00aaff,
        size: 0.2,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
      });

      const particles = new THREE.Points(particleGeometry, particleMaterial);
      this.mesh.add(particles);

      // Animation velocities
      const velocities = [];
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const pos = new THREE.Vector3(
          particlePositions[i3],
          particlePositions[i3 + 1],
          particlePositions[i3 + 2]
        );
        const vel = pos.clone().normalize().multiplyScalar(0.1);
        velocities.push(vel);
      }

      // Animation
      const animateParticles = () => {
        const positions = particleGeometry.attributes.position.array;

        for (let i = 0; i < particleCount; i++) {
          const i3 = i * 3;
          positions[i3] += velocities[i].x;
          positions[i3 + 1] += velocities[i].y;
          positions[i3 + 2] += velocities[i].z;
        }

        particleGeometry.attributes.position.needsUpdate = true;
        particleMaterial.opacity -= 0.02;

        if (particleMaterial.opacity > 0) {
          requestAnimationFrame(animateParticles);
        } else {
          this.mesh.remove(particles);
          particleGeometry.dispose();
          particleMaterial.dispose();
        }
      };

      animateParticles();
    };

    createDeactivationEffect();
  }

  die() {
    if (!this.isDead) {
      this.isDead = true;
      this.isRunning = false;
      this.animationState.jumping = false;
      this.animationState.sliding = false;
      this.animationState.stumbling = false;

      this.playDeathAnimation();
    }
  }

  playRunAnimation() {
    if (!this.isRunning) {
      return;
    }

    // Use a sine wave for the running cycle
    const time = performance.now() * 0.005;
    const runningCycle = Math.sin(time * 2);

    // Calculate leg angles - different handling for forward and backward swings
    // Forward swings (when sine is positive) - full range
    // Backward swings (when sine is negative) - limited range to prevent map clipping
    const leftLegAngle =
      runningCycle > 0
        ? (runningCycle * Math.PI) / 4 // Full forward swing
        : (runningCycle * Math.PI) / 8; // Reduced backward swing

    const rightLegAngle = -leftLegAngle; // Opposite movement for right leg

    // Apply different leg movements for left and right
    if (this.leftLeg) {
      this.leftLeg.rotation.x = leftLegAngle;

      // Add a slight lift when leg moves backward to prevent clipping
      if (runningCycle < 0) {
        this.leftLeg.position.y = 0.15 - runningCycle * 0.1; // Lift more as leg goes backward
      } else {
        this.leftLeg.position.y = 0.15; // Normal position
      }
    }

    if (this.rightLeg) {
      this.rightLeg.rotation.x = rightLegAngle;

      // Add a slight lift when leg moves backward to prevent clipping
      if (runningCycle > 0) {
        this.rightLeg.position.y = 0.15 + runningCycle * 0.1; // Lift more as leg goes backward
      } else {
        this.rightLeg.position.y = 0.15; // Normal position
      }
    }

    // Synchronize arm movement with opposite leg
    if (this.leftArm) {
      this.leftArm.rotation.x = rightLegAngle * 0.7; // Less extreme than legs
    }

    if (this.rightArm) {
      this.rightArm.rotation.x = leftLegAngle * 0.7; // Less extreme than legs
    }

    // Add subtle body bob
    if (this.body) {
      this.body.position.y = 0.6 + Math.abs(runningCycle) * 0.08;
    }
  }

  playJumpAnimation() {
    if (this.runAnimationId) {
      cancelAnimationFrame(this.runAnimationId);
      this.runAnimationId = null;
    }

    // Starting position
    this.leftLeg.rotation.x = -0.3;
    this.rightLeg.rotation.x = -0.3;
    this.leftArm.rotation.x = -0.7;
    this.rightArm.rotation.x = -0.7;

    const jumpDuration = 700; // ms
    const startTime = Date.now();

    const animateJump = () => {
      if (!this.animationState.jumping) return;

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / jumpDuration, 1);

      // Mid-jump pose transitions
      if (progress < 0.5) {
        // Initial phase - legs tucking, arms out
        const phase1Progress = progress / 0.5;
        this.leftLeg.rotation.x = THREE.MathUtils.lerp(
          -0.3,
          -1.0,
          phase1Progress
        );
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(
          -0.3,
          -1.0,
          phase1Progress
        );
        this.leftArm.rotation.x = THREE.MathUtils.lerp(
          -0.7,
          -1.2,
          phase1Progress
        );
        this.rightArm.rotation.x = THREE.MathUtils.lerp(
          -0.7,
          -1.2,
          phase1Progress
        );
      } else {
        // Landing phase - legs extending, arms balancing
        const phase2Progress = (progress - 0.5) / 0.5;
        this.leftLeg.rotation.x = THREE.MathUtils.lerp(-1.0, 0, phase2Progress);
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(
          -1.0,
          0,
          phase2Progress
        );
        this.leftArm.rotation.x = THREE.MathUtils.lerp(
          -1.2,
          -0.3,
          phase2Progress
        );
        this.rightArm.rotation.x = THREE.MathUtils.lerp(
          -1.2,
          -0.3,
          phase2Progress
        );
      }

      // Continue animation until complete
      if (progress < 1) {
        requestAnimationFrame(animateJump);
      } else {
        // End of jump animation, return to running if grounded
        if (!this.isJumping && !this.isSliding && !this.isDead) {
          this.isRunning = true;
          this.animationState.jumping = false;
          this.playRunAnimation();
        }
      }
    };

    requestAnimationFrame(animateJump);
  }

  playSlideAnimation() {
    if (this.runAnimationId) {
      cancelAnimationFrame(this.runAnimationId);
      this.runAnimationId = null;
    }

    const slideDuration = 800; // ms
    const startTime = Date.now();

    const animateSlide = () => {
      if (!this.animationState.sliding) return;

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / slideDuration, 1);

      // Slide position - lean forward, arms out, legs back
      if (progress < 0.2) {
        // Transition into slide
        const phase1Progress = progress / 0.2;
        this.mesh.rotation.x = THREE.MathUtils.lerp(
          0,
          Math.PI / 6,
          phase1Progress
        );
        this.body.scale.y = THREE.MathUtils.lerp(1, 0.5, phase1Progress);
        this.body.position.y = THREE.MathUtils.lerp(0.8, 0.4, phase1Progress);
        this.helmet.position.y = THREE.MathUtils.lerp(1.7, 1.1, phase1Progress);
      } else if (progress > 0.8) {
        // Transition out of slide
        const phase3Progress = (progress - 0.8) / 0.2;
        this.mesh.rotation.x = THREE.MathUtils.lerp(
          Math.PI / 6,
          0,
          phase3Progress
        );
        this.body.scale.y = THREE.MathUtils.lerp(0.5, 1, phase3Progress);
        this.body.position.y = THREE.MathUtils.lerp(0.4, 0.8, phase3Progress);
        this.helmet.position.y = THREE.MathUtils.lerp(1.1, 1.7, phase3Progress);
      }

      // Arm position during slide
      this.leftArm.rotation.x = -Math.PI / 4;
      this.rightArm.rotation.x = -Math.PI / 4;

      // Legs extended backward
      this.leftLeg.rotation.x = Math.PI / 6;
      this.rightLeg.rotation.x = Math.PI / 6;

      // Continue animation until complete
      if (progress < 1) {
        requestAnimationFrame(animateSlide);
      } else {
        // End of slide animation
        this.isSliding = false;
        this.animationState.sliding = false;

        // Reset positions
        this.mesh.rotation.x = 0;
        this.body.scale.y = 1;
        this.body.position.y = 0.8;
        this.helmet.position.y = 1.7;

        // Return to running if not dead
        if (!this.isDead) {
          this.isRunning = true;
          this.playRunAnimation();
        }
      }
    };

    requestAnimationFrame(animateSlide);
  }

  playStumbleAnimation() {
    // Clear running animation if it's active
    if (this.runAnimationId) {
      cancelAnimationFrame(this.runAnimationId);
      this.runAnimationId = null;
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
        this.runAnimationId = requestAnimationFrame(animateStumble);
      } else {
        // End of stumble animation
        this.body.rotation.x = 0;
      }
    };

    this.runAnimationId = requestAnimationFrame(animateStumble);
  }

  playDeathAnimation() {
    // Clear any existing animations
    if (this.runAnimationId) cancelAnimationFrame(this.runAnimationId);

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
    // Normalize delta for consistent movement
    const normalizedDelta = delta * 60; // Normalize to 60fps

    // Debug output for physics state
    if (this.isJumping) {
      console.log(
        `Jumping - Height: ${this.position.y.toFixed(
          2
        )}, Velocity: ${this.velocity.y.toFixed(2)}`
      );
    }

    // Check shield timer
    if (
      this.shieldActive &&
      Date.now() - this.shieldTimer > this.shieldDuration
    ) {
      this.deactivateShield();
    }

    // Handle jumping physics
    if (this.isJumping) {
      this.position.y += this.velocity.y * normalizedDelta;
      this.velocity.y -= this.gravity * normalizedDelta;

      // Check if landed
      if (this.position.y <= 0) {
        this.position.y = 0;
        this.velocity.y = 0;
        this.isJumping = false;
        console.log("Player landed");

        // Resume running if not doing something else
        if (!this.isSliding && !this.animationState.stumbling && !this.isDead) {
          this.isRunning = true;
          this.animationState.jumping = false;
          this.playRunAnimation();
        }
      }
    }

    // Handle lane changes (left/right movement)
    const targetX = this.targetLane * this.laneWidth;

    // Improved lane change speed - faster response time
    const laneChangeSpeed = 8 * normalizedDelta; // Increased speed
    const laneChangeDelta =
      (targetX - this.position.x) * laneChangeSpeed * 0.01;

    // Log lane change movement
    if (Math.abs(this.position.x - targetX) > 0.01) {
      console.log(
        `Lane change - Current: ${this.position.x.toFixed(
          2
        )}, Target: ${targetX.toFixed(2)}`
      );
      // Move towards target lane with easing
      this.position.x += laneChangeDelta;
    } else {
      // Snap to exact lane position when close enough
      this.position.x = targetX;
      this.currentLane = this.targetLane;
    }

    // Move forward (if not dead)
    if (!this.isDead) {
      const forwardStep = this.speed * normalizedDelta;
      this.position.z += forwardStep;
    }

    // Update mesh position
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);

    // Start running animation if not already running and should be
    if (this.isRunning && !this.runAnimationId && !this.isDead) {
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
    this.isRunning = true;
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
    this.helmet.position.y = 1.7;
    this.leftLeg.rotation.set(0, 0, 0);
    this.rightLeg.rotation.set(0, 0, 0);
    this.leftArm.rotation.set(0, 0, 0);
    this.rightArm.rotation.set(0, 0, 0);

    // Reset powerup indicator
    if (this.powerupRing && this.powerupLight) {
      this.powerupRing.material.opacity = 0;
      this.powerupLight.intensity = 0;
      this.activePowerup = null;
    }

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
}

module.exports = { Player };
