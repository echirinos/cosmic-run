const THREE = require("three");

class AssetManager {
  constructor() {
    this.loadingQueue = [];
    this.loadedAssets = new Map();
    this.priorityThreshold = 3; // Higher means more important
    this.isLoading = false;
    this.maxConcurrentLoads = 2; // Limit concurrent loads on mobile
  }

  queueAsset(url, assetType, priority, callback) {
    this.loadingQueue.push({
      url,
      assetType,
      priority,
      callback,
      loaded: false,
    });

    // Sort queue by priority (higher first)
    this.loadingQueue.sort((a, b) => b.priority - a.priority);

    // Start loading if not already loading
    if (!this.isLoading) {
      this.processQueue();
    }
  }

  processQueue() {
    this.isLoading = true;

    // Count how many assets are currently loading
    const loadingCount = this.loadingQueue.filter(
      (item) => !item.loaded && item.loading
    ).length;

    // Load more assets if under the limit
    if (loadingCount < this.maxConcurrentLoads) {
      // Get next unloaded high priority items
      const nextItems = this.loadingQueue
        .filter((item) => !item.loaded && !item.loading)
        .slice(0, this.maxConcurrentLoads - loadingCount);

      // Start loading these items
      nextItems.forEach((item) => {
        item.loading = true;
        this.loadAsset(item);
      });
    }
  }

  loadAsset(item) {
    let loader;

    // Choose correct loader based on asset type
    switch (item.assetType) {
      case "texture":
        loader = new THREE.TextureLoader();
        break;
      case "model":
        // Would use GLTFLoader here if importing that module
        console.error("Model loading not implemented");
        item.loaded = true;
        item.loading = false;
        this.processQueue();
        return;
      default:
        console.error("Unknown asset type:", item.assetType);
        item.loaded = true;
        item.loading = false;
        this.processQueue();
        return;
    }

    loader.load(
      item.url,
      (asset) => {
        // Asset loaded successfully
        item.loaded = true;
        item.loading = false;
        this.loadedAssets.set(item.url, asset);

        if (item.callback) {
          item.callback(asset);
        }

        // Process next items
        this.processQueue();
      },
      (progress) => {
        // Loading progress
        // Could update a loading indicator here
      },
      (error) => {
        // Error loading asset
        console.error(`Error loading ${item.url}:`, error);
        item.loaded = true; // Mark as handled
        item.loading = false;

        // Process next items despite error
        this.processQueue();
      }
    );
  }

  getAsset(url) {
    return this.loadedAssets.get(url);
  }
}

class World {
  constructor(scene) {
    this.scene = scene;

    // World properties
    this.trackLength = 100;
    this.trackWidth = 6;
    this.chunkSize = 20;

    // Temple Run style track properties
    this.trackPathLength = 0;
    this.visibleDistance = 100; // Default - will be adjusted based on device
    this.chunkTypes = {
      STRAIGHT: "straight",
      LEFT_TURN: "left_turn",
      RIGHT_TURN: "right_turn",
      RAMP_UP: "ramp_up",
      RAMP_DOWN: "ramp_down",
    };
    this.segmentDifficultyWeights = {
      easy: {
        [this.chunkTypes.STRAIGHT]: 0.7,
        [this.chunkTypes.LEFT_TURN]: 0.15,
        [this.chunkTypes.RIGHT_TURN]: 0.15,
        [this.chunkTypes.RAMP_UP]: 0,
        [this.chunkTypes.RAMP_DOWN]: 0,
      },
      medium: {
        [this.chunkTypes.STRAIGHT]: 0.5,
        [this.chunkTypes.LEFT_TURN]: 0.2,
        [this.chunkTypes.RIGHT_TURN]: 0.2,
        [this.chunkTypes.RAMP_UP]: 0.05,
        [this.chunkTypes.RAMP_DOWN]: 0.05,
      },
      hard: {
        [this.chunkTypes.STRAIGHT]: 0.3,
        [this.chunkTypes.LEFT_TURN]: 0.25,
        [this.chunkTypes.RIGHT_TURN]: 0.25,
        [this.chunkTypes.RAMP_UP]: 0.1,
        [this.chunkTypes.RAMP_DOWN]: 0.1,
      },
    };
    this.currentDifficulty = "easy";
    this.difficultyThresholds = {
      intermediate: 1000,
      advanced: 5000,
    };

    // Track path
    this.trackPath = []; // Will store track segment data with positions, directions, and types
    this.currentDirection = new THREE.Vector3(0, 0, -1); // Initial direction (negative Z)
    this.nextSegmentPosition = new THREE.Vector3(0, 0, 0); // Starting position

    // Objects
    this.track = null;
    this.obstacles = [];
    this.crystals = [];
    this.powerups = [];
    this.decorations = [];

    // Track segments (chunks)
    this.chunks = [];
    this.activeChunks = [];

    // Object pooling
    this.objectPools = {};

    // Materials
    this.trackMaterial = new THREE.MeshPhongMaterial({
      color: 0x333344,
      specular: 0x222233,
      shininess: 20,
      emissive: 0x000033,
      emissiveIntensity: 0.1,
    });

    this.obstacleMaterial = new THREE.MeshPhongMaterial({
      color: 0x666666,
      specular: 0x222222,
      shininess: 20,
    });

    this.crystalMaterial = new THREE.MeshPhongMaterial({
      color: 0x00ffff,
      specular: 0xffffff,
      shininess: 100,
      emissive: 0x007777,
      emissiveIntensity: 0.3,
    });

    this.powerupMaterial = new THREE.MeshPhongMaterial({
      color: 0xff00ff,
      specular: 0xffffff,
      shininess: 100,
      transparent: true,
      opacity: 0.8,
    });

    // Asset management
    this.assetManager = new AssetManager();

    // Initialize world
    this.init();
  }

  init() {
    console.log("Initializing world...");

    // Initialize materials first
    this.initMaterials();

    // Setup enhanced lighting
    this.setupLighting();

    // Create starfield background
    this.createStarfield();

    // Create space environment
    this.createSpaceEnvironment();

    // Initialize object pools
    this.initializeObjectPools();

    // Generate initial track segments for Temple Run style
    this.generateInitialTrackPath();

    // Make sure we have a valid track path
    if (!this.trackPath || this.trackPath.length === 0) {
      console.error("Failed to generate track path");
      // Create a default straight path
      this.trackPath = [
        { type: this.chunkTypes.STRAIGHT, length: 20 },
        { type: this.chunkTypes.STRAIGHT, length: 20 },
        { type: this.chunkTypes.STRAIGHT, length: 20 },
      ];
    }

    // Generate initial chunks from track segments
    this.generateInitialChunks();

    // Make sure chunks were created
    if (!this.chunks || this.chunks.length === 0) {
      console.error("Failed to generate chunks");
    } else {
      console.log(`Generated ${this.chunks.length} chunks`);
    }

    // Create a default player position for initial update calls
    this.defaultPlayerPosition = { x: 0, y: 0, z: 0 };

    // Debug
    console.log("World initialized with initial track chunks");
  }

  createTrackMaterials() {
    // Create a consistent set of materials for the track segments

    // Base track material - now brighter with subtle glow
    this.trackMaterial = new THREE.MeshStandardMaterial({
      color: 0x3366cc,
      roughness: 0.3,
      metalness: 0.7,
      emissive: 0x1133aa,
      emissiveIntensity: 0.2,
      envMapIntensity: 1.5,
    });

    // Edge glow material - brighter blue
    this.trackEdgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x00aaff,
      roughness: 0.2,
      metalness: 0.8,
      emissive: 0x0088ff,
      emissiveIntensity: 0.6,
      envMapIntensity: 1.5,
    });

    // Crystal lane material with stronger glow
    this.crystalLaneMaterial = new THREE.MeshStandardMaterial({
      color: 0x66ffff,
      roughness: 0.3,
      metalness: 0.7,
      emissive: 0x00ffff,
      emissiveIntensity: 0.3,
      envMapIntensity: 1.5,
    });

    // Obstacle warning material - bright red
    this.obstacleLaneMaterial = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      roughness: 0.3,
      metalness: 0.7,
      emissive: 0xff0000,
      emissiveIntensity: 0.3,
      envMapIntensity: 1.5,
    });
  }

  initializeObjectPools() {
    // Create object pools for reusing objects
    this.objectPools = {
      obstacles: this.createObjectPool(() => this.createObstacleTemplate(), 30),
      crystals: this.createObjectPool(() => this.createCrystalTemplate(), 50),
      powerups: this.createObjectPool(() => this.createPowerupTemplate(), 10),
    };
  }

  createObjectPool(factory, initialSize) {
    const pool = {
      available: [],
      inUse: new Set(),
      factory: factory,
    };

    // Fill pool with initial objects
    for (let i = 0; i < initialSize; i++) {
      pool.available.push(factory());
    }

    return pool;
  }

  getFromPool(poolName) {
    const pool = this.objectPools[poolName];
    if (!pool) return null;

    let object;

    // Get object from pool or create new one if needed
    if (pool.available.length > 0) {
      object = pool.available.pop();
    } else {
      object = pool.factory();
    }

    // Mark as in use
    pool.inUse.add(object);

    // Reset object visibility and position
    if (object.mesh) {
      object.mesh.visible = true;
      if (object.collected !== undefined) {
        object.collected = false;
      }
    }

    return object;
  }

  returnToPool(poolName, object) {
    const pool = this.objectPools[poolName];
    if (!pool) return;

    // Remove from in-use set
    pool.inUse.delete(object);

    // Return to available pool
    pool.available.push(object);

    // Hide object
    if (object.mesh) {
      object.mesh.visible = false;
    }
  }

  createObstacleTemplate() {
    // Create different types of space temple obstacles
    const obstacleTypes = [
      this.createAsteroidObstacle.bind(this),
      this.createSpaceDebrisObstacle.bind(this),
      this.createEnergyBarrierObstacle.bind(this),
      this.createAlienTotemObstacle.bind(this),
    ];

    // Create a new instance of a random obstacle type
    const randomType = Math.floor(Math.random() * obstacleTypes.length);
    const obstacle = obstacleTypes[randomType]();

    return obstacle;
  }

  createAsteroidObstacle() {
    // Create a group for the obstacle
    const obstacle = new THREE.Group();

    // Create a more distinctive asteroid with dangerous appearance
    const asteroidGeometry = new THREE.DodecahedronGeometry(0.8, 1);

    // Use a threatening dark red material with glowing cracks
    const asteroidMaterial = new THREE.MeshStandardMaterial({
      color: 0x661111,
      roughness: 0.8,
      metalness: 0.3,
      emissive: 0xff3300,
      emissiveIntensity: 0.3,
      flatShading: true,
    });

    const asteroid = new THREE.Mesh(asteroidGeometry, asteroidMaterial);

    // Create glowing red warning lights around the asteroid
    const warningLight1 = new THREE.PointLight(0xff0000, 2, 5);
    warningLight1.position.set(0.5, 0.5, 0);
    asteroid.add(warningLight1);

    const warningLight2 = new THREE.PointLight(0xff0000, 2, 5);
    warningLight2.position.set(-0.5, -0.5, 0);
    asteroid.add(warningLight2);

    // Add some spikes to make it look dangerous
    const spikeGeometry = new THREE.ConeGeometry(0.2, 0.6, 4);
    const spikeMaterial = new THREE.MeshStandardMaterial({
      color: 0x330000,
      roughness: 0.6,
      metalness: 0.4,
      emissive: 0xff2200,
      emissiveIntensity: 0.2,
    });

    // Add multiple spikes in different orientations
    const spikePositions = [
      { pos: [0.7, 0, 0], rot: [0, 0, Math.PI / 2] },
      { pos: [-0.7, 0, 0], rot: [0, 0, -Math.PI / 2] },
      { pos: [0, 0.7, 0], rot: [0, 0, 0] },
      { pos: [0, -0.7, 0], rot: [Math.PI, 0, 0] },
      { pos: [0, 0, 0.7], rot: [Math.PI / 2, 0, 0] },
      { pos: [0, 0, -0.7], rot: [-Math.PI / 2, 0, 0] },
    ];

    spikePositions.forEach((spikeData) => {
      const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
      spike.position.set(...spikeData.pos);
      spike.rotation.set(...spikeData.rot);
      asteroid.add(spike);
    });

    // Add a pulsing warning effect
    const warningRingGeometry = new THREE.RingGeometry(1.2, 1.4, 32);
    const warningRingMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });

    const warningRing = new THREE.Mesh(
      warningRingGeometry,
      warningRingMaterial
    );
    warningRing.rotation.x = Math.PI / 2;
    asteroid.add(warningRing);

    // Create animation for the warning ring
    const animateWarning = () => {
      warningRingMaterial.opacity = 0.4 + Math.sin(Date.now() * 0.005) * 0.3;
      warningRing.scale.setScalar(1 + Math.sin(Date.now() * 0.003) * 0.1);
      requestAnimationFrame(animateWarning);
    };

    animateWarning();

    asteroid.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );

    obstacle.add(asteroid);

    // Set tag for collision detection
    obstacle.userData = {
      type: "obstacle",
      subtype: "asteroid",
      deadly: true,
    };

    return obstacle;
  }

  createSpaceDebrisObstacle() {
    // Create a non-deadly obstacle that can be jumped over
    const obstacle = new THREE.Group();

    // Create a space debris piece that looks like junk but not dangerous
    const debrisGeometry = new THREE.BoxGeometry(1.5, 0.5, 1.5);

    // Use a metallic silver/blue material with no dangerous red glow
    const debrisMaterial = new THREE.MeshStandardMaterial({
      color: 0x8899aa,
      roughness: 0.4,
      metalness: 0.8,
      emissive: 0x6688aa,
      emissiveIntensity: 0.2,
      flatShading: true,
    });

    const debris = new THREE.Mesh(debrisGeometry, debrisMaterial);

    // Add some technological details to make it look like space junk
    const addDetail = (width, height, depth, x, y, z) => {
      const detailGeometry = new THREE.BoxGeometry(width, height, depth);
      const detailMaterial = new THREE.MeshStandardMaterial({
        color: 0x99aacc,
        roughness: 0.5,
        metalness: 0.7,
      });

      const detail = new THREE.Mesh(detailGeometry, detailMaterial);
      detail.position.set(x, y, z);
      return detail;
    };

    // Add visual details - antenna, solar panel, etc.
    debris.add(addDetail(0.2, 0.8, 0.2, 0.5, 0.5, 0));
    debris.add(addDetail(0.2, 0.3, 0.2, -0.5, 0.3, 0.5));
    debris.add(addDetail(1.0, 0.1, 0.5, 0, 0.3, -0.5));

    // Add a blue safety indicator to show it's non-deadly
    const safetyLight = new THREE.PointLight(0x00ccff, 1.5, 5);
    safetyLight.position.set(0, 0.5, 0);
    debris.add(safetyLight);

    // Add blue indicator
    const indicatorGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const indicatorMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ccff,
      transparent: true,
      opacity: 0.8,
    });

    const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    indicator.position.set(0, 0.5, 0);
    debris.add(indicator);

    // Create animation for the indicator
    const animateIndicator = () => {
      indicatorMaterial.opacity = 0.6 + Math.sin(Date.now() * 0.005) * 0.2;
      indicator.scale.setScalar(1 + Math.sin(Date.now() * 0.003) * 0.1);
      requestAnimationFrame(animateIndicator);
    };

    animateIndicator();

    debris.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );

    obstacle.add(debris);

    // Set tag for collision detection
    obstacle.userData = {
      type: "obstacle",
      subtype: "debris",
      deadly: false,
    };

    return obstacle;
  }

  createEnergyBarrierObstacle() {
    // Create a deadly energy barrier obstacle
    const obstacle = new THREE.Group();

    // Create the base of the energy barrier
    const baseGeometry = new THREE.CylinderGeometry(0.3, 0.4, 0.3, 16);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.2,
      metalness: 0.9,
    });

    const baseLeft = new THREE.Mesh(baseGeometry, baseMaterial);
    baseLeft.position.set(-1, 0, 0);
    obstacle.add(baseLeft);

    const baseRight = new THREE.Mesh(baseGeometry, baseMaterial);
    baseRight.position.set(1, 0, 0);
    obstacle.add(baseRight);

    // Create the energy barrier itself
    const barrierGeometry = new THREE.BoxGeometry(2.5, 1.8, 0.1);
    const barrierMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0066,
      transparent: true,
      opacity: 0.7,
      emissive: 0xff0066,
      emissiveIntensity: 0.8,
      side: THREE.DoubleSide,
    });

    const barrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
    barrier.position.set(0, 1, 0);
    obstacle.add(barrier);

    // Add energy particles within the barrier
    const particleGeometry = new THREE.BufferGeometry();
    const particleCount = 50;
    const particlePositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      particlePositions[i3] = (Math.random() - 0.5) * 2.3; // x
      particlePositions[i3 + 1] = 0.2 + Math.random() * 1.6; // y
      particlePositions[i3 + 2] = (Math.random() - 0.5) * 0.05; // z
    }

    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(particlePositions, 3)
    );

    const particleMaterial = new THREE.PointsMaterial({
      color: 0xff99cc,
      size: 0.1,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    obstacle.add(particles);

    // Add flickering lights to show barrier is active
    const lightLeft = new THREE.PointLight(0xff0066, 2, 5);
    lightLeft.position.set(-1, 0.2, 0);
    obstacle.add(lightLeft);

    const lightRight = new THREE.PointLight(0xff0066, 2, 5);
    lightRight.position.set(1, 0.2, 0);
    obstacle.add(lightRight);

    // Add danger symbols on the sides
    const createWarningSymbol = (x) => {
      const warningGeometry = new THREE.PlaneGeometry(0.3, 0.3);
      const warningMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      });

      const warning = new THREE.Mesh(warningGeometry, warningMaterial);
      warning.position.set(x, 0.5, 0.2);
      warning.rotation.y = Math.PI / 2;

      // Create a texture with warning symbol (simulated here with geometry)
      const symbolGeometry = new THREE.CircleGeometry(0.12, 3);
      const symbolMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const symbol = new THREE.Mesh(symbolGeometry, symbolMaterial);
      symbol.position.z = 0.01;

      warning.add(symbol);
      return warning;
    };

    obstacle.add(createWarningSymbol(-1));
    obstacle.add(createWarningSymbol(1));

    // Animate barrier properties
    const animateBarrier = () => {
      barrierMaterial.opacity = 0.5 + Math.sin(Date.now() * 0.003) * 0.2;

      // Animate particles
      const positions = particles.geometry.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3 + 1] += 0.01;
        if (positions[i3 + 1] > 1.8) {
          positions[i3 + 1] = 0.2;
        }
      }
      particles.geometry.attributes.position.needsUpdate = true;

      // Animate lights
      lightLeft.intensity = 1.5 + Math.sin(Date.now() * 0.005) * 0.5;
      lightRight.intensity = 1.5 + Math.cos(Date.now() * 0.005) * 0.5;

      requestAnimationFrame(animateBarrier);
    };

    animateBarrier();

    // Set tag for collision detection
    obstacle.userData = {
      type: "obstacle",
      subtype: "energy_barrier",
      deadly: true,
    };

    return obstacle;
  }

  createAlienTotemObstacle() {
    // Create a non-deadly obstacle that slows the player down
    const obstacle = new THREE.Group();

    // Create the base of the totem
    const baseGeometry = new THREE.CylinderGeometry(0.5, 0.7, 0.3, 8);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x66aa88,
      roughness: 0.6,
      metalness: 0.3,
      emissive: 0x225544,
      emissiveIntensity: 0.2,
    });

    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.15;
    obstacle.add(base);

    // Create the totem pillar
    const pillarGeometry = new THREE.CylinderGeometry(0.3, 0.4, 1.5, 8);
    const pillarMaterial = new THREE.MeshStandardMaterial({
      color: 0x55aaaa,
      roughness: 0.5,
      metalness: 0.4,
      emissive: 0x336666,
      emissiveIntensity: 0.2,
    });

    const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
    pillar.position.y = 1.0;
    obstacle.add(pillar);

    // Create the totem head
    const headGeometry = new THREE.SphereGeometry(0.4, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0x66ccbb,
      roughness: 0.3,
      metalness: 0.7,
      emissive: 0x44aa99,
      emissiveIntensity: 0.3,
    });

    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 2.0;
    obstacle.add(head);

    // Add glowing eyes to the totem
    const createEye = (x) => {
      const eyeGeometry = new THREE.SphereGeometry(0.1, 16, 16);
      const eyeMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.9,
      });

      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(x, 0.1, 0.3);

      const eyeLight = new THREE.PointLight(0x00ffcc, 1, 3);
      eyeLight.position.set(0, 0, 0);
      eye.add(eyeLight);

      return eye;
    };

    head.add(createEye(-0.15));
    head.add(createEye(0.15));

    // Add alien symbols carved into the totem
    const addSymbol = (y, scale, rotation) => {
      const symbolGeometry = new THREE.TorusGeometry(0.15, 0.03, 8, 16);
      const symbolMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ffaa,
        emissive: 0x00ffaa,
        emissiveIntensity: 0.5,
      });

      const symbol = new THREE.Mesh(symbolGeometry, symbolMaterial);
      symbol.position.set(0, y, 0.3);
      symbol.rotation.z = rotation;
      symbol.scale.set(scale, scale, scale);
      pillar.add(symbol);
    };

    addSymbol(0.4, 1.0, 0);
    addSymbol(0.1, 0.8, Math.PI / 4);
    addSymbol(-0.2, 0.7, Math.PI / 2);

    // Add a green safety field around the totem
    const fieldGeometry = new THREE.SphereGeometry(1.0, 16, 16);
    const fieldMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffaa,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });

    const field = new THREE.Mesh(fieldGeometry, fieldMaterial);
    field.position.y = 1.0;
    obstacle.add(field);

    // Animate the totem
    const animateTotem = () => {
      // Pulse the field
      field.material.opacity = 0.1 + Math.sin(Date.now() * 0.002) * 0.05;
      field.scale.setScalar(1 + Math.sin(Date.now() * 0.001) * 0.1);

      // Rotate the head slightly
      head.rotation.y += 0.01;

      // Make the totem float slightly
      obstacle.position.y = Math.sin(Date.now() * 0.001) * 0.1;

      requestAnimationFrame(animateTotem);
    };

    animateTotem();

    // Set tag for collision detection
    obstacle.userData = {
      type: "obstacle",
      subtype: "alien_totem",
      deadly: false,
      slowsPlayer: true,
    };

    return obstacle;
  }

  createCrystalTemplate() {
    const group = new THREE.Group();

    // Crystal mesh - more detailed geometry
    const geometry = new THREE.OctahedronGeometry(0.5, 1);
    const material = new THREE.MeshPhongMaterial({
      color: 0x00ffff,
      specular: 0xffffff,
      shininess: 100,
      emissive: 0x00aaff,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9,
    });

    const crystal = new THREE.Mesh(geometry, material);
    group.add(crystal);

    // Add inner glow
    const coreGeometry = new THREE.OctahedronGeometry(0.3, 0);
    const coreMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      emissive: 0x00ffff,
      emissiveIntensity: 1,
      transparent: true,
      opacity: 0.7,
    });

    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    crystal.add(core);

    // Add light source
    const light = new THREE.PointLight(0x00ffff, 0.5, 3);
    light.position.set(0, 0, 0);
    crystal.add(light);

    // Rotation animation data
    crystal.userData.rotationSpeed = {
      x: 0.01,
      y: 0.02,
      z: 0.005,
    };

    // Floating animation data
    crystal.userData.floatSpeed = 0.001;
    crystal.userData.floatAmplitude = 0.2;
    crystal.userData.floatOffset = Math.random() * Math.PI * 2;

    group.visible = false;
    this.scene.add(group);

    return {
      mesh: group,
      value: 1,
      collected: false,
      position: { x: 0, y: 0, z: 0 },
    };
  }

  createPowerupTemplate() {
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const mesh = new THREE.Mesh(geometry, this.powerupMaterial);
    mesh.visible = false;
    this.scene.add(mesh);

    return {
      mesh: mesh,
      type: "shield", // Default type
      collected: false,
      position: { x: 0, y: 0, z: 0 },
    };
  }

  generateInitialTrackPath() {
    console.log("Generating initial track path...");
    // Clear any existing track path
    this.trackPath = [];

    // Reset track path length
    this.trackPathLength = 0;

    // Generate first 10 segments as straight for a gentle start
    for (let i = 0; i < 10; i++) {
      const segment = this.addTrackSegment(this.chunkTypes.STRAIGHT);
      // Generate nodes for this segment
      this.generateSegmentNodes(segment);
    }

    console.log(
      `Generated initial track with ${this.trackPath.length} segments`
    );
  }

  addTrackSegment(type) {
    // Get segment length based on type
    let segmentLength = this.chunkSize;
    if (
      type === this.chunkTypes.LEFT_TURN ||
      type === this.chunkTypes.RIGHT_TURN
    ) {
      segmentLength = Math.PI * this.trackWidth; // Arc length for a 90° turn
    }

    // Create segment data
    const segment = {
      type: type,
      length: segmentLength,
      startPosition: this.nextSegmentPosition.clone(),
      startDirection: this.currentDirection.clone(),
      nodes: [],
    };

    // Generate path nodes for this segment
    this.generateSegmentNodes(segment);

    // Update next segment position and direction
    if (segment.nodes.length > 0) {
      const lastNode = segment.nodes[segment.nodes.length - 1];
      this.nextSegmentPosition.copy(lastNode.position);
      this.currentDirection.copy(lastNode.direction);
    }

    // Add to track path
    this.trackPath.push(segment);
    this.trackPathLength += segmentLength;

    return segment;
  }

  generateSegmentNodes(segment) {
    const type = segment.type;
    const nodeCount = Math.ceil(segment.length);
    const nodeSpacing = segment.length / nodeCount;

    // Create nodes based on segment type
    switch (type) {
      case this.chunkTypes.STRAIGHT:
        for (let i = 0; i <= nodeCount; i++) {
          const t = i / nodeCount;
          const position = segment.startPosition
            .clone()
            .add(
              segment.startDirection.clone().multiplyScalar(t * segment.length)
            );
          segment.nodes.push({
            position: position,
            direction: segment.startDirection.clone(),
            t: t,
          });
        }
        break;

      case this.chunkTypes.LEFT_TURN:
      case this.chunkTypes.RIGHT_TURN:
        const turnDirection = type === this.chunkTypes.LEFT_TURN ? 1 : -1;
        const turnRadius = this.trackWidth;
        const turnCenter = segment.startPosition
          .clone()
          .add(
            new THREE.Vector3(
              -turnDirection * turnRadius * segment.startDirection.z,
              0,
              turnDirection * turnRadius * segment.startDirection.x
            )
          );

        // Calculate starting angle
        const startAngle = Math.atan2(
          segment.startDirection.z,
          segment.startDirection.x
        );

        for (let i = 0; i <= nodeCount; i++) {
          const t = i / nodeCount;
          const angle = startAngle + turnDirection * (Math.PI / 2) * t;

          // Position along arc
          const position = new THREE.Vector3(
            turnCenter.x + turnRadius * Math.cos(angle),
            segment.startPosition.y,
            turnCenter.z + turnRadius * Math.sin(angle)
          );

          // Direction tangent to arc
          const direction = new THREE.Vector3(
            Math.cos(angle + (turnDirection * Math.PI) / 2),
            0,
            Math.sin(angle + (turnDirection * Math.PI) / 2)
          );

          segment.nodes.push({
            position: position,
            direction: direction,
            t: t,
          });
        }
        break;

      case this.chunkTypes.RAMP_UP:
      case this.chunkTypes.RAMP_DOWN:
        // Vertical factor (+1 for up, -1 for down)
        const verticalDir = type === this.chunkTypes.RAMP_UP ? 1 : -1;
        const rampHeight = 3; // Maximum height change

        for (let i = 0; i <= nodeCount; i++) {
          const t = i / nodeCount;
          // Smooth height curve
          const heightCurve = 1 - Math.cos(t * Math.PI) / 2; // 0 to 1
          const heightOffset = verticalDir * rampHeight * heightCurve;

          const position = segment.startPosition
            .clone()
            .add(
              new THREE.Vector3(
                segment.startDirection.x * segment.length * t,
                segment.startDirection.y * segment.length * t + heightOffset,
                segment.startDirection.z * segment.length * t
              )
            );

          segment.nodes.push({
            position: position,
            direction: segment.startDirection.clone(),
            t: t,
          });
        }
        break;
    }
  }

  createStarfield() {
    // Create a particle system for stars
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 3000;

    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);

    // Random positions for stars
    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;

      // Position stars in a large sphere around the scene
      const radius = 100 + Math.random() * 900; // 100-1000 units
      const theta = Math.random() * Math.PI * 2; // 0-2π
      const phi = Math.acos(2 * Math.random() - 1); // 0-π

      positions[i3] = radius * Math.sin(phi) * Math.cos(theta); // x
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta); // y
      positions[i3 + 2] = radius * Math.cos(phi); // z

      // Random star colors (mainly white/blue with some variations)
      const colorChoice = Math.random();
      if (colorChoice > 0.9) {
        // Red/orange stars (5%)
        colors[i3] = 1.0;
        colors[i3 + 1] = 0.5 + Math.random() * 0.3;
        colors[i3 + 2] = 0.3;
      } else if (colorChoice > 0.75) {
        // Yellow stars (15%)
        colors[i3] = 1.0;
        colors[i3 + 1] = 1.0;
        colors[i3 + 2] = 0.6 + Math.random() * 0.4;
      } else if (colorChoice > 0.5) {
        // Blue stars (25%)
        colors[i3] = 0.6 + Math.random() * 0.2;
        colors[i3 + 1] = 0.6 + Math.random() * 0.2;
        colors[i3 + 2] = 1.0;
      } else {
        // White/light blue stars (55%)
        colors[i3] = 0.8 + Math.random() * 0.2;
        colors[i3 + 1] = 0.8 + Math.random() * 0.2;
        colors[i3 + 2] = 0.8 + Math.random() * 0.2;
      }

      // Random star sizes
      sizes[i] = Math.random() * 2;
    }

    starGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    starGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    starGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const starMaterial = new THREE.PointsMaterial({
      size: 1,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
    });

    this.starfield = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(this.starfield);
  }

  createSpaceEnvironment() {
    // Create a more vibrant and brighter space environment

    // Create a starry background
    this.createStarfield();

    // Add several planets with more vibrant colors
    const planets = [
      { x: -200, y: 100, z: -500, radius: 60, color: 0x66aaff, hasRings: true }, // Blue gas giant with rings
      { x: 400, y: -50, z: -800, radius: 80, color: 0xff9966, hasRings: false }, // Orange/red planet
      {
        x: -350,
        y: 200,
        z: -1200,
        radius: 40,
        color: 0x99ff99,
        hasRings: false,
      }, // Green planet
      {
        x: 600,
        y: 300,
        z: -1500,
        radius: 120,
        color: 0xff66aa,
        hasRings: true,
      }, // Pink planet with rings
    ];

    planets.forEach((planet) => {
      this.createDetailedPlanet(
        planet.x,
        planet.y,
        planet.z,
        planet.radius,
        planet.color,
        planet.hasRings
      );
    });

    // Add nebulae with brighter colors for better visibility
    this.createNebula(-300, 150, -600, 0x5599ff, 0.7); // Blue nebula
    this.createNebula(400, -100, -900, 0xff6699, 0.7); // Pink nebula
    this.createNebula(100, 300, -1200, 0x99ff66, 0.7); // Green nebula

    // Add ambient particles for space dust
    this.createSpaceDust(5000);

    // Create asteroid field in the background
    this.createAsteroidField(100);

    // Add brighter ambient light for better visibility
    const ambientLight = new THREE.AmbientLight(0x666666, 0.8);
    this.scene.add(ambientLight);

    // Add directional light to simulate a distant star/sun
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(500, 300, -500);
    sunLight.castShadow = true;

    // Improve shadow quality
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 2000;
    sunLight.shadow.camera.left = -200;
    sunLight.shadow.camera.right = 200;
    sunLight.shadow.camera.top = 200;
    sunLight.shadow.camera.bottom = -200;
    this.scene.add(sunLight);

    // Add a soft blue-tinted hemisphere light for fill
    const hemisphereLight = new THREE.HemisphereLight(0x88aaff, 0x334455, 0.6);
    this.scene.add(hemisphereLight);

    // Create atmosphere fog with subtle color
    this.scene.fog = new THREE.FogExp2(0x0a1a33, 0.0015);
  }

  // Create a detailed planet with optional ring system
  createDetailedPlanet(x, y, z, radius, color, hasRings) {
    // Create planet with texture and atmosphere
    const planetGeometry = new THREE.SphereGeometry(radius, 32, 32);

    // Create material with some randomized surface detail
    const planetMaterial = new THREE.MeshPhongMaterial({
      color: color,
      specular: new THREE.Color(color).multiplyScalar(0.5),
      shininess: 10,
      emissive: new THREE.Color(color).multiplyScalar(0.1),
      emissiveIntensity: 0.2,
    });

    // Add random "continents" to the planet for visual interest
    if (Math.random() > 0.5) {
      const noise = [];
      for (let i = 0; i < planetGeometry.attributes.position.count; i++) {
        noise.push(Math.random() > 0.7 ? 1 : 0);
      }
      planetGeometry.setAttribute(
        "noise",
        new THREE.Float32BufferAttribute(noise, 1)
      );
    }

    const planet = new THREE.Mesh(planetGeometry, planetMaterial);
    planet.position.set(x, y, z);
    this.scene.add(planet);

    // Add a subtle glow effect (atmosphere)
    const atmosphereGeometry = new THREE.SphereGeometry(radius * 1.05, 32, 32);
    const atmosphereMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(1.5),
      transparent: true,
      opacity: 0.2,
      side: THREE.BackSide,
    });
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    planet.add(atmosphere);

    // Add rings if specified
    if (hasRings) {
      const ringGeometry = new THREE.RingGeometry(radius * 1.3, radius * 2, 64);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xaaaaaa,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
      });

      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 3;
      planet.add(ring);

      // Add a second, thinner ring with different color for some planets
      if (Math.random() > 0.5) {
        const ring2Geometry = new THREE.RingGeometry(
          radius * 1.1,
          radius * 1.2,
          64
        );
        const ring2Material = new THREE.MeshBasicMaterial({
          color: new THREE.Color(color).multiplyScalar(1.3),
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.7,
        });

        const ring2 = new THREE.Mesh(ring2Geometry, ring2Material);
        ring2.rotation.x = Math.PI / 2.5;
        planet.add(ring2);
      }
    }

    // Add some moons to some planets
    const moonCount = Math.floor(Math.random() * 3);
    for (let i = 0; i < moonCount; i++) {
      const moonRadius = radius * (0.1 + Math.random() * 0.15);
      const moonDistance = radius * (1.5 + Math.random() * 1.5);
      const moonGeometry = new THREE.SphereGeometry(moonRadius, 16, 16);
      const moonMaterial = new THREE.MeshPhongMaterial({
        color: 0xaaaaaa,
        specular: 0x555555,
        shininess: 5,
      });

      const moon = new THREE.Mesh(moonGeometry, moonMaterial);
      moon.position.set(
        moonDistance * Math.cos((i * Math.PI * 2) / moonCount),
        0,
        moonDistance * Math.sin((i * Math.PI * 2) / moonCount)
      );

      // Store original position for animation
      moon.userData.orbitRadius = moonDistance;
      moon.userData.orbitSpeed = 0.5 + Math.random();
      moon.userData.orbitPhase = Math.random() * Math.PI * 2;

      planet.add(moon);
    }

    // Store the planet object for animation
    if (!this.planets) this.planets = [];
    this.planets.push(planet);

    return planet;
  }

  // Create asteroid field with various sized rocks
  createAsteroidField(count) {
    const asteroidGroup = new THREE.Group();
    this.scene.add(asteroidGroup);

    for (let i = 0; i < count; i++) {
      // Determine size - mostly small, few medium, very few large
      let size;
      const sizeDeterminer = Math.random();
      if (sizeDeterminer > 0.95) {
        size = 3 + Math.random() * 5; // Large (5%)
      } else if (sizeDeterminer > 0.7) {
        size = 1 + Math.random() * 2; // Medium (25%)
      } else {
        size = 0.2 + Math.random() * 0.8; // Small (70%)
      }

      // Create asteroid geometry with irregular shape
      const asteroidGeometry = new THREE.DodecahedronGeometry(
        size,
        Math.floor(Math.random() * 2)
      );

      // Distort vertices for more irregular shape
      const positionAttribute = asteroidGeometry.attributes.position;
      for (let j = 0; j < positionAttribute.count; j++) {
        const x = positionAttribute.getX(j);
        const y = positionAttribute.getY(j);
        const z = positionAttribute.getZ(j);

        const distortion = 0.2 + Math.random() * 0.3;
        positionAttribute.setXYZ(
          j,
          x * (1 + Math.random() * distortion),
          y * (1 + Math.random() * distortion),
          z * (1 + Math.random() * distortion)
        );
      }

      // Create material with variances
      const darkFactor = 0.3 + Math.random() * 0.4;
      const asteroidMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(darkFactor, darkFactor * 0.9, darkFactor * 0.8),
        roughness: 0.8 + Math.random() * 0.2,
        metalness: Math.random() * 0.3,
      });

      const asteroid = new THREE.Mesh(asteroidGeometry, asteroidMaterial);

      // Position in a large volume, but away from the central track
      const distance = 50 + Math.random() * 300;
      const angle = Math.random() * Math.PI * 2;
      const height = -50 + Math.random() * 100;

      asteroid.position.set(
        Math.cos(angle) * distance,
        height,
        Math.sin(angle) * distance - 100 // Bias toward negative Z (ahead of player)
      );

      // Random rotation
      asteroid.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      // Add rotation animation data
      asteroid.userData.rotationSpeed = {
        x: (Math.random() - 0.5) * 0.01,
        y: (Math.random() - 0.5) * 0.01,
        z: (Math.random() - 0.5) * 0.01,
      };

      // Add parallax movement data
      asteroid.userData.parallaxFactor = 0.05 + size / 10; // Larger asteroids move more with parallax

      asteroidGroup.add(asteroid);
    }

    this.asteroidField = asteroidGroup;
  }

  // Create ambient space dust that moves toward player
  createSpaceDust(count) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    // Create dust particles in a large cylinder ahead of player
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Position in cylindrical volume ahead of player
      const radius = 5 + Math.random() * 30;
      const theta = Math.random() * Math.PI * 2;
      const z = -20 - Math.random() * 80; // Ahead of player

      positions[i3] = Math.cos(theta) * radius;
      positions[i3 + 1] = -10 + Math.random() * 20; // Vertical spread
      positions[i3 + 2] = z;

      // Random sizes
      sizes[i] = 0.05 + Math.random() * 0.1;

      // Subtle colors - mostly white/blue with slight variations
      const colorChoice = Math.random();
      if (colorChoice > 0.9) {
        // Yellowish dust (10%)
        colors[i3] = 0.9;
        colors[i3 + 1] = 0.9;
        colors[i3 + 2] = 0.6;
      } else if (colorChoice > 0.7) {
        // Blueish dust (20%)
        colors[i3] = 0.7;
        colors[i3 + 1] = 0.8;
        colors[i3 + 2] = 0.9;
      } else {
        // White/grey dust (70%)
        const brightness = 0.6 + Math.random() * 0.3;
        colors[i3] = brightness;
        colors[i3 + 1] = brightness;
        colors[i3 + 2] = brightness;
      }
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
    });

    this.spaceDust = new THREE.Points(geometry, material);
    this.scene.add(this.spaceDust);
  }

  generateInitialChunks() {
    console.log("Generating initial chunks...");

    // Clear active chunks
    this.activeChunks = [];

    // Generate chunks from existing track path
    for (let i = 0; i < this.trackPath.length; i++) {
      const segment = this.trackPath[i];
      this.generateChunkFromSegment(segment);
    }

    console.log(`Generated ${this.activeChunks.length} initial chunks`);
  }

  generateChunk(startZ) {
    // Create a chunk of the track
    const chunk = new THREE.Group();
    chunk.position.z = startZ;

    // Create track segment
    const trackGeometry = new THREE.BoxGeometry(
      this.trackWidth,
      0.1,
      this.chunkSize
    );
    const track = new THREE.Mesh(trackGeometry, this.trackMaterial);
    track.position.y = -0.05;
    chunk.add(track);

    // Add lane dividers
    for (let i = -1; i <= 1; i += 2) {
      const dividerGeometry = new THREE.BoxGeometry(0.1, 0.05, this.chunkSize);
      const divider = new THREE.Mesh(dividerGeometry, this.trackMaterial);
      divider.position.set(i * 1, 0, 0);
      chunk.add(divider);
    }

    // Add track boundaries
    for (let i = -1; i <= 1; i += 2) {
      const boundaryGeometry = new THREE.BoxGeometry(0.2, 0.3, this.chunkSize);
      const boundary = new THREE.Mesh(boundaryGeometry, this.trackMaterial);
      boundary.position.set(i * (this.trackWidth / 2 + 0.1), 0.15, 0);
      chunk.add(boundary);
    }

    // Add decorations on the sides
    this.addTrackDecorations(chunk);

    // Add obstacles and collectibles
    this.populateChunk(chunk);

    this.scene.add(chunk);
    this.chunks.push(chunk);
    this.activeChunks.push(chunk);

    return chunk;
  }

  addTrackDecorations(chunk, segment) {
    // If called with only one parameter (old version), provide default values
    if (!segment) {
      // Default track decoration without segment data
      // Add futuristic/sci-fi decorations along track
      const lanePositions = [-2, 0, 2]; // Left, center, right
      const chunkSize = this.chunkSize;
      const trackWidth = this.trackWidth || 6;

      // Add light posts every 5 units
      for (let z = -chunkSize / 2; z <= chunkSize / 2; z += 5) {
        for (let side = -1; side <= 1; side += 2) {
          const postGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
          const postMaterial = new THREE.MeshPhongMaterial({
            color: 0x888899,
            specular: 0x333344,
            shininess: 30,
          });
          const post = new THREE.Mesh(postGeometry, postMaterial);
          post.position.set(side * (trackWidth / 2 + 0.5), 0.5, z);
          chunk.add(post);

          // Add light
          const lightGeometry = new THREE.SphereGeometry(0.1, 8, 8);
          const lightMaterial = new THREE.MeshPhongMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 0.5,
          });
          const light = new THREE.Mesh(lightGeometry, lightMaterial);
          light.position.set(side * (trackWidth / 2 + 0.5), 1.1, z);
          chunk.add(light);
        }
      }

      return;
    }

    // Add decorative elements to the track based on segment data
    const segmentLength = segment.length;
    const trackWidth = this.trackWidth;

    // Add side rails
    const railGeometry = new THREE.BoxGeometry(0.2, 0.3, segmentLength);
    const railMaterial = new THREE.MeshPhongMaterial({
      color: 0x444444,
      specular: 0x111111,
      shininess: 30,
    });

    // Position based on segment type
    if (segment.type === this.chunkTypes.STRAIGHT) {
      // Left rail
      const leftRail = new THREE.Mesh(railGeometry, railMaterial);
      leftRail.position.set(-trackWidth / 2 - 0.1, 0.1, -segmentLength / 2);
      chunk.add(leftRail);

      // Right rail
      const rightRail = new THREE.Mesh(railGeometry, railMaterial);
      rightRail.position.set(trackWidth / 2 + 0.1, 0.1, -segmentLength / 2);
      chunk.add(rightRail);
    }

    // Add lane markers
    this.addLaneMarkers(chunk, segmentLength, trackWidth);
  }

  addLaneMarkers(chunk, segmentLength, trackWidth) {
    // Add lane divider markers
    const markerGeometry = new THREE.BoxGeometry(0.1, 0.05, 1);
    const markerMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      specular: 0x555555,
      shininess: 50,
      emissive: 0x444444,
      emissiveIntensity: 0.2,
    });

    // Space markers every 5 units
    const markerSpacing = 5;
    const markerCount = Math.floor(segmentLength / markerSpacing);

    // Two lanes, three markers
    const lanePositions = [-trackWidth / 3, 0, trackWidth / 3];

    for (let i = 0; i < markerCount; i++) {
      const zPos = -i * markerSpacing - markerSpacing / 2;

      lanePositions.forEach((xPos) => {
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.set(xPos, 0, zPos);
        chunk.add(marker);
      });
    }
  }

  populateChunk(chunk) {
    // Add obstacles, crystals, and power-ups to the chunk
    const lanePositions = [-2, 0, 2]; // Left, center, right

    // Space out obstacles and collectibles along the chunk
    for (let z = -this.chunkSize + 2; z < 0; z += 3) {
      // Only generate obstacles/collectibles with some probability
      if (Math.random() < 0.7) {
        // Pick random lane
        const laneIndex = Math.floor(Math.random() * 3);
        const lane = lanePositions[laneIndex];

        // Decide what to place (obstacle, crystal, or power-up)
        const objectType = Math.random();

        if (objectType < 0.6) {
          // 60% chance for an obstacle
          this.addObstacle(chunk, lane, z);
        } else if (objectType < 0.95) {
          // 35% chance for crystals
          this.addCrystal(chunk, lane, z);
        } else {
          // 5% chance for a power-up
          this.addPowerup(chunk, lane, z);
        }
      }
    }
  }

  addObstacle(chunk, lane, z) {
    // Create a random obstacle type
    const obstacleType = Math.floor(Math.random() * 3);
    let obstacle;

    switch (obstacleType) {
      case 0:
        // Asteroid
        const asteroidGeometry = new THREE.DodecahedronGeometry(0.8, 0);
        obstacle = new THREE.Mesh(asteroidGeometry, this.obstacleMaterial);
        obstacle.position.set(lane, 0.8, z);
        break;

      case 1:
        // Energy barrier
        const barrierGeometry = new THREE.BoxGeometry(1.5, 2, 0.2);
        const barrierMaterial = new THREE.MeshPhongMaterial({
          color: 0xff5500,
          transparent: true,
          opacity: 0.7,
        });
        obstacle = new THREE.Mesh(barrierGeometry, barrierMaterial);
        obstacle.position.set(lane, 1, z);
        break;

      case 2:
        // Broken space debris
        const debrisGeometry = new THREE.CylinderGeometry(0, 0.8, 1.2, 5);
        obstacle = new THREE.Mesh(debrisGeometry, this.obstacleMaterial);
        obstacle.position.set(lane, 0.6, z);
        obstacle.rotation.x = Math.PI / 2;
        obstacle.rotation.z = Math.random() * Math.PI;
        break;
    }

    // Store obstacle in chunk's userData for collision detection
    if (!chunk.userData.obstacles) {
      chunk.userData.obstacles = [];
    }

    chunk.userData.obstacles.push({
      mesh: obstacle,
      position: { x: lane, y: obstacle.position.y, z: z },
      size: { width: 1.5, height: 2, depth: 0.8 },
    });

    chunk.add(obstacle);
    this.obstacles.push(obstacle);
  }

  addCrystal(chunk, lane, z) {
    // Create crystal with glow effect
    const crystalGeometry = new THREE.OctahedronGeometry(0.4, 0);
    const crystal = new THREE.Mesh(crystalGeometry, this.crystalMaterial);

    // Position crystal (floating above track)
    crystal.position.set(lane, 1 + Math.sin(Date.now() * 0.001) * 0.1, z);

    // Add rotation animation
    crystal.userData.rotationSpeed = 0.02;

    // Store crystal in chunk's userData for collision detection
    if (!chunk.userData.crystals) {
      chunk.userData.crystals = [];
    }

    chunk.userData.crystals.push({
      mesh: crystal,
      position: { x: lane, y: crystal.position.y, z: z },
      value: 1,
      collected: false,
    });

    chunk.add(crystal);
    this.crystals.push(crystal);
  }

  addPowerup(chunk, lane, z) {
    // Determine power-up type
    const powerupType = Math.floor(Math.random() * 3);
    const types = ["shield", "magnet", "speed"];
    const type = types[powerupType];

    // Create power-up base geometry
    const powerupGeometry = new THREE.SphereGeometry(0.5, 16, 16);

    // Different colors for different power-ups
    let powerupColor;
    switch (type) {
      case "shield":
        powerupColor = 0x00ff00;
        break;
      case "magnet":
        powerupColor = 0xffaa00;
        break;
      case "speed":
        powerupColor = 0xff00ff;
        break;
    }

    const powerupMaterial = new THREE.MeshPhongMaterial({
      color: powerupColor,
      specular: 0xffffff,
      shininess: 100,
      transparent: true,
      opacity: 0.8,
    });

    const powerup = new THREE.Mesh(powerupGeometry, powerupMaterial);

    // Position power-up (floating above track)
    powerup.position.set(lane, 1.2, z);

    // Add rotation animation
    powerup.userData.rotationSpeed = 0.03;
    powerup.userData.type = type;

    // Store power-up in chunk's userData for collision detection
    if (!chunk.userData.powerups) {
      chunk.userData.powerups = [];
    }

    chunk.userData.powerups.push({
      mesh: powerup,
      position: { x: lane, y: powerup.position.y, z: z },
      type: type,
      collected: false,
    });

    chunk.add(powerup);
    this.powerups.push(powerup);
  }

  update(delta, gameSpeed, playerPosition) {
    // Make sure we have a valid playerPosition
    if (!playerPosition || typeof playerPosition.z === "undefined") {
      console.warn("Missing or invalid playerPosition in world update");

      // Use default position as fallback
      if (this.defaultPlayerPosition) {
        playerPosition = this.defaultPlayerPosition;
      } else {
        // If we don't have any position, we can't update
        return;
      }
    }

    // Store the valid position as our new default
    this.defaultPlayerPosition = { ...playerPosition };

    // Optimize update loop by reducing calculations
    const normalizedDelta = Math.min(delta, 0.1); // Cap delta to prevent large jumps

    // Only update visible objects
    this.updateVisibleObjects(normalizedDelta, playerPosition);

    // Update track effects only when player is close
    this.updateNearbyEffects(normalizedDelta, playerPosition);

    // We don't need to check collisions here - the game handles this
    // The game will call checkCollisions directly with the player hitbox

    // Manage chunks with optimized visibility culling
    this.manageChunks(playerPosition);
  }

  updateVisibleObjects(delta, playerPosition) {
    // Only update objects within a certain distance from the player
    const visibilityDistance = 100;

    // Update objects in active chunks only if they're visible
    for (let i = 0; i < this.activeChunks.length; i++) {
      const chunk = this.activeChunks[i];

      if (!chunk) continue;

      // Calculate chunk distance from player
      const chunkStartZ = chunk.position.z;
      const chunkEndZ = chunkStartZ + this.chunkLength;

      // Skip updating if chunk is too far behind or ahead
      if (
        playerPosition.z - chunkEndZ > 20 ||
        chunkStartZ - playerPosition.z > visibilityDistance
      ) {
        continue;
      }

      // Update obstacles - use userData.obstacles instead of chunk.obstacles
      if (chunk.userData && chunk.userData.obstacles) {
        for (let j = 0; j < chunk.userData.obstacles.length; j++) {
          const obstacle = chunk.userData.obstacles[j];

          if (!obstacle || !obstacle.position) continue;

          // Skip if too far
          if (
            Math.abs(obstacle.position.z - playerPosition.z) >
            visibilityDistance
          ) {
            // Ensure distant objects are hidden
            if (obstacle.mesh && obstacle.mesh.visible) {
              obstacle.mesh.visible = false;
            }
            continue;
          }

          // Make visible and update
          if (obstacle.mesh && !obstacle.mesh.visible) {
            obstacle.mesh.visible = true;
          }

          // Update any obstacle animation or effects
          if (obstacle.update) {
            obstacle.update(delta);
          }
        }
      }

      // Update crystals with the same distance check
      if (chunk.userData && chunk.userData.crystals) {
        for (let j = 0; j < chunk.userData.crystals.length; j++) {
          const crystal = chunk.userData.crystals[j];

          if (!crystal || !crystal.position) continue;

          if (
            Math.abs(crystal.position.z - playerPosition.z) > visibilityDistance
          ) {
            if (crystal.mesh && crystal.mesh.visible) {
              crystal.mesh.visible = false;
            }
            continue;
          }

          if (crystal.mesh && !crystal.mesh.visible) {
            crystal.mesh.visible = true;
          }

          if (crystal.update) {
            crystal.update(delta);
          }
        }
      }

      // Update powerups with the same distance check
      if (chunk.userData && chunk.userData.powerups) {
        for (let j = 0; j < chunk.userData.powerups.length; j++) {
          const powerup = chunk.userData.powerups[j];

          if (!powerup || !powerup.position) continue;

          if (
            Math.abs(powerup.position.z - playerPosition.z) > visibilityDistance
          ) {
            if (powerup.mesh && powerup.mesh.visible) {
              powerup.mesh.visible = false;
            }
            continue;
          }

          if (powerup.mesh && !powerup.mesh.visible) {
            powerup.mesh.visible = true;
          }

          if (powerup.update) {
            powerup.update(delta);
          }
        }
      }
    }
  }

  updateNearbyEffects(delta, playerPosition) {
    // Only update effects close to the player
    const effectsDistance = 50;

    // Select active effects based on player position
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];

      // Skip if chunk is too far
      if (Math.abs(chunk.position.z - playerPosition.z) > effectsDistance) {
        continue;
      }

      // Update track effects
      if (chunk.trackEffects) {
        for (let j = 0; j < chunk.trackEffects.length; j++) {
          const effect = chunk.trackEffects[j];
          if (effect.update) {
            effect.update(delta);
          }
        }
      }
    }

    // Update ambient effects that are always visible
    if (this.ambientParticles) {
      this.updateAmbientParticles(delta);
    }
  }

  createTrackMeshForSegment(segmentType, chunk) {
    // Create appropriate track mesh based on segment type
    switch (segmentType) {
      case this.chunkTypes.LEFT_TURN:
        this.createTurnTrackMesh(segmentType, chunk, -1); // -1 for left turn
        break;
      case this.chunkTypes.RIGHT_TURN:
        this.createTurnTrackMesh(segmentType, chunk, 1); // 1 for right turn
        break;
      case this.chunkTypes.RAMP_UP:
        this.createRampTrackMesh(segmentType, chunk, 1); // 1 for upward
        break;
      case this.chunkTypes.RAMP_DOWN:
        this.createRampTrackMesh(segmentType, chunk, -1); // -1 for downward
        break;
      case this.chunkTypes.STRAIGHT:
      default:
        this.createStraightTrackMesh(segmentType, chunk);
        break;
    }

    // Add track columns and decorations
    this.addTrackColumns(chunk, segmentType);

    // Add lane indicators
    this.addLaneMarkers(chunk, this.chunkSize, this.trackWidth);

    return chunk;
  }

  createStraightTrackMesh(segmentType, chunk) {
    // Create the basic track - a simple plane
    const trackGeometry = new THREE.PlaneGeometry(
      this.trackWidth,
      this.chunkSize,
      8,
      32
    );
    trackGeometry.rotateX(-Math.PI / 2); // Rotate to be horizontal

    const trackMesh = new THREE.Mesh(trackGeometry, this.trackMaterial);
    trackMesh.receiveShadow = true;

    // Position the track at the center of the chunk
    trackMesh.position.set(0, 0, this.chunkSize / 2);

    chunk.add(trackMesh);

    // Add edge glow
    const leftEdgeGeometry = new THREE.BoxGeometry(0.2, 0.1, this.chunkSize);
    const rightEdgeGeometry = new THREE.BoxGeometry(0.2, 0.1, this.chunkSize);

    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 0.5,
    });

    const leftEdge = new THREE.Mesh(leftEdgeGeometry, edgeMaterial);
    leftEdge.position.set(-this.trackWidth / 2, 0.05, this.chunkSize / 2);

    const rightEdge = new THREE.Mesh(rightEdgeGeometry, edgeMaterial);
    rightEdge.position.set(this.trackWidth / 2, 0.05, this.chunkSize / 2);

    chunk.add(leftEdge);
    chunk.add(rightEdge);

    return trackMesh;
  }

  createTurnTrackMesh(segmentType, chunk, turnDirection) {
    const width = this.trackWidth;
    const radius = this.trackWidth;
    const segments = 10; // Number of segments in the curve

    // Create track group
    const trackGroup = new THREE.Group();
    trackGroup.position.copy(segmentType.startPosition);

    // Create a curve representing the path
    const curve = new THREE.CurvePath();
    const startPoint = new THREE.Vector3(0, 0, 0);
    const endPoint = new THREE.Vector3(turnDirection * radius, 0, radius);
    const controlPoint = new THREE.Vector3(
      (turnDirection * radius) / 2,
      0,
      radius / 2
    );

    // Create a quadratic curve for smooth turning
    const curvePath = new THREE.QuadraticBezierCurve3(
      startPoint,
      controlPoint,
      endPoint
    );
    curve.add(curvePath);

    // Create track surface
    const trackGeometry = new THREE.BoxGeometry(width, 0.2, 1);
    trackGeometry.translate(0, 0, 0.5); // Center the track segment

    // Create points along the curve
    const points = curve.getPoints(segments);

    // Place track segments along the curve
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];

      // Calculate direction vector
      const direction = new THREE.Vector3()
        .subVectors(next, current)
        .normalize();

      // Calculate length of this segment
      const segmentLength = current.distanceTo(next);

      // Create segment geometry - scale to match segment length
      const segmentGeo = trackGeometry.clone();
      segmentGeo.scale(1, 1, segmentLength);

      // Create segment mesh
      const segment = new THREE.Mesh(segmentGeo, this.trackMaterial);
      segment.position.copy(current);

      // Orient segment to face the next point
      segment.lookAt(next);

      segment.receiveShadow = true;
      trackGroup.add(segment);

      // Add edge rails
      const railGeometry = new THREE.BoxGeometry(0.3, 0.3, segmentLength);
      railGeometry.translate(0, 0, segmentLength / 2); // Center the rail

      const leftRail = new THREE.Mesh(railGeometry, this.trackEdgeMaterial);
      leftRail.position.copy(current);
      leftRail.lookAt(next);
      leftRail.translateX(-width / 2);
      leftRail.translateY(0.15);
      leftRail.receiveShadow = true;
      leftRail.castShadow = true;
      trackGroup.add(leftRail);

      const rightRail = new THREE.Mesh(railGeometry, this.trackEdgeMaterial);
      rightRail.position.copy(current);
      rightRail.lookAt(next);
      rightRail.translateX(width / 2);
      rightRail.translateY(0.15);
      rightRail.receiveShadow = true;
      rightRail.castShadow = true;
      trackGroup.add(rightRail);
    }

    // Add columns at key points along the curve
    const numColumns = 3;

    for (let i = 0; i < numColumns; i++) {
      const t = i / (numColumns - 1);
      const point = curve.getPoint(t);

      const column = this.createSpaceColumn();

      // Position column outside the curve
      const tangent = curve.getTangent(t).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(
        turnDirection === 1 ? 1 : -1
      );

      const columnPos = point.clone().add(normal.multiplyScalar(width / 2 + 3));
      column.position.set(columnPos.x, -5, columnPos.z);
      trackGroup.add(column);
    }

    // Add the track to the chunk
    chunk.add(trackGroup);

    return trackGroup;
  }

  createRampTrackMesh(segmentType, chunk, verticalDir) {
    const length = this.chunkSize;
    const width = this.trackWidth;
    const height = 10; // Ramp height

    // Create track group
    const trackGroup = new THREE.Group();
    

    // Create ramp geometry
    const rampShape = new THREE.Shape();
    rampShape.moveTo(0, 0);
    rampShape.lineTo(0, height);
    rampShape.lineTo(length, height);
    rampShape.lineTo(length, 0);

    const extrudeSettings = {
      steps: 1,
      depth: width,
      bevelEnabled: false,
    };

    const rampGeometry = new THREE.ExtrudeGeometry(rampShape, extrudeSettings);
    rampGeometry.rotateX(Math.PI / 2);
    rampGeometry.translate(-width / 2, 0, 0);

    const rampMesh = new THREE.Mesh(rampGeometry, this.trackMaterial);
    rampMesh.receiveShadow = true;
    trackGroup.add(rampMesh);

    // Add edge rails
    const railPoints = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(length, height, 0),
    ];

    const railCurve = new THREE.LineCurve3(railPoints[0], railPoints[1]);
    const railGeometry = new THREE.TubeGeometry(railCurve, 1, 0.15, 8, false);

    const leftRail = new THREE.Mesh(railGeometry, this.trackEdgeMaterial);
    leftRail.position.set(-width / 2, 0.15, 0);
    leftRail.receiveShadow = true;
    leftRail.castShadow = true;
    trackGroup.add(leftRail);

    const rightRail = new THREE.Mesh(railGeometry, this.trackEdgeMaterial);
    rightRail.position.set(width / 2, 0.15, 0);
    rightRail.receiveShadow = true;
    rightRail.castShadow = true;
    trackGroup.add(rightRail);

    // Add the track to the chunk
    chunk.add(trackGroup);

    return trackGroup;
  }

  addTrackColumns(trackGroup, segment) {
    const length = segment.length;
    const width = this.trackWidth;

    // Add columns at regular intervals
    const columnSpacing = 20;
    const numColumns = Math.floor(length / columnSpacing);

    for (let i = 0; i < numColumns; i++) {
      const leftColumn = this.createSpaceColumn();
      const rightColumn = this.createSpaceColumn();

      const zPos = i * columnSpacing + columnSpacing / 2;
      const xOffset = width / 2 + 3;

      leftColumn.position.set(-xOffset, -5, zPos);
      rightColumn.position.set(xOffset, -5, zPos);

      trackGroup.add(leftColumn);
      trackGroup.add(rightColumn);
    }
  }

  // Create a space column with optimized geometry
  createSpaceColumn() {
    const column = new THREE.Group();

    // Base
    const baseGeometry = new THREE.CylinderGeometry(1.5, 2, 1, 8);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x444466,
      roughness: 0.5,
      metalness: 0.7,
      emissive: 0x222233,
      emissiveIntensity: 0.1,
    });

    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0;
    base.receiveShadow = true;
    base.castShadow = true;
    column.add(base);

    // Column shaft with reduced segments
    const shaftGeometry = new THREE.CylinderGeometry(1, 1, 10, 8);
    const shaftMaterial = new THREE.MeshStandardMaterial({
      color: 0x334455,
      roughness: 0.4,
      metalness: 0.6,
      emissive: 0x113355,
      emissiveIntensity: 0.2,
    });

    const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
    shaft.position.y = 5;
    shaft.receiveShadow = true;
    shaft.castShadow = true;
    column.add(shaft);

    // Top with reduced polygon count
    const topGeometry = new THREE.CylinderGeometry(1.5, 1, 1, 8);
    const top = new THREE.Mesh(topGeometry, baseMaterial);
    top.position.y = 10.5;
    top.receiveShadow = true;
    top.castShadow = true;
    column.add(top);

    // Optional ornament - only add to some columns
    if (Math.random() < 0.5) {
      const orbGeometry = new THREE.SphereGeometry(0.8, 8, 8);
      const orbMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        roughness: 0.2,
        metalness: 0.9,
        emissive: 0x00ffff,
        emissiveIntensity: 0.5,
      });

      const orb = new THREE.Mesh(orbGeometry, orbMaterial);
      orb.position.y = 12;
      orb.receiveShadow = true;
      orb.castShadow = true;
      column.add(orb);

      // Add a point light for the orb
      const light = new THREE.PointLight(0x00ffff, 1, 10);
      light.position.y = 12;
      column.add(light);
    }

    return column;
  }

  // Create a decorative element for the space track
  createSpaceDecoration() {
    const decoration = new THREE.Group();

    // Random decoration style
    const decorType = Math.floor(Math.random() * 3);

    if (decorType === 0) {
      // Floating crystal formation
      const crystalGeometry = new THREE.OctahedronGeometry(0.8, 0);
      const crystalMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ffaa,
        roughness: 0.1,
        metalness: 0.8,
        emissive: 0x00ffaa,
        emissiveIntensity: 0.6,
      });

      // Create crystal cluster
      for (let i = 0; i < 3; i++) {
        const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
        crystal.position.set(
          (Math.random() - 0.5) * 1.5,
          1.5 + Math.random() * 1.5,
          (Math.random() - 0.5) * 1.5
        );
        crystal.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        );
        crystal.scale.set(
          0.5 + Math.random() * 0.7,
          0.5 + Math.random() * 0.7,
          0.5 + Math.random() * 0.7
        );
        crystal.castShadow = true;
        decoration.add(crystal);
      }

      // Add glow light
      const light = new THREE.PointLight(0x00ffaa, 1, 5);
      light.position.y = 2;
      decoration.add(light);
    } else if (decorType === 1) {
      // Tech panel/monument
      const baseGeometry = new THREE.BoxGeometry(1.5, 0.2, 1.5);
      const baseMaterial = new THREE.MeshStandardMaterial({
        color: 0x333344,
        roughness: 0.8,
        metalness: 0.5,
      });

      const base = new THREE.Mesh(baseGeometry, baseMaterial);
      base.position.y = 0.1;
      base.receiveShadow = true;
      decoration.add(base);

      const panelGeometry = new THREE.BoxGeometry(1, 2, 0.1);
      const panelMaterial = new THREE.MeshStandardMaterial({
        color: 0x555566,
        roughness: 0.4,
        metalness: 0.7,
        emissive: 0x222233,
        emissiveIntensity: 0.2,
      });

      const panel = new THREE.Mesh(panelGeometry, panelMaterial);
      panel.position.y = 1.2;
      panel.position.z = -0.5;
      panel.castShadow = true;
      decoration.add(panel);

      // Add holographic light effect
      const holoGeometry = new THREE.PlaneGeometry(0.8, 0.8);
      const holoMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
      });

      const holo = new THREE.Mesh(holoGeometry, holoMaterial);
      holo.position.set(0, 1.5, -0.44);
      decoration.add(holo);
    } else {
      // Space artifact/relic
      const geom = new THREE.TorusKnotGeometry(0.5, 0.15, 32, 8);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x9966ff,
        roughness: 0.3,
        metalness: 0.8,
        emissive: 0x442288,
        emissiveIntensity: 0.4,
      });

      const artifact = new THREE.Mesh(geom, mat);
      artifact.position.y = 1.5;
      artifact.castShadow = true;
      decoration.add(artifact);

      // Add base
      const pedesGeometry = new THREE.CylinderGeometry(0.3, 0.5, 1, 8);
      const pedesMaterial = new THREE.MeshStandardMaterial({
        color: 0x333344,
        roughness: 0.6,
        metalness: 0.5,
      });

      const pedestal = new THREE.Mesh(pedesGeometry, pedesMaterial);
      pedestal.position.y = 0.5;
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      decoration.add(pedestal);

      // Add light
      const light = new THREE.PointLight(0x9966ff, 1, 4);
      light.position.y = 1.5;
      decoration.add(light);
    }

    return decoration;
  }

  manageChunks(playerPosition) {
    if (!playerPosition || typeof playerPosition.z === "undefined") {
      return;
    }

    // Calculate how many chunks we need ahead
    const chunksAhead = 5; // Keep 5 chunks ahead of player
    const chunksNeeded = chunksAhead;

    // Find the furthest chunk's Z position
    let furthestZ = playerPosition.z - 20; // Start behind player
    for (let i = 0; i < this.activeChunks.length; i++) {
      if (this.activeChunks[i] && this.activeChunks[i].position.z > furthestZ) {
        furthestZ = this.activeChunks[i].position.z;
      }
    }

    // Generate new chunks if needed
    while (furthestZ < playerPosition.z + chunksNeeded * this.chunkSize) {
      const newChunkZ = furthestZ + this.chunkSize;
      const segmentType = this.chooseNextSegmentType();

      console.log(`Generating new chunk at Z: ${newChunkZ}`);

      // Create a new chunk at the furthest position
      const newChunk = this.generateChunkFromSegment(segmentType);
      newChunk.position.z = newChunkZ;
      furthestZ = newChunkZ;

      // Add to active chunks
      this.activeChunks.push(newChunk);

      // Add to the scene
      this.scene.add(newChunk);

      // Populate with obstacles, crystals, etc.
      this.populateChunk(newChunk);
    }

    // Remove chunks that are too far behind the player
    const chunksToRemove = [];
    for (let i = 0; i < this.activeChunks.length; i++) {
      const chunk = this.activeChunks[i];
      if (
        chunk &&
        playerPosition.z - (chunk.position.z + this.chunkSize) > 50
      ) {
        chunksToRemove.push(i);
      }
    }

    // Remove chunks in reverse order to avoid index shifting issues
    for (let i = chunksToRemove.length - 1; i >= 0; i--) {
      const index = chunksToRemove[i];
      this.removeChunk(index);
    }
  }

  removeChunk(index) {
    if (index < 0 || index >= this.activeChunks.length) return;

    const chunk = this.activeChunks[index];
    if (!chunk) return;

    // Remove from scene
    this.scene.remove(chunk);

    // Recycle all resources
    if (chunk.userData) {
      // Return obstacles to pool
      if (chunk.userData.obstacles) {
        for (let i = 0; i < chunk.userData.obstacles.length; i++) {
          const obstacle = chunk.userData.obstacles[i];
          if (obstacle) {
            // Return to pool if not already collected
            if (!obstacle.collected) {
              this.returnToPool("obstacles", obstacle);
            }
          }
        }
      }

      // Return crystals to pool
      if (chunk.userData.crystals) {
        for (let i = 0; i < chunk.userData.crystals.length; i++) {
          const crystal = chunk.userData.crystals[i];
          if (crystal && !crystal.collected) {
            this.returnToPool("crystals", crystal);
          }
        }
      }

      // Return powerups to pool
      if (chunk.userData.powerups) {
        for (let i = 0; i < chunk.userData.powerups.length; i++) {
          const powerup = chunk.userData.powerups[i];
          if (powerup && !powerup.collected) {
            this.returnToPool("powerups", powerup);
          }
        }
      }
    }

    // Remove the chunk from active chunks array
    this.activeChunks.splice(index, 1);

    console.log(
      `Removed chunk at index ${index}, active chunks: ${this.activeChunks.length}`
    );
  }

  updateObjects(delta) {
    // Update all active crystals (rotation and floating effect)
    this.objectPools.crystals.inUse.forEach((crystal) => {
      if (crystal.mesh && crystal.mesh.visible && !crystal.collected) {
        // Apply rotation
        crystal.mesh.rotation.x += 0.01;
        crystal.mesh.rotation.y += 0.02;

        // Apply floating motion
        const time = Date.now() * 0.001;
        crystal.mesh.position.y =
          crystal.position.y +
          Math.sin(time + (crystal.mesh.userData.floatOffset || 0)) * 0.2;

        // Pulse inner glow if it exists
        if (crystal.mesh.children && crystal.mesh.children.length > 0) {
          const child = crystal.mesh.children[0];
          if (child.children && child.children.length > 0) {
            const core = child.children[0];
            if (core.material) {
              core.material.emissiveIntensity = 0.5 + Math.sin(time * 2) * 0.3;
            }
          }
        }
      }
    });

    // Update all active powerups (rotation and floating effect)
    this.objectPools.powerups.inUse.forEach((powerup) => {
      if (powerup.mesh && powerup.mesh.visible) {
        powerup.mesh.rotation.y += 0.03;
        powerup.mesh.position.y = 1.2 + Math.sin(Date.now() * 0.001) * 0.1;
      }
    });

    // Update obstacles - Apply animations based on type
    this.objectPools.obstacles.inUse.forEach((obstacle) => {
      if (obstacle.mesh && obstacle.mesh.visible) {
        switch (obstacle.type) {
          case "asteroid":
            // Slow rotation
            obstacle.mesh.rotation.x += 0.005;
            obstacle.mesh.rotation.y += 0.003;
            break;

          case "debris":
            // Random sparking effect
            if (obstacle.mesh.userData.canSpark && Math.random() < 0.02) {
              this.createSparkEffect(obstacle.mesh.position.clone());
            }
            break;

          case "barrier":
            // Energy field ripple effect
            if (obstacle.mesh.children) {
              obstacle.mesh.children.forEach((child) => {
                if (child.userData && child.userData.animate) {
                  child.userData.time += delta;

                  // Modulate opacity for ripple effect
                  if (child.material) {
                    const pulse = Math.sin(child.userData.time * 3) * 0.2 + 0.7;
                    child.material.opacity = pulse;
                  }
                }
              });
            }
            break;

          case "totem":
            // Pulsing eyes
            if (obstacle.mesh.children) {
              obstacle.mesh.children.forEach((child) => {
                if (child.userData && child.userData.pulse) {
                  const pulse = Math.sin(Date.now() * 0.005) * 0.5 + 0.5;
                  if (child.material) {
                    child.material.emissiveIntensity = 0.5 + pulse * 0.5;
                  }

                  // Also scale slightly for throbbing effect
                  const scale = 0.9 + pulse * 0.2;
                  child.scale.set(scale, scale, scale);
                }
              });
            }
            break;
        }
      }
    });
  }

  // Create spark effect for damaged debris
  createSparkEffect(position) {
    const particleCount = 10;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i++) {
      positions[i] = position.toArray()[i % 3];
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffaa00,
      size: 0.1,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
    });

    const sparks = new THREE.Points(geometry, material);
    this.scene.add(sparks);

    // Animate sparks flying outward
    const velocities = [];
    for (let i = 0; i < particleCount; i++) {
      velocities.push({
        x: (Math.random() - 0.5) * 0.1,
        y: Math.random() * 0.1,
        z: (Math.random() - 0.5) * 0.1,
      });
    }

    const animateSparks = () => {
      const positions = sparks.geometry.attributes.position.array;

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3] += velocities[i].x;
        positions[i3 + 1] += velocities[i].y;
        positions[i3 + 2] += velocities[i].z;

        // Add gravity
        velocities[i].y -= 0.01;
      }

      sparks.geometry.attributes.position.needsUpdate = true;

      material.opacity -= 0.05;

      if (material.opacity > 0) {
        requestAnimationFrame(animateSparks);
      } else {
        this.scene.remove(sparks);
        geometry.dispose();
        material.dispose();
      }
    };

    animateSparks();
  }

  checkCollisions(playerHitbox) {
    // Safely check if playerHitbox exists and has the required properties
    if (
      !playerHitbox ||
      !playerHitbox.min ||
      !playerHitbox.max ||
      typeof playerHitbox.min.z === "undefined" ||
      typeof playerHitbox.max.z === "undefined"
    ) {
      console.warn("Invalid player hitbox provided to world.checkCollisions");
      return [];
    }

    const collisions = [];

    // Check all active chunks
    for (let i = 0; i < this.activeChunks.length; i++) {
      const chunk = this.activeChunks[i];

      if (!chunk || !chunk.position) continue;

      // If chunk is too far behind or ahead, skip collision check for performance
      // Adjusted range check for positive Z direction
      if (
        chunk.position.z < playerHitbox.min.z - 20 ||
        chunk.position.z > playerHitbox.max.z + 20
      ) {
        continue;
      }

      // Check obstacle collisions
      if (chunk.userData && chunk.userData.obstacles) {
        for (let j = 0; j < chunk.userData.obstacles.length; j++) {
          const obstacle = chunk.userData.obstacles[j];

          if (!obstacle || !obstacle.position || obstacle.collected) continue;

          // Get obstacle position in world space
          const obstacleWorldPos = {
            x: chunk.position.x + obstacle.position.x,
            y: chunk.position.y + obstacle.position.y,
            z: chunk.position.z + obstacle.position.z,
          };

          // Get obstacle bounds from userData or use default
          let obstacleSize = obstacle.userData?.size || {
            width: 1,
            height: 1,
            depth: 1,
          };

          // Scale bounds based on visible mesh size if available
          if (obstacle.geometry) {
            obstacle.geometry.computeBoundingBox();
            const box = obstacle.geometry.boundingBox;
            obstacleSize = {
              width: (box.max.x - box.min.x) * obstacle.scale.x,
              height: (box.max.y - box.min.y) * obstacle.scale.y,
              depth: (box.max.z - box.min.z) * obstacle.scale.z,
            };
          }

          // Create obstacle hitbox
          const obstacleHitbox = {
            min: {
              x: obstacleWorldPos.x - obstacleSize.width / 2,
              y: obstacleWorldPos.y,
              z: obstacleWorldPos.z - obstacleSize.depth / 2,
            },
            max: {
              x: obstacleWorldPos.x + obstacleSize.width / 2,
              y: obstacleWorldPos.y + obstacleSize.height,
              z: obstacleWorldPos.z + obstacleSize.depth / 2,
            },
          };

          // AABB collision detection between player hitbox and obstacle hitbox
          if (
            playerHitbox.max.x > obstacleHitbox.min.x &&
            playerHitbox.min.x < obstacleHitbox.max.x &&
            playerHitbox.max.y > obstacleHitbox.min.y &&
            playerHitbox.min.y < obstacleHitbox.max.y &&
            playerHitbox.max.z > obstacleHitbox.min.z &&
            playerHitbox.min.z < obstacleHitbox.max.z
          ) {
            // Mark as hit to prevent multiple collisions
            obstacle.collected = true;

            // Create visual hit effect
            this.createHitEffect(obstacleWorldPos);

            // Add collision to result array
            collisions.push({
              type: "obstacle",
              object: obstacle,
              position: obstacleWorldPos,
              deadly: obstacle.userData?.deadly || false,
            });

            // Log collision for debugging
            console.log(
              "Obstacle collision:",
              obstacle.name || "unnamed obstacle"
            );
          }
        }
      }

      // Check crystal collisions
      if (chunk.userData && chunk.userData.crystals) {
        for (let j = 0; j < chunk.userData.crystals.length; j++) {
          const crystal = chunk.userData.crystals[j];

          if (!crystal || !crystal.position || crystal.collected) continue;

          // Get crystal position in world space
          const crystalWorldPos = {
            x: chunk.position.x + crystal.position.x,
            y: chunk.position.y + crystal.position.y,
            z: chunk.position.z + crystal.position.z,
          };

          // Use a sphere collision for crystals (more forgiving)
          const crystalRadius = 0.7; // Slightly larger than visual size for better collection experience
          const playerCenter = {
            x: (playerHitbox.min.x + playerHitbox.max.x) / 2,
            y: (playerHitbox.min.y + playerHitbox.max.y) / 2,
            z: (playerHitbox.min.z + playerHitbox.max.z) / 2,
          };

          // Calculate distance from player center to crystal
          const dx = playerCenter.x - crystalWorldPos.x;
          const dy = playerCenter.y - crystalWorldPos.y;
          const dz = playerCenter.z - crystalWorldPos.z;
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (
            distance <
            crystalRadius + Math.min(playerHitbox.width, playerHitbox.depth) / 2
          ) {
            // Mark as collected
            crystal.collected = true;

            // Add to collisions array
            collisions.push({
              type: "crystal",
              object: crystal,
              position: crystalWorldPos,
            });

            // Create collection effect
            this.createCollectionEffect(crystalWorldPos, "crystal");
          }
        }
      }

      // Check powerup collisions
      if (chunk.userData && chunk.userData.powerups) {
        for (let j = 0; j < chunk.userData.powerups.length; j++) {
          const powerup = chunk.userData.powerups[j];

          if (!powerup || !powerup.position || powerup.collected) continue;

          // Get powerup position in world space
          const powerupWorldPos = {
            x: chunk.position.x + powerup.position.x,
            y: chunk.position.y + powerup.position.y,
            z: chunk.position.z + powerup.position.z,
          };

          // Use a sphere collision for powerups (more forgiving)
          const powerupRadius = 0.8; // Slightly larger than visual size
          const playerCenter = {
            x: (playerHitbox.min.x + playerHitbox.max.x) / 2,
            y: (playerHitbox.min.y + playerHitbox.max.y) / 2,
            z: (playerHitbox.min.z + playerHitbox.max.z) / 2,
          };

          // Calculate distance
          const dx = playerCenter.x - powerupWorldPos.x;
          const dy = playerCenter.y - powerupWorldPos.y;
          const dz = playerCenter.z - powerupWorldPos.z;
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (
            distance <
            powerupRadius + Math.min(playerHitbox.width, playerHitbox.depth) / 2
          ) {
            // Mark as collected
            powerup.collected = true;

            // Add to collisions array
            collisions.push({
              type: "powerup",
              object: powerup,
              position: powerupWorldPos,
            });

            // Create collection effect with powerup type color
            this.createCollectionEffect(
              powerupWorldPos,
              powerup.userData?.powerupType || "powerup"
            );
          }
        }
      }
    }

    return collisions;
  }

  createHitEffect(position) {
    // Create particles for hit effect
    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = position.x;
      positions[i3 + 1] = position.y;
      positions[i3 + 2] = position.z;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xff0000,
      size: 0.2,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);

    // Animate particles outward
    const velocities = [];
    for (let i = 0; i < particleCount; i++) {
      velocities.push({
        x: (Math.random() - 0.5) * 0.2,
        y: (Math.random() - 0.5) * 0.2 + 0.1,
        z: (Math.random() - 0.5) * 0.2,
      });
    }

    const animateParticles = () => {
      const positions = particles.geometry.attributes.position.array;

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3] += velocities[i].x;
        positions[i3 + 1] += velocities[i].y;
        positions[i3 + 2] += velocities[i].z;

        // Add gravity
        velocities[i].y -= 0.01;
      }

      particles.geometry.attributes.position.needsUpdate = true;

      material.opacity -= 0.02;

      if (material.opacity > 0) {
        requestAnimationFrame(animateParticles);
      } else {
        this.scene.remove(particles);
        geometry.dispose();
        material.dispose();
      }
    };

    animateParticles();
  }

  createCollectionEffect(position, type = "crystal") {
    // Create particles for collection effect
    const particleCount = 10;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = position.x;
      positions[i3 + 1] = position.y;
      positions[i3 + 2] = position.z;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // Set color based on type
    let color = 0x00ffff; // Default cyan for crystals
    if (type === "shield") color = 0x00ff00; // Green for shield
    if (type === "magnet") color = 0xffff00; // Yellow for magnet
    if (type === "speed") color = 0xff00ff; // Magenta for speed

    const material = new THREE.PointsMaterial({
      color: color,
      size: 0.15,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);

    // Animate particles upward
    const velocities = [];
    for (let i = 0; i < particleCount; i++) {
      velocities.push({
        x: (Math.random() - 0.5) * 0.1,
        y: Math.random() * 0.1 + 0.05,
        z: (Math.random() - 0.5) * 0.1,
      });
    }

    const animateParticles = () => {
      const positions = particles.geometry.attributes.position.array;

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3] += velocities[i].x;
        positions[i3 + 1] += velocities[i].y;
        positions[i3 + 2] += velocities[i].z;
      }

      particles.geometry.attributes.position.needsUpdate = true;

      material.opacity -= 0.02;

      if (material.opacity > 0) {
        requestAnimationFrame(animateParticles);
      } else {
        this.scene.remove(particles);
        geometry.dispose();
        material.dispose();
      }
    };

    animateParticles();
  }

  reset() {
    // Remove all chunks
    this.chunks.forEach((chunk) => {
      // Clean up resources
      if (chunk.userData.obstacles) {
        chunk.userData.obstacles.forEach((obstacle) => {
          this.returnToPool("obstacles", obstacle);
        });
      }

      if (chunk.userData.crystals) {
        chunk.userData.crystals.forEach((crystal) => {
          this.returnToPool("crystals", crystal);
        });
      }

      if (chunk.userData.powerups) {
        chunk.userData.powerups.forEach((powerup) => {
          this.returnToPool("powerups", powerup);
        });
      }

      this.scene.remove(chunk);
    });

    this.chunks = [];
    this.activeChunks = [];

    // Reset track generation
    this.trackPath = [];
    this.trackPathLength = 0;
    this.currentDirection = new THREE.Vector3(0, 0, -1);
    this.nextSegmentPosition = new THREE.Vector3(0, 0, 0);
    this.currentDifficulty = "easy";

    // Generate new initial track
    this.generateInitialTrackPath();
  }

  addNextTrackSegment() {
    const segmentType = this.chooseNextSegmentType();
    return this.addTrackSegment(segmentType);
  }

  chooseNextSegmentType() {
    // Get weights based on current difficulty
    const weights = this.segmentDifficultyWeights;

    // Random value between 0 and 1
    const random = Math.random();

    // Cumulative probability for weighted selection
    let cumulativeProbability = 0;

    // Check each segment type
    for (const type in weights) {
      cumulativeProbability += weights[type];

      // If random value is less than cumulative probability, select this type
      if (random < cumulativeProbability) {
        return type;
      }
    }

    // Default to straight segment if something goes wrong
    return this.chunkTypes.STRAIGHT;
  }

  generateChunkFromSegment(segmentType) {
    // Create new chunk group
    const chunk = new THREE.Group();

    // Store segment type in userData
    chunk.userData = {
      segmentType: segmentType,
      obstacles: [],
      crystals: [],
      powerups: [],
    };

    // Create track mesh based on segment type
    this.createTrackMeshForSegment(segmentType, chunk);

    // Add decorations based on segment type
    this.addTrackDecorations(chunk, segmentType);

    return chunk;
  }

  addTempleDecoration(chunk, length, width) {
    // Add space-temple columns every X units
    for (let i = 5; i < length; i += 10) {
      // Left column
      const leftColumn = this.createSpaceColumn();
      leftColumn.position.set(-width / 2 - 1.5, 0, i);
      chunk.add(leftColumn);

      // Right column
      const rightColumn = this.createSpaceColumn();
      rightColumn.position.set(width / 2 + 1.5, 0, i);
      chunk.add(rightColumn);
    }
  }

  populateSegment(segment, chunk) {
    // Add obstacles and collectibles based on segment type
    const segmentLength = segment.length;
    const trackWidth = this.trackWidth;

    // Space out obstacles and collectibles along the segment
    for (let z = 5; z < segmentLength; z += 10) {
      // Only generate obstacles/collectibles with some probability
      if (Math.random() < 0.6) {
        // Pick random lane
        const lanePositions = [-trackWidth / 3, 0, trackWidth / 3];
        const laneIndex = Math.floor(Math.random() * 3);
        const lane = lanePositions[laneIndex];

        // Decide what to place (obstacle, crystal, or power-up)
        const objectType = Math.random();

        if (objectType < 0.6) {
          // 60% chance for an obstacle
          const obstacle = this.getFromPool("obstacles");
          if (obstacle) {
            obstacle.position.x = lane;
            obstacle.position.y = 0.5;
            obstacle.position.z = z;

            if (obstacle.mesh) {
              obstacle.mesh.position.set(lane, 0.5, z);
              obstacle.mesh.visible = true;
              chunk.add(obstacle.mesh);
            }

            // Store for collision detection
            if (!chunk.userData.obstacles) {
              chunk.userData.obstacles = [];
            }
            chunk.userData.obstacles.push(obstacle);
          }
        } else if (objectType < 0.95) {
          // 35% chance for crystals
          const crystal = this.getFromPool("crystals");
          if (crystal) {
            crystal.position.x = lane;
            crystal.position.y = 1;
            crystal.position.z = z;

            if (crystal.mesh) {
              crystal.mesh.position.set(lane, 1, z);
              crystal.mesh.visible = true;
              chunk.add(crystal.mesh);
            }

            // Store for collision detection
            if (!chunk.userData.crystals) {
              chunk.userData.crystals = [];
            }
            chunk.userData.crystals.push(crystal);
          }
        } else {
          // 5% chance for a power-up
          const powerup = this.getFromPool("powerups");
          if (powerup) {
            powerup.position.x = lane;
            powerup.position.y = 1;
            powerup.position.z = z;

            if (powerup.mesh) {
              powerup.mesh.position.set(lane, 1, z);
              powerup.mesh.visible = true;
              chunk.add(powerup.mesh);
            }

            // Store for collision detection
            if (!chunk.userData.powerups) {
              chunk.userData.powerups = [];
            }
            chunk.userData.powerups.push(powerup);
          }
        }
      }
    }
  }

  updateEffects(delta) {
    // Update column orb pulsing
    this.scene.traverse((object) => {
      if (object.userData && object.userData.pulseFrequency) {
        const time = Date.now() * 0.001;
        const intensity =
          0.7 +
          0.3 *
            Math.sin(
              time * object.userData.pulseFrequency + object.userData.pulsePhase
            );

        if (object.material) {
          object.material.emissiveIntensity = intensity;
        }

        // Update light intensity if this object has a light as a child
        if (object.parent) {
          object.parent.children.forEach((child) => {
            if (child instanceof THREE.PointLight) {
              child.intensity = 0.5 + intensity * 0.5;
            }
          });
        }
      }
    });

    // Update planet rotations and moon orbits
    if (this.planets) {
      this.planets.forEach((planet) => {
        // Slowly rotate the planet
        planet.rotation.y += 0.0005;

        // Update moons if any
        planet.children.forEach((child) => {
          if (child.userData.orbitRadius) {
            const time = Date.now() * 0.001;
            const speed = child.userData.orbitSpeed || 1;
            const phase = child.userData.orbitPhase || 0;

            // Update moon position in orbit
            child.position.x =
              child.userData.orbitRadius * Math.cos(time * speed * 0.1 + phase);
            child.position.z =
              child.userData.orbitRadius * Math.sin(time * speed * 0.1 + phase);

            // Rotate moon
            child.rotation.y += 0.01;
          }
        });
      });
    }

    // Update asteroid field rotations and parallax
    if (this.asteroidField) {
      this.asteroidField.children.forEach((asteroid) => {
        // Apply rotation
        if (asteroid.userData.rotationSpeed) {
          asteroid.rotation.x += asteroid.userData.rotationSpeed.x;
          asteroid.rotation.y += asteroid.userData.rotationSpeed.y;
          asteroid.rotation.z += asteroid.userData.rotationSpeed.z;
        }
      });
    }

    // Update space dust movement
    if (this.spaceDust) {
      const positions = this.spaceDust.geometry.attributes.position.array;
      const count = positions.length / 3;

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;

        // Move dust toward player (positive z)
        positions[i3 + 2] += 0.2;

        // If dust passes player, reset it far ahead
        if (positions[i3 + 2] > 10) {
          positions[i3 + 2] = -100 - Math.random() * 50;
          positions[i3] = (Math.random() - 0.5) * 60;
          positions[i3 + 1] = (Math.random() - 0.5) * 30;
        }
      }

      this.spaceDust.geometry.attributes.position.needsUpdate = true;
    }

    // Add subtle ambient particles if not already added
    if (!this.ambientParticles) {
      this.createAmbientParticles();
    } else {
      this.updateAmbientParticles(delta);
    }
  }

  createAmbientParticles() {
    // Create a simple particle system for ambient particles
    const particleCount = 100;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 10;
      positions[i3 + 1] = (Math.random() - 0.5) * 10;
      positions[i3 + 2] = (Math.random() - 0.5) * 10;

      colors[i3] = 0.5;
      colors[i3 + 1] = 0.5;
      colors[i3 + 2] = 0.5;

      sizes[i] = Math.random() * 0.2;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      color: 0x888888,
      size: 0.1,
      transparent: true,
      opacity: 0.5,
    });

    this.ambientParticles = new THREE.Points(geometry, material);
    this.scene.add(this.ambientParticles);
  }

  updateAmbientParticles(delta) {
    // Update the position of ambient particles
    const positions = this.ambientParticles.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += (Math.random() - 0.5) * 0.01;
      positions[i + 1] += (Math.random() - 0.5) * 0.01;
      positions[i + 2] += (Math.random() - 0.5) * 0.01;
    }
    this.ambientParticles.geometry.attributes.position.needsUpdate = true;
  }

  // Add columns along the track
  addTrackColumns(chunk, segment) {
    const columnSpacing = 10; // Space between columns
    const columnCount = Math.floor(segment.length / columnSpacing);

    for (let i = 0; i < columnCount; i++) {
      const zPos = i * columnSpacing + columnSpacing / 2;

      // Left column
      const leftColumn = this.createSpaceColumn();
      leftColumn.position.set(-this.trackWidth / 2 - 2, 0, zPos);
      chunk.add(leftColumn);

      // Right column
      const rightColumn = this.createSpaceColumn();
      rightColumn.position.set(this.trackWidth / 2 + 2, 0, zPos);
      chunk.add(rightColumn);
    }
  }

  // Add hexagonal pattern to track
  addHexPattern(parent, x, z, size) {
    // Create hexagon outline
    const hexShape = new THREE.Shape();
    const segments = 6;

    for (let i = 0; i < segments; i++) {
      const angle = ((Math.PI * 2) / segments) * i;
      const xPos = size * Math.cos(angle);
      const zPos = size * Math.sin(angle);

      if (i === 0) {
        hexShape.moveTo(xPos, zPos);
      } else {
        hexShape.lineTo(xPos, zPos);
      }
    }

    hexShape.closePath();

    const hexGeometry = new THREE.ShapeGeometry(hexShape);
    const hexMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
    });

    const hexMesh = new THREE.Mesh(hexGeometry, hexMaterial);
    hexMesh.rotation.x = -Math.PI / 2;
    hexMesh.position.set(x, 0.01, z);

    parent.add(hexMesh);
  }

  // Add decorative patterns to track
  addTrackPatterns(trackMesh, segment) {
    // Create line patterns on the track
    const trackWidth = this.trackWidth;
    const trackLength = segment.length;

    // Center line
    const centerLineGeometry = new THREE.PlaneGeometry(0.1, trackLength);
    const centerLineMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.5,
    });

    const centerLine = new THREE.Mesh(centerLineGeometry, centerLineMaterial);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(0, 0.01, trackLength / 2);
    trackMesh.add(centerLine);

    // Lane markers (dashed lines)
    const dashLength = 1;
    const dashGap = 1;
    const dashesPerLane = Math.floor(trackLength / (dashLength + dashGap));

    const dashGeometry = new THREE.PlaneGeometry(0.1, dashLength);
    const dashMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.3,
    });

    // Left lane
    for (let i = 0; i < dashesPerLane; i++) {
      const dash = new THREE.Mesh(dashGeometry, dashMaterial);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(
        -trackWidth / 4,
        0.01,
        i * (dashLength + dashGap) + dashLength / 2
      );
      trackMesh.add(dash);
    }

    // Right lane
    for (let i = 0; i < dashesPerLane; i++) {
      const dash = new THREE.Mesh(dashGeometry, dashMaterial);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(
        trackWidth / 4,
        0.01,
        i * (dashLength + dashGap) + dashLength / 2
      );
      trackMesh.add(dash);
    }

    // Add hexagonal patterns for sci-fi look
    const hexSize = 1;
    const hexRows = 3;
    const hexCols = Math.floor(trackLength / hexSize);

    for (let row = 0; row < hexRows; row++) {
      for (let col = 0; col < hexCols; col++) {
        if ((row + col) % 3 === 0) {
          // Skip some for pattern
          continue;
        }

        const xPos = ((row - 1) * trackWidth) / 3;
        const zPos = col * hexSize + hexSize / 2;

        this.addHexPattern(trackMesh, xPos, zPos, hexSize * 0.4);
      }
    }
  }

  // Create an enhanced nebula with more particle detail and visual effects
  createNebula(x, y, z, color, density) {
    // Create a nebula using particle system with more particles for detail
    const particleCount = 3000;
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const opacities = new Float32Array(particleCount);

    const colorObj = new THREE.Color(color);

    // Create color variations
    const colorVariant1 = new THREE.Color(color).multiplyScalar(1.2);
    const colorVariant2 = new THREE.Color(color).multiplyScalar(0.8);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      // Use improved distribution for more natural nebula shape
      // Create a cloud-like structure with density increasing toward center
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);

      // Use different radii for different axes to create non-spherical shapes
      let radius;
      if (i % 3 === 0) {
        // Create tendrils reaching out
        radius = 30 + Math.pow(Math.random(), 2) * 40;
      } else {
        // Create denser core
        radius = 10 + Math.random() * 30;
      }

      // Calculate position with some randomization for more natural look
      const xOffset = (Math.random() - 0.5) * 10;
      const yOffset = (Math.random() - 0.5) * 10;
      const zOffset = (Math.random() - 0.5) * 10;

      positions[i3] = x + radius * Math.sin(phi) * Math.cos(theta) + xOffset;
      positions[i3 + 1] =
        y + radius * Math.sin(phi) * Math.sin(theta) + yOffset;
      positions[i3 + 2] = z + radius * Math.cos(phi) + zOffset;

      // Vary the color based on position for more natural look
      // Outer particles are dimmer
      const distanceFactor = radius / 70; // Normalized to 0-1 range
      const brightnessBase = Math.max(0.4, 1 - distanceFactor);
      const brightness = brightnessBase * (0.7 + Math.random() * 0.3);

      // Apply different color variations
      let r, g, b;
      const colorVar = Math.random();
      if (colorVar > 0.7) {
        // Use variant color 1 (brighter)
        r = colorVariant1.r * brightness;
        g = colorVariant1.g * brightness;
        b = colorVariant1.b * brightness;
      } else if (colorVar > 0.4) {
        // Use base color
        r = colorObj.r * brightness;
        g = colorObj.g * brightness;
        b = colorObj.b * brightness;
      } else {
        // Use variant color 2 (darker)
        r = colorVariant2.r * brightness;
        g = colorVariant2.g * brightness;
        b = colorVariant2.b * brightness;
      }

      colors[i3] = r;
      colors[i3 + 1] = g;
      colors[i3 + 2] = b;

      // Vary particle sizes - farther particles are smaller
      sizes[i] = 2 + Math.random() * 4 * (1 - distanceFactor * 0.5);

      // Store opacity data for animation
      opacities[i] = 0.3 + Math.random() * 0.7;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    // Create custom material with custom shader for better particle rendering
    const material = new THREE.PointsMaterial({
      size: 1,
      vertexColors: true,
      transparent: true,
      opacity: density,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // Use additive blending for glow effect
    });

    const nebula = new THREE.Points(geometry, material);
    nebula.userData.pulseFactor = 0.5 + Math.random() * 0.5;
    nebula.userData.pulseSpeed = 0.1 + Math.random() * 0.2;
    nebula.userData.time = Math.random() * 1000;
    nebula.userData.opacities = opacities;

    this.scene.add(nebula);

    // Add a subtle point light in the center of the nebula
    const nebulaLight = new THREE.PointLight(color, 0.5, 150);
    nebulaLight.position.set(x, y, z);
    this.scene.add(nebulaLight);

    // Store reference for animations
    if (!this.nebulae) this.nebulae = [];
    this.nebulae.push({ nebula, light: nebulaLight });

    // Also track as decoration for proper cleanup
    this.decorations.push(nebula);
    this.decorations.push(nebulaLight);

    return nebula;
  }

  // Preload textures and assets for upcoming track segments
  preloadUpcomingSegments() {
    // This method preloads textures and assets for upcoming segments
    // to prevent stuttering when new segments appear

    // We'll look at the last few segments to predict what might come next
    const lastThreeSegmentTypes = this.trackPath
      .slice(-3)
      .map((segment) => segment.type);

    // Determine potential upcoming segment types based on current path
    const potentialSegmentTypes = this.predictNextSegmentTypes(
      lastThreeSegmentTypes
    );

    // Queue asset loading for each potential segment type
    potentialSegmentTypes.forEach((segmentType) => {
      // Preload specific textures based on segment type
      if (
        segmentType === this.chunkTypes.LEFT_TURN ||
        segmentType === this.chunkTypes.RIGHT_TURN
      ) {
        // Preload turn-specific textures if available
        if (this.assetManager) {
          this.assetManager.queueAsset("turn_texture", "texture", 10);
        }
      } else if (
        segmentType === this.chunkTypes.RAMP_UP ||
        segmentType === this.chunkTypes.RAMP_DOWN
      ) {
        // Preload ramp-specific textures if available
        if (this.assetManager) {
          this.assetManager.queueAsset("ramp_texture", "texture", 10);
        }
      }
    });

    // Process the asset loading queue
    if (this.assetManager) {
      this.assetManager.processQueue();
    }

    console.log("Preloading assets for upcoming segments");
  }

  // Predict the next segment types based on recent history
  predictNextSegmentTypes(recentSegments) {
    // Simple prediction - just return a few likely segment types
    // In a more advanced implementation, this could use patterns to predict

    // Default potential segments if we don't have enough history
    if (!recentSegments || recentSegments.length < 2) {
      return [
        this.chunkTypes.STRAIGHT,
        this.chunkTypes.LEFT_TURN,
        this.chunkTypes.RIGHT_TURN,
      ];
    }

    // Check for pattern of straight segments - likely to continue or make a turn
    const allStraight = recentSegments.every(
      (type) => type === this.chunkTypes.STRAIGHT
    );
    if (allStraight) {
      // After several straight segments, likely to get a turn
      return [
        this.chunkTypes.STRAIGHT,
        this.chunkTypes.LEFT_TURN,
        this.chunkTypes.RIGHT_TURN,
      ];
    }

    // After a left turn, likely to get straight or right turn
    const lastSegment = recentSegments[recentSegments.length - 1];
    if (lastSegment === this.chunkTypes.LEFT_TURN) {
      return [this.chunkTypes.STRAIGHT, this.chunkTypes.RIGHT_TURN];
    }

    // After a right turn, likely to get straight or left turn
    if (lastSegment === this.chunkTypes.RIGHT_TURN) {
      return [this.chunkTypes.STRAIGHT, this.chunkTypes.LEFT_TURN];
    }

    // Default case - return all regular segment types
    return [
      this.chunkTypes.STRAIGHT,
      this.chunkTypes.LEFT_TURN,
      this.chunkTypes.RIGHT_TURN,
    ];
  }

  initMaterials() {
    // Create a brighter track material with subtle glow
    this.trackMaterial = new THREE.MeshStandardMaterial({
      color: 0x4488ff,
      roughness: 0.3,
      metalness: 0.8,
      emissive: 0x112244,
      emissiveIntensity: 0.3,
      flatShading: false,
    });

    // Create a more vibrant track edge material with stronger glow
    this.trackEdgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ccff,
      roughness: 0.2,
      metalness: 0.9,
      emissive: 0x0088ff,
      emissiveIntensity: 0.5,
      flatShading: false,
    });

    // Brighter obstacle material
    this.obstacleMaterial = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      roughness: 0.5,
      metalness: 0.7,
      emissive: 0x551111,
      emissiveIntensity: 0.4,
    });

    // More vibrant collectible material
    this.collectibleMaterial = new THREE.MeshStandardMaterial({
      color: 0xffcc00,
      roughness: 0.2,
      metalness: 1.0,
      emissive: 0xffaa00,
      emissiveIntensity: 0.6,
    });

    // Improved space environment with more vibrant colors
    this.environmentMaterial = new THREE.MeshStandardMaterial({
      color: 0x2255aa,
      roughness: 0.7,
      metalness: 0.3,
      emissive: 0x001133,
      emissiveIntensity: 0.2,
    });
  }

  setupLighting() {
    // Create a brighter main directional light
    this.mainLight = new THREE.DirectionalLight(0xffffff, 1.3);
    this.mainLight.position.set(50, 50, 50);
    this.mainLight.castShadow = true;

    // Optimize shadow settings for performance but maintain quality
    this.mainLight.shadow.mapSize.width = 2048;
    this.mainLight.shadow.mapSize.height = 2048;
    this.mainLight.shadow.camera.near = 0.5;
    this.mainLight.shadow.camera.far = 500;
    this.mainLight.shadow.camera.left = -100;
    this.mainLight.shadow.camera.right = 100;
    this.mainLight.shadow.camera.top = 100;
    this.mainLight.shadow.camera.bottom = -100;
    this.mainLight.shadow.bias = -0.001;

    this.scene.add(this.mainLight);

    // Add a stronger ambient light for better overall visibility
    this.ambientLight = new THREE.AmbientLight(0x444466, 0.8);
    this.scene.add(this.ambientLight);

    // Add colored point lights for visual interest
    const pointLight1 = new THREE.PointLight(0x3388ff, 1, 100);
    pointLight1.position.set(20, 15, 20);
    this.scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xff3366, 1, 100);
    pointLight2.position.set(-20, 15, -20);
    this.scene.add(pointLight2);
  }

  // Function to mark an object as collected and hide it
  collectItem(object) {
    if (!object) return;

    // Mark as collected
    object.collected = true;

    // Make it invisible
    if (object.material) {
      object.material.visible = false;
    } else if (object.traverse) {
      object.traverse((child) => {
        if (child.material) {
          child.material.visible = false;
        }
      });
    }

    // Disable any lights
    object.traverse((child) => {
      if (child.isLight) {
        child.intensity = 0;
      }
    });

    // Schedule for removal (will be cleaned up when chunk is recycled)
    setTimeout(() => {
      if (object.parent) {
        object.parent.remove(object);
      }
    }, 2000);
  }

  setDifficulty(difficultyLevel, settings) {
    console.log(`Setting world difficulty to ${difficultyLevel}`, settings);

    // Store the current difficulty level
    this.currentDifficulty = difficultyLevel;

    // Update obstacle generation parameters
    if (settings) {
      this.obstacleFrequency = settings.obstacleFrequency || 0.2;
      this.obstacleVariety = settings.obstacleVariety || 1;

      // Update segment weights for difficulty
      if (difficultyLevel === "medium") {
        // Medium difficulty has more turns and some ramps
        this.segmentDifficultyWeights = {
          [this.chunkTypes.STRAIGHT]: 0.5,
          [this.chunkTypes.LEFT_TURN]: 0.2,
          [this.chunkTypes.RIGHT_TURN]: 0.2,
          [this.chunkTypes.RAMP_UP]: 0.05,
          [this.chunkTypes.RAMP_DOWN]: 0.05,
        };
      } else if (difficultyLevel === "hard") {
        // Hard difficulty has more complex segments
        this.segmentDifficultyWeights = {
          [this.chunkTypes.STRAIGHT]: 0.3,
          [this.chunkTypes.LEFT_TURN]: 0.25,
          [this.chunkTypes.RIGHT_TURN]: 0.25,
          [this.chunkTypes.RAMP_UP]: 0.1,
          [this.chunkTypes.RAMP_DOWN]: 0.1,
        };

        // Increase number of obstacles per segment
        this.maxObstaclesPerSegment = 4;
      } else {
        // Easy difficulty (default)
        this.segmentDifficultyWeights = {
          [this.chunkTypes.STRAIGHT]: 0.7,
          [this.chunkTypes.LEFT_TURN]: 0.15,
          [this.chunkTypes.RIGHT_TURN]: 0.15,
          [this.chunkTypes.RAMP_UP]: 0,
          [this.chunkTypes.RAMP_DOWN]: 0,
        };

        // Fewer obstacles per segment
        this.maxObstaclesPerSegment = 2;
      }
    }

    // Visual indicator for difficulty change
    this.createDifficultyTransitionEffect();
  }

  createDifficultyTransitionEffect() {
    // Create a wave effect that moves down the track
    const particleCount = 200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    // Get the last player position to start the effect
    const lastChunk = this.activeChunks[this.activeChunks.length - 1];
    const effectStartZ = lastChunk ? lastChunk.position.z + 20 : 100;

    // Create a wave of particles spreading across the track ahead
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * this.trackWidth;

      positions[i3] = Math.cos(angle) * radius; // X
      positions[i3 + 1] = 0.1 + Math.random() * 2; // Y
      positions[i3 + 2] = effectStartZ + Math.random() * 50; // Z
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // Color based on difficulty
    let color;
    if (this.currentDifficulty === "hard") {
      color = new THREE.Color(0xff3333); // Red for hard
    } else if (this.currentDifficulty === "medium") {
      color = new THREE.Color(0xffaa00); // Orange for medium
    } else {
      color = new THREE.Color(0x00aaff); // Blue for easy
    }

    const material = new THREE.PointsMaterial({
      color: color,
      size: 0.5,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);

    // Animate particles flowing along the track
    const lifeDuration = 3; // seconds
    let lifetime = 0;

    const animateParticles = () => {
      const delta = 1 / 60; // Assuming 60fps
      lifetime += delta;

      if (lifetime > lifeDuration) {
        this.scene.remove(particles);
        geometry.dispose();
        material.dispose();
        return;
      }

      // Move particles forward and pulse
      const positions = geometry.attributes.position.array;
      const progress = lifetime / lifeDuration;

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;

        // Move forward
        positions[i3 + 2] -= 0.5;

        // Pulse Y based on sine wave
        positions[i3 + 1] = 0.1 + Math.sin(progress * 10 + i) * 0.5;
      }

      geometry.attributes.position.needsUpdate = true;

      // Pulse the opacity based on progress
      material.opacity = 0.8 * (1 - progress);

      requestAnimationFrame(animateParticles);
    };

    animateParticles();
  }
}

module.exports = { World };
