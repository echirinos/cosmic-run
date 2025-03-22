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

    // Debug mode for visualizing track issues
    this.debug = true; // Enable debug markers

    // World properties
    this.trackLength = 100;
    this.trackWidth = 6;
    this.chunkSize = 20;

    // Temple Run style track properties
    this.trackPathLength = 0;
    this.visibleDistance = 150; // Increased from 100 to see further down the course
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

    // Initialize track materials first
    this.createTrackMaterials();
    console.log("Track materials initialized");

    // Initialize essential materials for obstacles and collectibles
    this.obstacleMaterial = new THREE.MeshStandardMaterial({
      color: 0x882222,
      roughness: 0.7,
      metalness: 0.3,
    });

    this.crystalMaterial = new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      roughness: 0.2,
      metalness: 0.8,
      emissive: 0x4488ff,
      emissiveIntensity: 0.5,
    });

    // Create starfield background
    this.createStarfield();
    console.log("Starfield created");

    // Create space nebula environment
    this.createSpaceEnvironment();
    console.log("Space environment created");

    // Add debug grid to always see the ground
    const gridHelper = new THREE.GridHelper(100, 100, 0xffff00, 0x00ffff);
    this.scene.add(gridHelper);

    // Add axis helper
    const axisHelper = new THREE.AxesHelper(20);
    this.scene.add(axisHelper);

    console.log("Added debug visualization helpers");

    // Initialize object pools for reuse
    this.initializeObjectPools();
    console.log("Object pools initialized");

    // Generate initial track
    this.generateInitialTrackPath();
    console.log(
      `Initial track path generated with ${this.trackPath.length} segments`
    );

    // Initialize the first batch of chunks
    this.generateInitialChunks();
    console.log(`Initial chunks generated: ${this.activeChunks.length} chunks`);

    // Create debug visualization of the track
    this.createDebugTrackVisualization();

    // Create track indicators that follow the player
    this.createTrackIndicators();

    // Create player spotlight that follows the player
    this.createPlayerLight();

    // Verify track visibility
    if (this.activeChunks.length > 0) {
      console.log("First chunk position:", this.activeChunks[0].position);
      if (this.activeChunks[0].track) {
        console.log(
          "First track mesh position:",
          this.activeChunks[0].track.position
        );
        console.log(
          "First track mesh rotation:",
          this.activeChunks[0].track.rotation
        );
        console.log(
          "First track mesh material:",
          this.activeChunks[0].track.material
        );
      } else {
        console.warn("Track mesh not found in first chunk!");
      }
    } else {
      console.warn("No active chunks were generated!");
    }

    // Setup performance tracking
    this.lastUpdateTime = Date.now();
    this.frameCount = 0;
    this.frameTime = 0;

    console.log("World initialized successfully");
  }

  // Create a strong player light that follows the player
  createPlayerLight() {
    // Create a spotlight that follows the player and illuminates the track ahead
    const playerSpotlight = new THREE.SpotLight(
      0xffffff,
      5.0, // Intensity increased to 5.0 (from 3.0)
      50, // Distance increased to 50 (from 30)
      Math.PI / 4, // Wider angle
      0.3, // Lower penumbra for sharper light
      1
    );
    playerSpotlight.position.set(0, 15, 0); // Position higher
    playerSpotlight.target.position.set(0, 0, -15); // Point ahead of player

    // Configure shadows for better visibility
    playerSpotlight.castShadow = true;
    playerSpotlight.shadow.mapSize.width = 1024;
    playerSpotlight.shadow.mapSize.height = 1024;
    playerSpotlight.shadow.camera.near = 0.5;
    playerSpotlight.shadow.camera.far = 60; // Increased far plane

    // Add target to scene to make it work
    this.scene.add(playerSpotlight.target);
    this.scene.add(playerSpotlight);

    // Store reference
    this.playerLight = playerSpotlight;

    // Add MULTIPLE point lights that follow player for better illumination
    // 1. Central player point light (blue tint)
    const centerLight = new THREE.PointLight(0xaaddff, 2.0, 15);
    centerLight.position.set(0, 2, 0);
    this.scene.add(centerLight);
    this.playerPointLight = centerLight;

    // 2. Forward light to illuminate track ahead (bright white)
    const forwardLight = new THREE.PointLight(0xffffff, 3.0, 20);
    forwardLight.position.set(0, 1, -10);
    this.scene.add(forwardLight);
    this.playerForwardLight = forwardLight;

    // 3. Left and right side lights for lane visibility
    const leftLight = new THREE.PointLight(0xff88ff, 1.5, 12);
    leftLight.position.set(-3, 1, -5);
    this.scene.add(leftLight);
    this.playerLeftLight = leftLight;

    const rightLight = new THREE.PointLight(0x88ffff, 1.5, 12);
    rightLight.position.set(3, 1, -5);
    this.scene.add(rightLight);
    this.playerRightLight = rightLight;

    console.log(
      "Enhanced player-following light system created with multiple light sources"
    );
  }

  // Update player lights to follow player position
  updatePlayerLight(playerPosition) {
    // Simple stub method - no implementation needed for now
    // This is just to avoid errors when the Game class calls this method
  }

  createTrackMaterials() {
    // Create a MUCH more visible track material
    this.trackMaterial = new THREE.MeshStandardMaterial({
      color: 0x00aaff, // Bright blue
      roughness: 0.2,
      metalness: 0.6,
      emissive: 0x0066ff,
      emissiveIntensity: 0.5, // Stronger glow
      transparent: false,
      opacity: 1.0,
      visible: true,
    });

    // Edge glow material - brighter blue
    this.trackEdgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      roughness: 0.2,
      metalness: 0.8,
      emissive: 0x0088ff,
      emissiveIntensity: 0.8,
      envMapIntensity: 1.5,
      transparent: false,
      opacity: 1.0,
      visible: true,
    });

    // Crystal lane material with stronger glow
    this.crystalLaneMaterial = new THREE.MeshStandardMaterial({
      color: 0x66ffff,
      roughness: 0.3,
      metalness: 0.7,
      emissive: 0x00ffff,
      emissiveIntensity: 0.5,
      envMapIntensity: 1.5,
      transparent: false,
      opacity: 1.0,
      visible: true,
    });

    // Obstacle warning material - bright red
    this.obstacleLaneMaterial = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      roughness: 0.3,
      metalness: 0.7,
      emissive: 0xff0000,
      emissiveIntensity: 0.5,
      envMapIntensity: 1.5,
      transparent: false,
      opacity: 1.0,
      visible: true,
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
    // Create an asteroid obstacle
    const asteroidGroup = new THREE.Group();

    // Create the main asteroid body with irregular shape
    const asteroidGeometry = new THREE.DodecahedronGeometry(0.8, 1);
    const asteroidMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.9,
      metalness: 0.2,
    });

    // Deform the asteroid geometry for more natural shape
    const positionAttribute = asteroidGeometry.getAttribute("position");
    const vertex = new THREE.Vector3();

    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);

      // Add random variation to vertices
      vertex.x += (Math.random() - 0.5) * 0.2;
      vertex.y += (Math.random() - 0.5) * 0.2;
      vertex.z += (Math.random() - 0.5) * 0.2;

      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    asteroidGeometry.computeVertexNormals();

    const asteroid = new THREE.Mesh(asteroidGeometry, asteroidMaterial);
    asteroid.position.y = 0.8;
    asteroid.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    asteroid.castShadow = true;

    asteroidGroup.add(asteroid);

    // Add a slow rotation animation
    const rotateAsteroid = () => {
      asteroid.rotation.y += 0.002;
      asteroid.rotation.z += 0.001;
      requestAnimationFrame(rotateAsteroid);
    };

    rotateAsteroid();

    return asteroidGroup;
  }

  createSpaceDebrisObstacle() {
    // Create a cluster of space debris
    const debrisGroup = new THREE.Group();

    // Main piece
    const mainGeometry = new THREE.DodecahedronGeometry(0.6, 0);
    const debrisMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.8,
      metalness: 0.2,
    });

    const mainDebris = new THREE.Mesh(mainGeometry, debrisMaterial);
    mainDebris.position.y = 0.6;
    mainDebris.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    mainDebris.castShadow = true;

    debrisGroup.add(mainDebris);

    // Add smaller debris pieces
    const smallGeometries = [
      new THREE.TetrahedronGeometry(0.3),
      new THREE.OctahedronGeometry(0.25),
      new THREE.IcosahedronGeometry(0.2),
    ];

    // Add 3-4 smaller pieces
    const pieceCount = 3 + Math.floor(Math.random() * 2);

    for (let i = 0; i < pieceCount; i++) {
      const geoIndex = Math.floor(Math.random() * smallGeometries.length);
      const piece = new THREE.Mesh(smallGeometries[geoIndex], debrisMaterial);

      // Random position around main piece
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.4 + Math.random() * 0.3;

      piece.position.set(
        Math.cos(angle) * radius,
        0.3 + Math.random() * 0.5,
        Math.sin(angle) * radius
      );

      piece.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );

      piece.castShadow = true;
      debrisGroup.add(piece);
    }

    // Add slow rotation animation
    const rotateDebris = () => {
      debrisGroup.rotation.y += 0.005;
      requestAnimationFrame(rotateDebris);
    };

    rotateDebris();

    return debrisGroup;
  }

  createEnergyBarrierObstacle() {
    // Create a glowing energy barrier
    const barrierGroup = new THREE.Group();

    // Create the main barrier
    const barrierGeometry = new THREE.BoxGeometry(2.0, 2.0, 0.2);
    const barrierMaterial = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      emissive: 0xff0000,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.7,
    });

    const barrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
    barrier.position.y = 1.0;
    barrier.castShadow = true;

    barrierGroup.add(barrier);

    // Add animated pulse effect
    const pulseAnimation = () => {
      const scale = 1 + 0.1 * Math.sin(Date.now() * 0.005);
      barrier.scale.set(1, scale, 1);

      // Continue animation
      requestAnimationFrame(pulseAnimation);
    };

    pulseAnimation();

    return barrierGroup;
  }

  createAlienTotemObstacle() {
    // Create an alien totem pole obstacle
    const totemGroup = new THREE.Group();

    // Create the main totem body
    const bodyGeometry = new THREE.CylinderGeometry(0.4, 0.5, 2.0, 6);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x00aa55,
      roughness: 0.3,
      metalness: 0.7,
      emissive: 0x005522,
      emissiveIntensity: 0.2,
    });

    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1.0;
    body.castShadow = true;

    totemGroup.add(body);

    // Add alien "eye"
    const eyeGeometry = new THREE.SphereGeometry(0.15, 12, 12);
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xff7700,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9,
    });

    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0, 1.5, 0.35);
    totemGroup.add(eye);

    // Add animated eye movement
    const animateEye = () => {
      const time = Date.now() * 0.001;
      eye.position.x = Math.sin(time * 1.5) * 0.1;
      eye.scale.setScalar(0.8 + 0.2 * Math.sin(time * 3));

      requestAnimationFrame(animateEye);
    };

    animateEye();

    return totemGroup;
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

    // Add rotation animation properties directly to the group's userData
    group.userData.rotationSpeed = {
      x: 0.01,
      y: 0.02,
      z: 0.005,
    };

    // Floating animation data
    group.userData.floatSpeed = 0.001;
    group.userData.floatAmplitude = 0.2;
    group.userData.floatOffset = Math.random() * Math.PI * 2;
    group.userData.value = 1; // Crystal value

    return group;
  }

  createPowerupTemplate() {
    // Create a group for the powerup
    const group = new THREE.Group();

    // Main powerup sphere
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const material = new THREE.MeshPhongMaterial({
      color: 0xff00ff,
      specular: 0xffffff,
      shininess: 100,
      emissive: 0xaa00aa,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.8,
    });

    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);

    // Add a glow effect
    const glowGeometry = new THREE.SphereGeometry(0.6, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff55ff,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide,
    });

    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    group.add(glow);

    // Add light
    const light = new THREE.PointLight(0xff00ff, 0.5, 3);
    light.position.set(0, 0, 0);
    group.add(light);

    // Set powerup properties
    group.userData.type = "shield"; // Default type
    group.userData.rotationSpeed = 0.02;
    group.userData.pulseSpeed = 0.003;

    return group;
  }

  generateInitialTrackPath() {
    console.log("Generating initial track path...");
    // Clear any existing track path
    this.trackPath = [];

    // Reset track path length
    this.trackPathLength = 0;

    // Generate straight segments for a simple direct path
    // No more turns or ramps, just a straight path
    for (let i = 0; i < 10; i++) {
      const segment = this.addTrackSegment(this.chunkTypes.STRAIGHT);
      // Generate nodes for this segment
      this.generateSegmentNodes(segment);
    }

    console.log(
      `Generated straight track with ${this.trackPath.length} segments`
    );
  }

  addTrackSegment(type) {
    // Always use STRAIGHT type regardless of what's passed in
    type = this.chunkTypes.STRAIGHT;

    // Get segment length
    const segmentLength = this.chunkSize;

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
    // All segments are straight segments now
    const nodeCount = Math.ceil(segment.length);
    const nodeSpacing = segment.length / nodeCount;

    // Create nodes in a straight line
    for (let i = 0; i <= nodeCount; i++) {
      const t = i / nodeCount;
      const position = segment.startPosition
        .clone()
        .add(segment.startDirection.clone().multiplyScalar(t * segment.length));
      segment.nodes.push({
        position: position,
        direction: segment.startDirection.clone(),
        t: t,
      });
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

    // MAXIMUM VISIBILITY LIGHTING SETUP
    console.log("Creating maximum visibility lighting setup");

    // Clear any existing lighting
    // Find and remove any existing lights in the scene
    const existingLights = [];
    this.scene.traverse((object) => {
      if (object.isLight) {
        existingLights.push(object);
      }
    });

    existingLights.forEach((light) => {
      this.scene.remove(light);
    });

    // Add extremely bright ambient light for guaranteed visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0); // Increased intensity
    this.scene.add(ambientLight);

    // Add directional light from above - super bright
    const sunLight = new THREE.DirectionalLight(0xffffff, 3.0); // Increased intensity
    sunLight.position.set(0, 20, 0); // Position directly above
    sunLight.castShadow = false; // Disable shadows for performance and to avoid visual issues
    this.scene.add(sunLight);

    // Add a hemispheric light for better overall illumination
    const hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 1.5);
    this.scene.add(hemisphereLight);

    // Add track-specific spotlight
    const trackSpot = new THREE.SpotLight(0xffffff, 3.0, 100, Math.PI / 4, 0.5);
    trackSpot.position.set(0, 30, 0);
    trackSpot.castShadow = false;
    this.scene.add(trackSpot);

    // Add front-facing light that moves with camera
    const frontLight = new THREE.DirectionalLight(0xffffff, 2.0);
    frontLight.position.set(0, 5, 10); // In front of player
    this.scene.add(frontLight);
    this.frontLight = frontLight;

    // EXTREMELY IMPORTANT: Completely disable fog for maximum visibility
    // Ensure fog is null
    if (this.scene.fog) {
      console.log(
        "Explicitly removing all fog from scene for maximum track visibility"
      );
      this.scene.fog = null;
    }

    // Double-check fog status
    console.log("Scene fog status:", this.scene.fog ? "Present" : "Removed");
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

      // Set the segment index
      segment.index = i;

      // Generate the chunk from segment
      const chunk = this.generateChunkFromSegment(segment);

      // Add the chunk to the scene and active chunks
      if (chunk) {
        this.scene.add(chunk);
        this.activeChunks.push(chunk);
      }
    }

    console.log(`Generated ${this.activeChunks.length} initial chunks`);
  }

  generateChunkFromSegment(segment) {
    // Create chunk container
    const chunk = new THREE.Group();

    // Create a basic bright blue floor that's very large
    const floorGeometry = new THREE.PlaneGeometry(20, 100);
    const floorMaterial = new THREE.MeshBasicMaterial({
      color: 0x0088ff,
      side: THREE.DoubleSide,
      transparent: false,
      opacity: 1.0,
    });

    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = Math.PI / 2; // Make horizontal
    floor.position.y = -0.5; // Position below player

    // Add glowing edges
    const edgeGeometry = new THREE.BoxGeometry(1, 0.5, 100);
    const edgeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      emissive: 0xff00ff,
      emissiveIntensity: 1.0,
    });

    const leftEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    leftEdge.position.set(-10, 0, 0);

    const rightEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    rightEdge.position.set(10, 0, 0);

    // Add everything to the chunk
    chunk.add(floor);
    chunk.add(leftEdge);
    chunk.add(rightEdge);

    // Position the chunk
    if (segment) {
      chunk.position.copy(segment.startPosition);
    } else {
      chunk.position.set(0, 0, 0);
    }

    // IMPORTANT: Add to scene
    this.scene.add(chunk);

    // Store in active chunks
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
    // Create lane dividers with brighter emissive materials
    const markerMaterial = new THREE.MeshStandardMaterial({
      color: 0x88aaee, // Brighter blue color for better visibility
      emissive: 0x4488cc, // Add blue glow
      emissiveIntensity: 0.6, // Increased emissive intensity
      metalness: 0.7,
      roughness: 0.3,
    });

    // Create dashed lane markers
    const laneWidth = trackWidth / 3;
    const markerSpacing = 2; // Space between markers
    const markerLength = 1; // Length of each marker
    const markerCount = Math.floor(
      segmentLength / (markerSpacing + markerLength)
    );

    // Left and right lane markers
    for (let lane = -1; lane <= 1; lane++) {
      if (lane === 0) continue; // Skip center lane

      const x = lane * laneWidth;

      for (let i = 0; i < markerCount; i++) {
        const z = -(i * (markerSpacing + markerLength) + markerLength / 2);

        // Make markers taller for better visibility
        const markerGeometry = new THREE.BoxGeometry(0.1, 0.1, markerLength);
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);

        // Position markers just above the track surface
        marker.position.set(x, 0.05, z);
        chunk.add(marker);

        // Add to decorations for cleanup
        if (!chunk.decorations) chunk.decorations = [];
        chunk.decorations.push(marker);
      }
    }

    // Add edge barriers with enhanced visibility
    for (let side = -1; side <= 1; side += 2) {
      // Create taller edge barriers
      const edgeGeometry = new THREE.BoxGeometry(0.3, 0.8, segmentLength);
      const edgeMaterial = new THREE.MeshStandardMaterial({
        color: 0x4444ff, // Bright blue
        emissive: 0x2222ff, // Blue glow
        emissiveIntensity: 0.7, // Strong glow
        metalness: 0.8,
        roughness: 0.2,
      });

      const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
      edge.position.set(
        side * (trackWidth / 2 + 0.15),
        0.4, // Raised position for better visibility
        -segmentLength / 2
      );

      chunk.add(edge);
      if (!chunk.decorations) chunk.decorations = [];
      chunk.decorations.push(edge);
    }
  }

  populateChunk(chunk) {
    // Skip first chunk to give player time to adjust
    if (chunk.index === 0) return;

    // Determine difficulty-based parameters
    let difficulty;
    if (chunk.index < 5) difficulty = "easy";
    else if (chunk.index < 15) difficulty = "medium";
    else difficulty = "hard";

    // Increase obstacle frequency based on difficulty
    const obstacleFrequency = {
      easy: 0.3, // Increased from previous values
      medium: 0.5,
      hard: 0.7,
    }[difficulty];

    // Place objects along the chunk
    const chunkLength = chunk.segment.length;
    const numLanes = 3;
    const laneWidth = this.trackWidth / numLanes;

    // Add obstacles and collectibles
    // Use more consistent spacing with variation
    const zSpacing = 5; // Space between placement points

    for (let z = 5; z < chunkLength - 5; z += zSpacing) {
      // Random offset for more natural placement
      const zOffset = (Math.random() - 0.5) * 3;
      const actualZ = z + zOffset;

      // Decide if we should place an obstacle at this z-position
      if (Math.random() < obstacleFrequency) {
        // Select which lanes to obstruct
        const pattern = Math.random();

        // Different obstacle patterns based on difficulty
        if (difficulty === "easy") {
          // Easy: Single lane obstacles
          const lane = Math.floor(Math.random() * numLanes) - 1;
          const obstacleType = Math.floor(Math.random() * 4); // More obstacle variety
          this.addObstacle(chunk, lane, actualZ, obstacleType);
        } else if (difficulty === "medium") {
          if (pattern < 0.7) {
            // Medium: Single or adjacent lane obstacles
            const lane = Math.floor(Math.random() * numLanes) - 1;
            const obstacleType = Math.floor(Math.random() * 4);
            this.addObstacle(chunk, lane, actualZ, obstacleType);

            // 30% chance to add adjacent obstacle
            if (Math.random() < 0.3) {
              const adjacentLane = lane + (Math.random() < 0.5 ? 1 : -1);
              if (adjacentLane >= -1 && adjacentLane <= 1) {
                this.addObstacle(chunk, adjacentLane, actualZ, obstacleType);
              }
            }
          } else {
            // Create a gap with only one lane open
            const openLane = Math.floor(Math.random() * numLanes) - 1;
            for (let l = -1; l <= 1; l++) {
              if (l !== openLane) {
                const obstacleType = Math.floor(Math.random() * 4);
                this.addObstacle(chunk, l, actualZ, obstacleType);
              }
            }
          }
        } else {
          // Hard
          if (pattern < 0.6) {
            // Hard: More complex patterns
            const openLane = Math.floor(Math.random() * numLanes) - 1;
            for (let l = -1; l <= 1; l++) {
              if (l !== openLane) {
                const obstacleType = Math.floor(Math.random() * 4);
                this.addObstacle(chunk, l, actualZ, obstacleType);
              }
            }
          } else if (pattern < 0.85) {
            // Create a zigzag pattern over multiple z positions
            const startLane = Math.random() < 0.5 ? -1 : 1;
            this.addObstacle(
              chunk,
              startLane,
              actualZ,
              Math.floor(Math.random() * 4)
            );
            this.addObstacle(
              chunk,
              0,
              actualZ + 2.5,
              Math.floor(Math.random() * 4)
            );
            this.addObstacle(
              chunk,
              -startLane,
              actualZ + 5,
              Math.floor(Math.random() * 4)
            );
          } else {
            // Rarely, place moving obstacles (indicated by a special type)
            for (let l = -1; l <= 1; l++) {
              if (Math.random() < 0.3) {
                this.addObstacle(chunk, l, actualZ, 4); // Type 4 could be a moving obstacle
              }
            }
          }
        }
      }
      // Add crystals in locations where there are no obstacles
      else if (Math.random() < 0.3) {
        // Slightly increased crystal frequency
        const lane = Math.floor(Math.random() * numLanes) - 1;
        // Check if there's no obstacle at this position
        const hasObstacle = chunk.obstacles.some(
          (o) => Math.abs(o.position.z - actualZ) < 2 && o.lane === lane
        );

        if (!hasObstacle) {
          this.addCrystal(chunk, lane, actualZ);
        }
      }
    }

    return chunk;
  }

  // Add the missing addObstacle method
  addObstacle(chunk, lane, z, obstacleType = 0) {
    // Determine actual lane position on the track
    const x = lane * (this.trackWidth / 3);

    let obstacle;

    // Create different obstacle types based on the obstacleType parameter
    switch (obstacleType) {
      case 0: // Standard asteroid obstacle
        obstacle = this.createAsteroidObstacle();
        break;
      case 1: // Energy barrier
        obstacle = this.createEnergyBarrierObstacle();
        break;
      case 2: // Space debris
        obstacle = this.createSpaceDebrisObstacle();
        break;
      case 3: // Alien totem
        obstacle = this.createAlienTotemObstacle();
        break;
      case 4: // Moving obstacle (horizontally shifting)
        obstacle = this.createAsteroidObstacle();
        // Mark it as a moving obstacle
        obstacle.userData.isMoving = true;
        obstacle.userData.moveSpeed = 0.05;
        obstacle.userData.moveDirection = Math.random() > 0.5 ? 1 : -1;
        obstacle.userData.originalLane = lane;
        break;
      default:
        obstacle = this.createAsteroidObstacle();
    }

    // Position the obstacle
    obstacle.position.set(x, 0, z);
    obstacle.lane = lane; // Store lane for collision detection

    // Add to chunk
    chunk.add(obstacle);
    chunk.obstacles.push(obstacle);

    return obstacle;
  }

  // Add the missing addCrystal method
  addCrystal(chunk, lane, z) {
    // Determine actual lane position
    const x = lane * (this.trackWidth / 3);

    // Create crystal group
    const crystalGroup = this.createCrystalTemplate();

    // Position the crystal group
    crystalGroup.position.set(x, 0.7, z); // Slightly elevated
    crystalGroup.lane = lane; // Store lane for collision detection
    crystalGroup.userData.type = "crystal"; // Mark as crystal for animations

    // Add to chunk
    chunk.add(crystalGroup);
    if (!chunk.crystals) chunk.crystals = [];
    chunk.crystals.push(crystalGroup);

    return crystalGroup;
  }

  // Add this method that was deleted during optimization
  createNebula(x, y, z, color, density = 0.7) {
    // Create a simplified nebula using particle system
    const particleCount = 500; // Reduced from 3000
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    const colorObj = new THREE.Color(color);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      // Simple sphere distribution
      const radius = 20 + Math.random() * 20;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i3] = x + radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = y + radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = z + radius * Math.cos(phi);

      // Simple color
      const brightness = 0.5 + Math.random() * 0.5;
      colors[i3] = colorObj.r * brightness;
      colors[i3 + 1] = colorObj.g * brightness;
      colors[i3 + 2] = colorObj.b * brightness;

      // Simple size variation
      sizes[i] = 1 + Math.random() * 3;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    // Simple material
    const material = new THREE.PointsMaterial({
      size: 1,
      vertexColors: true,
      transparent: true,
      opacity: density,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const nebula = new THREE.Points(geometry, material);

    this.scene.add(nebula);

    // Add light
    const nebulaLight = new THREE.PointLight(color, 0.3, 100);
    nebulaLight.position.set(x, y, z);
    this.scene.add(nebulaLight);

    // Store for tracking
    if (!this.nebulae) this.nebulae = [];
    this.nebulae.push({ nebula, light: nebulaLight });

    return nebula;
  }

  // Add the missing updateObjectsInChunk method
  updateObjectsInChunk(objects, playerPosition, delta) {
    if (!objects || !Array.isArray(objects)) return;

    // Simple update for objects - just animate them
    objects.forEach((object) => {
      if (!object || object.collected) return;

      // Simple rotation animation
      if (object.userData && object.userData.type === "crystal") {
        object.rotation.y += delta * (object.userData.rotationSpeed || 2);
      }

      // Make sure object is visible
      object.visible = true;
    });
  }

  // Add the missing manageChunks method
  manageChunks(playerPosition) {
    // CRITICAL FIX: First, make sure activeChunks is initialized
    if (!this.activeChunks) {
      this.activeChunks = [];
    }

    // CRITICAL FIX: Make sure the player position exists
    if (!playerPosition || typeof playerPosition.z === "undefined") {
      // Use a default position if player position is not available
      playerPosition = { x: 0, y: 0, z: 0 };
    }

    // BASIC CHUNK MANAGEMENT - SIMPLIFIED
    // If we don't have any chunks yet, create the initial chunk
    if (this.activeChunks.length === 0) {
      // Create a simple segment for the first chunk
      const segment = {
        type: "straight",
        length: this.chunkSize || 20,
        startPosition: new THREE.Vector3(0, 0, 0),
        startDirection: new THREE.Vector3(0, 0, 1),
        nodes: [],
        index: 0,
      };

      // Create first chunk
      this.generateChunkFromSegment(segment);
      console.log("Created initial track chunk");
    }

    // Find the furthest chunk
    let furthestZ = -999999;
    for (let i = 0; i < this.activeChunks.length; i++) {
      const chunk = this.activeChunks[i];
      if (chunk && chunk.position && chunk.position.z > furthestZ) {
        furthestZ = chunk.position.z;
      }
    }

    // Generate new chunks if player is approaching the end of the track
    if (furthestZ - playerPosition.z < 50) {
      // Create a new segment for the next chunk
      const segment = {
        type: "straight",
        length: this.chunkSize || 20,
        startPosition: new THREE.Vector3(0, 0, furthestZ + this.chunkSize),
        startDirection: new THREE.Vector3(0, 0, 1),
        nodes: [],
        index: this.activeChunks.length,
      };

      // Generate next chunk
      this.generateChunkFromSegment(segment);
      console.log("Created new track chunk at z:", furthestZ + this.chunkSize);
    }

    // Very simple chunk removal - don't remove any chunks until we have many
    if (this.activeChunks.length > 10) {
      // Find chunks too far behind the player
      for (let i = 0; i < this.activeChunks.length; i++) {
        const chunk = this.activeChunks[i];
        if (
          chunk &&
          chunk.position &&
          playerPosition.z - chunk.position.z > 100
        ) {
          // Remove this chunk
          this.scene.remove(chunk);
          this.activeChunks.splice(i, 1);
          i--; // Adjust index after removing an element
        }
      }
    }
  }

  // Add the missing removeChunk method
  removeChunk(index) {
    if (index < 0 || index >= this.activeChunks.length) {
      return;
    }

    const chunk = this.activeChunks[index];
    if (!chunk) return;

    // Remove chunk from scene
    this.scene.remove(chunk);

    // Remove from active chunks array
    this.activeChunks.splice(index, 1);
  }

  update(delta, gameSpeed, playerPosition) {
    // CRITICAL FIX: Make sure playerPosition is valid
    if (!playerPosition) {
      playerPosition = { x: 0, y: 0, z: 0 };
    }

    // Manage chunks - safe call with default value
    this.manageChunks(playerPosition);

    // SIMPLIFY: Skip processing objects if player position is invalid
    if (!playerPosition || typeof playerPosition.z === "undefined") {
      return;
    }

    // Update objects only for nearby chunks to improve performance
    for (let i = 0; i < this.activeChunks.length; i++) {
      const chunk = this.activeChunks[i];
      if (!chunk) continue;

      // Only process chunks near the player
      if (
        chunk.position &&
        Math.abs(chunk.position.z - playerPosition.z) < 50
      ) {
        // Make sure the chunk is visible
        chunk.visible = true;

        // Simple update for any moving elements
        if (chunk.obstacles) {
          chunk.obstacles.forEach((obstacle) => {
            if (obstacle && obstacle.update) {
              obstacle.update(delta);
            }
          });
        }
      }
    }
  }

  reset() {
    console.log("Resetting world...");

    // Clear all active chunks from scene
    if (this.activeChunks) {
      for (let i = this.activeChunks.length - 1; i >= 0; i--) {
        const chunk = this.activeChunks[i];
        if (chunk) {
          this.scene.remove(chunk);
        }
      }
    }

    // Reset arrays
    this.activeChunks = [];

    // Reset positions
    this.nextSegmentPosition = new THREE.Vector3(0, 0, 0);

    console.log("World reset complete");
  }

  checkCollisions(playerHitbox) {
    // Basic collision checking
    if (!playerHitbox || !playerHitbox.min || !playerHitbox.max) {
      console.warn("Invalid player hitbox provided to world.checkCollisions");
      return [];
    }

    // Return empty array if no chunks
    if (!this.activeChunks || this.activeChunks.length === 0) {
      return [];
    }

    // Simple array to track collisions
    const collisions = [];

    // Check only nearby chunks for performance
    for (let i = 0; i < this.activeChunks.length; i++) {
      const chunk = this.activeChunks[i];
      if (!chunk) continue;

      // Check obstacles
      if (chunk.obstacles) {
        for (let j = 0; j < chunk.obstacles.length; j++) {
          const obstacle = chunk.obstacles[j];
          if (!obstacle || !obstacle.position) continue;

          // Simple bounding box check
          const distance = new THREE.Vector3(
            playerHitbox.min.x + (playerHitbox.max.x - playerHitbox.min.x) / 2,
            playerHitbox.min.y + (playerHitbox.max.y - playerHitbox.min.y) / 2,
            playerHitbox.min.z + (playerHitbox.max.z - playerHitbox.min.z) / 2
          ).distanceTo(obstacle.position);

          // If close enough, consider it a collision
          if (distance < 1.5) {
            collisions.push({
              type: "obstacle",
              object: obstacle,
            });
          }
        }
      }
    }

    return collisions;
  }

  collectItem(item) {
    if (!item) return;

    // Make the item invisible
    item.visible = false;

    // Find which chunk this item belongs to
    for (let i = 0; i < this.activeChunks.length; i++) {
      const chunk = this.activeChunks[i];
      if (!chunk) continue;

      // Check crystals
      if (chunk.crystals) {
        const index = chunk.crystals.indexOf(item);
        if (index !== -1) {
          // Mark as collected but don't remove from array to avoid index issues
          chunk.crystals[index].collected = true;
          return;
        }
      }

      // Check powerups
      if (chunk.powerups) {
        const index = chunk.powerups.indexOf(item);
        if (index !== -1) {
          // Mark as collected but don't remove from array to avoid index issues
          chunk.powerups[index].collected = true;
          return;
        }
      }
    }
  }

  updateTrackIndicators(playerPosition) {
    // Simple stub method - no implementation needed for now
    // This is just to avoid errors when the Game class calls this method
  }

  createTrackIndicators() {
    // Create visual indicators for the player's position on track
    console.log("Creating track indicators");

    // Create a group to hold all indicators
    const indicatorsGroup = new THREE.Group();
    this.scene.add(indicatorsGroup);

    // Create lane markers that show the player which lane they're in
    const laneWidth = this.trackWidth / 3;

    // Create indicators for each lane
    for (let lane = -1; lane <= 1; lane++) {
      const indicatorGeometry = new THREE.BoxGeometry(0.5, 0.1, 0.5);
      const indicatorMaterial = new THREE.MeshStandardMaterial({
        color: 0xff88ff,
        emissive: 0xff00ff,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.8,
      });

      const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
      indicator.position.set(lane * laneWidth, 0.05, -3); // Position just ahead of player start position
      indicatorsGroup.add(indicator);
    }

    // Store reference to update with player
    this.trackIndicators = indicatorsGroup;

    console.log("Track indicators created successfully");
  }

  createDebugTrackVisualization() {
    // Create a visible grid to help with debugging
    const gridHelper = new THREE.GridHelper(100, 100, 0xffff00, 0x00ffff);
    this.scene.add(gridHelper);

    // Create a basic visible track right at the origin
    const trackGeometry = new THREE.PlaneGeometry(10, 100);
    const trackMaterial = new THREE.MeshBasicMaterial({
      color: 0x0088ff,
      side: THREE.DoubleSide,
    });

    const track = new THREE.Mesh(trackGeometry, trackMaterial);
    track.rotation.x = Math.PI / 2; // Lay flat
    track.position.set(0, -0.1, 0); // Slightly below player
    this.scene.add(track);

    // Add visible axis helper
    const axisHelper = new THREE.AxesHelper(5);
    this.scene.add(axisHelper);

    console.log("Debug track visualization created");
  }
}

module.exports = { World };
