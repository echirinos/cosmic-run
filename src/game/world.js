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
    // Create starfield background
    this.createStarfield();

    // Create space environment
    this.createSpaceEnvironment();

    // Initialize object pools
    this.initializeObjectPools();

    // Generate initial track segments for Temple Run style
    this.generateInitialTrackPath();

    // Generate initial chunks from track segments
    this.generateInitialChunks();

    // Debug
    console.log("World initialized with initial track chunks");
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
    // Default obstacle mesh that will be customized when placed
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry, this.obstacleMaterial);
    mesh.visible = false;
    this.scene.add(mesh);

    return {
      mesh: mesh,
      type: "asteroid", // Default type
      position: { x: 0, y: 0, z: 0 },
      size: { width: 1, height: 1, depth: 1 },
    };
  }

  createCrystalTemplate() {
    const geometry = new THREE.OctahedronGeometry(0.4, 0);
    const mesh = new THREE.Mesh(geometry, this.crystalMaterial);
    mesh.visible = false;
    this.scene.add(mesh);

    return {
      mesh: mesh,
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
    // Create a distant nebula (large colored cloud)
    this.createNebula(-30, 20, -100, 0x5500ff, 0.1);
    this.createNebula(40, -10, -150, 0xff5500, 0.08);

    // Create a distant planet
    const planetGeometry = new THREE.SphereGeometry(20, 32, 32);
    const planetMaterial = new THREE.MeshPhongMaterial({
      color: 0x008888,
      specular: 0x004466,
      shininess: 10,
    });

    const planet = new THREE.Mesh(planetGeometry, planetMaterial);
    planet.position.set(-80, 30, -200);
    this.scene.add(planet);

    // Add rings to the planet
    const ringGeometry = new THREE.RingGeometry(25, 35, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x888888,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });

    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(-80, 30, -200);
    ring.rotation.x = Math.PI / 3;
    this.scene.add(ring);
  }

  createNebula(x, y, z, color, density) {
    // Create a nebula using particle system
    const particleCount = 2000;
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    const colorObj = new THREE.Color(color);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      // Create a cloud-like shape
      const radius = 30 + Math.random() * 20;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      // Add some variation for a more natural look
      const offset = Math.random() * 10;

      positions[i3] = x + radius * Math.sin(phi) * Math.cos(theta) + offset;
      positions[i3 + 1] = y + radius * Math.sin(phi) * Math.sin(theta) + offset;
      positions[i3 + 2] = z + radius * Math.cos(phi) + offset;

      // Vary the color slightly
      const shade = 0.7 + Math.random() * 0.3;
      colors[i3] = colorObj.r * shade;
      colors[i3 + 1] = colorObj.g * shade;
      colors[i3 + 2] = colorObj.b * shade;

      sizes[i] = 3 + Math.random() * 3;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 1,
      vertexColors: true,
      transparent: true,
      opacity: density,
      depthWrite: false,
    });

    const nebula = new THREE.Points(geometry, material);
    this.scene.add(nebula);
    this.decorations.push(nebula);
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
    // Move and recycle chunks
    this.manageChunks(playerPosition);

    // Update objects animations
    this.updateObjects(delta);

    // Check for end of visible track and generate more if needed
    if (this.trackPathLength - playerPosition.z < this.visibleDistance) {
      const newSegment = this.addNextTrackSegment();
      this.generateChunkFromSegment(newSegment);

      // Preload upcoming segment textures
      this.preloadUpcomingSegments();
    }

    // Rotate starfield
    if (this.starfield) {
      this.starfield.rotation.y += 0.0001;
    }

    // Collision detection
    return this.checkCollisions(playerPosition);
  }

  manageChunks(playerPosition) {
    // Check if we need to add new chunks
    if (this.activeChunks.length > 0) {
      const lastChunk = this.activeChunks[this.activeChunks.length - 1];
      const chunkEndZ = lastChunk.position.z + this.chunkSize;

      // If last chunk's end is too close to player, add new chunk (positive Z direction)
      if (chunkEndZ < playerPosition.z + this.visibleDistance) {
        this.generateChunk(chunkEndZ);
      }
    }

    // Remove chunks that are behind the player
    for (let i = this.activeChunks.length - 1; i >= 0; i--) {
      const chunk = this.activeChunks[i];
      // If chunk is too far behind the player, remove it (positive Z direction)
      if (chunk.position.z + this.chunkSize < playerPosition.z - 20) {
        this.removeChunk(i);
      }
    }
  }

  updateObjects(delta) {
    // Update all active crystals (rotation and floating effect)
    this.objectPools.crystals.inUse.forEach((crystal) => {
      if (crystal.mesh && crystal.mesh.visible) {
        crystal.mesh.rotation.y += 0.02;
        crystal.mesh.position.y = 1 + Math.sin(Date.now() * 0.001) * 0.1;
      }
    });

    // Update all active powerups (rotation and floating effect)
    this.objectPools.powerups.inUse.forEach((powerup) => {
      if (powerup.mesh && powerup.mesh.visible) {
        powerup.mesh.rotation.y += 0.03;
        powerup.mesh.position.y = 1.2 + Math.sin(Date.now() * 0.001) * 0.1;
      }
    });

    // Update obstacles (some may have animations)
    this.objectPools.obstacles.inUse.forEach((obstacle) => {
      if (
        obstacle.mesh &&
        obstacle.mesh.visible &&
        obstacle.type === "asteroid"
      ) {
        obstacle.mesh.rotation.x += 0.01;
        obstacle.mesh.rotation.y += 0.01;
      }
    });
  }

  checkCollisions(playerPosition) {
    const result = {
      obstacleHit: false,
      crystalsCollected: 0,
      powerupCollected: false,
      powerupType: null,
    };

    // Get player bounds - adjust for new player size with better precision
    const playerSize = { width: 0.7, height: 1.5, depth: 0.7 }; // Standard player size
    const playerBounds = {
      minX: playerPosition.x - playerSize.width / 2,
      maxX: playerPosition.x + playerSize.width / 2,
      minY: playerPosition.y,
      maxY: playerPosition.y + playerSize.height,
      minZ: playerPosition.z - playerSize.depth / 2,
      maxZ: playerPosition.z + playerSize.depth / 2,
    };

    // Check all active chunks
    for (let i = 0; i < this.activeChunks.length; i++) {
      const chunk = this.activeChunks[i];

      // If chunk is too far behind or ahead, skip collision check for performance
      // Adjusted range check for positive Z direction
      if (
        chunk.position.z < playerPosition.z - 20 ||
        chunk.position.z > playerPosition.z + 20
      ) {
        continue;
      }

      // Check obstacle collisions
      if (chunk.userData.obstacles) {
        for (let j = 0; j < chunk.userData.obstacles.length; j++) {
          const obstacle = chunk.userData.obstacles[j];

          if (obstacle.collected) continue;

          // Get obstacle position in world space
          const obstacleWorldPos = {
            x: chunk.position.x + obstacle.position.x,
            y: chunk.position.y + obstacle.position.y,
            z: chunk.position.z + obstacle.position.z,
          };

          // Get obstacle bounds (simple box collision)
          const obstacleSize = obstacle.size || {
            width: 1,
            height: 1,
            depth: 1,
          };
          const obstacleBounds = {
            minX: obstacleWorldPos.x - obstacleSize.width / 2,
            maxX: obstacleWorldPos.x + obstacleSize.width / 2,
            minY: obstacleWorldPos.y,
            maxY: obstacleWorldPos.y + obstacleSize.height,
            minZ: obstacleWorldPos.z - obstacleSize.depth / 2,
            maxZ: obstacleWorldPos.z + obstacleSize.depth / 2,
          };

          // AABB collision detection
          if (
            playerBounds.maxX > obstacleBounds.minX &&
            playerBounds.minX < obstacleBounds.maxX &&
            playerBounds.maxY > obstacleBounds.minY &&
            playerBounds.minY < obstacleBounds.maxY &&
            playerBounds.maxZ > obstacleBounds.minZ &&
            playerBounds.minZ < obstacleBounds.maxZ
          ) {
            result.obstacleHit = true;
            obstacle.collected = true; // Mark as hit so we don't collide multiple times

            // Create hit effect
            this.createHitEffect(obstacleWorldPos);

            // Debug log
            console.log("Obstacle collision at", obstacleWorldPos);

            return result; // Return early on first obstacle hit
          }
        }
      }

      // Check crystal collisions
      if (chunk.userData.crystals) {
        for (let j = 0; j < chunk.userData.crystals.length; j++) {
          const crystal = chunk.userData.crystals[j];

          if (crystal.collected) continue;

          // Get crystal position in world space
          const crystalWorldPos = {
            x: chunk.position.x + crystal.position.x,
            y: chunk.position.y + crystal.position.y,
            z: chunk.position.z + crystal.position.z,
          };

          // Distance-based collision for crystals (sphere)
          const dx = playerPosition.x - crystalWorldPos.x;
          const dy = playerPosition.y - crystalWorldPos.y;
          const dz = playerPosition.z - crystalWorldPos.z;
          const distanceSquared = dx * dx + dy * dy + dz * dz;

          // If within collection radius (made slightly larger for better game feel)
          if (distanceSquared < 3.0) {
            crystal.collected = true;
            crystal.mesh.visible = false;
            result.crystalsCollected++;

            // Create collection effect
            this.createCollectionEffect(crystalWorldPos);
          }
        }
      }

      // Check powerup collisions
      if (chunk.userData.powerups) {
        for (let j = 0; j < chunk.userData.powerups.length; j++) {
          const powerup = chunk.userData.powerups[j];

          if (powerup.collected) continue;

          // Get powerup position in world space
          const powerupWorldPos = {
            x: chunk.position.x + powerup.position.x,
            y: chunk.position.y + powerup.position.y,
            z: chunk.position.z + powerup.position.z,
          };

          // Distance-based collision for powerups (sphere)
          const dx = playerPosition.x - powerupWorldPos.x;
          const dy = playerPosition.y - powerupWorldPos.y;
          const dz = playerPosition.z - powerupWorldPos.z;
          const distanceSquared = dx * dx + dy * dy + dz * dz;

          // If within collection radius (made slightly larger for better game feel)
          if (distanceSquared < 3.0) {
            powerup.collected = true;
            powerup.mesh.visible = false;
            result.powerupCollected = true;
            result.powerupType = powerup.type;

            // Create collection effect
            this.createCollectionEffect(powerupWorldPos, powerup.type);
            break; // Only collect one powerup at a time
          }
        }
      }
    }

    return result;
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
    // Update difficulty based on track length
    if (this.trackPathLength > this.difficultyThresholds.advanced) {
      this.currentDifficulty = "hard";
    } else if (this.trackPathLength > this.difficultyThresholds.intermediate) {
      this.currentDifficulty = "medium";
    }

    // Get weights for current difficulty
    const weights = this.segmentDifficultyWeights[this.currentDifficulty];

    // Random selection based on weights
    const random = Math.random();
    let cumulativeWeight = 0;

    for (const type in weights) {
      cumulativeWeight += weights[type];
      if (random < cumulativeWeight) {
        return type;
      }
    }

    // Default to straight if something goes wrong
    return this.chunkTypes.STRAIGHT;
  }

  generateChunkFromSegment(segment) {
    // Create a chunk based on the segment data
    const chunk = new THREE.Group();
    chunk.userData.segmentType = segment.type;
    chunk.userData.obstacles = [];
    chunk.userData.crystals = [];
    chunk.userData.powerups = [];

    // Set position to segment start
    chunk.position.copy(segment.startPosition);

    // Create track mesh
    this.createTrackMeshForSegment(segment, chunk);

    // Add obstacles and collectibles
    this.populateSegment(segment, chunk);

    this.scene.add(chunk);
    this.chunks.push(chunk);
    this.activeChunks.push(chunk);

    return chunk;
  }

  createTrackMeshForSegment(segment, chunk) {
    // Different mesh creation based on segment type
    switch (segment.type) {
      case this.chunkTypes.STRAIGHT:
        this.createStraightTrackMesh(segment, chunk);
        break;

      case this.chunkTypes.LEFT_TURN:
      case this.chunkTypes.RIGHT_TURN:
        this.createTurnTrackMesh(segment, chunk);
        break;

      case this.chunkTypes.RAMP_UP:
      case this.chunkTypes.RAMP_DOWN:
        this.createRampTrackMesh(segment, chunk);
        break;
    }

    // Add lane dividers and decorations common to all tracks
    this.addTrackDecorations(chunk, segment);
  }

  createStraightTrackMesh(segment, chunk) {
    console.log("Creating straight track mesh");

    // Track dimensions
    const length = segment.length;
    const width = this.trackWidth;

    // Create track geometry
    const trackGeometry = new THREE.BoxGeometry(width, 0.1, length);

    // Create glowing track material
    const trackMaterial = new THREE.MeshPhongMaterial({
      color: 0x0066cc,
      specular: 0x3399ff,
      shininess: 30,
      emissive: 0x001133,
      side: THREE.DoubleSide,
    });

    // Create track mesh
    const trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);

    // Position track at segment start
    trackMesh.position.set(0, 0, length / 2);

    // Add to chunk
    chunk.add(trackMesh);

    // Add side barriers
    this.addTrackBarriers(chunk, segment, width, length);

    return trackMesh;
  }

  // Add barriers to the side of the track
  addTrackBarriers(chunk, segment, width, length) {
    const barrierHeight = 0.5;
    const barrierThickness = 0.1;

    // Create barrier geometry
    const barrierGeometry = new THREE.BoxGeometry(
      barrierThickness,
      barrierHeight,
      length
    );

    // Create barrier material
    const barrierMaterial = new THREE.MeshPhongMaterial({
      color: 0x0099ff,
      specular: 0x66ccff,
      shininess: 10,
      transparent: true,
      opacity: 0.7,
    });

    // Left barrier
    const leftBarrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
    leftBarrier.position.set(
      -width / 2 - barrierThickness / 2,
      barrierHeight / 2,
      length / 2
    );
    chunk.add(leftBarrier);

    // Right barrier
    const rightBarrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
    rightBarrier.position.set(
      width / 2 + barrierThickness / 2,
      barrierHeight / 2,
      length / 2
    );
    chunk.add(rightBarrier);
  }

  createTurnTrackMesh(segment, chunk) {
    const turnDirection = segment.type === this.chunkTypes.LEFT_TURN ? 1 : -1;
    const radius = this.trackWidth;
    const innerRadius = radius - this.trackWidth / 2;
    const outerRadius = radius + this.trackWidth / 2;

    // Create curved track using Shape and ExtrudeGeometry
    const shape = new THREE.Shape();
    shape.moveTo(innerRadius, 0);
    shape.absarc(0, 0, innerRadius, 0, Math.PI / 2, false);
    shape.lineTo(outerRadius, Math.PI / 2);
    shape.absarc(0, 0, outerRadius, Math.PI / 2, 0, true);
    shape.lineTo(innerRadius, 0);

    const extrudeSettings = {
      steps: 20,
      depth: 0.1,
      bevelEnabled: false,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Adjust rotation based on turn direction
    const track = new THREE.Mesh(geometry, this.trackMaterial);

    if (turnDirection > 0) {
      // Left turn
      track.rotation.x = -Math.PI / 2;
      track.rotation.z = Math.PI;
      track.position.x = radius;
    } else {
      // Right turn
      track.rotation.x = -Math.PI / 2;
      track.position.x = -radius;
    }

    chunk.add(track);
  }

  createRampTrackMesh(segment, chunk) {
    // Use segment nodes to create a custom geometry
    const nodes = segment.nodes;
    const width = this.trackWidth;

    // Simplified ramp for now - just a BoxGeometry with rotation
    const trackGeometry = new THREE.BoxGeometry(
      this.trackWidth,
      0.1,
      segment.length
    );

    const track = new THREE.Mesh(trackGeometry, this.trackMaterial);
    track.position.y = -0.05;
    track.position.z = -segment.length / 2;

    // Rotate based on ramp type
    if (segment.type === this.chunkTypes.RAMP_UP) {
      track.rotation.x = -Math.PI / 12; // 15 degrees up
    } else {
      track.rotation.x = Math.PI / 12; // 15 degrees down
    }

    chunk.add(track);
  }

  populateSegment(segment, chunk) {
    const nodes = segment.nodes;
    if (nodes.length < 2) return;

    // Skip first and last nodes for better placement
    for (let i = 2; i < nodes.length - 2; i += 2) {
      const node = nodes[i];

      // Only place objects with some probability
      if (Math.random() < 0.7) {
        // Determine lane position (left, center, right)
        const lanePosition = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
        const laneWidth = 2;

        // Calculate position perpendicular to track direction
        const perpendicular = new THREE.Vector3(
          -node.direction.z,
          0,
          node.direction.x
        );
        const position = node.position
          .clone()
          .add(perpendicular.clone().multiplyScalar(lanePosition * laneWidth));

        // Random offset along track to avoid grid-like placement
        const forwardOffset = (Math.random() - 0.5) * 1.0;
        position.add(node.direction.clone().multiplyScalar(forwardOffset));

        // Decide what to place
        const objectType = Math.random();

        if (objectType < 0.6) {
          // Obstacle
          this.addObstacleToChunk(chunk, position, node.direction);
        } else if (objectType < 0.95) {
          // Crystal
          this.addCrystalToChunk(chunk, position, node.direction);
        } else {
          // Power-up
          this.addPowerupToChunk(chunk, position, node.direction);
        }
      }
    }
  }

  addObstacleToChunk(chunk, position, direction) {
    const obstacle = this.getFromPool("obstacles");
    if (!obstacle) return; // Safety check

    // Calculate local position relative to chunk
    const localPosition = position.clone().sub(chunk.position);

    // Random obstacle type
    const obstacleType = Math.floor(Math.random() * 3);
    let geometry, height, width, depth;

    switch (obstacleType) {
      case 0: // Asteroid
        obstacle.mesh.geometry = new THREE.DodecahedronGeometry(0.8, 0);
        width = 1.6;
        height = 1.6;
        depth = 1.6;
        obstacle.type = "asteroid";
        obstacle.mesh.material = new THREE.MeshPhongMaterial({
          color: 0x888888,
          specular: 0x333333,
          shininess: 30,
        });
        break;

      case 1: // Energy barrier
        obstacle.mesh.geometry = new THREE.BoxGeometry(1.5, 2, 0.2);
        obstacle.mesh.material = new THREE.MeshPhongMaterial({
          color: 0xff5500,
          transparent: true,
          opacity: 0.7,
        });
        width = 1.5;
        height = 2;
        depth = 0.2;
        obstacle.type = "barrier";
        break;

      case 2: // Broken space debris
        obstacle.mesh.geometry = new THREE.CylinderGeometry(0, 0.8, 1.2, 5);
        obstacle.mesh.material = new THREE.MeshPhongMaterial({
          color: 0x666666,
          specular: 0x222222,
          shininess: 20,
        });
        width = 1.6;
        height = 1.2;
        depth = 1.6;
        obstacle.type = "debris";
        break;
    }

    // Position and orient obstacle
    obstacle.mesh.position.copy(localPosition);
    obstacle.mesh.position.y = height / 2;

    // Align with track direction
    const lookAt = new THREE.Vector3().addVectors(localPosition, direction);
    obstacle.mesh.lookAt(lookAt);

    // Randomize rotation a bit for variety
    obstacle.mesh.rotation.y += ((Math.random() - 0.5) * Math.PI) / 4;

    // Make visible
    obstacle.mesh.visible = true;

    // Update obstacle data
    obstacle.position = {
      x: position.x,
      y: position.y + height / 2,
      z: position.z,
    };

    obstacle.size = {
      width: width,
      height: height,
      depth: depth,
    };

    // Add to chunk
    if (!chunk.userData.obstacles) {
      chunk.userData.obstacles = [];
    }

    chunk.userData.obstacles.push(obstacle);
    chunk.add(obstacle.mesh);
  }

  addCrystalToChunk(chunk, position, direction) {
    const crystal = this.getFromPool("crystals");
    if (!crystal) return; // Safety check

    // Calculate local position relative to chunk
    const localPosition = position.clone().sub(chunk.position);

    // Position crystal floating above track
    crystal.mesh.position.copy(localPosition);
    crystal.mesh.position.y = 1.0;

    // Update crystal material for better visibility
    crystal.mesh.material = new THREE.MeshPhongMaterial({
      color: 0x00ffff,
      specular: 0xffffff,
      shininess: 100,
      emissive: 0x007777,
      emissiveIntensity: 0.3,
    });

    // Make visible and reset collection status
    crystal.mesh.visible = true;
    crystal.collected = false;

    // Update crystal position data
    crystal.position = {
      x: position.x,
      y: position.y + 1.0,
      z: position.z,
    };

    // Add to chunk
    if (!chunk.userData.crystals) {
      chunk.userData.crystals = [];
    }

    chunk.userData.crystals.push(crystal);
    chunk.add(crystal.mesh);
  }

  addPowerupToChunk(chunk, position, direction) {
    const powerup = this.getFromPool("powerups");
    if (!powerup) return; // Safety check

    // Calculate local position relative to chunk
    const localPosition = position.clone().sub(chunk.position);

    // Random powerup type
    const powerupType = Math.floor(Math.random() * 3);
    const types = ["shield", "magnet", "speed"];
    const type = types[powerupType];

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

    // Update material
    powerup.mesh.material = new THREE.MeshPhongMaterial({
      color: powerupColor,
      specular: 0xffffff,
      shininess: 100,
      transparent: true,
      opacity: 0.8,
      emissive: powerupColor,
      emissiveIntensity: 0.3,
    });

    // Position power-up floating above track
    powerup.mesh.position.copy(localPosition);
    powerup.mesh.position.y = 1.2;

    // Make visible and reset collection status
    powerup.mesh.visible = true;
    powerup.collected = false;
    powerup.type = type;

    // Update power-up position data
    powerup.position = {
      x: position.x,
      y: position.y + 1.2,
      z: position.z,
    };

    // Add to chunk
    if (!chunk.userData.powerups) {
      chunk.userData.powerups = [];
    }

    chunk.userData.powerups.push(powerup);
    chunk.add(powerup.mesh);
  }

  setDrawDistance(distance) {
    // Update visible distance for optimized performance
    this.visibleDistance = distance;

    // Clean up distant chunks that are now beyond the draw distance
    this.pruneDistantChunks();
  }

  pruneDistantChunks() {
    // Remove chunks that are beyond the visible distance to save memory
    for (let i = this.activeChunks.length - 1; i >= 0; i--) {
      const chunk = this.activeChunks[i];
      const chunkPosition = chunk.position.clone();

      // Calculate distance from current camera view
      const distanceFromCamera = Math.abs(chunkPosition.z);

      // If beyond visible distance and out of view, remove chunk
      if (distanceFromCamera > this.visibleDistance + this.chunkSize) {
        this.removeChunk(i);
      }
    }
  }

  removeChunk(index) {
    // Get the chunk to remove
    const chunk = this.activeChunks[index];
    if (!chunk) return;

    // Remove chunk from active list
    this.activeChunks.splice(index, 1);

    // Return objects to object pools
    if (chunk.userData.obstacles) {
      chunk.userData.obstacles.forEach((obstacle) => {
        chunk.remove(obstacle.mesh);
        this.returnToPool("obstacles", obstacle);
      });
    }

    if (chunk.userData.crystals) {
      chunk.userData.crystals.forEach((crystal) => {
        chunk.remove(crystal.mesh);
        this.returnToPool("crystals", crystal);
      });
    }

    if (chunk.userData.powerups) {
      chunk.userData.powerups.forEach((powerup) => {
        chunk.remove(powerup.mesh);
        this.returnToPool("powerups", powerup);
      });
    }

    // Remove from scene
    this.scene.remove(chunk);

    // Update all-chunks list
    const chunksIndex = this.chunks.indexOf(chunk);
    if (chunksIndex !== -1) {
      this.chunks.splice(chunksIndex, 1);
    }
  }

  // Progressive asset loading methods
  loadTextureAsync(url, priority = 1) {
    return new Promise((resolve) => {
      // Check if already loaded
      const existingTexture = this.assetManager.getAsset(url);
      if (existingTexture) {
        resolve(existingTexture);
        return;
      }

      // Queue for loading
      this.assetManager.queueAsset(url, "texture", priority, resolve);
    });
  }

  // Function to preload track textures based on upcoming segments
  preloadUpcomingSegments() {
    // Determine next 3 likely segment types based on difficulty weights
    const weights = this.segmentDifficultyWeights[this.currentDifficulty];
    const segmentTypes = Object.keys(weights)
      .sort((a, b) => weights[b] - weights[a])
      .slice(0, 3);

    // Queue texture loads by segment type priority
    segmentTypes.forEach((segmentType, index) => {
      // Higher priority (3) for most likely segment, lower (1) for less likely
      const priority = 3 - index;

      // We'd load specific textures here if we had different textures per segment type
      // For now we'll just log that we're prioritizing this segment type
      console.log(
        `Prioritizing preload of ${segmentType} segments (${priority})`
      );
    });
  }
}

module.exports = { World };
