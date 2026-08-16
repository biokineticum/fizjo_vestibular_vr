(() => {
  const SPEEDS = {
    gentle: { cruise: 1.7, max: 2.6, turn: 0.85 },
    normal: { cruise: 3.3, max: 5.0, turn: 1.25 },
  };

  const WAVES = [
    { dx: 0.92, dz: 0.38, steep: 0.16, len: 22 },
    { dx: -0.35, dz: 0.94, steep: 0.11, len: 11 },
    { dx: 0.18, dz: -0.98, steep: 0.07, len: 5.5 },
  ];

  const canvas = document.getElementById("view");
  const overlay = document.getElementById("overlay");
  const divider = document.getElementById("divider");
  const startBtn = document.getElementById("start");
  const speedSel = document.getElementById("speed");
  const lensChk = document.getElementById("lens");

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x87b8cc, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xa9d4e4, 0.0062);

  const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 900);
  const stereo = new THREE.StereoCamera();
  stereo.aspect = 0.5;
  stereo.eyeSep = 0.064;

  const clock = new THREE.Clock();
  const sunDir = new THREE.Vector3(0.42, 0.74, 0.38).normalize();

  const boat = {
    pos: new THREE.Vector3(0, 0, 0),
    heading: 0,
    targetHeading: 0,
    speed: 0,
    pitch: 0,
    roll: 0,
    bob: 0,
  };

  const look = {
    device: new THREE.Quaternion(),
    offset: new THREE.Quaternion(),
    mouseYaw: 0,
    mousePitch: -0.08,
    hasGyro: false,
    lastAlpha: null,
    dragging: false,
    lastX: 0,
    lastY: 0,
  };

  const tmp = {
    lookDir: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    sit: new THREE.Vector3(),
    euler: new THREE.Euler(),
    q0: new THREE.Quaternion(),
    q1: new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2),
    zee: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    size: new THREE.Vector2(),
  };

  let mode = "menu";
  let lensOn = true;
  let speedKey = "gentle";
  let audio = null;
  let fade = 1;
  let wakeLock = null;
  let lastTap = 0;

  const woodMap = makeWoodTexture();
  const foamMap = makeFoamTexture();
  const cloudMap = makeCloudTexture();

  const boatGroup = buildBoat();
  scene.add(boatGroup);

  const ocean = buildOcean();
  scene.add(ocean);

  buildSky();
  buildLights();
  const islands = buildIslands();
  const birds = buildBirds();
  const wake = buildWake();

  const distort = buildDistortion();

  function makeWoodTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#8a5a34";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * 256;
      g.strokeStyle = `rgba(40,18,6,${0.05 + Math.random() * 0.12})`;
      g.lineWidth = 1 + Math.random() * 2.2;
      g.beginPath();
      for (let y = 0; y <= 256; y += 4) {
        g.lineTo(x + Math.sin(y * 0.045 + i) * 4, y);
      }
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 3);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeFoamTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,0.9)");
    grd.addColorStop(0.45, "rgba(220,240,245,0.35)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeCloudTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 18; i++) {
      const x = 40 + Math.random() * 176;
      const y = 80 + Math.random() * 90;
      const r = 22 + Math.random() * 40;
      const grd = g.createRadialGradient(x, y, 4, x, y, r);
      grd.addColorStop(0, "rgba(255,255,255,0.55)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function gerstner(x, z, t, wave) {
    const len = Math.hypot(wave.dx, wave.dz) || 1;
    const dx = wave.dx / len;
    const dz = wave.dz / len;
    const k = (Math.PI * 2) / wave.len;
    const c = Math.sqrt(9.8 / k);
    const f = k * (dx * x + dz * z - c * t);
    const a = wave.steep / k;
    return {
      x: dx * a * Math.cos(f),
      y: a * Math.sin(f),
      z: dz * a * Math.cos(f),
    };
  }

  function sampleWave(x, z, t) {
    let y = 0;
    let ox = 0;
    let oz = 0;
    for (const w of WAVES) {
      const g = gerstner(x, z, t, w);
      y += g.y;
      ox += g.x;
      oz += g.z;
    }
    return { y, ox, oz };
  }

  function waveNormal(x, z, t) {
    const e = 0.55;
    const c = sampleWave(x, z, t).y;
    const r = sampleWave(x + e, z, t).y;
    const f = sampleWave(x, z + e, t).y;
    return new THREE.Vector3(c - r, e, c - f).normalize();
  }

  function buildOcean() {
    const geo = new THREE.PlaneGeometry(700, 700, 100, 100);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: sunDir.clone() },
        uBoat: { value: new THREE.Vector3() },
        uW0: { value: new THREE.Vector4(WAVES[0].dx, WAVES[0].dz, WAVES[0].steep, WAVES[0].len) },
        uW1: { value: new THREE.Vector4(WAVES[1].dx, WAVES[1].dz, WAVES[1].steep, WAVES[1].len) },
        uW2: { value: new THREE.Vector4(WAVES[2].dx, WAVES[2].dz, WAVES[2].steep, WAVES[2].len) },
        uDeep: { value: new THREE.Color(0x0c5a72) },
        uShallow: { value: new THREE.Color(0x2eb3b8) },
        uHorizon: { value: new THREE.Color(0xc5e4f0) },
        uSunColor: { value: new THREE.Color(0xfff1c8) },
      },
      vertexShader: `
        uniform float uTime;
        uniform vec4 uW0, uW1, uW2;
        varying vec3 vWorld;
        varying vec3 vNormal;
        void gerstner(inout vec3 p, inout vec3 t, inout vec3 b, vec4 w) {
          vec2 d = normalize(w.xy);
          float k = 6.28318530718 / w.w;
          float c = sqrt(9.8 / k);
          float f = k * (dot(d, p.xz) - c * uTime);
          float a = w.z / k;
          float s = sin(f);
          float cs = cos(f);
          p += vec3(d.x * a * cs, a * s, d.y * a * cs);
          t += vec3(-d.x * d.x * w.z * s, d.x * w.z * cs, -d.x * d.y * w.z * s);
          b += vec3(-d.x * d.y * w.z * s, d.y * w.z * cs, -d.y * d.y * w.z * s);
        }
        void main() {
          vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
          vec3 t = vec3(1.0, 0.0, 0.0);
          vec3 b = vec3(0.0, 0.0, 1.0);
          gerstner(p, t, b, uW0);
          gerstner(p, t, b, uW1);
          gerstner(p, t, b, uW2);
          vWorld = p;
          vNormal = normalize(cross(b, t));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir, uDeep, uShallow, uHorizon, uSunColor, uBoat;
        varying vec3 vWorld;
        varying vec3 vNormal;
        void main() {
          vec3 n = normalize(vNormal);
          vec3 v = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.6);
          float peak = smoothstep(0.12, 0.62, vWorld.y);
          vec3 water = mix(uDeep, uShallow, peak * 0.65 + 0.12);
          vec3 col = mix(water, uHorizon, fres * 0.82);
          vec3 r = reflect(-v, n);
          float spec = pow(max(dot(r, normalize(uSunDir)), 0.0), 90.0);
          col += uSunColor * spec * 0.95;
          float sparkSeed = fract(sin(dot(vWorld.xz, vec2(12.9898, 78.233))) * 43758.5453);
          float spark = pow(max(dot(n, normalize(uSunDir)), 0.0), 28.0) * step(0.975, sparkSeed);
          col += spark * 0.45;
          col = mix(col, vec3(0.90, 0.96, 0.98), peak * 0.42);
          float d = length(vWorld.xz - uBoat.xz);
          col = mix(col, vec3(0.82, 0.93, 0.96), smoothstep(4.2, 1.1, d) * 0.28);
          float fog = 1.0 - exp(-0.0075 * length(cameraPosition - vWorld));
          col = mix(col, vec3(0.663, 0.831, 0.894), fog);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  }

  function buildSky() {
    const geo = new THREE.SphereGeometry(520, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSunDir: { value: sunDir.clone() },
        uZenith: { value: new THREE.Color(0x3b86c0) },
        uHorizon: { value: new THREE.Color(0xd5eef7) },
        uSunColor: { value: new THREE.Color(0xfff3c4) },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir, uZenith, uHorizon, uSunColor;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uZenith, smoothstep(-0.08, 0.62, h));
          float sun = pow(max(dot(d, normalize(uSunDir)), 0.0), 280.0);
          float glow = pow(max(dot(d, normalize(uSunDir)), 0.0), 6.0);
          col += uSunColor * sun * 2.4 + uSunColor * glow * 0.32;
          col = mix(col, uHorizon, exp(-max(h, 0.0) * 7.0) * 0.4);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.frustumCulled = false;
    scene.add(sky);

    for (let i = 0; i < 7; i++) {
      const spr = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: cloudMap,
          transparent: true,
          depthWrite: false,
          opacity: 0.55,
          color: 0xffffff,
        }),
      );
      const a = (i / 7) * Math.PI * 2;
      spr.position.set(Math.cos(a) * (90 + i * 12), 38 + (i % 3) * 8, Math.sin(a) * (90 + i * 8));
      spr.scale.set(46, 18, 1);
      scene.add(spr);
    }
  }

  function buildLights() {
    scene.add(new THREE.HemisphereLight(0x9fd4ef, 0x0b3a4a, 0.85));
    const sun = new THREE.DirectionalLight(0xfff2d0, 1.35);
    sun.position.copy(sunDir).multiplyScalar(80);
    scene.add(sun);
  }

  function woodMat(color, rough) {
    return new THREE.MeshStandardMaterial({
      map: woodMap,
      color,
      roughness: rough,
      metalness: 0.03,
    });
  }

  function buildBoat() {
    const group = new THREE.Group();
    const light = woodMat(0xc89a67, 0.78);
    const dark = woodMat(0x5c3618, 0.88);

    const hull = new THREE.BoxGeometry(1.42, 0.52, 3.7, 6, 2, 12);
    const pos = hull.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const zn = z / 1.85;
      const bow = Math.max(0, zn);
      const stern = Math.max(0, -zn);
      x *= 1 - bow * bow * 0.8 - stern * 0.1;
      y += bow * bow * 0.24 + stern * stern * 0.07;
      if (y < 0) x *= 0.68 + 0.32 * ((y + 0.26) / 0.26);
      pos.setXYZ(i, x, y, z);
    }
    hull.computeVertexNormals();
    group.add(new THREE.Mesh(hull, light));

    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.08, 2.85), dark);
    floor.position.y = 0.06;
    group.add(floor);

    const seatGeo = new THREE.BoxGeometry(1.08, 0.09, 0.34);
    const seatA = new THREE.Mesh(seatGeo, light);
    seatA.position.set(0, 0.2, 0.62);
    const seatB = seatA.clone();
    seatB.position.z = -0.72;
    group.add(seatA, seatB);

    const railGeo = new THREE.BoxGeometry(0.08, 0.13, 3.15);
    const railL = new THREE.Mesh(railGeo, light);
    railL.position.set(-0.6, 0.3, -0.04);
    const railR = railL.clone();
    railR.position.x = 0.6;
    group.add(railL, railR);

    const bowDeck = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.07, 0.72), light);
    bowDeck.position.set(0, 0.24, 1.38);
    group.add(bowDeck);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.55, 8), dark);
    post.position.set(0, 0.5, 1.55);
    group.add(post);

    const oarMat = woodMat(0x7a4a24, 0.7);
    [-1, 1].forEach((side) => {
      const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 2.1, 6), oarMat);
      oar.rotation.z = side * 0.18;
      oar.rotation.x = 1.22;
      oar.position.set(side * 0.72, 0.28, -0.1);
      group.add(oar);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.02), oarMat);
      blade.position.set(side * 0.9, 0.02, 0.85);
      blade.rotation.y = side * 0.15;
      group.add(blade);
    });

    return group;
  }

  function buildIslands() {
    const specs = [
      { x: 48, z: -62, s: 9, light: true },
      { x: -78, z: -28, s: 13 },
      { x: 26, z: 86, s: 7 },
      { x: -38, z: 56, s: 10 },
      { x: 98, z: 16, s: 16 },
      { x: -20, z: -110, s: 8 },
    ];
    const rock = new THREE.MeshStandardMaterial({ color: 0x6d675c, roughness: 0.95 });
    const grass = new THREE.MeshStandardMaterial({ color: 0x4f7a46, roughness: 0.9 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.7 });
    const red = new THREE.MeshStandardMaterial({ color: 0xb23b3b, roughness: 0.65 });

    specs.forEach((s) => {
      const base = new THREE.Mesh(new THREE.DodecahedronGeometry(s.s * 0.55, 0), rock);
      base.position.set(s.x, s.s * 0.08, s.z);
      base.scale.set(1.5, 0.55, 1.2);
      scene.add(base);
      const top = new THREE.Mesh(new THREE.DodecahedronGeometry(s.s * 0.38, 0), grass);
      top.position.set(s.x + 1.2, s.s * 0.28, s.z - 0.6);
      top.scale.set(1.3, 0.7, 1.1);
      scene.add(top);

      if (s.light) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 9, 10), white);
        tower.position.set(s.x, 5.2, s.z);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.4, 8), red);
        cap.position.set(s.x, 10.2, s.z);
        const lamp = new THREE.PointLight(0xffd089, 0.6, 55, 2);
        lamp.position.set(s.x, 9.4, s.z);
        lamp.userData.blink = true;
        scene.add(tower, cap, lamp);
      }
    });
    return specs;
  }

  function buildBirds() {
    const list = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0xf6f6f6, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const wingL = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.12), mat);
      const wingR = wingL.clone();
      wingL.position.x = -0.28;
      wingR.position.x = 0.28;
      g.add(wingL, wingR);
      g.userData = {
        left: wingL,
        right: wingR,
        radius: 18 + i * 5,
        speed: 0.18 + i * 0.04,
        height: 8 + (i % 3) * 2.2,
        center: islands[i % islands.length],
        phase: i * 1.1,
      };
      scene.add(g);
      list.push(g);
    }
    return list;
  }

  function buildWake() {
    const patches = [];
    const mat = new THREE.SpriteMaterial({
      map: foamMap,
      transparent: true,
      depthWrite: false,
      opacity: 0.0,
    });
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(mat.clone());
      s.scale.set(1.8, 1.8, 1);
      s.visible = false;
      scene.add(s);
      patches.push({ sprite: s, age: 99, x: 0, z: 0 });
    }
    return { patches, timer: 0 };
  }

  function buildDistortion() {
    const rtL = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: true });
    const rtR = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: true });
    const scene2 = new THREE.Scene();
    const cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tLeft: { value: rtL.texture },
        tRight: { value: rtR.texture },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tLeft, tRight;
        varying vec2 vUv;
        vec2 barrel(vec2 uv) {
          vec2 c = uv * 2.0 - 1.0;
          float r2 = dot(c, c);
          c *= 1.0 + 0.22 * r2 + 0.24 * r2 * r2;
          return c * 0.5 + 0.5;
        }
        void main() {
          if (abs(vUv.x - 0.5) < 0.004) {
            gl_FragColor = vec4(0.0);
            return;
          }
          bool left = vUv.x < 0.5;
          vec2 uv = left ? vec2(vUv.x * 2.0, vUv.y) : vec2((vUv.x - 0.5) * 2.0, vUv.y);
          uv = barrel(uv);
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            gl_FragColor = vec4(0.0);
            return;
          }
          gl_FragColor = texture2D(left ? tLeft : tRight, uv);
        }
      `,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    scene2.add(quad);
    return { rtL, rtR, scene2, cam2 };
  }

  function screenAngle() {
    if (screen.orientation && typeof screen.orientation.angle === "number") {
      return screen.orientation.angle;
    }
    return window.orientation || 0;
  }

  function setFromDevice(alpha, beta, gamma) {
    const a = THREE.MathUtils.degToRad(alpha || 0);
    const b = THREE.MathUtils.degToRad(beta || 0);
    const g = THREE.MathUtils.degToRad(gamma || 0);
    const o = THREE.MathUtils.degToRad(screenAngle());
    tmp.euler.set(b, a, -g, "YXZ");
    look.device.setFromEuler(tmp.euler);
    look.device.multiply(tmp.q1);
    look.device.multiply(tmp.q0.setFromAxisAngle(tmp.zee, -o));
  }

  function onOrient(ev) {
    if (ev.alpha == null && ev.beta == null) return;
    look.hasGyro = true;
    setFromDevice(ev.alpha, ev.beta, ev.gamma);
  }

  function applyLook() {
    if (mode === "vr" && look.hasGyro) {
      camera.quaternion.copy(look.offset).multiply(look.device);
    } else {
      tmp.euler.set(look.mousePitch, look.mouseYaw, 0, "YXZ");
      camera.quaternion.setFromEuler(tmp.euler);
    }
  }

  function recenter() {
    if (look.hasGyro) {
      const inv = look.device.clone().invert();
      const keepPitch = new THREE.Quaternion();
      look.offset.copy(keepPitch).multiply(inv);
      const yOnly = new THREE.Euler().setFromQuaternion(look.offset, "YXZ");
      yOnly.x = 0;
      yOnly.z = 0;
      look.offset.setFromEuler(yOnly);
    } else {
      look.mouseYaw = boat.heading;
      look.mousePitch = -0.06;
    }
    camera.getWorldDirection(tmp.lookDir);
    const hLen = Math.hypot(tmp.lookDir.x, tmp.lookDir.z);
    if (hLen > 0.001) {
      boat.heading = Math.atan2(tmp.lookDir.x, tmp.lookDir.z);
      boat.targetHeading = boat.heading;
    }
  }

  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function updateBoat(dt, t) {
    camera.getWorldDirection(tmp.lookDir);
    const horiz = Math.hypot(tmp.lookDir.x, tmp.lookDir.z);
    if (horiz > 0.28) {
      boat.targetHeading = Math.atan2(tmp.lookDir.x, tmp.lookDir.z);
    }

    const cfg = SPEEDS[speedKey];
    const err = wrapAngle(boat.targetHeading - boat.heading);
    const maxTurn = cfg.turn * dt;
    boat.heading += THREE.MathUtils.clamp(err * 2.1 * dt, -maxTurn, maxTurn);

    const align = 1 - Math.min(Math.abs(err) / Math.PI, 1);
    const horizonLook = THREE.MathUtils.clamp((horiz - 0.15) / 0.75, 0, 1);
    let want = 0;
    if (mode === "vr" || mode === "play") {
      want = cfg.cruise * (0.35 + 0.65 * horizonLook) * (0.55 + 0.45 * align);
      want = Math.min(want, cfg.max);
    } else {
      want = 0.35;
    }

    const k = 1 - Math.exp(-dt * 1.8);
    boat.speed += (want - boat.speed) * k;

    boat.pos.x += Math.sin(boat.heading) * boat.speed * dt;
    boat.pos.z += Math.cos(boat.heading) * boat.speed * dt;

    const w = sampleWave(boat.pos.x, boat.pos.z, t);
    const n = waveNormal(boat.pos.x, boat.pos.z, t);
    boat.bob = w.y * 0.55;
    const lean = THREE.MathUtils.clamp(-err * 0.35, -0.18, 0.18);
    boat.pitch += ((n.z * 0.35) - boat.pitch) * (1 - Math.exp(-dt * 3));
    boat.roll += ((-n.x * 0.35 + lean) - boat.roll) * (1 - Math.exp(-dt * 3));

    boatGroup.position.set(boat.pos.x, 0.12 + boat.bob, boat.pos.z);
    boatGroup.rotation.set(boat.pitch, boat.heading, boat.roll, "YXZ");

    tmp.sit.set(0, 0, -0.58).applyAxisAngle(tmp.up, boat.heading);
    camera.position.set(
      boat.pos.x + tmp.sit.x,
      1.18 + boat.bob * 0.45,
      boat.pos.z + tmp.sit.z,
    );

    ocean.position.x = boat.pos.x;
    ocean.position.z = boat.pos.z;
    ocean.material.uniforms.uTime.value = t;
    ocean.material.uniforms.uBoat.value.copy(boat.pos);

    updateWake(dt);
  }

  function updateWake(dt) {
    wake.timer -= dt;
    if (wake.timer <= 0 && boat.speed > 0.4) {
      wake.timer = 0.11;
      const slot = wake.patches.reduce((a, b) => (a.age > b.age ? a : b));
      const back = 1.6;
      slot.x = boat.pos.x - Math.sin(boat.heading) * back;
      slot.z = boat.pos.z - Math.cos(boat.heading) * back;
      slot.age = 0;
      slot.sprite.visible = true;
    }
    for (const p of wake.patches) {
      p.age += dt;
      const life = p.age / 2.4;
      if (life >= 1) {
        p.sprite.visible = false;
        continue;
      }
      const y = sampleWave(p.x, p.z, clock.elapsedTime).y + 0.08;
      p.sprite.position.set(p.x, y, p.z);
      p.sprite.scale.setScalar(1.4 + life * 2.6);
      p.sprite.material.opacity = (1 - life) * Math.min(1, boat.speed / 2) * 0.55;
    }
  }

  function updateBirds(t) {
    for (const b of birds) {
      const u = b.userData;
      const a = t * u.speed + u.phase;
      b.position.set(
        u.center.x + Math.cos(a) * u.radius,
        u.height + Math.sin(t * 1.4 + u.phase) * 0.6,
        u.center.z + Math.sin(a) * u.radius,
      );
      b.rotation.y = -a + Math.PI * 0.5;
      const flap = Math.sin(t * 8 + u.phase) * 0.55;
      u.left.rotation.z = flap;
      u.right.rotation.z = -flap;
    }
    scene.traverse((obj) => {
      if (obj.isPointLight && obj.userData.blink) {
        obj.intensity = Math.sin(t * 2.2) > 0.55 ? 3.4 : 0.15;
      }
    });
  }

  function resizeTargets() {
    renderer.getSize(tmp.size);
    const w = Math.max(2, Math.floor(tmp.size.x * 0.5));
    const h = Math.max(2, Math.floor(tmp.size.y));
    if (distort.rtL.width !== w || distort.rtL.height !== h) {
      distort.rtL.setSize(w, h);
      distort.rtR.setSize(w, h);
    }
  }

  function renderFrame() {
    renderer.getSize(tmp.size);
    const w = tmp.size.x;
    const h = tmp.size.y;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    if (mode !== "vr") {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }

    stereo.update(camera);
    const half = Math.floor(w / 2);

    if (lensOn) {
      try {
        resizeTargets();
        renderer.setScissorTest(false);
        renderer.setRenderTarget(distort.rtL);
        renderer.setViewport(0, 0, distort.rtL.width, distort.rtL.height);
        renderer.clear();
        renderer.render(scene, stereo.cameraL);
        renderer.setRenderTarget(distort.rtR);
        renderer.setViewport(0, 0, distort.rtR.width, distort.rtR.height);
        renderer.clear();
        renderer.render(scene, stereo.cameraR);
        renderer.setRenderTarget(null);
        renderer.setViewport(0, 0, w, h);
        renderer.render(distort.scene2, distort.cam2);
      } catch (err) {
        lensOn = false;
        divider.hidden = false;
        renderer.setRenderTarget(null);
      }
    }
    if (!lensOn) {
      renderer.setRenderTarget(null);
      renderer.setScissorTest(true);
      renderer.setViewport(0, 0, half, h);
      renderer.setScissor(0, 0, half, h);
      renderer.render(scene, stereo.cameraL);
      renderer.setViewport(half, 0, w - half, h);
      renderer.setScissor(half, 0, w - half, h);
      renderer.render(scene, stereo.cameraR);
      renderer.setScissorTest(false);
    }
  }

  function applyFade(dt) {
    if (mode === "vr" && fade > 0) {
      fade = Math.max(0, fade - dt * 0.85);
      renderer.toneMappingExposure = 1.08 * (1 - fade) + 0.05 * fade;
    }
  }

  function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    applyLook();
    if (mode === "menu") {
      look.mouseYaw += dt * 0.05;
    }
    updateBoat(dt, t);
    updateBirds(t);
    applyFade(dt);
    renderFrame();
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function startAudio() {
    if (audio) {
      if (audio.ctx.state === "suspended") audio.ctx.resume();
      return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 620;
    const gain = ctx.createGain();
    gain.gain.value = 0.07;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    audio = { ctx, gain };
  }

  async function requestSensors() {
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        await DeviceOrientationEvent.requestPermission();
      } catch (_) { /* Android WebView does not need this */ }
    }
    window.addEventListener("deviceorientation", onOrient, true);
    window.addEventListener("deviceorientationabsolute", onOrient, true);
    try {
      await screen.orientation?.lock?.("landscape");
    } catch (_) { /* already locked by Android */ }
    try {
      wakeLock = await navigator.wakeLock?.request("screen");
    } catch (_) { /* keep-screen-on is also set natively */ }
  }

  async function enterVR() {
    speedKey = speedSel.value;
    lensOn = lensChk.checked;
    try { startAudio(); } catch (_) { /* autoplay may be blocked */ }
    try {
      await Promise.race([
        requestSensors(),
        new Promise((resolve) => setTimeout(resolve, 700)),
      ]);
    } catch (_) { /* sensors are optional on desktop preview */ }
    overlay.classList.add("hidden");
    document.body.classList.add("vr");
    divider.hidden = lensOn;
    mode = "vr";
    fade = new URLSearchParams(location.search).get("vr") === "1" ? 0 : 1;
    setTimeout(recenter, 250);
  }

  function exitVR() {
    mode = "menu";
    overlay.classList.remove("hidden");
    document.body.classList.remove("vr");
    divider.hidden = true;
    renderer.setScissorTest(false);
    fade = 0;
    renderer.toneMappingExposure = 1.08;
    return true;
  }

  function onPointerDown(e) {
    if (mode === "vr" && look.hasGyro) {
      const now = performance.now();
      if (now - lastTap < 280) {
        exitVR();
      } else {
        recenter();
      }
      lastTap = now;
      return;
    }
    look.dragging = true;
    look.lastX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    look.lastY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
  }

  function onPointerMove(e) {
    if (!look.dragging || (mode === "vr" && look.hasGyro)) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? look.lastX;
    const y = e.clientY ?? e.touches?.[0]?.clientY ?? look.lastY;
    look.mouseYaw -= (x - look.lastX) * 0.005;
    look.mousePitch -= (y - look.lastY) * 0.005;
    look.mousePitch = THREE.MathUtils.clamp(look.mousePitch, -1.2, 1.0);
    look.lastX = x;
    look.lastY = y;
  }

  function onPointerUp() {
    look.dragging = false;
  }

  startBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    enterVR();
  });
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("touchstart", (e) => {
    if (mode === "vr") e.preventDefault();
  }, { passive: false });
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 200));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mode === "vr") exitVR();
  });

  window.__seaBoat = {
    back() {
      if (mode === "vr") {
        exitVR();
        return true;
      }
      return false;
    },
    pause() {
      audio?.ctx?.suspend?.();
    },
    resume() {
      audio?.ctx?.resume?.();
    },
  };

  resize();
  look.mouseYaw = 0.35;
  tick();

  const bootParams = new URLSearchParams(location.search);
  if (bootParams.get("lens") === "0") lensChk.checked = false;
  if (bootParams.get("vr") === "1") setTimeout(enterVR, 200);
})();
