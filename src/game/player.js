const THREE = require("three");

class Player {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    // Player state
    this.position = { x: 0, y: 0, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.state = "running"; // running, jumping, sliding, stumbling, dead

    // Movement parameters
    this.lanes = [-2, 0, 2]; // Left, center, right
    this.currentLane = 1; // Start in center lane
    this.targetLanePosition = this.lanes[this.currentLane];
    this.laneChangeSpeed = 8; // Increased for more responsive movement

    // Physics parameters
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.gravity = -25;
    this.jumpForce = 12;
    this.isGrounded = true;

    // Animation parameters
    this.runningCycle = 0;
    this.runningSpeed = 10;
    this.leanAngle = 0;
    this.maxLeanAngle = Math.PI / 6;
    this.leanSpeed = 8;
    this.bobHeight = 0.1;
    this.bobSpeed = 8;

    // Jump parameters
    this.jumpHeight = 2;
    this.jumpDuration = 0.6;
    this.jumpTime = 0;
    this.isJumping = false;
    this.jumpStartY = 0;

    // Slide parameters
    this.slideHeight = 0.5;
    this.originalHeight = 1;
    this.slideDuration = 0.8;
    this.slideTime = 0;
    this.isSliding = false;

    // Stumble parameters
    this.isStumbling = false;
    this.stumbleTime = 0;
    this.stumbleDuration = 0.5;
    this.stumbleRotation = 0;
    this.maxStumbleRotation = Math.PI / 4;

    // Power-up states
    this.hasShield = false;
    this.hasMagnet = false;
    this.hasSpeedBoost = false;
    this.isInvincibleState = false;

    // Power-up timers
    this.magnetTimer = null;
    this.speedBoostTimer = null;
    this.invincibilityTimer = null;

    // Camera shake parameters
    this.cameraShake = {
      intensity: 0,
      decay: 0.9,
      maxOffset: 0.2,
      trauma: 0,
    };

    // Create player mesh
    this.createPlayerMesh();

    // Initialize animation mixer
    this.mixer = null;
    this.actions = {};
    this.setupAnimations();
  }

  createPlayerMesh() {
    // Create player container
    this.playerContainer = new THREE.Group();
    this.scene.add(this.playerContainer);

    // Create astronaut body
    const bodyGeometry = new THREE.CapsuleGeometry(0.5, 1, 8, 16);
    const bodyMaterial = new THREE.MeshPhongMaterial({
      color: 0x00ffff,
      specular: 0x111111,
      shininess: 30,
      envMap: this.scene.background,
      reflectivity: 0.2,
    });
    this.playerBody = new THREE.Mesh(bodyGeometry, bodyMaterial);
    this.playerBody.position.y = 1;
    this.playerBody.castShadow = true;
    this.playerContainer.add(this.playerBody);

    // Create astronaut helmet (glass dome)
    const helmetGeometry = new THREE.SphereGeometry(0.55, 32, 32);
    const helmetMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      metalness: 1,
      roughness: 0,
      envMap: this.scene.background,
      refractionRatio: 0.98,
      clearcoat: 1,
      clearcoatRoughness: 0,
    });
    this.playerHelmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
    this.playerHelmet.position.y = 1.75;
    this.playerContainer.add(this.playerHelmet);

    // Create helmet visor
    const visorGeometry = new THREE.SphereGeometry(
      0.54,
      32,
      32,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2
    );
    const visorMaterial = new THREE.MeshPhongMaterial({
      color: 0x000000,
      specular: 0x666666,
      shininess: 90,
      envMap: this.scene.background,
      reflectivity: 0.8,
    });
    this.playerVisor = new THREE.Mesh(visorGeometry, visorMaterial);
    this.playerVisor.position.set(0, 1.75, 0.1);
    this.playerVisor.rotation.x = Math.PI / 2;
    this.playerContainer.add(this.playerVisor);

    // Create backpack with more detail
    const backpackGroup = new THREE.Group();

    // Main backpack body
    const backpackGeometry = new THREE.BoxGeometry(0.7, 0.9, 0.4);
    const backpackMaterial = new THREE.MeshPhongMaterial({
      color: 0x999999,
      specular: 0x333333,
      shininess: 30,
    });
    const backpack = new THREE.Mesh(backpackGeometry, backpackMaterial);
    backpackGroup.add(backpack);

    // Backpack details (tubes and connectors)
    const tubeGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8);
    const tubeMaterial = new THREE.MeshPhongMaterial({
      color: 0x666666,
      specular: 0x222222,
      shininess: 30,
    });

    // Add tubes on sides
    for (let i = -1; i <= 1; i += 2) {
      const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
      tube.position.set(i * 0.3, 0, 0.1);
      backpackGroup.add(tube);
    }

    backpackGroup.position.set(0, 1, -0.4);
    this.playerContainer.add(backpackGroup);

    // Create arms with better joints
    this.createLimb("left", 0.65, 1.1, 0);
    this.createLimb("right", -0.65, 1.1, 0);

    // Create legs with better joints
    this.createLimb("leftLeg", 0.25, 0.4, 0);
    this.createLimb("rightLeg", -0.25, 0.4, 0);

    // Create shield effect
    this.createShieldEffect();

    // Create trail effect
    this.createTrailEffect();

    // Set initial position
    this.playerContainer.position.set(
      this.lanes[this.currentLane],
      this.position.y,
      this.position.z
    );
  }

  createLimb(side, x, y, z) {
    const group = new THREE.Group();

    // Upper part (arm/thigh)
    const upperGeometry = new THREE.CapsuleGeometry(0.15, 0.4, 8, 8);
    const lowerGeometry = new THREE.CapsuleGeometry(0.12, 0.4, 8, 8);
    const material = new THREE.MeshPhongMaterial({
      color: 0x00ffff,
      specular: 0x111111,
      shininess: 30,
    });

    const upper = new THREE.Mesh(upperGeometry, material);
    const lower = new THREE.Mesh(lowerGeometry, material);

    // Position lower part
    lower.position.y = -0.4;

    // Create joint
    const joint = new THREE.Group();
    joint.add(upper);
    joint.add(lower);

    group.add(joint);
    group.position.set(x, y, z);

    // Store reference
    this[side] = group;
    this[`${side}Joint`] = joint;

    this.playerContainer.add(group);
  }

  createShieldEffect() {
    const shieldGeometry = new THREE.SphereGeometry(1.2, 32, 32);
    const shieldMaterial = new THREE.MeshPhongMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    this.shield = new THREE.Mesh(shieldGeometry, shieldMaterial);
    this.shield.position.y = 1;
    this.shield.visible = false;

    // Add shield glow
    const glowGeometry = new THREE.SphereGeometry(1.3, 32, 32);
    const glowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(0x00ffff) },
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color;
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.7 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);
          intensity = intensity * (0.5 + 0.5 * sin(time * 2.0));
          gl_FragColor = vec4(color, intensity * 0.5);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });

    this.shieldGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    this.shieldGlow.visible = false;
    this.shield.add(this.shieldGlow);

    this.playerContainer.add(this.shield);
  }

  createTrailEffect() {
    this.trailEffect = new THREE.Group();

    const trailMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
    });

    // Create multiple trail segments
    for (let i = 0; i < 8; i++) {
      const trailGeometry = new THREE.CapsuleGeometry(
        0.5 - i * 0.06,
        1 - i * 0.1,
        8,
        8
      );
      const trailPart = new THREE.Mesh(trailGeometry, trailMaterial.clone());
      trailPart.position.set(0, 1, i * 0.4);
      trailPart.material.opacity = 0.5 - i * 0.06;
      this.trailEffect.add(trailPart);
    }

    this.trailEffect.visible = false;
    this.playerContainer.add(this.trailEffect);
  }

  update(delta) {
    // Update physics
    this.updatePhysics(delta);

    // Update animations
    this.updateAnimations(delta);

    // Update effects
    this.updateEffects(delta);

    // Update camera shake
    this.updateCameraShake(delta);

    // Update position and rotation properties
    this.updateTransform();
  }

  updatePhysics(delta) {
    // Apply gravity if not grounded
    if (!this.isGrounded && !this.isSliding) {
      this.velocity.y += this.gravity * delta;
      this.playerContainer.position.y += this.velocity.y * delta;

      // Check for ground collision
      if (this.playerContainer.position.y <= 0) {
        this.playerContainer.position.y = 0;
        this.velocity.y = 0;
        this.isGrounded = true;
        this.isJumping = false;
        this.state = "running";
      }
    }

    // Handle lane changes
    if (this.playerContainer.position.x !== this.targetLanePosition) {
      const direction =
        this.targetLanePosition > this.playerContainer.position.x ? 1 : -1;
      const movement = direction * this.laneChangeSpeed * delta;

      // Calculate new position
      const newX = this.playerContainer.position.x + movement;
      const passedTarget =
        direction === 1
          ? newX > this.targetLanePosition
          : newX < this.targetLanePosition;

      // Set position and handle overshoot
      this.playerContainer.position.x = passedTarget
        ? this.targetLanePosition
        : newX;

      // Calculate lean angle
      this.leanAngle = THREE.MathUtils.lerp(
        this.leanAngle,
        -direction * this.maxLeanAngle,
        this.leanSpeed * delta
      );
    } else {
      // Return to upright when in lane
      this.leanAngle = THREE.MathUtils.lerp(
        this.leanAngle,
        0,
        this.leanSpeed * delta
      );
    }

    // Apply lean angle
    this.playerContainer.rotation.z = this.leanAngle;
  }

  updateAnimations(delta) {
    // Update running cycle
    this.runningCycle += delta * this.runningSpeed;

    if (this.state === "running") {
      // Leg animations
      this.leftLegJoint.rotation.x = Math.sin(this.runningCycle) * 0.5;
      this.rightLegJoint.rotation.x =
        Math.sin(this.runningCycle + Math.PI) * 0.5;

      // Arm animations
      this.leftJoint.rotation.x = Math.sin(this.runningCycle + Math.PI) * 0.3;
      this.rightJoint.rotation.x = Math.sin(this.runningCycle) * 0.3;

      // Add bobbing motion
      this.playerContainer.position.y =
        Math.sin(this.runningCycle * 2) * this.bobHeight;
    } else if (this.state === "jumping") {
      // Jump animation
      this.jumpTime += delta;
      const jumpProgress = this.jumpTime / this.jumpDuration;

      if (jumpProgress <= 1) {
        // Anticipation phase
        if (jumpProgress < 0.2) {
          this.playerContainer.rotation.x = jumpProgress * -0.2;
        }
        // Rise phase
        else if (jumpProgress < 0.6) {
          this.playerContainer.rotation.x = THREE.MathUtils.lerp(
            -0.2,
            0.3,
            (jumpProgress - 0.2) / 0.4
          );
        }
        // Fall phase
        else {
          this.playerContainer.rotation.x = THREE.MathUtils.lerp(
            0.3,
            0,
            (jumpProgress - 0.6) / 0.4
          );
        }
      }
    } else if (this.state === "sliding") {
      // Slide animation
      this.slideTime += delta;
      const slideProgress = this.slideTime / this.slideDuration;

      if (slideProgress <= 1) {
        // Scale player height for sliding effect
        const scale = THREE.MathUtils.lerp(
          1,
          0.5,
          Math.min(1, slideProgress * 2)
        );

        this.playerBody.scale.y = scale;
        this.playerBody.position.y = 0.5 + scale * 0.5;
        this.playerHelmet.position.y = 1.25 + scale * 0.5;
        this.playerVisor.position.y = 1.25 + scale * 0.5;
      } else {
        // End slide
        this.isSliding = false;
        this.state = "running";

        // Reset dimensions
        this.playerBody.scale.y = 1;
        this.playerBody.position.y = 1;
        this.playerHelmet.position.y = 1.75;
        this.playerVisor.position.y = 1.75;
      }
    } else if (this.state === "stumbling") {
      // Stumble animation
      this.stumbleTime += delta;
      const stumbleProgress = this.stumbleTime / this.stumbleDuration;

      if (stumbleProgress <= 1) {
        // Rotate player during stumble
        this.stumbleRotation =
          Math.sin(stumbleProgress * Math.PI * 2) * this.maxStumbleRotation;
        this.playerContainer.rotation.z = this.stumbleRotation;
      } else {
        // End stumble
        this.isStumbling = false;
        this.state = "running";
        this.playerContainer.rotation.z = 0;
      }
    }
  }

  updateEffects(delta) {
    // Update shield effect
    if (this.hasShield) {
      this.shield.visible = true;
      this.shieldGlow.visible = true;
      this.shieldGlow.material.uniforms.time.value += delta;
    } else {
      this.shield.visible = false;
      this.shieldGlow.visible = false;
    }

    // Update trail effect
    if (this.hasSpeedBoost) {
      this.trailEffect.visible = true;
      this.trailEffect.children.forEach((part, index) => {
        part.position.z =
          index * 0.4 + Math.sin(Date.now() * 0.01 + index) * 0.1;
        part.material.opacity =
          (0.5 - index * 0.06) *
          (0.8 + Math.sin(Date.now() * 0.01 + index) * 0.2);
      });
    } else {
      this.trailEffect.visible = false;
    }

    // Update invincibility effect
    if (this.isInvincibleState) {
      const flash = Math.sin(Date.now() * 0.01) * 0.5 + 0.5;
      this.playerBody.material.emissive.setHex(0x00ffff);
      this.playerBody.material.emissiveIntensity = flash;
    } else {
      this.playerBody.material.emissiveIntensity = 0;
    }
  }

  updateCameraShake(delta) {
    if (this.cameraShake.trauma > 0) {
      const shake = this.cameraShake.trauma * this.cameraShake.trauma;
      const offsetX =
        shake * this.cameraShake.maxOffset * (Math.random() * 2 - 1);
      const offsetY =
        shake * this.cameraShake.maxOffset * (Math.random() * 2 - 1);

      this.camera.position.x += offsetX;
      this.camera.position.y += offsetY;

      this.cameraShake.trauma *= this.cameraShake.decay;
      if (this.cameraShake.trauma < 0.01) {
        this.cameraShake.trauma = 0;
      }
    }
  }

  updateTransform() {
    this.position = {
      x: this.playerContainer.position.x,
      y: this.playerContainer.position.y,
      z: this.playerContainer.position.z,
    };

    this.rotation = {
      x: this.playerContainer.rotation.x,
      y: this.playerContainer.rotation.y,
      z: this.playerContainer.rotation.z,
    };
  }

  moveLeft() {
    if (this.currentLane > 0 && !this.isStumbling) {
      this.currentLane--;
      this.targetLanePosition = this.lanes[this.currentLane];
    }
  }

  moveRight() {
    if (this.currentLane < this.lanes.length - 1 && !this.isStumbling) {
      this.currentLane++;
      this.targetLanePosition = this.lanes[this.currentLane];
    }
  }

  jump() {
    if (this.isGrounded && !this.isSliding && !this.isStumbling) {
      this.isJumping = true;
      this.isGrounded = false;
      this.jumpTime = 0;
      this.state = "jumping";
      this.velocity.y = this.jumpForce;
      this.jumpStartY = this.playerContainer.position.y;
    }
  }

  slide() {
    if (!this.isJumping && !this.isSliding && !this.isStumbling) {
      this.isSliding = true;
      this.slideTime = 0;
      this.state = "sliding";
    }
  }

  stumble() {
    if (!this.isStumbling) {
      this.isStumbling = true;
      this.stumbleTime = 0;
      this.state = "stumbling";
      this.addCameraShake(0.5);
    }
  }

  addCameraShake(intensity) {
    this.cameraShake.trauma = Math.min(1, this.cameraShake.trauma + intensity);
  }

  die() {
    this.state = "dead";
    this.velocity.y = this.jumpForce * 0.5;
    this.isGrounded = false;

    // Add dramatic camera shake
    this.addCameraShake(1.0);

    // Start floating away
    const floatAway = () => {
      this.playerContainer.position.y += this.velocity.y * 0.016;
      this.playerContainer.rotation.z += 0.02;
      this.velocity.y *= 0.98;

      if (this.state === "dead") {
        requestAnimationFrame(floatAway);
      }
    };

    floatAway();
  }

  reset() {
    // Reset position
    this.currentLane = 1;
    this.targetLanePosition = this.lanes[this.currentLane];
    this.playerContainer.position.set(this.lanes[this.currentLane], 0, 0);
    this.playerContainer.rotation.set(0, 0, 0);

    // Reset physics
    this.velocity.set(0, 0, 0);
    this.isGrounded = true;

    // Reset state
    this.state = "running";
    this.isJumping = false;
    this.isSliding = false;
    this.isStumbling = false;

    // Reset animations
    this.runningCycle = 0;
    this.leanAngle = 0;

    // Reset power-ups
    this.hasShield = false;
    this.hasMagnet = false;
    this.hasSpeedBoost = false;
    this.isInvincibleState = false;

    // Reset timers
    if (this.magnetTimer) clearTimeout(this.magnetTimer);
    if (this.speedBoostTimer) clearTimeout(this.speedBoostTimer);
    if (this.invincibilityTimer) clearTimeout(this.invincibilityTimer);
    if (this.flashInterval) clearInterval(this.flashInterval);

    // Reset effects
    this.shield.visible = false;
    this.shieldGlow.visible = false;
    this.trailEffect.visible = false;
    this.playerBody.material.emissiveIntensity = 0;

    // Reset dimensions
    this.playerBody.scale.y = 1;
    this.playerBody.position.y = 1;
    this.playerHelmet.position.y = 1.75;
    this.playerVisor.position.y = 1.75;

    // Reset camera shake
    this.cameraShake.trauma = 0;
  }

  // Collision detection
  getCollisionBox() {
    const box = new THREE.Box3();

    if (this.isSliding) {
      // Smaller collision box while sliding
      const slideBox = new THREE.Box3();
      slideBox.setFromCenterAndSize(
        this.playerContainer.position,
        new THREE.Vector3(0.8, 0.5, 0.8)
      );
      return slideBox;
    } else {
      // Normal collision box
      box.setFromObject(this.playerBody);
      // Adjust for helmet
      box.max.y += 0.5;
      return box;
    }
  }

  // Power-up methods remain the same...

  isInvincible() {
    return this.isInvincibleState;
  }

  isShielded() {
    return this.hasShield;
  }

  getPosition() {
    return this.position;
  }

  getRotation() {
    return this.rotation;
  }

  getState() {
    return this.state;
  }
}

module.exports = { Player };
