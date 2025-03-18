const THREE = require("three");

class World {
  constructor(scene) {
    this.scene = scene;

    // World properties
    this.trackLength = 100;
    this.trackWidth = 6;
    this.chunkSize = 20;

    // Objects
    this.track = null;
    this.obstacles = [];
    this.crystals = [];
    this.powerups = [];
    this.decorations = [];

    // Track segments (chunks)
    this.chunks = [];
    this.activeChunks = [];

    // Materials
    this.trackMaterial = new THREE.MeshPhongMaterial({
      color: 0x333355,
      specular: 0x222244,
      shininess: 10,
    });

    this.obstacleMaterial = new THREE.MeshPhongMaterial({
      color: 0xff3333,
      specular: 0x660000,
      shininess: 30,
    });

    this.crystalMaterial = new THREE.MeshPhongMaterial({
      color: 0x00ffff,
      specular: 0xffffff,
      shininess: 100,
      transparent: true,
      opacity: 0.8,
    });

    this.powerupMaterial = new THREE.MeshPhongMaterial({
      color: 0xffff00,
      specular: 0xffffff,
      shininess: 100,
      transparent: true,
      opacity: 0.8,
    });

    // Initialize world
    this.init();
  }

  init() {
    // Create starfield background
    this.createStarfield();

    // Create space environment
    this.createSpaceEnvironment();

    // Generate initial track chunks
    this.generateInitialChunks();
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
    // Generate first 5 chunks
    for (let i = 0; i < 5; i++) {
      this.generateChunk(i * -this.chunkSize);
    }
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

  addTrackDecorations(chunk) {
    // Add futuristic/sci-fi decorations along track
    const lanePositions = [-2, 0, 2]; // Left, center, right

    // Add light posts every 5 units
    for (let z = -this.chunkSize / 2; z <= this.chunkSize / 2; z += 5) {
      for (let side = -1; side <= 1; side += 2) {
        const postGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
        const postMaterial = new THREE.MeshPhongMaterial({
          color: 0x888899,
          specular: 0x333344,
          shininess: 30,
        });

        const post = new THREE.Mesh(postGeometry, postMaterial);
        post.position.set(side * (this.trackWidth / 2 + 0.5), 0.5, z);
        chunk.add(post);

        // Add light to the post
        const lightGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const lightMaterial = new THREE.MeshBasicMaterial({
          color: 0x00ffff,
          transparent: true,
          opacity: 0.9,
        });

        const light = new THREE.Mesh(lightGeometry, lightMaterial);
        light.position.set(side * (this.trackWidth / 2 + 0.5), 1.1, z);
        chunk.add(light);

        // Add actual point light (for better performance, only add few actual lights)
        if (z % 15 === 0) {
          const pointLight = new THREE.PointLight(0x00ffff, 0.5, 5);
          pointLight.position.set(side * (this.trackWidth / 2 + 0.5), 1.1, z);
          chunk.add(pointLight);
        }
      }
    }

    // Add random space debris/asteroids in the distance
    for (let i = 0; i < 5; i++) {
      const size = 0.5 + Math.random() * 1.5;
      const geometry = new THREE.DodecahedronGeometry(size, 0);
      const material = new THREE.MeshPhongMaterial({
        color: 0x666666,
        specular: 0x222222,
        shininess: 5,
      });

      const asteroid = new THREE.Mesh(geometry, material);

      // Position asteroids far from the track
      const side = Math.random() > 0.5 ? 1 : -1;
      asteroid.position.set(
        side * (this.trackWidth + 5 + Math.random() * 15),
        -5 + Math.random() * 15,
        -this.chunkSize / 2 + Math.random() * this.chunkSize
      );

      // Random rotation
      asteroid.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      chunk.add(asteroid);
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
    // Move chunks toward the player
    this.chunks.forEach((chunk) => {
      chunk.position.z += gameSpeed;
    });

    // Handle crystals and powerups rotation
    this.crystals.forEach((crystal) => {
      crystal.rotation.y += crystal.userData.rotationSpeed;
      // Add floating animation
      crystal.position.y = 1 + Math.sin(Date.now() * 0.001) * 0.1;
    });

    this.powerups.forEach((powerup) => {
      powerup.rotation.y += powerup.userData.rotationSpeed;
      // Add floating animation
      powerup.position.y = 1.2 + Math.sin(Date.now() * 0.001) * 0.1;
    });

    // Generate new chunks as needed
    const firstChunk = this.activeChunks[0];
    if (firstChunk && firstChunk.position.z > this.chunkSize) {
      this.activeChunks.shift();
      this.scene.remove(firstChunk);

      // Generate a new chunk at the end
      const lastChunk = this.activeChunks[this.activeChunks.length - 1];
      const newZ = lastChunk.position.z - this.chunkSize;
      this.generateChunk(newZ);
    }

    // Rotate starfield
    this.starfield.rotation.y += 0.0001;

    // Collision detection
    return this.checkCollisions(playerPosition);
  }

  checkCollisions(playerPosition) {
    // Check for collisions with obstacles, crystals, and power-ups
    let collisions = {
      obstacle: false,
      crystal: 0,
      powerup: false,
      powerupType: null,
    };

    // Only check chunks near the player
    this.activeChunks.forEach((chunk) => {
      // Calculate player's position relative to chunk
      const relativeZ = playerPosition.z - chunk.position.z;

      // Check collision with obstacles
      if (chunk.userData.obstacles) {
        chunk.userData.obstacles.forEach((obstacle) => {
          if (this.isColliding(playerPosition, obstacle)) {
            collisions.obstacle = true;
          }
        });
      }

      // Check collision with crystals
      if (chunk.userData.crystals) {
        chunk.userData.crystals.forEach((crystal) => {
          if (!crystal.collected && this.isColliding(playerPosition, crystal)) {
            collisions.crystal += crystal.value;
            crystal.collected = true;
            crystal.mesh.visible = false;
          }
        });
      }

      // Check collision with power-ups
      if (chunk.userData.powerups) {
        chunk.userData.powerups.forEach((powerup) => {
          if (!powerup.collected && this.isColliding(playerPosition, powerup)) {
            collisions.powerup = true;
            collisions.powerupType = powerup.type;
            powerup.collected = true;
            powerup.mesh.visible = false;
          }
        });
      }
    });

    return collisions;
  }

  isColliding(playerPosition, object) {
    // Simple collision detection (distance-based)
    const dx = playerPosition.x - object.position.x;
    const dy = playerPosition.y - object.position.y;
    const dz = playerPosition.z - object.position.z;

    // Calculate distance
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // If distance is less than sum of radii, they are colliding
    return distance < 1.2;
  }

  reset() {
    // Remove all chunks
    this.chunks.forEach((chunk) => {
      this.scene.remove(chunk);
    });

    this.chunks = [];
    this.activeChunks = [];
    this.obstacles = [];
    this.crystals = [];
    this.powerups = [];

    // Regenerate initial chunks
    this.generateInitialChunks();
  }
}

module.exports = { World };
