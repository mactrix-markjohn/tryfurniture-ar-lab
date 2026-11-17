import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const get = (id) => document.getElementById(id);
const overlay = get('overlay');
const storeKey = 'tryfurniture.ar-lab.layout.v1';
const controls = ['add', 'move', 'swap', 'rotate-left', 'rotate-right', 'remove', 'save', 'restore'];
const variantKey = new URLSearchParams(location.search).get('variantKey');
const labels = Object.fromEntries([...get('catalogue').options].map((option) => [option.value, option.text]));
const loader = new GLTFLoader();
const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ray = new THREE.Raycaster();
const preview = new THREE.Mesh(
  new THREE.RingGeometry(0.09, 0.114, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffce84, side: THREE.DoubleSide, depthTest: false }),
);
preview.visible = false;
preview.renderOrder = 10;
let active;
let modelPromise;
let variantLaunchUrl;

function loadModels() {
  modelPromise ??= Promise.all(Object.keys(labels).map(async (key) => [
    key, (await loader.loadAsync(new URL(`./models/${key}.glb`, import.meta.url).href)).scene,
  ])).then(Object.fromEntries).catch((error) => {
    modelPromise = undefined;
    throw error;
  });
  return modelPromise;
}

function savedLayout() {
  try {
    const data = JSON.parse(localStorage.getItem(storeKey));
    if (!Array.isArray(data) || data.length > 12) return null;
    return data.length && data.every((x) => Object.hasOwn(labels, x.key)
      && Array.isArray(x.position) && x.position.length === 3
      && x.position.every(Number.isFinite) && Number.isFinite(x.angle)) ? data : null;
  } catch {
    return null;
  }
}

function selected(run) {
  return run.pieces.find((piece) => piece.id === get('placed').value);
}

function updateControls(run, selectId = get('placed').value) {
  const picker = get('placed');
  picker.replaceChildren(new Option('None', ''), ...run.pieces.map((piece, index) =>
    new Option(`${index + 1}. ${labels[piece.key]}`, piece.id)));
  picker.value = run.pieces.some((piece) => piece.id === selectId) ? selectId : '';
  const hasSelection = Boolean(selected(run));
  get('catalogue').disabled = !run.models;
  for (const id of controls) get(id).disabled = !run.models;
  for (const id of ['move', 'swap', 'rotate-left', 'rotate-right', 'remove']) get(id).disabled ||= !hasSelection;
  get('save').disabled ||= !run.pieces.length;
  get('restore').disabled ||= !savedLayout();
  get('add').setAttribute('aria-pressed', String(run.mode === 'add'));
  get('move').setAttribute('aria-pressed', String(run.mode === 'move'));
}

function instruction(run) {
  if (!run.models) return 'Loading the furniture models…';
  if (run.mode === 'restore') return 'Face the original direction and tap a floor point to set the saved layout down.';
  if (run.engine === 'webxr') return run.mode === 'move'
    ? 'Aim the ring at the new position and tap the camera view to move the piece.'
    : 'Aim the ring at the floor and tap the camera view to place the piece.';
  if (run.mode === 'move') return 'Tap the floor where the selected piece should move.';
  return 'Point at the floor and tap to place the selected catalogue piece.';
}

function setMode(run, mode) {
  run.mode = mode;
  get('status').textContent = instruction(run);
  updateControls(run);
}

function makePiece(run, key, position, angle = 0) {
  const node = new THREE.Group();
  node.add(run.models[key].clone(true));
  node.position.copy(position);
  node.rotation.y = angle;
  run.layout.add(node);
  const piece = { id: String(++run.id), key, node };
  run.pieces.push(piece);
  return piece;
}

function place(run, point, heading, nativeHit) {
  if (active !== run || !run.models || run.trackingLost) return;
  if (!point) {
    get('status').textContent = 'Floor not found. Aim down and pan slowly over a textured area.';
    return;
  }
  const isRestore = run.mode === 'restore';
  const restore = isRestore ? savedLayout() : null;
  if (isRestore && !restore) {
    setMode(run, 'add');
    return;
  }
  if (!run.originSet || isRestore) {
    run.anchor?.delete?.();
    run.anchor = undefined;
    const anchorRevision = ++run.anchorRevision;
    run.layout.position.copy(point);
    run.layout.rotation.y = Math.atan2(-heading.x, -heading.z);
    run.layout.updateMatrixWorld(true);
    run.originSet = true;
    nativeHit?.createAnchor?.().then((anchor) => {
      if (active === run && run.anchorRevision === anchorRevision) run.anchor = anchor;
      else anchor.delete?.();
    }).catch(() => {});
  }
  const localPoint = run.layout.worldToLocal(point.clone());
  localPoint.y = 0;
  let piece;
  if (isRestore) {
    run.layout.clear();
    run.pieces = [];
    for (const item of restore) piece = makePiece(run, item.key, new THREE.Vector3().fromArray(item.position), item.angle);
  } else if (run.mode === 'move') {
    piece = selected(run);
    piece?.node.position.copy(localPoint);
  } else if (run.pieces.length < 12) {
    piece = makePiece(run, get('catalogue').value, localPoint);
  } else {
    get('status').textContent = 'This test supports up to 12 pieces. Remove one to add another.';
    return;
  }
  run.mode = 'add';
  updateControls(run, piece?.id);
  get('status').textContent = isRestore ? 'Layout restored at the new floor position.' : instruction(run);
}

function addSceneElements(run, scene, camera) {
  run.scene = scene;
  run.camera = camera;
  const fill = new THREE.HemisphereLight(0xfffaf1, 0x85817c, 2);
  const key = new THREE.DirectionalLight(0xfff3e2, 1.8);
  key.position.set(2, 5, 3);
  scene.add(fill, key, run.layout, preview);
}

function loadScript(url, attributes = {}) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    for (const [name, value] of Object.entries(attributes)) script.setAttribute(name, value);
    script.onload = resolve;
    script.onerror = () => { script.remove(); reject(new Error('Could not load the AR engine.')); };
    document.head.append(script);
  });
}

async function start8thWall(run) {
  window.THREE = THREE;
  if (!window.XR8) {
    await loadScript('https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1.0.0/dist/xr.js',
      { crossorigin: 'anonymous', 'data-preload-chunks': 'slam' });
    if (!window.XR8) throw new Error('8th Wall did not initialize.');
  }
  const xr = window.XR8;
  if (active !== run) return;
  await xr.loadChunk('slam');
  if (active !== run) return;
  xr.XrController.configure({ scale: 'absolute' });
  xr.addCameraPipelineModules([
    xr.GlTextureRenderer.pipelineModule(),
    xr.Threejs.pipelineModule(),
    xr.XrController.pipelineModule(),
    {
      name: 'tryfurniture-editor',
      onStart: () => {
        const { scene, camera } = xr.Threejs.xrScene();
        addSceneElements(run, scene, camera);
        camera.position.set(0, 1.6, 0);
        xr.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
      },
      onUpdate: () => {
        if (!run.camera || !run.models || run.trackingLost) return;
        const hit = floorPoint(run, 0, 0);
        preview.visible = Boolean(hit);
        if (hit) preview.position.copy(hit).y += 0.006;
      },
      onCameraStatusChange: ({ status }) => {
        if (status === 'failed') finish(run, 'Camera unavailable. Check camera permission and reopen the live editor.');
      },
      onException: (error) => finish(run, error?.message || '8th Wall could not start on this device.'),
      listeners: [{
        event: 'reality.trackingstatus',
        process: ({ detail }) => {
          if (active !== run) return;
          const previous = run.trackingLost;
          run.trackingLost = detail.status === 'LIMITED' || detail.status === 'UNAVAILABLE';
          if (run.trackingLost) preview.visible = false;
          if (previous !== run.trackingLost) {
            get('status').textContent = run.trackingLost
              ? 'Tracking is limited. Move slowly and point at a textured area.' : instruction(run);
          }
        },
      }],
    },
  ]);
  run.stop = () => {
    xr.stop();
    xr.clearCameraPipelineModules();
  };
  xr.run({ canvas: get('camera'), allowedDevices: xr.XrConfig.device().MOBILE });
}

function floorPoint(run, x, y) {
  if (!run.camera) return null;
  run.camera.updateMatrixWorld(true);
  ray.setFromCamera({ x, y }, run.camera);
  const point = ray.ray.intersectPlane(floor, new THREE.Vector3());
  return point && point.distanceTo(ray.ray.origin) <= 8 ? point : null;
}

async function startWebXR(run) {
  if (!navigator.xr?.requestSession) throw new Error('WebXR AR is unavailable here. Try Chrome on an ARCore-capable Android phone.');
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['local', 'hit-test', 'dom-overlay'],
    optionalFeatures: ['anchors'],
    domOverlay: { root: overlay },
  });
  if (active !== run) {
    await session.end();
    return;
  }
  let renderer;
  let ended = false;
  run.stop = () => {
    renderer?.setAnimationLoop(null);
    renderer?.dispose();
    if (!ended) void session.end().catch(() => {});
  };
  session.addEventListener('end', () => {
    ended = true;
    finish(run);
  });
  renderer = new THREE.WebGLRenderer({ canvas: get('camera'), alpha: true, antialias: true });
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  addSceneElements(run, scene, camera);
  await renderer.xr.setSession(session);
  if (active !== run) return;
  const reference = renderer.xr.getReferenceSpace();
  const viewerSpace = await session.requestReferenceSpace('viewer');
  if (active !== run) return;
  const centerSource = await session.requestHitTestSource({ space: viewerSpace });
  if (active !== run) {
    centerSource?.cancel();
    return;
  }
  if (!centerSource) throw new Error('The phone did not provide floor hit-testing.');
  const heading = new THREE.Vector3(0, 0, -1);
  overlay.addEventListener('beforexrselect', (event) => event.preventDefault(), { signal: run.signal });
  renderer.setAnimationLoop((_, frame) => {
    if (active !== run || !frame) return;
    if (run.anchor) {
      const pose = frame.getPose(run.anchor.anchorSpace, reference);
      if (pose) run.layout.position.copy(pose.transform.position);
    }
    const view = frame.getViewerPose(reference);
    if (view) {
      const direction = directionFor(view.transform.orientation);
      heading.set(direction.x, direction.y, direction.z);
    }
    const centerHit = frame.getHitTestResults(centerSource)[0];
    const center = floorFromHit(centerHit, reference);
    preview.visible = Boolean(run.models && center);
    if (center) preview.position.copy(center).y += 0.006;
    if (run.placeCenter) {
      run.placeCenter = false;
      place(run, center, heading, centerHit);
    }
    renderer.render(scene, camera);
  });
}

function directionFor(orientation) {
  const q = new THREE.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w);
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return new DOMPointReadOnly(direction.x, direction.y, direction.z, 0);
}

function floorFromHit(hit, reference) {
  const pose = hit?.getPose(reference);
  if (!pose) return null;
  const q = pose.transform.orientation;
  const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
  if (normal.y < 0.8) return null;
  return new THREE.Vector3().copy(pose.transform.position);
}

async function start(engine) {
  if (active) return;
  if (engine === 'webxr' && variantLaunchUrl) {
    location.assign(variantLaunchUrl);
    return;
  }
  const controller = new AbortController();
  const run = {
    engine, layout: new THREE.Group(), pieces: [], mode: 'add', id: 0, anchorRevision: 0,
    controller, signal: controller.signal,
  };
  active = run;
  get('home').hidden = true;
  get('editor').hidden = false;
  get('engine-name').textContent = engine === '8thwall' ? '8th Wall' : variantKey ? 'WebXR / Variant Launch' : 'WebXR';
  get('status').textContent = 'Starting the camera…';
  updateControls(run);
  const startingEngine = engine === '8thwall' ? start8thWall(run) : startWebXR(run);
  try {
    const [, models] = await Promise.all([startingEngine, loadModels()]);
    if (active !== run) return;
    run.models = models;
    setMode(run, 'add');
  } catch (error) {
    finish(run, error.message || 'The AR session could not start.');
  }
}

function finish(run, message) {
  if (!run || active !== run) return;
  active = undefined;
  preview.removeFromParent();
  run.anchor?.delete?.();
  run.controller.abort();
  try { run.stop?.(); } catch (error) { console.error(error); }
  // Different engines use different WebGL contexts. Each session starts with a fresh canvas.
  const oldCanvas = get('camera');
  oldCanvas.replaceWith(oldCanvas.cloneNode(false));
  get('editor').hidden = true;
  get('home').hidden = false;
  if (message) get('notice').textContent = message;
}

get('placement-surface').addEventListener('pointerup', (event) => {
  const run = active;
  if (!run?.models) return;
  if (run.engine === 'webxr') {
    run.placeCenter = true;
    return;
  }
  const rect = event.currentTarget.getBoundingClientRect();
  const x = 2 * (event.clientX - rect.left) / rect.width - 1;
  const y = 1 - 2 * (event.clientY - rect.top) / rect.height;
  if (run.camera) place(run, floorPoint(run, x, y), run.camera.getWorldDirection(new THREE.Vector3()));
});
get('exit').onclick = () => finish(active);
get('placed').onchange = () => {
  if (active) setMode(active, 'add');
};
for (const id of ['add', 'move', 'restore']) get(id).onclick = () => active && setMode(active, id);
for (const [id, direction] of [['rotate-left', 1], ['rotate-right', -1]]) get(id).onclick = () => {
  const piece = active && selected(active);
  if (piece) piece.node.rotation.y += direction * Math.PI / 12;
};
get('swap').onclick = () => {
  const piece = active && selected(active);
  const key = get('catalogue').value;
  if (!piece || piece.key === key) return;
  piece.key = key;
  piece.node.clear().add(active.models[key].clone(true));
  updateControls(active);
  get('status').textContent = `Swapped to ${labels[key]}. Position and rotation kept.`;
};
get('remove').onclick = () => {
  const piece = active && selected(active);
  if (!piece) return;
  piece.node.removeFromParent();
  active.pieces = active.pieces.filter((other) => other !== piece);
  setMode(active, 'add');
};
get('save').onclick = () => {
  if (!active?.pieces.length) return;
  try {
    localStorage.setItem(storeKey, JSON.stringify(active.pieces.map(({ key, node }) =>
      ({ key, position: node.position.toArray(), angle: node.rotation.y }))));
    updateControls(active);
    get('status').textContent = 'Saved in this browser. Restore places the layout at a new floor point.';
  } catch {
    get('status').textContent = 'This browser could not save the layout.';
  }
};
for (const button of document.querySelectorAll('[data-engine]')) {
  button.onclick = () => void start(button.dataset.engine);
  button.disabled = false;
}

if (variantKey) {
  const button = get('webxr-launch');
  button.disabled = true;
  button.textContent = 'Start Variant test';
  get('webxr-device').textContent = 'iPhone App Clip · Android WebXR';
  get('webxr-title').textContent = 'Compare Variant Launch';
  get('webxr-description').textContent = 'Run the same furniture controls with ARKit on iPhone or ARCore on Android.';
  window.addEventListener('vlaunch-initialized', ({ detail }) => {
    variantLaunchUrl = detail.launchRequired ? detail.launchUrl : undefined;
    button.disabled = false;
  }, { once: true });
  loadScript(`https://launchar.app/sdk/v1?key=${encodeURIComponent(variantKey)}`).catch((error) => {
    get('notice').textContent = error.message;
  });
}
