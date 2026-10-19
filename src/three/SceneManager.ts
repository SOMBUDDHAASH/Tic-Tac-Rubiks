import * as THREE from 'three';

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  private animationFrameId: number | null = null;
  private onRenderCallbacks: ((delta: number, time: number) => void)[] = [];
  private clock: THREE.Clock = new THREE.Clock();

  // Screen shake
  private shakeIntensity: number = 0;
  private shakeDecay: number = 0.9;
  private baseCameraPos: THREE.Vector3 = new THREE.Vector3(5, 4, 6);

  // Orbit controls state
  private isDragging: boolean = false;
  private orbitEnabled: boolean = true;
  private previousPointerPos = { x: 0, y: 0 };
  private spherical: THREE.Spherical = new THREE.Spherical(9, Math.PI / 3, Math.PI / 4);
  private targetLookAt: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

  constructor(container: HTMLElement) {
    this.container = container;

    // 1. Scene with warm felt craft studio tabletop atmosphere (#2b2621)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2b2621);
    this.scene.fog = new THREE.FogExp2(0x2b2621, 0.035);

    // 2. Camera — portrait-aware FOV
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const isPortrait = height > width;
    this.camera = new THREE.PerspectiveCamera(isPortrait ? 50 : 45, width / height, 0.1, 100);
    this.updateCameraFromSpherical();

    // 3. Renderer with high visual fidelity
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // 4. Lighting setup
    this.setupLighting();

    // 5. Setup Controls & Listeners
    this.setupOrbitControls();
    window.addEventListener('resize', this.onWindowResize);

    // 6. Visibility change auto-mute handled externally via App.tsx

    // 7. Start Loop
    this.startLoop();
  }

  private setupLighting() {
    // Warm incandescent ambient fill
    const ambientLight = new THREE.AmbientLight(0x423c36, 1.3);
    this.scene.add(ambientLight);

    // Warm gallery dome light (soft parchment sky & dark walnut floor)
    const hemiLight = new THREE.HemisphereLight(0xf5ede1, 0x221d19, 0.85);
    this.scene.add(hemiLight);

    // Main warm directional key light with soft shadow
    const keyLight = new THREE.DirectionalLight(0xfff7ea, 2.2);
    keyLight.position.set(6, 8, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 25;
    keyLight.shadow.bias = -0.0005;
    const d = 5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    this.scene.add(keyLight);

    // Warm brass / terracotta rim light for tactile cubie edge definition
    const rimLight = new THREE.DirectionalLight(0xdfa075, 1.2);
    rimLight.position.set(-7, -4, -6);
    this.scene.add(rimLight);

    // Subtle sage / olive bounce light
    const fillLight = new THREE.DirectionalLight(0xa3b899, 0.75);
    fillLight.position.set(5, -5, -6);
    this.scene.add(fillLight);

    // Subtle ground shadow catcher
    const groundGeo = new THREE.PlaneGeometry(30, 30);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.4 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3.2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  /**
   * Enable or disable orbit (used by InteractionManager when dragging a layer vs background)
   */
  public setOrbitEnabled(enabled: boolean) {
    this.orbitEnabled = enabled;
  }

  /** Legacy compat: allow InteractionManager to still call allowOrbit setter */
  public set allowOrbit(val: boolean) {
    this.orbitEnabled = val;
  }

  private setupOrbitControls() {
    const el = this.renderer.domElement;

    // Single-pointer orbit (touch or mouse on background)
    const onPointerDown = (e: PointerEvent) => {
      if (!this.orbitEnabled) return;
      // Accept button 0 (left click) or any touch pointer
      if (e.button !== 0 && e.pointerType !== 'touch') return;
      this.isDragging = true;
      this.previousPointerPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.isDragging || !this.orbitEnabled) return;

      const deltaX = e.clientX - this.previousPointerPos.x;
      const deltaY = e.clientY - this.previousPointerPos.y;

      const rotSpeed = 0.006;
      this.spherical.theta -= deltaX * rotSpeed;
      this.spherical.phi -= deltaY * rotSpeed;

      // Clamp vertical orbit angle so camera never flips upside down
      this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));

      this.updateCameraFromSpherical();
      this.previousPointerPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = () => {
      this.isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSpeed = 0.003;
      this.spherical.radius += e.deltaY * zoomSpeed;
      this.spherical.radius = Math.max(5.5, Math.min(14, this.spherical.radius));
      this.updateCameraFromSpherical();
    };

    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    // Two-finger pinch-to-zoom on touch devices
    let lastPinchDist = 0;
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        lastPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        // Disable single-pointer drag when pinching
        this.isDragging = false;
      }
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const delta = lastPinchDist - dist;
        this.spherical.radius = Math.max(5.5, Math.min(14, this.spherical.radius + delta * 0.02));
        this.updateCameraFromSpherical();
        lastPinchDist = dist;
      }
    }, { passive: true });
  }

  private updateCameraFromSpherical() {
    this.baseCameraPos.setFromSpherical(this.spherical);
    this.camera.position.copy(this.baseCameraPos);
    this.camera.lookAt(this.targetLookAt);
  }

  /**
   * Snaps camera to look directly at a specific face
   */
  public snapToFace(face: 'F' | 'B' | 'L' | 'R' | 'U' | 'D') {
    const r = 8.5;
    switch (face) {
      case 'F':
        this.spherical.set(r, Math.PI / 2, 0);
        break;
      case 'B':
        this.spherical.set(r, Math.PI / 2, Math.PI);
        break;
      case 'R':
        this.spherical.set(r, Math.PI / 2, Math.PI / 2);
        break;
      case 'L':
        this.spherical.set(r, Math.PI / 2, -Math.PI / 2);
        break;
      case 'U':
        this.spherical.set(r, 0.2, 0);
        break;
      case 'D':
        this.spherical.set(r, Math.PI - 0.2, 0);
        break;
    }
    this.updateCameraFromSpherical();
  }

  /**
   * Trigger screen shake effect on layer twists
   */
  public triggerScreenShake(intensity: number = 0.12) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  public registerRenderCallback(cb: (delta: number, time: number) => void) {
    this.onRenderCallbacks.push(cb);
  }

  private isPaused: boolean = false;

  public pause() {
    this.isPaused = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public resume() {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.clock.start();
    this.startLoop();
  }

  private onWindowResize = () => {
    if (!this.container) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const aspect = width / height;

    // Responsive FOV adaptation across all aspect ratios (9:32, 9:21, 9:16, 3:4, 1:1, 4:3, 16:9, 21:9, 32:9)
    if (aspect < 0.55) {
      this.camera.fov = 55; // Tall portrait (e.g. 9:21, 9:32)
    } else if (aspect < 0.85) {
      this.camera.fov = 50; // Standard portrait (9:16)
    } else if (aspect < 1.2) {
      this.camera.fov = 46; // Square / Tablet (3:4, 1:1, 4:3)
    } else {
      this.camera.fov = 40; // Landscape / Ultrawide (16:9, 21:9, 32:9)
    }

    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private startLoop() {
    if (this.isPaused) return;

    const animate = () => {
      if (this.isPaused) return;
      this.animationFrameId = requestAnimationFrame(animate);

      const delta = this.clock.getDelta();
      const time = this.clock.getElapsedTime();

      // Screen shake decay and camera position offset
      if (this.shakeIntensity > 0.001) {
        const ox = (Math.random() - 0.5) * this.shakeIntensity;
        const oy = (Math.random() - 0.5) * this.shakeIntensity;
        const oz = (Math.random() - 0.5) * this.shakeIntensity;
        this.camera.position.set(
          this.baseCameraPos.x + ox,
          this.baseCameraPos.y + oy,
          this.baseCameraPos.z + oz
        );
        this.shakeIntensity *= this.shakeDecay;
      } else {
        this.camera.position.copy(this.baseCameraPos);
      }
      this.camera.lookAt(this.targetLookAt);

      // Execute registered render callbacks
      for (const cb of this.onRenderCallbacks) {
        cb(delta, time);
      }

      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  public dispose() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.onWindowResize);
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
