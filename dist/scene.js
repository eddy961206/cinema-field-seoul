import * as THREE from "./vendor/three.module.js";
import {
  normalizeRoomConfig,
  seatX,
  seatPosition,
  seatMetrics,
  seatLabelInfo,
  SCREEN_BOTTOM,
  SEATED_EYE_HEIGHT,
} from "./model.js";

const clamp = THREE.MathUtils.clamp;
const TAU = Math.PI * 2;

/** An architectural viewing model. Dimensions use metres; seats are 1-indexed. */
export function createCinema(container, options = {}) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.23;
  renderer.setClearColor(0x070709, 1);
  renderer.domElement.className = "cinema-canvas";
  renderer.domElement.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;z-index:0";
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    "aria-label",
    "3D 상영관. 좌석을 누르면 앉고, 드래그 또는 방향키로 시선을 돌립니다. 걸어보기에서 W A S D 키로 이동합니다. Tab 키로 나갈 수 있습니다.",
  );
  container.appendChild(renderer.domElement);
  if (getComputedStyle(container).position === "static")
    container.style.position = "relative";
  container.style.overflow = "hidden";
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0c0f);
  scene.fog = new THREE.FogExp2(0x13131b, 0.008);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.04, 150);
  camera.rotation.order = "YXZ";
  const world = new THREE.Group();
  scene.add(world);
  let config = normalizeRoomConfig();
  let roomWidth = 22,
    roomDepth = 23,
    ceiling = 10,
    seatCenters = [],
    pickMeshes = [],
    aisleXs = [],
    maxGridColumn = 24;
  let screenBottom = SCREEN_BOTTOM,
    screenMesh,
    screenTexture,
    selectedMarker;
  let contentTexture = null,
    textureRequest = 0,
    contextLost = false,
    needsRender = true;
  let labelGroup = null,
    selectedLabel = null,
    selectedLabelKey = "",
    labelsVisible = true;
  let state = {
    selectedRow: 7,
    selectedSeat: 13,
    mode: "orbit",
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
  };
  let yaw = 0,
    pitch = 0,
    orbitTheta = 0.19,
    orbitElevation = 0.265,
    orbitRadius = 19;
  let layoutView = false;
  let visitors = [];
  const avatarHeads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.17, 12, 8),
    new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    33,
  );
  const avatarBodies = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.16, 0.22, 0.46, 10),
    new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    33,
  );
  avatarHeads.count = avatarBodies.count = 0;
  avatarHeads.frustumCulled = avatarBodies.frustumCulled = false;
  scene.add(avatarHeads, avatarBodies);
  function updateVisitors() {
    const visible = visitors
      .filter((person) => !(person.self && state.mode !== "orbit"))
      .slice(0, 33);
    let index = 0;
    for (const person of visible) {
      const s = seatAt(person.row, person.seat);
      if (!s) continue;
      const same = visible.filter(
        (p) => p.row === person.row && p.seat === person.seat,
      );
      const offset = (same.indexOf(person) - (same.length - 1) / 2) * 0.22;
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.position.set(s.x + offset, s.y + 1.28, s.z - 0.12);
      dummy.updateMatrix();
      avatarHeads.setMatrixAt(index, dummy.matrix);
      avatarHeads.setColorAt(index, new THREE.Color(person.color));
      dummy.position.y = s.y + 0.91;
      dummy.updateMatrix();
      avatarBodies.setMatrixAt(index, dummy.matrix);
      avatarBodies.setColorAt(index, new THREE.Color(person.color));
      index++;
    }
    for (const mesh of [avatarHeads, avatarBodies]) {
      mesh.count = index;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    renderer.domElement.dataset.visitors = String(index);
    needsRender = true;
  }
  let animated = null,
    lastTime = performance.now(),
    lastNotify = 0,
    disposed = false,
    raf,
    width = 1,
    height = 1;
  const keys = new Set(),
    raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    dummy = new THREE.Object3D();
  const projectionCorners = Array.from(
    { length: 4 },
    () => new THREE.Vector3(),
  );
  const screenElement = options.screenElement;
  const eventCleanups = [];
  let screenCssWidth = 1280,
    screenCssHeight = 720;
  if (screenElement) {
    Object.assign(screenElement.style, {
      position: "absolute",
      left: "0",
      top: "0",
      transformOrigin: "0 0",
      zIndex: "2",
      pointerEvents: "auto",
      backfaceVisibility: "hidden",
      willChange: "transform",
    });
  }

  const velvet = new THREE.MeshStandardMaterial({
    color: 0x793039,
    roughness: 0.86,
    metalness: 0.03,
  });
  const velvetFront = new THREE.MeshStandardMaterial({
    color: 0x983e45,
    roughness: 0.92,
    metalness: 0,
  });
  const velvetSide = new THREE.MeshStandardMaterial({
    color: 0x51242d,
    roughness: 0.9,
  });
  const piping = new THREE.MeshStandardMaterial({
    color: 0xad5960,
    roughness: 0.85,
  });
  const plastic = new THREE.MeshStandardMaterial({
    color: 0x17191d,
    roughness: 0.66,
    metalness: 0.1,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x20242a,
    roughness: 0.5,
    metalness: 0.66,
  });
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x252329,
    roughness: 1,
  });
  const panelMaterial = new THREE.MeshStandardMaterial({
    color: 0x40383b,
    roughness: 0.94,
  });
  const panelInset = new THREE.MeshStandardMaterial({
    color: 0x1f1d24,
    roughness: 0.96,
  });
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0x16171b,
    roughness: 0.94,
  });
  const warmLightMat = new THREE.MeshBasicMaterial({ color: 0xffc68d });
  const softLightMat = new THREE.MeshBasicMaterial({ color: 0x896749 });
  const carpet = new THREE.MeshStandardMaterial({
    color: 0x25272c,
    roughness: 1,
    map: makeCarpetTexture(),
  });
  const stepFace = new THREE.MeshStandardMaterial({
    color: 0x16181e,
    roughness: 1,
  });
  const baseMaterials = [
    velvet,
    velvetFront,
    velvetSide,
    piping,
    plastic,
    steel,
    wallMaterial,
    panelMaterial,
    panelInset,
    ceilingMat,
    warmLightMat,
    softLightMat,
    carpet,
    stepFace,
  ];

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
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#777777";
    ctx.fillRect(0, 0, 128, 128);
    // Deterministic, finely speckled acoustic carpet.
    let seed = 19;
    for (let i = 0; i < 3500; i++) {
      seed = (seed * 16807) % 2147483647;
      const x = seed % 128;
      seed = (seed * 16807) % 2147483647;
      const y = seed % 128;
      ctx.fillStyle = i % 3 ? "#636363" : "#898989";
      ctx.fillRect(x, y, 1, 1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(28, 28);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  function roundedBox(w, h, d, r = 0.065) {
    r = Math.min(r, w / 2, h / 2, d / 2);
    const x = -w / 2 + r,
      y = -h / 2 + r,
      sw = w - 2 * r,
      sh = h - 2 * r;
    const shape = new THREE.Shape();
    shape.moveTo(x, y);
    shape.lineTo(x + sw, y);
    shape.lineTo(x + sw, y + sh);
    shape.lineTo(x, y + sh);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.001, d - r * 2),
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: r,
      bevelThickness: r,
      curveSegments: 4,
    });
    geo.translate(0, 0, -d / 2 + r);
    geo.computeVertexNormals();
    return geo;
  }
  function box(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    world.add(mesh);
    return mesh;
  }
  function rowFloor(row) {
    return Math.max(0, row - 1) * config.rise;
  }
  function floorAt(z) {
    return (
      clamp(
        Math.floor(
          (z - config.frontDistance + config.pitch / 2) / config.pitch,
        ),
        0,
        config.rows - 1,
      ) * config.rise
    );
  }
  function seatAt(row, seat) {
    return seatCenters.find((s) => s.row === row && s.seat === seat);
  }
  function disposeWorld() {
    const geometries = new Set(),
      transientMaterials = new Set();
    world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material && !baseMaterials.includes(o.material))
        transientMaterials.add(o.material);
    });
    geometries.forEach((g) => g.dispose());
    transientMaterials.forEach((m) => {
      if (m.map && m.map !== contentTexture) m.map.dispose();
      m.dispose();
    });
    world.clear();
    seatCenters = [];
    pickMeshes = [];
    selectedMarker = null;
    labelGroup = null;
    selectedLabel = null;
    selectedLabelKey = "";
  }
  function build() {
    disposeWorld();
    const count = config.columns;
    const hasGrid =
      Array.isArray(config.rowColumns) && config.rowColumns.length > 0;
    maxGridColumn = hasGrid ? Math.max(...config.rowColumns.flat()) : count - 1;
    const seatingWidth = hasGrid
      ? (maxGridColumn + 1) * 0.67
      : count * 0.67 + 2.06;
    roomWidth = Math.max(seatingWidth + 3.6, config.screenWidth + 3.1);
    roomDepth = config.frontDistance + (config.rows - 1) * config.pitch + 3.3;
    ceiling = Math.max(
      config.screenHeight + screenBottom + 1.7,
      rowFloor(config.rows) + 5.6,
    );
    screenCssHeight =
      (screenCssWidth * config.screenHeight) / config.screenWidth;
    if (screenElement) {
      screenElement.style.width = `${screenCssWidth}px`;
      screenElement.style.height = `${screenCssHeight}px`;
    }
    const split1 = Math.max(2, Math.round(count * 0.25)),
      split2 = count - split1;
    aisleXs = [
      (seatX(split1 - 1, count) + seatX(split1, count)) / 2,
      (seatX(split2 - 1, count) + seatX(split2, count)) / 2,
    ];
    if (hasGrid) {
      const openColumns = [];
      for (let col = 1; col < maxGridColumn; col++)
        if (
          config.rowColumns.filter((row) => !row.includes(col)).length >=
          config.rows * 0.78
        )
          openColumns.push(col);
      aisleXs = [];
      for (let i = 0; i < openColumns.length; i++) {
        const start = openColumns[i];
        let end = start;
        while (openColumns[i + 1] === end + 1) end = openColumns[++i];
        aisleXs.push(((start + end) / 2 - maxGridColumn / 2) * 0.67);
      }
    }
    const sideAisles = [-(seatingWidth / 2 + 0.83), seatingWidth / 2 + 0.83];
    const allAisles = [...sideAisles, ...aisleXs];
    // Tiered slab: the first row sits on the main floor, each rear row rises.
    box(
      roomWidth,
      0.22,
      roomDepth + 2.4,
      carpet,
      0,
      -0.11,
      roomDepth / 2 - 0.4,
    );
    for (let r = 1; r <= config.rows; r++) {
      const z = config.frontDistance + (r - 1) * config.pitch;
      const rise = rowFloor(r);
      if (rise > 0)
        box(roomWidth - 0.04, rise, config.pitch, carpet, 0, rise / 2, z);
      box(
        roomWidth - 0.06,
        0.055,
        0.045,
        stepFace,
        0,
        rise + 0.009,
        z - config.pitch / 2 + 0.012,
      );
      for (const ax of allAisles) {
        box(
          0.7,
          0.012,
          0.035,
          warmLightMat,
          ax,
          rise + 0.018,
          z - config.pitch / 2 + 0.025,
        );
        box(
          0.035,
          0.012,
          config.pitch - 0.14,
          softLightMat,
          ax - 0.43,
          rise + 0.014,
          z,
        );
        box(
          0.035,
          0.012,
          config.pitch - 0.14,
          softLightMat,
          ax + 0.43,
          rise + 0.014,
          z,
        );
      }
      const rowCount = clamp(
        Math.round(config.rowCounts?.[r - 1] || count),
        1,
        count,
      );
      for (let s = 1; s <= rowCount; s++) {
        seatCenters.push(seatPosition(config, r, s));
      }
    }
    const rearFloor = rowFloor(config.rows);
    box(
      roomWidth,
      rearFloor + 0.02,
      3.4,
      carpet,
      0,
      (rearFloor - 0.02) / 2,
      roomDepth - 1.5,
    );
    // Thick velvet screen surround; the projected surface sits slightly forward.
    box(
      config.screenWidth + 0.52,
      config.screenHeight + 0.5,
      0.24,
      plastic,
      0,
      screenBottom + config.screenHeight / 2,
      -0.17,
    );
    box(roomWidth, ceiling + 0.3, 0.36, wallMaterial, 0, ceiling / 2, -0.68);
    for (const side of [-1, 1]) {
      box(
        0.28,
        ceiling,
        roomDepth + 1.2,
        wallMaterial,
        (side * roomWidth) / 2,
        ceiling / 2,
        roomDepth / 2 - 0.3,
      );
      for (let z = 1.05, i = 0; z < roomDepth - 0.8; z += 1.48, i++) {
        const floor = floorAt(z),
          panelHeight = ceiling - floor - 1.5;
        box(
          0.105,
          panelHeight,
          1.17,
          i % 2 ? panelMaterial : panelInset,
          side * (roomWidth / 2 - 0.2),
          floor + 0.7 + panelHeight / 2,
          z,
        );
        box(
          0.033,
          0.033,
          1.28,
          softLightMat,
          side * (roomWidth / 2 - 0.27),
          floor + 0.31,
          z,
        );
      }
      box(
        0.07,
        0.05,
        roomDepth,
        softLightMat,
        side * (roomWidth / 2 - 0.42),
        ceiling - 0.25,
        roomDepth / 2,
      );
      // Low illuminated wall panels ground the room without visual clutter.
      for (let z = 4.5; z < roomDepth; z += 5) {
        box(
          0.16,
          0.45,
          0.1,
          plastic,
          side * (roomWidth / 2 - 0.32),
          floorAt(z) + 1.05,
          z,
        );
        box(
          0.018,
          0.33,
          0.075,
          warmLightMat,
          side * (roomWidth / 2 - 0.414),
          floorAt(z) + 1.05,
          z,
        );
      }
    }
    box(
      roomWidth,
      ceiling,
      0.25,
      wallMaterial,
      0,
      ceiling / 2,
      roomDepth + 0.35,
    );
    box(
      roomWidth,
      0.22,
      roomDepth + 1.6,
      ceilingMat,
      0,
      ceiling + 0.1,
      roomDepth / 2 - 0.4,
    );
    for (let x = -roomWidth / 2 + 1; x <= roomWidth / 2 - 0.5; x += 1.75) {
      box(
        0.065,
        0.13,
        roomDepth + 0.2,
        plastic,
        x,
        ceiling - 0.08,
        roomDepth / 2,
      );
      for (let z = 3; z < roomDepth - 1; z += 4.6) {
        box(0.63, 0.035, 0.19, steel, x, ceiling - 0.18, z);
        box(0.43, 0.038, 0.065, softLightMat, x, ceiling - 0.203, z);
      }
    }
    buildScreen();
    buildSeats();
    buildExitSigns();
    screenLight.position.set(0, screenBottom + config.screenHeight * 0.52, 2.5);
    screenLight.intensity = 180 * (config.screenWidth / 15);
    rearGlow.position.set(-4, rearFloor + 3.5, roomDepth - 3);
    ceilingLight.position.set(-roomWidth * 0.25, ceiling + 4, roomDepth * 0.75);
    orbitRadius = roomDepth - config.frontDistance * 0.55 - 1.2;
    state.selectedRow = clamp(state.selectedRow, 1, config.rows);
    state.selectedSeat = clamp(
      state.selectedSeat,
      1,
      config.rowCounts?.[state.selectedRow - 1] || count,
    );
    updateMarker();
  }
  function buildSeats() {
    const actualSeats = seatCenters.filter((s) => !s.accessible);
    const n = actualSeats.length;
    const parts = [
      {
        geometry: roundedBox(0.585, 0.87, 0.225, 0.079),
        material: velvet,
        p: [0, 0.745, 0.245],
        rx: -0.06,
        pick: true,
      },
      {
        geometry: roundedBox(0.526, 0.63, 0.068, 0.03),
        material: velvetFront,
        p: [0, 0.746, 0.11],
        rx: -0.065,
      },
      {
        geometry: roundedBox(0.525, 0.195, 0.53, 0.065),
        material: velvetFront,
        p: [0, 0.437, -0.065],
        rx: 0.025,
        pick: true,
      },
      {
        geometry: roundedBox(0.49, 0.195, 0.066, 0.03),
        material: velvet,
        p: [0, 1.075, 0.102],
        rx: -0.075,
      },
      {
        geometry: roundedBox(0.106, 0.155, 0.585, 0.048),
        material: velvetSide,
        p: [-0.315, 0.596, -0.045],
      },
      {
        geometry: roundedBox(0.106, 0.155, 0.585, 0.048),
        material: velvetSide,
        p: [0.315, 0.596, -0.045],
      },
      {
        geometry: new THREE.BoxGeometry(0.072, 0.335, 0.37),
        material: plastic,
        p: [-0.307, 0.351, 0.035],
      },
      {
        geometry: new THREE.BoxGeometry(0.072, 0.335, 0.37),
        material: plastic,
        p: [0.307, 0.351, 0.035],
      },
      {
        geometry: new THREE.BoxGeometry(0.19, 0.265, 0.235),
        material: steel,
        p: [0, 0.16, 0.08],
      },
      {
        geometry: new THREE.BoxGeometry(0.38, 0.055, 0.3),
        material: plastic,
        p: [0, 0.038, 0.08],
      },
      // A fine stitch edge on the visible back makes the upholstery read as fabric.
      {
        geometry: roundedBox(0.5, 0.015, 0.009, 0.004),
        material: piping,
        p: [0, 1.101, 0.361],
        rx: -0.06,
      },
    ];
    parts.forEach((part) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, n);
      mesh.frustumCulled = false;
      actualSeats.forEach((s, i) => {
        dummy.position.set(s.x + part.p[0], s.y + part.p[1], s.z + part.p[2]);
        dummy.rotation.set(part.rx || 0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        // Subtle row variation avoids the uniform appearance of plastic.
        if (part.material === velvet || part.material === velvetFront) {
          const color = new THREE.Color().setScalar(
            0.92 + ((s.row * 7 + s.seat * 3) % 11) * 0.013,
          );
          mesh.setColorAt(i, color);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (part.pick) {
        mesh.userData.seatPart = true;
        mesh.userData.seats = actualSeats;
        pickMeshes.push(mesh);
      }
      world.add(mesh);
    });
    // Recessed cup holders, a small but recognizable architectural detail.
    const cups = new THREE.InstancedMesh(
      new THREE.TorusGeometry(0.033, 0.009, 5, 14),
      plastic,
      n * 2,
    );
    actualSeats.forEach((s, i) => {
      [-1, 1].forEach((side, j) => {
        dummy.position.set(s.x + side * 0.314, s.y + 0.681, s.z - 0.19);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        cups.setMatrixAt(i * 2 + j, dummy.matrix);
      });
    });
    cups.frustumCulled = false;
    world.add(cups);
    const accessibleMat = new THREE.MeshBasicMaterial({
      color: 0x80b7b2,
      transparent: true,
      opacity: 0.65,
    });
    for (const s of seatCenters.filter((s) => s.accessible)) {
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.57, 0.83)),
        new THREE.LineBasicMaterial({ color: 0x8cb6b0 }),
      );
      outline.rotation.x = -Math.PI / 2;
      outline.position.set(s.x, s.y + 0.02, s.z);
      world.add(outline);
      const pad = new THREE.Mesh(
        new THREE.PlaneGeometry(0.58, 0.83),
        accessibleMat,
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.copy(outline.position);
      pad.position.y -= 0.001;
      pad.userData.seat = s;
      world.add(pad);
      pickMeshes.push(pad);
      const symbolCanvas = document.createElement("canvas");
      symbolCanvas.width = symbolCanvas.height = 128;
      const ctx = symbolCanvas.getContext("2d");
      ctx.fillStyle = "#c8e6df";
      ctx.font = "90px Arial";
      ctx.textAlign = "center";
      ctx.fillText("♿", 64, 100);
      const tex = new THREE.CanvasTexture(symbolCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const symbol = new THREE.Mesh(
        new THREE.PlaneGeometry(0.36, 0.36),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
      );
      symbol.rotation.x = -Math.PI / 2;
      symbol.position.set(s.x, s.y + 0.022, s.z);
      world.add(symbol);
    }
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xa6e5ce,
      transparent: true,
      opacity: 0.94,
      depthTest: true,
    });
    selectedMarker = new THREE.Mesh(
      new THREE.TorusGeometry(0.205, 0.018, 8, 40),
      markerMat,
    );
    selectedMarker.rotation.x = -Math.PI / 2;
    world.add(selectedMarker);
    buildSeatLabels();
  }

  function buildSeatLabels() {
    labelGroup = new THREE.Group();
    labelGroup.visible = labelsVisible;
    world.add(labelGroup);
    const entries = seatCenters.map((seat) => ({
      text:
        (seatLabelInfo(config, seat.row, seat.seat).verified ? "" : "M ") +
        seatLabelInfo(config, seat.row, seat.seat).label,
      verified: seatLabelInfo(config, seat.row, seat.seat).verified,
      planes: seat.accessible
        ? [
            {
              x: seat.x,
              y: seat.y + 0.027,
              z: seat.z + 0.3,
              w: 0.42,
              h: 0.18,
              rx: -Math.PI / 2,
            },
          ]
        : [
            {
              x: seat.x,
              y: seat.y + 1.0,
              z: seat.z + 0.375,
              w: 0.42,
              h: 0.2,
              rx: -0.06,
            },
            {
              x: seat.x,
              y: seat.y + 1.06,
              z: seat.z + 0.048,
              w: 0.34,
              h: 0.17,
              ry: Math.PI,
            },
          ],
    }));
    for (let row = 1; row <= config.rows; row++) {
      const seat = seatAt(row, 1),
        text = seatLabelInfo(config, row, 1).rowLabel;
      entries.push({
        text: `${text}열`,
        rowMarker: true,
        planes: [-1, 1].map((side) => ({
          x: side * (roomWidth / 2 - 0.34),
          y: seat.y + 1.05,
          z: seat.z,
          w: 0.72,
          h: 0.36,
          ry: (-side * Math.PI) / 2,
        })),
      });
    }
    // One atlas and one batched mesh per 512 labels, rather than one draw call per seat.
    const cellWidth = 128,
      cellHeight = 64;
    const columns = Math.min(
      16,
      Math.floor(renderer.capabilities.maxTextureSize / cellWidth),
    );
    const batchSize =
      columns *
      Math.min(
        32,
        Math.floor(renderer.capabilities.maxTextureSize / cellHeight),
      );
    const point = new THREE.Vector3();
    for (let start = 0; start < entries.length; start += batchSize) {
      const batch = entries.slice(start, start + batchSize);
      const canvas = document.createElement("canvas");
      canvas.width = columns * cellWidth;
      canvas.height = Math.ceil(batch.length / columns) * cellHeight;
      const ctx = canvas.getContext("2d"),
        positions = [],
        uvs = [],
        indices = [];
      batch.forEach((entry, index) => {
        const x = (index % columns) * cellWidth,
          y = Math.floor(index / columns) * cellHeight;
        ctx.fillStyle = entry.rowMarker
          ? "#263938"
          : entry.verified
            ? "#234c41"
            : "#282125";
        ctx.fillRect(x + 3, y + 5, cellWidth - 6, cellHeight - 10);
        ctx.strokeStyle = entry.rowMarker ? "#b9c7b7" : "#c8ad7e";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 4, y + 6, cellWidth - 8, cellHeight - 12);
        ctx.fillStyle = "#f4ead4";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "600 30px Arial, sans-serif";
        ctx.fillText(
          entry.text,
          x + cellWidth / 2,
          y + cellHeight / 2 + 1,
          cellWidth - 16,
        );
        const u0 = x / canvas.width,
          u1 = (x + cellWidth) / canvas.width;
        const v0 = 1 - (y + cellHeight) / canvas.height,
          v1 = 1 - y / canvas.height;
        for (const plane of entry.planes) {
          const base = positions.length / 3;
          dummy.position.set(plane.x, plane.y, plane.z);
          dummy.rotation.set(plane.rx || 0, plane.ry || 0, 0);
          dummy.scale.set(plane.w, plane.h, 1);
          dummy.updateMatrix();
          for (const [px, py] of [
            [-0.5, 0.5],
            [-0.5, -0.5],
            [0.5, -0.5],
            [0.5, 0.5],
          ]) {
            point.set(px, py, 0).applyMatrix4(dummy.matrix);
            positions.push(point.x, point.y, point.z);
          }
          uvs.push(u0, v1, u0, v0, u1, v0, u1, v1);
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(
        4,
        renderer.capabilities.getMaxAnisotropy(),
      );
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          alphaTest: 0.05,
          toneMapped: false,
        }),
      );
      labelGroup.add(mesh);
    }
    const badge = document.createElement("canvas");
    badge.width = 384;
    badge.height = 128;
    const texture = new THREE.CanvasTexture(badge);
    texture.colorSpace = THREE.SRGBColorSpace;
    selectedLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.5),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    selectedLabel.renderOrder = 10;
    labelGroup.add(selectedLabel);
  }
  function buildScreen() {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = Math.round(
      (1600 * config.screenHeight) / config.screenWidth,
    );
    const ctx = canvas.getContext("2d"),
      w = canvas.width,
      h = canvas.height;
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#b8d1d2");
    gradient.addColorStop(0.45, "#8ba4a7");
    gradient.addColorStop(1, "#f0d8b4");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    // Quiet, cinematic mountain imagery remains a useful screen reference before video is loaded.
    const mountains = [
      ["#718f94", 0.58, 0.09],
      ["#547277", 0.73, 0.1],
      ["#304d52", 0.91, 0.12],
    ];
    mountains.forEach(([color, base, amp], layer) => {
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + 10; x += 8) {
        const t = x / w;
        const wave =
          Math.sin(t * 6.3 + layer * 2) * 0.36 +
          Math.sin(t * 15.2 + layer) * 0.18 +
          Math.cos(t * 30.8) * 0.065;
        ctx.lineTo(x, h * (base + wave * amp * 4));
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    });
    const haze = ctx.createLinearGradient(0, 0, 0, h);
    haze.addColorStop(0, "#edf0db22");
    haze.addColorStop(0.5, "#efddb217");
    haze.addColorStop(1, "#172d3544");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffffffd9";
    ctx.textAlign = "center";
    ctx.font = `500 ${h * 0.022}px Arial, sans-serif`;
    ctx.letterSpacing = "6px";
    ctx.fillText("A DIFFERENT PERSPECTIVE", w / 2, h * 0.255);
    ctx.font = `300 ${h * 0.1}px Georgia, serif`;
    ctx.letterSpacing = "0px";
    ctx.fillText("Every seat has a story.", w / 2, h * 0.4);
    screenTexture = contentTexture || new THREE.CanvasTexture(canvas);
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(config.screenWidth, config.screenHeight),
      new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false }),
    );
    screenMesh.position.set(0, screenBottom + config.screenHeight / 2, 0.009);
    world.add(screenMesh);
    // Subdued strips simulate light spill around the screen surround.
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x70858a,
      transparent: true,
      opacity: 0.35,
    });
    box(
      config.screenWidth + 0.64,
      0.022,
      0.05,
      glowMat,
      0,
      screenBottom - 0.27,
      -0.02,
    );
  }
  function buildExitSigns() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 96;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#123b30";
    ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = "#b1f1cd";
    ctx.font = "bold 43px Arial";
    ctx.textAlign = "center";
    ctx.fillText("EXIT  →", 128, 63);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: texture });
    for (const side of [-1, 1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.27), mat);
      sign.position.set(side * (roomWidth / 2 - 0.19), 2.5, 2.8);
      sign.rotation.y = (-side * Math.PI) / 2;
      world.add(sign);
      const door = box(
        0.045,
        2.12,
        1.2,
        plastic,
        side * (roomWidth / 2 - 0.165),
        1.06,
        2.8,
      );
      box(0.058, 0.02, 0.19, steel, side * (roomWidth / 2 - 0.205), 1.01, 2.53);
    }
  }
  function updateMarker() {
    const s = seatAt(state.selectedRow, state.selectedSeat);
    if (s && selectedMarker) {
      selectedMarker.position.set(s.x, s.y + 0.547, s.z - 0.075);
      selectedMarker.visible = state.mode !== "seat";
    }
    if (s && selectedLabel) {
      const info = seatLabelInfo(config, s.row, s.seat);
      const key = `${info.label}/${info.verified}`;
      if (key !== selectedLabelKey) {
        const canvas = selectedLabel.material.map.image,
          ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = info.verified ? "#194a3feF" : "#303329ef";
        ctx.fillRect(5, 5, 374, 118);
        ctx.strokeStyle = "#c7b782";
        ctx.lineWidth = 3;
        ctx.strokeRect(5, 5, 374, 118);
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff5dd";
        ctx.font = "600 49px sans-serif";
        ctx.fillText(`${info.rowLabel}열 ${info.seatLabel}번`, 192, 62);
        ctx.font = "25px sans-serif";
        ctx.fillStyle = "#c9d3b8";
        ctx.fillText(
          info.verified
            ? "자료에서 확인한 표기"
            : "모델 번호 · 실제 번호 미확인",
          192,
          103,
        );
        selectedLabel.material.map.needsUpdate = true;
        selectedLabelKey = key;
      }
      selectedLabel.position.set(s.x, s.y + 1.67, s.z);
      selectedLabel.visible = state.mode !== "seat";
    }
  }
  function stateSnapshot() {
    return {
      ...state,
      layoutView,
      position: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      },
      yaw: camera.rotation.y,
      pitch: camera.rotation.x,
      fov: camera.fov,
      config: { ...config },
      seatCount: seatCenters.length,
    };
  }
  function notify(force = false) {
    needsRender = true;
    updateVisitors();
    const now = performance.now();
    if (!force && now - lastNotify < 100) return;
    lastNotify = now;
    options.onState?.(stateSnapshot());
  }
  function cameraAnglesTo(target) {
    const dx = target.x - camera.position.x,
      dy = target.y - camera.position.y,
      dz = target.z - camera.position.z;
    yaw = Math.atan2(-dx, -dz);
    pitch = Math.atan2(dy, Math.hypot(dx, dz));
    camera.rotation.set(pitch, yaw, 0, "YXZ");
  }
  function orbitCamera() {
    if (layoutView) {
      const focusZ =
        config.frontDistance + (config.rows - 1) * config.pitch * 0.42;
      camera.position.set(
        Math.sin(orbitTheta) * orbitRadius * 0.65,
        clamp(
          ceiling * 0.7 + Math.sin(orbitElevation) * orbitRadius * 0.25,
          rowFloor(config.rows) + 2,
          ceiling - 0.65,
        ),
        clamp(
          config.frontDistance * 0.55 + orbitRadius,
          focusZ + 3,
          roomDepth - 0.8,
        ),
      );
      cameraAnglesTo(
        new THREE.Vector3(0, rowFloor(config.rows) * 0.35, focusZ),
      );
      return;
    }
    const targetZ = config.frontDistance * 0.55;
    camera.position.set(
      clamp(
        Math.sin(orbitTheta) * orbitRadius,
        -roomWidth / 2 + 0.75,
        roomWidth / 2 - 0.75,
      ),
      clamp(
        screenBottom +
          config.screenHeight * 0.36 +
          Math.sin(orbitElevation) * orbitRadius,
        2,
        ceiling - 0.65,
      ),
      clamp(
        targetZ + Math.cos(orbitTheta) * Math.cos(orbitElevation) * orbitRadius,
        2.3,
        roomDepth - 0.8,
      ),
    );
    cameraAnglesTo(
      new THREE.Vector3(0, screenBottom + config.screenHeight * 0.46, 0.8),
    );
  }
  function sit(row, seat, immediate = false) {
    row = clamp(Math.round(Number(row) || 1), 1, config.rows);
    seat = clamp(
      Math.round(Number(seat) || 1),
      1,
      config.rowCounts?.[row - 1] || config.columns,
    );
    const s = seatAt(row, seat);
    if (!s) return;
    state.selectedRow = row;
    state.selectedSeat = seat;
    state.mode = "seat";
    const to = new THREE.Vector3(s.x, s.y + SEATED_EYE_HEIGHT, s.z - 0.055);
    const dx = -to.x,
      dy = screenBottom + config.screenHeight / 2 - to.y,
      dz = 0.025 - to.z;
    const targetYaw = Math.atan2(-dx, -dz),
      targetPitch = Math.atan2(dy, Math.hypot(dx, dz));
    if (
      immediate ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      camera.position.copy(to);
      yaw = targetYaw;
      pitch = targetPitch;
      camera.rotation.set(pitch, yaw, 0);
      animated = null;
    } else
      animated = {
        from: camera.position.clone(),
        to,
        yawFrom: camera.rotation.y,
        pitchFrom: camera.rotation.x,
        yawTo: targetYaw,
        pitchTo: targetPitch,
        start: performance.now(),
        duration: 820,
      };
    updateMarker();
    notify(true);
  }
  function setMode(mode) {
    if (!["seat", "walk", "orbit"].includes(mode)) return;
    animated = null;
    keys.clear();
    if (mode === "seat") {
      sit(state.selectedRow, state.selectedSeat);
      return;
    }
    state.mode = mode;
    if (mode === "orbit") {
      layoutView = false;
      orbitTheta = 0.19;
      orbitElevation = 0.265;
      orbitRadius = roomDepth - config.frontDistance * 0.55 - 1.2;
      orbitCamera();
    }
    if (mode === "walk") {
      const nearest = [
        ...aisleXs,
        -roomWidth / 2 + 0.9,
        roomWidth / 2 - 0.9,
      ].reduce((a, b) =>
        Math.abs(a - camera.position.x) < Math.abs(b - camera.position.x)
          ? a
          : b,
      );
      camera.position.x = nearest;
      camera.position.z = clamp(camera.position.z, 1.4, roomDepth - 0.6);
      camera.position.y = floorAt(camera.position.z) + 1.65;
      yaw = camera.rotation.y;
      pitch = clamp(camera.rotation.x, -0.7, 0.7);
    }
    updateMarker();
    notify(true);
  }
  function lookAtScreen() {
    animated = null;
    if (state.mode === "orbit") {
      setMode("orbit");
      return;
    }
    cameraAnglesTo(
      new THREE.Vector3(0, screenBottom + config.screenHeight / 2, 0.025),
    );
    notify(true);
  }
  function blocked(x, z) {
    // Keep the walker in cross-aisles or longitudinal aisles, never through chairs.
    return seatCenters.some(
      (s) =>
        !s.accessible && Math.abs(s.x - x) < 0.43 && Math.abs(s.z - z) < 0.53,
    );
  }
  function move(dx, dz) {
    if (state.mode !== "walk") return;
    if (!Number.isFinite(Number(dx)) || !Number.isFinite(Number(dz))) return;
    animated = null;
    const distance = Math.hypot(Number(dx), Number(dz));
    const scale = distance > 3 ? 3 / distance : 1;
    const sx =
      (Number(dx) * Math.cos(yaw) - Number(dz) * Math.sin(yaw)) * scale;
    const sz =
      (-Number(dx) * Math.sin(yaw) - Number(dz) * Math.cos(yaw)) * scale;
    // Split long inputs so they cannot tunnel through a block of seats.
    const steps = Math.max(1, Math.ceil(Math.hypot(sx, sz) / 0.08));
    for (let i = 0; i < steps; i++) {
      const nx = clamp(
        camera.position.x + sx / steps,
        -roomWidth / 2 + 0.44,
        roomWidth / 2 - 0.44,
      );
      const nz = clamp(camera.position.z + sz / steps, 1.05, roomDepth - 0.55);
      if (!blocked(nx, camera.position.z)) camera.position.x = nx;
      if (!blocked(camera.position.x, nz)) camera.position.z = nz;
    }
    camera.position.y = floorAt(camera.position.z) + 1.65;
    notify();
  }
  /** Angles are radians. Positive dx looks right, positive dy looks down. */
  function rotate(dx, dy) {
    dx = Number(dx);
    dy = Number(dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    animated = null;
    if (state.mode === "orbit") {
      orbitTheta = clamp(orbitTheta - dx, -0.57, 0.57);
      orbitElevation = clamp(orbitElevation + dy, -0.05, 0.48);
      orbitCamera();
    } else {
      yaw -= Number(dx) || 0;
      pitch = clamp(pitch - (Number(dy) || 0), -1.22, 1.22);
      camera.rotation.set(pitch, yaw, 0, "YXZ");
    }
    notify();
  }
  function setRoom(next = {}) {
    if (disposed) return;
    const oldMode = state.mode;
    config = normalizeRoomConfig({ ...config, ...next });
    if (Number.isFinite(Number(next.fov))) {
      camera.fov = clamp(Number(next.fov), 35, 90);
      camera.updateProjectionMatrix();
    }
    build();
    if (oldMode === "seat") sit(state.selectedRow, state.selectedSeat, true);
    else setMode(oldMode);
    resize();
    notify(true);
  }
  function setCalibration(values = {}) {
    const next = {};
    for (const key of ["pitch", "rise", "frontDistance"])
      if (Number.isFinite(Number(values[key]))) next[key] = Number(values[key]);
    if (values.fov !== undefined) {
      camera.fov = clamp(Number(values.fov) || 60, 35, 90);
      camera.updateProjectionMatrix();
    }
    if (Object.keys(next).length) setRoom(next);
    else notify(true);
  }
  function resize() {
    if (disposed) return;
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    updateScreenProjection();
    needsRender = true;
  }
  function updateScreenProjection() {
    if (!screenElement) return;
    camera.updateMatrixWorld();
    const sw = config.screenWidth / 2,
      sy = screenBottom,
      sh = config.screenHeight;
    const worldPoints = [
      [-sw, sy + sh, 0.026],
      [sw, sy + sh, 0.026],
      [sw, sy, 0.026],
      [-sw, sy, 0.026],
    ];
    let behind = false;
    const p = worldPoints.map((v, i) => {
      const point = projectionCorners[i].set(...v);
      const viewZ = point.clone().applyMatrix4(camera.matrixWorldInverse).z;
      if (viewZ >= -0.06) behind = true;
      point.project(camera);
      return {
        x: ((point.x + 1) * width) / 2,
        y: ((1 - point.y) * height) / 2,
      };
    });
    if (behind || camera.position.z <= 0) {
      screenElement.style.visibility = "hidden";
      return;
    }
    screenElement.style.visibility = "visible";
    const [p0, p1, p2, p3] = p;
    const dx1 = p1.x - p2.x,
      dx2 = p3.x - p2.x,
      dx3 = p0.x - p1.x + p2.x - p3.x;
    const dy1 = p1.y - p2.y,
      dy2 = p3.y - p2.y,
      dy3 = p0.y - p1.y + p2.y - p3.y;
    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(det) < 0.00001) {
      screenElement.style.visibility = "hidden";
      return;
    }
    const g = (dx3 * dy2 - dx2 * dy3) / det,
      h = (dx1 * dy3 - dx3 * dy1) / det;
    const a = p1.x - p0.x + g * p1.x,
      b = p3.x - p0.x + h * p3.x;
    const d = p1.y - p0.y + g * p1.y,
      e = p3.y - p0.y + h * p3.y;
    const m = [
      a / screenCssWidth,
      d / screenCssWidth,
      0,
      g / screenCssWidth,
      b / screenCssHeight,
      e / screenCssHeight,
      0,
      h / screenCssHeight,
      0,
      0,
      1,
      0,
      p0.x,
      p0.y,
      0,
      1,
    ];
    screenElement.style.transform = `matrix3d(${m.join(",")})`;
  }
  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickMeshes, false)[0];
    if (!hit) return null;
    return (
      hit.object.userData.seat ||
      hit.object.userData.seats?.[hit.instanceId] ||
      null
    );
  }
  function on(target, event, handler, opts) {
    target.addEventListener(event, handler, opts);
    eventCleanups.push(() => target.removeEventListener(event, handler, opts));
  }
  let dragging = false,
    pointerId = null,
    lastX = 0,
    lastY = 0,
    dragDistance = 0;
  on(renderer.domElement, "pointerdown", (e) => {
    if (dragging || (e.button !== 0 && e.pointerType !== "touch")) return;
    renderer.domElement.focus({ preventScroll: true });
    dragging = true;
    pointerId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    dragDistance = 0;
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  on(renderer.domElement, "pointermove", (e) => {
    if (dragging && e.pointerId === pointerId) {
      const dx = e.clientX - lastX,
        dy = e.clientY - lastY;
      dragDistance += Math.abs(dx) + Math.abs(dy);
      lastX = e.clientX;
      lastY = e.clientY;
      if (dragDistance > 4) rotate(dx * 0.0035, dy * 0.0035);
    } else if (!dragging) {
      const hit = pick(e);
      renderer.domElement.style.cursor = hit ? "pointer" : "grab";
      options.onHover?.(
        hit
          ? { row: hit.row, seat: hit.seat, x: e.clientX, y: e.clientY }
          : null,
      );
    }
  });
  on(renderer.domElement, "pointerup", (e) => {
    if (e.pointerId !== pointerId) return;
    if (dragDistance <= 4) {
      const hit = pick(e);
      if (hit) {
        sit(hit.row, hit.seat);
        options.onSeat?.(hit.row, hit.seat);
      }
    }
    dragging = false;
    pointerId = null;
    if (renderer.domElement.hasPointerCapture(e.pointerId))
      renderer.domElement.releasePointerCapture(e.pointerId);
  });
  on(renderer.domElement, "pointercancel", () => {
    dragging = false;
    pointerId = null;
  });
  on(renderer.domElement, "lostpointercapture", () => {
    dragging = false;
    pointerId = null;
  });
  on(renderer.domElement, "pointerleave", () => {
    if (!dragging) options.onHover?.(null);
  });
  on(
    renderer.domElement,
    "wheel",
    (e) => {
      if (e.ctrlKey || e.metaKey || state.mode === "seat") return;
      e.preventDefault();
      const delta = clamp(
        e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1),
        -240,
        240,
      );
      if (state.mode === "orbit") {
        orbitRadius = clamp(
          orbitRadius + delta * 0.014,
          Math.min(
            config.frontDistance + 1.6,
            roomDepth - config.frontDistance * 0.45,
          ),
          roomDepth - config.frontDistance * 0.45,
        );
        orbitCamera();
        notify();
      } else if (state.mode === "walk") move(0, -delta * 0.003);
    },
    { passive: false },
  );
  on(window, "keydown", (e) => {
    if (
      document.activeElement !== renderer.domElement ||
      e.altKey ||
      e.ctrlKey ||
      e.metaKey ||
      e.isComposing
    )
      return;
    const key = /^Key[WASD]$/.test(e.code)
      ? e.code.slice(3).toLowerCase()
      : e.key.toLowerCase();
    if (
      ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key) ||
      (state.mode === "walk" && ["w", "a", "s", "d", "shift"].includes(key))
    ) {
      keys.add(key);
      e.preventDefault();
    }
  });
  on(window, "keyup", (e) => {
    keys.delete(e.key.toLowerCase());
    if (/^Key[WASD]$/.test(e.code)) keys.delete(e.code.slice(3).toLowerCase());
  });
  on(renderer.domElement, "blur", () => keys.clear());
  on(window, "blur", () => {
    keys.clear();
    dragging = false;
    pointerId = null;
  });
  on(document, "visibilitychange", () => {
    keys.clear();
    lastTime = performance.now();
    needsRender = true;
  });
  on(renderer.domElement, "webglcontextlost", (e) => {
    e.preventDefault();
    contextLost = true;
    keys.clear();
    animated = null;
    options.onContextChange?.({ lost: true });
  });
  on(renderer.domElement, "webglcontextrestored", () => {
    contextLost = false;
    needsRender = true;
    resize();
    options.onContextChange?.({ lost: false });
  });
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  function animate(now) {
    if (disposed) return;
    const dt = Math.min((now - lastTime) / 1000, 0.04);
    lastTime = now;
    let changed = false;
    if (animated) {
      const t = clamp((now - animated.start) / animated.duration, 0, 1),
        ease = t * t * (3 - 2 * t);
      camera.position.lerpVectors(animated.from, animated.to, ease);
      let yd =
        ((((animated.yawTo - animated.yawFrom + Math.PI) % TAU) + TAU) % TAU) -
        Math.PI;
      yaw = animated.yawFrom + yd * ease;
      pitch = THREE.MathUtils.lerp(animated.pitchFrom, animated.pitchTo, ease);
      camera.rotation.set(pitch, yaw, 0, "YXZ");
      changed = true;
      if (t >= 1) animated = null;
    }
    const speed = (keys.has("shift") ? 3.2 : 1.75) * dt;
    if (
      state.mode === "walk" &&
      (keys.has("w") || keys.has("a") || keys.has("s") || keys.has("d"))
    ) {
      const dx = Number(keys.has("d")) - Number(keys.has("a")),
        dz = Number(keys.has("w")) - Number(keys.has("s"));
      const divisor = Math.max(1, Math.hypot(dx, dz));
      move((dx / divisor) * speed, (dz / divisor) * speed);
      changed = true;
    }
    const rx = Number(keys.has("arrowright")) - Number(keys.has("arrowleft")),
      ry = Number(keys.has("arrowdown")) - Number(keys.has("arrowup"));
    if (rx || ry) {
      rotate(rx * dt * 0.7, ry * dt * 0.7);
      changed = true;
    }
    if (changed) notify();
    if (needsRender && !contextLost && !document.hidden) {
      if (selectedLabel?.visible)
        selectedLabel.quaternion.copy(camera.quaternion);
      updateScreenProjection();
      renderer.render(scene, camera);
      needsRender = false;
    }
    raf = requestAnimationFrame(animate);
  }
  build();
  orbitCamera();
  resize();
  notify(true);
  raf = requestAnimationFrame(animate);
  return {
    setVisitors(next) {
      visitors = next;
      updateVisitors();
    },
    setRoom,
    sit,
    setMode,
    setCalibration,
    move,
    rotate,
    resize,
    lookAtScreen,
    getState: stateSnapshot,
    showSeatLayout() {
      setMode("orbit");
      layoutView = true;
      orbitTheta = 0.12;
      orbitCamera();
      notify(true);
    },
    getSeatMetrics(row = state.selectedRow, seat = state.selectedSeat) {
      return seatMetrics(config, row, seat);
    },
    selectSeat(row, seat) {
      if (!seatAt(row, seat)) return;
      state.selectedRow = row;
      state.selectedSeat = seat;
      updateMarker();
      needsRender = true;
    },
    setLabelsVisible(visible) {
      labelsVisible = !!visible;
      if (labelGroup) labelGroup.visible = labelsVisible;
      needsRender = true;
    },
    setScreenImage(url) {
      if (disposed) return;
      const request = ++textureRequest;
      new THREE.TextureLoader().load(
        url,
        (texture) => {
          if (disposed || request !== textureRequest) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          const previous = screenMesh.material.map;
          contentTexture = texture;
          screenMesh.material.map = texture;
          if (previous && previous !== texture) previous.dispose();
          screenMesh.material.needsUpdate = true;
          needsRender = true;
        },
        undefined,
        (error) => {
          if (!disposed && request === textureRequest) options.onError?.(error);
        },
      );
    },
    focus() {
      renderer.domElement.focus({ preventScroll: true });
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      textureRequest++;
      cancelAnimationFrame(raf);
      observer.disconnect();
      eventCleanups.forEach((fn) => fn());
      disposeWorld();
      contentTexture?.dispose();
      contentTexture = null;
      baseMaterials.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
      avatarHeads.geometry.dispose();
      avatarHeads.material.dispose();
      avatarBodies.geometry.dispose();
      avatarBodies.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
