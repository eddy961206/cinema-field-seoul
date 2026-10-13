import * as THREE from './vendor/three.module.js';

const clamp = THREE.MathUtils.clamp;
const TAU = Math.PI * 2;

/** An architectural viewing model. Dimensions use metres; seats are 1-indexed. */
export function createCinema(container, options = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.23;
  renderer.setClearColor(0x070709, 1);
  renderer.domElement.className = 'cinema-canvas';
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none;z-index:0';
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Interactive three-dimensional cinema. Click a seat to sit. Drag to look. Use W A S D to walk.');
  container.appendChild(renderer.domElement);
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.style.overflow = 'hidden';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0c0f);
  scene.fog = new THREE.FogExp2(0x13131b, 0.008);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.04, 150);
  camera.rotation.order = 'YXZ';
  const world = new THREE.Group();
  scene.add(world);
  let config = { screenWidth: 15.5, screenHeight: 6.5, rows: 12, columns: 25, pitch: 1.12, rise: 0.29, frontDistance: 7.5 };
  let roomWidth = 22, roomDepth = 23, ceiling = 10, seatCenters = [], pickMeshes = [], aisleXs = [], maxGridColumn = 24;
  let screenBottom = 1.55, screenMesh, screenTexture, hoverSeat = null, selectedMarker;
  let state = { selectedRow: 7, selectedSeat: 13, mode: 'orbit', position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 };
  let yaw = 0, pitch = 0, orbitTheta = 0.19, orbitElevation = 0.265, orbitRadius = 19;
  let animated = null, lastTime = performance.now(), lastNotify = 0, disposed = false, raf, width = 1, height = 1;
  const keys = new Set(), raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), dummy = new THREE.Object3D();
  const projectionCorners = Array.from({ length: 4 }, () => new THREE.Vector3());
  const screenElement = options.screenElement;
  const eventCleanups = [];
  let screenCssWidth = 1280, screenCssHeight = 720;
  if (screenElement) {
    Object.assign(screenElement.style, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0', zIndex: '2', pointerEvents: 'auto', backfaceVisibility: 'hidden', willChange: 'transform' });
  }

  const velvet = new THREE.MeshStandardMaterial({ color: 0x793039, roughness: 0.86, metalness: 0.03 });
  const velvetFront = new THREE.MeshStandardMaterial({ color: 0x983e45, roughness: 0.92, metalness: 0 });
  const velvetSide = new THREE.MeshStandardMaterial({ color: 0x51242d, roughness: 0.9 });
  const piping = new THREE.MeshStandardMaterial({ color: 0xad5960, roughness: 0.85 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.66, metalness: 0.1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.5, metalness: 0.66 });
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x252329, roughness: 1 });
  const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x40383b, roughness: 0.94 });
  const panelInset = new THREE.MeshStandardMaterial({ color: 0x1f1d24, roughness: 0.96 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x16171b, roughness: 0.94 });
  const warmLightMat = new THREE.MeshBasicMaterial({ color: 0xffc68d });
  const softLightMat = new THREE.MeshBasicMaterial({ color: 0x896749 });
  const carpet = new THREE.MeshStandardMaterial({ color: 0x25272c, roughness: 1, map: makeCarpetTexture() });
  const stepFace = new THREE.MeshStandardMaterial({ color: 0x16181e, roughness: 1 });
  const baseMaterials = [velvet, velvetFront, velvetSide, piping, plastic, steel, wallMaterial, panelMaterial, panelInset, ceilingMat, warmLightMat, softLightMat, carpet, stepFace];

  const ambient = new THREE.HemisphereLight(0xc7d4eb, 0x614540, 1.13);
  scene.add(ambient);
  const screenLight = new THREE.PointLight(0xb7d0ff, 160, 46, 2);
  screenLight.position.set(0, 5, 2.6);
  scene.add(screenLight);
  const ceilingLight = new THREE.DirectionalLight(0xffd1ad, 2.5);
  ceilingLight.position.set(-6, 14, 14);
  scene.add(ceilingLight);
  const fill = new THREE.DirectionalLight(0x8aa2d0, 1.0);
  fill.position.set(8, 9, -5);
  scene.add(fill);
  const rearGlow = new THREE.PointLight(0xffad7a, 62, 26, 2);
  scene.add(rearGlow);

  function makeCarpetTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#777777'; ctx.fillRect(0, 0, 128, 128);
    // Deterministic, finely speckled acoustic carpet.
    let seed = 19;
    for (let i = 0; i < 3500; i++) {
      seed = (seed * 16807) % 2147483647; const x = seed % 128;
      seed = (seed * 16807) % 2147483647; const y = seed % 128;
      ctx.fillStyle = i % 3 ? '#636363' : '#898989'; ctx.fillRect(x, y, 1, 1);
    }
    const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(28, 28); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  function roundedBox(w, h, d, r = 0.065) {
    r = Math.min(r, w / 2, h / 2, d / 2);
    const x = -w / 2 + r, y = -h / 2 + r, sw = w - 2 * r, sh = h - 2 * r;
    const shape = new THREE.Shape();
    shape.moveTo(x, y); shape.lineTo(x + sw, y); shape.lineTo(x + sw, y + sh); shape.lineTo(x, y + sh); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, d - r * 2), bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: r, bevelThickness: r, curveSegments: 4 });
    geo.translate(0, 0, -d / 2 + r); geo.computeVertexNormals(); return geo;
  }
  function box(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); world.add(mesh); return mesh;
  }
  function rowFloor(row) { return Math.max(0, row - 1) * config.rise; }
  function floorAt(z) { return clamp(Math.floor((z - config.frontDistance + config.pitch / 2) / config.pitch), 0, config.rows - 1) * config.rise; }
  function seatAt(row, seat) { return seatCenters.find(s => s.row === row && s.seat === seat); }
  function seatX(index, count) {
    const split1 = Math.max(2, Math.round(count * 0.25));
    const split2 = count - split1;
    const gap = 1.03, spacing = 0.67;
    return (index - (count - 1) / 2) * spacing + (index >= split1 ? gap : 0) + (index >= split2 ? gap : 0) - gap;
  }
  function disposeWorld() {
    const geometries = new Set(), transientMaterials = new Set();
    world.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material && !baseMaterials.includes(o.material)) transientMaterials.add(o.material); });
    geometries.forEach(g => g.dispose()); transientMaterials.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    world.clear(); seatCenters = []; pickMeshes = []; selectedMarker = null;
  }
  function build() {
    disposeWorld();
    const count = config.columns;
    const hasGrid = Array.isArray(config.rowColumns) && config.rowColumns.length > 0;
    maxGridColumn = hasGrid ? Math.max(...config.rowColumns.flat()) : count - 1;
    const seatingWidth = hasGrid ? (maxGridColumn + 1) * .67 : count * 0.67 + 2.06;
    roomWidth = Math.max(seatingWidth + 3.6, config.screenWidth + 3.1);
    roomDepth = config.frontDistance + (config.rows - 1) * config.pitch + 3.3;
    ceiling = Math.max(config.screenHeight + screenBottom + 1.7, rowFloor(config.rows) + 5.6);
    screenCssHeight = screenCssWidth * config.screenHeight / config.screenWidth;
    if (screenElement) { screenElement.style.width = `${screenCssWidth}px`; screenElement.style.height = `${screenCssHeight}px`; }
    const split1 = Math.max(2, Math.round(count * .25)), split2 = count - split1;
    aisleXs = [(seatX(split1 - 1, count) + seatX(split1, count)) / 2, (seatX(split2 - 1, count) + seatX(split2, count)) / 2];
    if (hasGrid) {
      const openColumns = [];
      for (let col = 1; col < maxGridColumn; col++) if (config.rowColumns.filter(row => !row.includes(col)).length >= config.rows * .78) openColumns.push(col);
      aisleXs = [];
      for (let i = 0; i < openColumns.length; i++) { const start = openColumns[i]; let end = start; while (openColumns[i + 1] === end + 1) end = openColumns[++i]; aisleXs.push(((start + end) / 2 - maxGridColumn / 2) * .67); }
    }
    const sideAisles = [-(seatingWidth / 2 + .83), seatingWidth / 2 + .83];
    const allAisles = [...sideAisles, ...aisleXs];
    // Tiered slab: the first row sits on the main floor, each rear row rises.
    box(roomWidth, .22, roomDepth + 2.4, carpet, 0, -.11, roomDepth / 2 - .4);
    for (let r = 1; r <= config.rows; r++) {
      const z = config.frontDistance + (r - 1) * config.pitch;
      const rise = rowFloor(r);
      if (rise > 0) box(roomWidth - .04, rise, config.pitch, carpet, 0, rise / 2, z);
      box(roomWidth - .06, .055, .045, stepFace, 0, rise + .009, z - config.pitch / 2 + .012);
      for (const ax of allAisles) {
        box(.70, .012, .035, warmLightMat, ax, rise + .018, z - config.pitch / 2 + .025);
        box(.035, .012, config.pitch - .14, softLightMat, ax - .43, rise + .014, z);
        box(.035, .012, config.pitch - .14, softLightMat, ax + .43, rise + .014, z);
      }
      const rowCount = clamp(Math.round(config.rowCounts?.[r - 1] || count), 1, count);
      for (let s = 1; s <= rowCount; s++) {
        const column = hasGrid ? config.rowColumns[r - 1][s - 1] : s - 1;
        const accessible = config.accessibleCells?.some(cell => cell.row === r && cell.column === column) || false;
        seatCenters.push({ row: r, seat: s, column, accessible, x: hasGrid ? (column - maxGridColumn / 2) * .67 : seatX(s - 1, rowCount), y: rise, z });
      }
    }
    const rearFloor = rowFloor(config.rows);
    box(roomWidth, rearFloor + .02, 3.4, carpet, 0, (rearFloor - .02) / 2, roomDepth - 1.5);
    // Thick velvet screen surround; the projected surface sits slightly forward.
    box(config.screenWidth + .52, config.screenHeight + .5, .24, plastic, 0, screenBottom + config.screenHeight / 2, -.17);
    box(roomWidth, ceiling + .3, .36, wallMaterial, 0, ceiling / 2, -.68);
    for (const side of [-1, 1]) {
      box(.28, ceiling, roomDepth + 1.2, wallMaterial, side * roomWidth / 2, ceiling / 2, roomDepth / 2 - .3);
      for (let z = 1.05, i = 0; z < roomDepth - .8; z += 1.48, i++) {
        const floor = floorAt(z), panelHeight = ceiling - floor - 1.5;
        box(.105, panelHeight, 1.17, i % 2 ? panelMaterial : panelInset, side * (roomWidth / 2 - .2), floor + .7 + panelHeight / 2, z);
        box(.033, .033, 1.28, softLightMat, side * (roomWidth / 2 - .27), floor + .31, z);
      }
      box(.07, .05, roomDepth, softLightMat, side * (roomWidth / 2 - .42), ceiling - .25, roomDepth / 2);
      // Low illuminated wall panels ground the room without visual clutter.
      for (let z = 4.5; z < roomDepth; z += 5) {
        box(.16, .45, .10, plastic, side * (roomWidth / 2 - .32), floorAt(z) + 1.05, z);
        box(.018, .33, .075, warmLightMat, side * (roomWidth / 2 - .414), floorAt(z) + 1.05, z);
      }
    }
    box(roomWidth, ceiling, .25, wallMaterial, 0, ceiling / 2, roomDepth + .35);
    box(roomWidth, .22, roomDepth + 1.6, ceilingMat, 0, ceiling + .1, roomDepth / 2 - .4);
    for (let x = -roomWidth / 2 + 1; x <= roomWidth / 2 - .5; x += 1.75) {
      box(.065, .13, roomDepth + .2, plastic, x, ceiling - .08, roomDepth / 2);
      for (let z = 3; z < roomDepth - 1; z += 4.6) {
        box(.63, .035, .19, steel, x, ceiling - .18, z);
        box(.43, .038, .065, softLightMat, x, ceiling - .203, z);
      }
    }
    buildScreen();
    buildSeats();
    buildExitSigns();
    screenLight.position.set(0, screenBottom + config.screenHeight * .52, 2.5);
    screenLight.intensity = 180 * (config.screenWidth / 15);
    rearGlow.position.set(-4, rearFloor + 3.5, roomDepth - 3);
    ceilingLight.position.set(-roomWidth * .25, ceiling + 4, roomDepth * .75);
    orbitRadius = roomDepth - (config.frontDistance * .55) - 1.2;
    state.selectedRow = clamp(state.selectedRow, 1, config.rows);
    state.selectedSeat = clamp(state.selectedSeat, 1, config.rowCounts?.[state.selectedRow - 1] || count);
    updateMarker();
  }
  function buildSeats() {
    const actualSeats = seatCenters.filter(s => !s.accessible);
    const n = actualSeats.length;
    const parts = [
      { geometry: roundedBox(.585, .87, .225, .079), material: velvet, p: [0, .745, .245], rx: -.06, pick: true },
      { geometry: roundedBox(.526, .63, .068, .03), material: velvetFront, p: [0, .746, .110], rx: -.065 },
      { geometry: roundedBox(.525, .195, .53, .065), material: velvetFront, p: [0, .437, -.065], rx: .025, pick: true },
      { geometry: roundedBox(.49, .195, .066, .030), material: velvet, p: [0, 1.075, .102], rx: -.075 },
      { geometry: roundedBox(.106, .155, .585, .048), material: velvetSide, p: [-.315, .596, -.045] },
      { geometry: roundedBox(.106, .155, .585, .048), material: velvetSide, p: [.315, .596, -.045] },
      { geometry: new THREE.BoxGeometry(.072, .335, .37), material: plastic, p: [-.307, .351, .035] },
      { geometry: new THREE.BoxGeometry(.072, .335, .37), material: plastic, p: [.307, .351, .035] },
      { geometry: new THREE.BoxGeometry(.19, .265, .235), material: steel, p: [0, .16, .08] },
      { geometry: new THREE.BoxGeometry(.38, .055, .30), material: plastic, p: [0, .038, .08] },
      // A fine stitch edge on the visible back makes the upholstery read as fabric.
      { geometry: roundedBox(.50, .015, .009, .004), material: piping, p: [0, 1.101, .361], rx: -.06 },
    ];
    parts.forEach(part => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, n);
      mesh.frustumCulled = false;
      actualSeats.forEach((s, i) => {
        dummy.position.set(s.x + part.p[0], s.y + part.p[1], s.z + part.p[2]);
        dummy.rotation.set(part.rx || 0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        // Subtle row variation avoids the uniform appearance of plastic.
        if (part.material === velvet || part.material === velvetFront) {
          const color = new THREE.Color().setScalar(0.92 + ((s.row * 7 + s.seat * 3) % 11) * .013);
          mesh.setColorAt(i, color);
        }
      });
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (part.pick) { mesh.userData.seatPart = true; mesh.userData.seats = actualSeats; pickMeshes.push(mesh); }
      world.add(mesh);
    });
    // Recessed cup holders, a small but recognizable architectural detail.
    const cups = new THREE.InstancedMesh(new THREE.TorusGeometry(.033, .009, 5, 14), plastic, n * 2);
    actualSeats.forEach((s, i) => {
      [-1, 1].forEach((side, j) => {
        dummy.position.set(s.x + side * .314, s.y + .681, s.z - .19); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.updateMatrix(); cups.setMatrixAt(i * 2 + j, dummy.matrix);
      });
    }); cups.frustumCulled = false; world.add(cups);
    const accessibleMat = new THREE.MeshBasicMaterial({ color: 0x80b7b2, transparent: true, opacity: .65 });
    for (const s of seatCenters.filter(s => s.accessible)) {
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(.57, .83)), new THREE.LineBasicMaterial({ color: 0x8cb6b0 }));
      outline.rotation.x = -Math.PI / 2; outline.position.set(s.x, s.y + .02, s.z); world.add(outline);
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(.58, .83), accessibleMat); pad.rotation.x = -Math.PI / 2; pad.position.copy(outline.position); pad.position.y -= .001; pad.userData.seat = s; world.add(pad); pickMeshes.push(pad);
      const symbolCanvas = document.createElement("canvas"); symbolCanvas.width = symbolCanvas.height = 128; const ctx = symbolCanvas.getContext("2d"); ctx.fillStyle = "#c8e6df"; ctx.font = "90px Arial"; ctx.textAlign = "center"; ctx.fillText("♿", 64, 100); const tex = new THREE.CanvasTexture(symbolCanvas); tex.colorSpace = THREE.SRGBColorSpace;
      const symbol = new THREE.Mesh(new THREE.PlaneGeometry(.36, .36), new THREE.MeshBasicMaterial({ map: tex, transparent: true })); symbol.rotation.x = -Math.PI / 2; symbol.position.set(s.x, s.y + .022, s.z); world.add(symbol);
    }
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xa6e5ce, transparent: true, opacity: .94, depthTest: true });
    selectedMarker = new THREE.Mesh(new THREE.TorusGeometry(.205, .018, 8, 40), markerMat);
    selectedMarker.rotation.x = -Math.PI / 2; world.add(selectedMarker);
  }
  function buildScreen() {
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = Math.round(1600 * config.screenHeight / config.screenWidth);
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    const gradient = ctx.createLinearGradient(0, 0, w, h); gradient.addColorStop(0, '#b8d1d2'); gradient.addColorStop(.45, '#8ba4a7'); gradient.addColorStop(1, '#f0d8b4'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    // Quiet, cinematic mountain imagery remains a useful screen reference before video is loaded.
    const mountains = [ ['#718f94', .58, .09], ['#547277', .73, .10], ['#304d52', .91, .12] ];
    mountains.forEach(([color, base, amp], layer) => {
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w + 10; x += 8) { const t = x / w; const wave = Math.sin(t * 6.3 + layer * 2) * .36 + Math.sin(t * 15.2 + layer) * .18 + Math.cos(t * 30.8) * .065; ctx.lineTo(x, h * (base + wave * amp * 4)); }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    });
    const haze = ctx.createLinearGradient(0, 0, 0, h); haze.addColorStop(0, '#edf0db22'); haze.addColorStop(.5, '#efddb217'); haze.addColorStop(1, '#172d3544'); ctx.fillStyle = haze; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffffd9'; ctx.textAlign = 'center'; ctx.font = `500 ${h * .022}px Arial, sans-serif`; ctx.letterSpacing = '6px'; ctx.fillText('A DIFFERENT PERSPECTIVE', w / 2, h * .255);
    ctx.font = `300 ${h * .100}px Georgia, serif`; ctx.letterSpacing = '0px'; ctx.fillText('Every seat has a story.', w / 2, h * .40);
    screenTexture = new THREE.CanvasTexture(canvas); screenTexture.colorSpace = THREE.SRGBColorSpace;
    screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(config.screenWidth, config.screenHeight), new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false }));
    screenMesh.position.set(0, screenBottom + config.screenHeight / 2, .009); world.add(screenMesh);
    // Subdued strips simulate light spill around the screen surround.
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x70858a, transparent: true, opacity: .35 });
    box(config.screenWidth + .64, .022, .05, glowMat, 0, screenBottom - .27, -.02);
  }
  function buildExitSigns() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#123b30'; ctx.fillRect(0, 0, 256, 96); ctx.fillStyle = '#b1f1cd'; ctx.font = 'bold 43px Arial'; ctx.textAlign = 'center'; ctx.fillText('EXIT  →', 128, 63);
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: texture });
    for (const side of [-1, 1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(.72, .27), mat); sign.position.set(side * (roomWidth / 2 - .19), 2.5, 2.8); sign.rotation.y = -side * Math.PI / 2; world.add(sign);
      const door = box(.045, 2.12, 1.2, plastic, side * (roomWidth / 2 - .165), 1.06, 2.8);
      box(.058, .02, .19, steel, side * (roomWidth / 2 - .205), 1.01, 2.53);
    }
  }
  function updateMarker() {
    const s = seatAt(state.selectedRow, state.selectedSeat);
    if (s && selectedMarker) { selectedMarker.position.set(s.x, s.y + .547, s.z - .075); selectedMarker.visible = state.mode !== 'seat'; }
  }
  function stateSnapshot() {
    return { ...state, position: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, yaw: camera.rotation.y, pitch: camera.rotation.x, fov: camera.fov, config: { ...config }, seatCount: seatCenters.length };
  }
  function notify(force = false) {
    const now = performance.now(); if (!force && now - lastNotify < 100) return;
    lastNotify = now; options.onState?.(stateSnapshot());
  }
  function cameraAnglesTo(target) {
    const dx = target.x - camera.position.x, dy = target.y - camera.position.y, dz = target.z - camera.position.z;
    yaw = Math.atan2(-dx, -dz); pitch = Math.atan2(dy, Math.hypot(dx, dz));
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }
  function orbitCamera() {
    const targetZ = config.frontDistance * .55;
    camera.position.set(clamp(Math.sin(orbitTheta) * orbitRadius, -roomWidth / 2 + .75, roomWidth / 2 - .75), clamp(screenBottom + config.screenHeight * .36 + Math.sin(orbitElevation) * orbitRadius, 2, ceiling - .65), clamp(targetZ + Math.cos(orbitTheta) * Math.cos(orbitElevation) * orbitRadius, 2.3, roomDepth - .8));
    cameraAnglesTo(new THREE.Vector3(0, screenBottom + config.screenHeight * .46, .8));
  }
  function sit(row, seat, immediate = false) {
    row = clamp(Math.round(Number(row) || 1), 1, config.rows);
    seat = clamp(Math.round(Number(seat) || 1), 1, config.rowCounts?.[row - 1] || config.columns);
    const s = seatAt(row, seat); if (!s) return;
    state.selectedRow = row; state.selectedSeat = seat; state.mode = 'seat';
    const to = new THREE.Vector3(s.x, s.y + 1.12, s.z - .055);
    const dx = -to.x, dy = screenBottom + config.screenHeight / 2 - to.y, dz = .025 - to.z;
    const targetYaw = Math.atan2(-dx, -dz), targetPitch = Math.atan2(dy, Math.hypot(dx, dz));
    if (immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { camera.position.copy(to); yaw = targetYaw; pitch = targetPitch; camera.rotation.set(pitch, yaw, 0); animated = null; }
    else animated = { from: camera.position.clone(), to, yawFrom: camera.rotation.y, pitchFrom: camera.rotation.x, yawTo: targetYaw, pitchTo: targetPitch, start: performance.now(), duration: 820 };
    updateMarker(); notify(true);
  }
  function setMode(mode) {
    if (!['seat', 'walk', 'orbit'].includes(mode)) return;
    animated = null;
    if (mode === 'seat') { sit(state.selectedRow, state.selectedSeat); return; }
    state.mode = mode;
    if (mode === 'orbit') { orbitTheta = .19; orbitElevation = .265; orbitRadius = roomDepth - config.frontDistance * .55 - 1.2; orbitCamera(); }
    if (mode === 'walk') {
      const nearest = [...aisleXs, -roomWidth / 2 + .9, roomWidth / 2 - .9].reduce((a, b) => Math.abs(a - camera.position.x) < Math.abs(b - camera.position.x) ? a : b);
      camera.position.x = nearest; camera.position.z = clamp(camera.position.z, 1.4, roomDepth - .6); camera.position.y = floorAt(camera.position.z) + 1.65;
      yaw = camera.rotation.y; pitch = clamp(camera.rotation.x, -.7, .7);
    }
    updateMarker(); notify(true);
  }
  function lookAtScreen() {
    animated = null;
    if (state.mode === 'orbit') { setMode('orbit'); return; }
    cameraAnglesTo(new THREE.Vector3(0, screenBottom + config.screenHeight / 2, .025));
    notify(true);
  }
  function blocked(x, z) {
    // Keep the walker in cross-aisles or longitudinal aisles, never through chairs.
    return seatCenters.some(s => !s.accessible && Math.abs(s.x - x) < .43 && Math.abs(s.z - z) < .53);
  }
  function move(dx, dz) {
    if (state.mode !== 'walk') return;
    animated = null;
    const sx = (Number(dx) || 0) * Math.cos(yaw) - (Number(dz) || 0) * Math.sin(yaw);
    const sz = -(Number(dx) || 0) * Math.sin(yaw) - (Number(dz) || 0) * Math.cos(yaw);
    // Split long inputs so they cannot tunnel through a block of seats.
    const steps = Math.max(1, Math.ceil(Math.hypot(sx, sz) / .08));
    for (let i = 0; i < steps; i++) {
      const nx = clamp(camera.position.x + sx / steps, -roomWidth / 2 + .44, roomWidth / 2 - .44);
      const nz = clamp(camera.position.z + sz / steps, 1.05, roomDepth - .55);
      if (!blocked(nx, camera.position.z)) camera.position.x = nx;
      if (!blocked(camera.position.x, nz)) camera.position.z = nz;
    }
    camera.position.y = floorAt(camera.position.z) + 1.65; notify();
  }
  /** Angles are radians. Positive dx looks right, positive dy looks down. */
  function rotate(dx, dy) {
    animated = null;
    if (state.mode === 'orbit') {
      orbitTheta = clamp(orbitTheta - dx, -.57, .57); orbitElevation = clamp(orbitElevation + dy, -.05, .48); orbitCamera();
    } else {
      yaw -= Number(dx) || 0; pitch = clamp(pitch - (Number(dy) || 0), -1.22, 1.22); camera.rotation.set(pitch, yaw, 0, 'YXZ');
    }
    notify();
  }
  function setRoom(next = {}) {
    const oldMode = state.mode;
    config = { ...config, ...next };
    if (Number.isFinite(Number(next.fov))) { camera.fov = clamp(Number(next.fov), 35, 90); camera.updateProjectionMatrix(); }
    config.screenWidth = clamp(Number(config.screenWidth) || 15.5, 4, 36);
    config.screenHeight = clamp(Number(config.screenHeight) || 6.5, 2, 40);
    config.rows = clamp(Math.round(Number(config.rows) || 12), 1, 35);
    config.columns = clamp(Math.round(Number(config.columns) || 25), 4, 80);
    if (Array.isArray(config.rowColumns) && config.rowColumns.length) {
      config.rowColumns = config.rowColumns.map(row => [...new Set(row.map(Number).filter(Number.isFinite))].sort((a, b) => a - b));
      config.rows = config.rowColumns.length; config.rowCounts = config.rowColumns.map(row => row.length); config.columns = Math.max(...config.rowColumns.flat()) + 1;
    }
    config.pitch = clamp(Number(config.pitch) || 1.12, .85, 2.2);
    config.rise = clamp(Number(config.rise) || .29, 0, .75);
    config.frontDistance = clamp(Number(config.frontDistance) || 7.5, 2.5, 22);
    if (Array.isArray(config.rowCounts)) config.rowCounts = config.rowCounts.map(n => clamp(Math.round(Number(n) || config.columns), 1, config.columns));
    build();
    if (oldMode === 'seat') sit(state.selectedRow, state.selectedSeat, true); else setMode(oldMode);
    resize(); notify(true);
  }
  function setCalibration(values = {}) {
    const next = {};
    for (const key of ['pitch', 'rise', 'frontDistance']) if (Number.isFinite(Number(values[key]))) next[key] = Number(values[key]);
    if (values.fov !== undefined) { camera.fov = clamp(Number(values.fov) || 60, 35, 90); camera.updateProjectionMatrix(); }
    if (Object.keys(next).length) setRoom(next); else notify(true);
  }
  function resize() {
    width = Math.max(1, container.clientWidth); height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); updateScreenProjection();
  }
  function updateScreenProjection() {
    if (!screenElement) return;
    camera.updateMatrixWorld();
    const sw = config.screenWidth / 2, sy = screenBottom, sh = config.screenHeight;
    const worldPoints = [[-sw, sy + sh, .026], [sw, sy + sh, .026], [sw, sy, .026], [-sw, sy, .026]];
    let behind = false;
    const p = worldPoints.map((v, i) => {
      const point = projectionCorners[i].set(...v);
      const viewZ = point.clone().applyMatrix4(camera.matrixWorldInverse).z;
      if (viewZ >= -.06) behind = true;
      point.project(camera); return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 };
    });
    if (behind || camera.position.z <= 0) { screenElement.style.visibility = 'hidden'; return; }
    screenElement.style.visibility = 'visible';
    const [p0, p1, p2, p3] = p;
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
    const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(det) < .00001) { screenElement.style.visibility = 'hidden'; return; }
    const g = (dx3 * dy2 - dx2 * dy3) / det, h = (dx1 * dy3 - dx3 * dy1) / det;
    const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x;
    const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y;
    const m = [a / screenCssWidth, d / screenCssWidth, 0, g / screenCssWidth, b / screenCssHeight, e / screenCssHeight, 0, h / screenCssHeight, 0, 0, 1, 0, p0.x, p0.y, 0, 1];
    screenElement.style.transform = `matrix3d(${m.join(',')})`;
  }
  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickMeshes, false)[0]; if (!hit) return null; return hit.object.userData.seat || hit.object.userData.seats?.[hit.instanceId] || null;
  }
  function on(target, event, handler, opts) { target.addEventListener(event, handler, opts); eventCleanups.push(() => target.removeEventListener(event, handler, opts)); }
  let dragging = false, pointerId = null, lastX = 0, lastY = 0, dragDistance = 0;
  on(renderer.domElement, 'pointerdown', e => {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    renderer.domElement.focus({ preventScroll: true }); dragging = true; pointerId = e.pointerId; lastX = e.clientX; lastY = e.clientY; dragDistance = 0; renderer.domElement.setPointerCapture(e.pointerId);
  });
  on(renderer.domElement, 'pointermove', e => {
    if (dragging && e.pointerId === pointerId) { const dx = e.clientX - lastX, dy = e.clientY - lastY; dragDistance += Math.abs(dx) + Math.abs(dy); lastX = e.clientX; lastY = e.clientY; if (dragDistance > 4) rotate(dx * .0035, dy * .0035); }
    else { const hit = pick(e); hoverSeat = hit; renderer.domElement.style.cursor = hit ? 'pointer' : 'grab'; options.onHover?.(hit ? { row: hit.row, seat: hit.seat, x: e.clientX, y: e.clientY } : null); }
  });
  on(renderer.domElement, 'pointerup', e => {
    if (e.pointerId !== pointerId) return;
    if (dragDistance < 7) { const hit = pick(e); if (hit) { sit(hit.row, hit.seat); options.onSeat?.(hit.row, hit.seat); } }
    dragging = false; pointerId = null; if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
  });
  on(renderer.domElement, 'pointercancel', () => { dragging = false; pointerId = null; });
  on(renderer.domElement, 'pointerleave', () => { if (!dragging) options.onHover?.(null); });
  on(renderer.domElement, 'wheel', e => {
    e.preventDefault(); if (state.mode === 'orbit') { orbitRadius = clamp(orbitRadius + e.deltaY * .014, config.frontDistance + 1.6, roomDepth - config.frontDistance * .45); orbitCamera(); notify(); }
    else if (state.mode === 'walk') move(0, -e.deltaY * .003);
  }, { passive: false });
  on(window, 'keydown', e => {
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'IFRAME'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
    const key = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'shift'].includes(key)) { keys.add(key); e.preventDefault(); }
  });
  on(window, 'keyup', e => keys.delete(e.key.toLowerCase()));
  on(window, 'blur', () => { keys.clear(); dragging = false; });
  const observer = new ResizeObserver(resize); observer.observe(container);

  function animate(now) {
    if (disposed) return; const dt = Math.min((now - lastTime) / 1000, .04); lastTime = now;
    let changed = false;
    if (animated) {
      const t = clamp((now - animated.start) / animated.duration, 0, 1), ease = t * t * (3 - 2 * t);
      camera.position.lerpVectors(animated.from, animated.to, ease);
      let yd = ((animated.yawTo - animated.yawFrom + Math.PI) % TAU + TAU) % TAU - Math.PI;
      yaw = animated.yawFrom + yd * ease; pitch = THREE.MathUtils.lerp(animated.pitchFrom, animated.pitchTo, ease);
      camera.rotation.set(pitch, yaw, 0, 'YXZ'); changed = true; if (t >= 1) animated = null;
    }
    const speed = (keys.has('shift') ? 3.2 : 1.75) * dt;
    if (state.mode === 'walk' && (keys.has('w') || keys.has('a') || keys.has('s') || keys.has('d'))) { move((Number(keys.has('d')) - Number(keys.has('a'))) * speed, (Number(keys.has('w')) - Number(keys.has('s'))) * speed); changed = true; }
    const rx = Number(keys.has('arrowright')) - Number(keys.has('arrowleft')), ry = Number(keys.has('arrowdown')) - Number(keys.has('arrowup'));
    if (rx || ry) { rotate(rx * dt * .7, ry * dt * .7); changed = true; }
    updateScreenProjection(); renderer.render(scene, camera); if (changed) notify(); raf = requestAnimationFrame(animate);
  }
  build(); orbitCamera(); resize(); notify(true); raf = requestAnimationFrame(animate);
  return {
    setRoom, sit, setMode, setCalibration, move, rotate, resize, lookAtScreen, getState: stateSnapshot,
    setScreenImage(url) { new THREE.TextureLoader().load(url, texture => { texture.colorSpace = THREE.SRGBColorSpace; if (screenMesh.material.map) screenMesh.material.map.dispose(); screenMesh.material.map = texture; screenMesh.material.needsUpdate = true; }); },
    focus() { renderer.domElement.focus({ preventScroll: true }); },
    destroy() { disposed = true; cancelAnimationFrame(raf); observer.disconnect(); eventCleanups.forEach(fn => fn()); disposeWorld(); baseMaterials.forEach(m => { m.map?.dispose(); m.dispose(); }); renderer.dispose(); renderer.domElement.remove(); }
  };
}
