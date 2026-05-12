import * as cg from "../render/core/cg.js";
import * as global from "../global.js";
import { Gltf2Node } from "../render/nodes/gltf2.js";
import { buttonState, joyStickState } from "../render/core/controllerInput.js";
import * as customFire from "./campFire.js";
import { loadSound, playSoundAtPosition } from "../util/positional-audio.js";

// ─── Scene State ────────────────────────────────────────────────────────────
let startTime = 0;
let campfireLit = false;
let fireStartTime = 0;
let riftOpened = false;
let modelsSwapped = false;
let isInitialized = false;
let monsterNode;
let prevFrameTime = 0;
let virtualPlayerX = 0;
let virtualPlayerZ = 0;
let virtualPlayerYaw = 0;
let snapTurnReady = true;
let mapTaken = false;
let mapOpen = false;
let mapTriggerLatch = false;
let strikeCount = 0;
let lastStrikeTime = 0;
const STRIKES_NEEDED = 3;
const STRIKE_COOLDOWN = 0.5; // seconds between strikes
// State for the matchbox
let matchboxInPocket = false;
let matchboxWorldX = -3;
let matchboxWorldZ = -5;
// voice lines
let monsterLine4Buffer, monsterLine5Buffer,monsterLine6Buffer,monsterLine7Buffer
let played4 = false, played5 = false, played6 = false, played7 = false;
let soundsLoaded = false;

// ─── Infinite World: Chunk System ───────────────────────────────────────────
//
// The world is divided into square chunks of CHUNK_SIZE units.
// Each chunk is identified by its integer grid coords (cx, cz).
// We keep a Map from key "cx,cz" → { floorNodes[], treeNodes[], plantNodes[] }
// and load/unload chunks as the player moves through the world.
//
// Player position in Scene 2 is inferred from the VR hand positions (averaged),
// since there is no explicit camera API exposed in this framework.

const CHUNK_SIZE      = 6;     // world units per chunk
const RENDER_RADIUS   = 2;     // chunks visible in each direction (5×5 grid = 25 chunks)
const UNLOAD_RADIUS   = 3;     // chunks farther than this get unloaded
const STREAM_CENTER_Z_OFFSET = -3;
const MOVE_SPEED = 2.4;
const STICK_DEADZONE = 0.15;
const SNAP_TURN_ANGLE = Math.PI / 6;
const SNAP_TURN_THRESHOLD = 0.65;
const MAP_TAKE_RADIUS = 0.3;
const FIRE_INTERACT_RADIUS = 0.75;
const CAMPFIRE_WORLD_POS = [18, -0.88, -18];
const MAP_GIFT_WORLD_POS = [0.65, 1.1, -2.55];
const MAP_BOUNDS = { minX: -6, maxX: 24, minZ: -24, maxZ: 6 };
const MAP_SIZE = 1.3;

// Keep the player spawn area clear so Act 2 doesn't begin with terrain
// intersecting the viewer. We only clear the immediate entry zone, not the
// campfire area in front of the player.
function inEntryClearZone(x, z) {
   return Math.abs(x) < 1.6 && z > -1.0 && z < 1.5;
}

function applyDeadzone(v) {
   return Math.abs(v) < STICK_DEADZONE ? 0 : v;
}

function makePlacement(node, x, y, z, rotY, s) {
   return { node, x, y, z, rotY, s };
}

function rotateXZ(x, z, yaw) {
   const c = Math.cos(yaw);
   const s = Math.sin(yaw);
   return [x * c - z * s, x * s + z * c];
}

function transformWorldPoint(x, y, z, offsetX = 0, offsetZ = 0, yaw = 0) {
   const [rx, rz] = rotateXZ(x - offsetX, z - offsetZ, -yaw);
   return [rx, y, rz];
}

function applyPlacement(placement, offsetX = 0, offsetZ = 0, yaw = 0) {
   const [x, y, z] = transformWorldPoint(placement.x, placement.y, placement.z, offsetX, offsetZ, yaw);
   placement.node.matrix = cg.mMultiply(
      cg.mTranslate(x, y, z),
      cg.mMultiply(cg.mRotateY(placement.rotY - yaw), cg.mScale(placement.s, placement.s, placement.s))
   );
}

function applyChunkWorldOffset(offsetX, offsetZ, yaw) {
   for (const chunk of loadedChunks.values()) {
      for (const p of chunk.floorNodes) applyPlacement(p, offsetX, offsetZ, yaw);
      for (const p of chunk.treeNodes)  applyPlacement(p, offsetX, offsetZ, yaw);
      for (const p of chunk.stoneNodes) applyPlacement(p, offsetX, offsetZ, yaw);
      for (const p of chunk.plantNodes) applyPlacement(p, offsetX, offsetZ, yaw);
   }
}

function offsetPos([x, y, z], offsetX, offsetZ, yaw = 0) {
   return transformWorldPoint(x, y, z, offsetX, offsetZ, yaw);
}

function clamp01(v) {
   return Math.max(0, Math.min(1, v));
}

function planarDistance(ax, az, bx, bz) {
   return Math.hypot(ax - bx, az - bz);
}

function worldToMapLocal(x, z) {
   const u = clamp01((x - MAP_BOUNDS.minX) / (MAP_BOUNDS.maxX - MAP_BOUNDS.minX));
   const v = clamp01((z - MAP_BOUNDS.minZ) / (MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ));
   return [
      (u - 0.5) * MAP_SIZE,
      (0.5 - v) * MAP_SIZE,
   ];
}

function renderMapPanel(model, anchorPos, playerX, playerZ, playerYaw) {
   const root = model.add()
      .move(...anchorPos)
      .turnY(0.4)
      .turnX(-0.08)
      .scale(0.28); // Keep the global scale for the container

   // 1. Shrink the dark frame width (from 1.95 to 1.3)
   root.add("cube").scale(1.3, 1.35, 0.035).color(0.11, 0.10, 0.08);

   // 2. Shrink the paper width (from 1.82 to 1.15)
   root.add("square").move(0, 0, 0.02).scale(1.15, 1.22, 1).color(0.88, 0.82, 0.64);

   // 3. Update the grid lines
   for (let i = -2; i <= 2; i++) {
      const x = i * 0.33; 
      const y = i * 0.33; 
      
      // Vertical lines (scale X remains thin, Y stays long)
      root.add("cube").move(x, 0, 0.03).scale(0.012, 1.12, 0.01).color(0.55, 0.48, 0.34);
      
      // Horizontal lines (scale X needs to be shorter: from 1.72 to 1.1)
      root.add("cube").move(0, y, 0.03).scale(1.1, 0.012, 0.01).color(0.55, 0.48, 0.34);
   }

   // 4. Update markers: worldToMapLocal now needs to account for the narrow width
   const [rawPlayerMapX, playerMapY] = worldToMapLocal(playerX, playerZ);
   const [rawFireMapX, fireMapY] = worldToMapLocal(CAMPFIRE_WORLD_POS[0], CAMPFIRE_WORLD_POS[2]);
   const [rawGiftMapX, giftMapY] = worldToMapLocal(MAP_GIFT_WORLD_POS[0], MAP_GIFT_WORLD_POS[2]);
   
   // Compensate marker X positions for the narrower map (multiply by ~0.6)
   const playerMapX = rawPlayerMapX * 0.6;
   const fireMapX = rawFireMapX * 0.6;
   const giftMapX = rawGiftMapX * 0.6;

   const mapFacing = -playerYaw;

   // Markers (keeping these as standard scales so they don't look like eggs!)
   root.add("sphere").move(playerMapX, playerMapY, 0.05).scale(0.06).color(0.14, 0.35, 0.95);
      
   root.add("sphere").move(fireMapX, fireMapY, 0.05).scale(0.07).color(0.95, 0.32, 0.08);
   root.add("sphere").move(giftMapX, giftMapY, 0.05).scale(0.05).color(0.18, 0.7, 0.28);

   // Labels (Reduced X offset for "YOU", "FIRE", "MAP" so they stay near markers)
   root.add(clay.text("YOU")).move(playerMapX + 0.08, playerMapY + 0.05, 0.05).scale(0.18).color(0.08, 0.18, 0.55);
   root.add(clay.text("FIRE")).move(fireMapX + 0.08, fireMapY + 0.05, 0.05).scale(0.18).color(0.55, 0.18, 0.05);
   root.add(clay.text("MAP")).move(giftMapX + 0.08, giftMapY + 0.05, 0.05).scale(0.16).color(0.12, 0.35, 0.12);
   
   // Compass (Keep centered)
   root.add(clay.text("N")).move(0, 0.78, 0.05).scale(0.2).color(0.18, 0.14, 0.1);
   root.add("cube").move(0, 0.67, 0.05).scale(0.018, 0.09, 0.01).color(0.18, 0.14, 0.1);
   root.add("coneY").move(0, 0.77, 0.05).scale(0.045, 0.08, 0.045).color(0.18, 0.14, 0.1);
}
// Seeded pseudo-random for deterministic generation per chunk
function seededRand(seed) {
   let s = seed;
   return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
   };
}

function chunkSeed(cx, cz) {
   // Cantor-pair–style unique integer for each (cx, cz)
   return Math.abs(cx * 73856093 ^ cz * 19349663);
}

// Track every loaded chunk
let loadedChunks = new Map();

// Which biome a chunk belongs to — used to switch models after campfire
// Chunks generated before the campfire are "snow", after are "green"
// (we just rebuild them on demand if biome changes)
let worldBiome = "snow"; // "snow" | "green"

// Generate (or regenerate) a single chunk at (cx, cz) and add it to the scene
function buildChunk(cx, cz) {
   const rand = seededRand(chunkSeed(cx, cz));
   const originX = cx * CHUNK_SIZE;
   const originZ = cz * CHUNK_SIZE;

   const floorNodes = [];
   const treeNodes  = [];
   const stoneNodes = [];
   const plantNodes = [];

   // ── Floor tiles (3×3 grid inside the chunk) ──
   const tilesPerSide = 2;
   const tileSpacing  = CHUNK_SIZE / tilesPerSide;
   for (let tx = 0; tx < tilesPerSide; tx++) {
      for (let tz = 0; tz < tilesPerSide; tz++) {
         const x = originX + tx * tileSpacing + tileSpacing * 0.5 - CHUNK_SIZE * 0.5;
         const z = originZ + tz * tileSpacing + tileSpacing * 0.5 - CHUNK_SIZE * 0.5;
         if (inEntryClearZone(x, z)) continue;
         const s = 2.5 + rand() * 0.8;
         const rotY = rand() * Math.PI * 2;

         const url = worldBiome === "snow"
            ? "../../media/models/nature/block-snow-large.glb"
            : "../../media/models/nature/block-grass-large.glb";

         const node = new Gltf2Node({ url });
         global.scene().addNode(node);
         floorNodes.push(makePlacement(node, x, -4, z, rotY, s));
      }
   }

   // ── Trees (0–2 per chunk, based on noise) ──
   const treeCount = Math.floor(rand() * 3); // 0, 1, or 2
   for (let i = 0; i < treeCount; i++) {
      const x = originX + (rand() - 0.5) * CHUNK_SIZE * 0.8;
      const z = originZ + (rand() - 0.5) * CHUNK_SIZE * 0.8;
      if (inEntryClearZone(x, z)) continue;
      const s = 1.8 + rand() * 1.4;
      const rotY = rand() * Math.PI * 2;

      const variant = Math.floor(rand() * 2); // 0 = regular tree, 1 = pine
      const url = worldBiome === "snow"
         ? (variant === 0 ? "../../media/models/nature/tree-snow.glb" : "../../media/models/nature/tree-pine-snow.glb")
         : (variant === 0 ? "../../media/models/nature/tree.glb"      : "../../media/models/nature/tree-pine.glb");

      const node = new Gltf2Node({ url });
      global.scene().addNode(node);
      treeNodes.push(makePlacement(node, x, -1.0, z, rotY, s));
   }

   // ── Stones (very sparse: 0–1 per chunk) ─────────────────────────────────
   const stoneCount = rand() < 0.35 ? 1 : 0;
   for (let i = 0; i < stoneCount; i++) {
      const x = originX + (rand() - 0.5) * CHUNK_SIZE * 0.85;
      const z = originZ + (rand() - 0.5) * CHUNK_SIZE * 0.85;
      if (inEntryClearZone(x, z)) continue;
      const s = 0.8 + rand() * 0.9;
      const rotY = rand() * Math.PI * 2;

      const node = new Gltf2Node({ url: "../../media/models/nature/stones.glb" });
      global.scene().addNode(node);
      stoneNodes.push(makePlacement(node, x, -1.05, z, rotY, s));
   }

   // ── Plants / details (0–3 per chunk, only in green biome) ──
   if (worldBiome === "green") {
      const plantCount = Math.floor(rand() * 4);
      for (let i = 0; i < plantCount; i++) {
         const x = originX + (rand() - 0.5) * CHUNK_SIZE * 0.9;
         const z = originZ + (rand() - 0.5) * CHUNK_SIZE * 0.9;
         if (inEntryClearZone(x, z)) continue;
         const s = 1.0 + rand() * 1.0;
         const rotY = rand() * Math.PI * 2;

         const variant = Math.floor(rand() * 2);
         const url = variant === 0
            ? "../../media/models/nature/mushrooms.glb"
            : "../../media/models/nature/flowers.glb";

         const node = new Gltf2Node({ url });
         global.scene().addNode(node);
         plantNodes.push(makePlacement(node, x, -1.0, z, rotY, s));
      }
   }

   return { floorNodes, treeNodes, stoneNodes, plantNodes };
}

// Remove all nodes in a chunk and drop the chunk from the map
function unloadChunk(key) {
   const chunk = loadedChunks.get(key);
   if (!chunk) return;
   for (const p of chunk.floorNodes) global.scene().removeNode(p.node);
   for (const p of chunk.treeNodes)  global.scene().removeNode(p.node);
    for (const p of chunk.stoneNodes) global.scene().removeNode(p.node);
   for (const p of chunk.plantNodes) global.scene().removeNode(p.node);
   loadedChunks.delete(key);
}

// Unload every chunk (used on reset)
function unloadAllChunks() {
   for (const key of loadedChunks.keys()) unloadChunk(key);
}

// Given the player's current world-space position, load nearby chunks and
// unload distant ones.  Call every frame (cheap: most work is a Map lookup).
function updateChunks(playerX, playerZ) {
   const pcx = Math.round(playerX / CHUNK_SIZE);
   const pcz = Math.round(playerZ / CHUNK_SIZE);

   // Load chunks within RENDER_RADIUS
   for (let dx = -RENDER_RADIUS; dx <= RENDER_RADIUS; dx++) {
      for (let dz = -RENDER_RADIUS; dz <= RENDER_RADIUS; dz++) {
         const cx = pcx + dx;
         const cz = pcz + dz;
         const key = `${cx},${cz}`;
         if (!loadedChunks.has(key)) {
            loadedChunks.set(key, buildChunk(cx, cz));
         }
      }
   }

   // Unload chunks beyond UNLOAD_RADIUS
   for (const key of loadedChunks.keys()) {
      const [cx, cz] = key.split(",").map(Number);
      if (Math.abs(cx - pcx) > UNLOAD_RADIUS || Math.abs(cz - pcz) > UNLOAD_RADIUS) {
         unloadChunk(key);
      }
   }
}

// When biome changes (snow → green) we must rebuild all loaded chunks
function rebuildAllChunksForBiome() {
   const keys = [...loadedChunks.keys()];
   for (const key of keys) unloadChunk(key);
   // Chunks will be reloaded on the next updateChunks() call automatically
}

// ─── Fixed Scene Objects (campfire area, monster NPC) ───────────────────────
const firePos = CAMPFIRE_WORLD_POS;

// ─── Dialogue state ──────────────────────────────────────────────────────────
let plantGrowthStartTime = 0;

// ─── Matchbox (giant prop) ───────────────────────────────────────────────────
// The matchbox is the iconic set-piece the slime stole — we render it at the
// back of the scene as a large static prop so it feels meaningful.
function renderMatchboxProp(model) {
   model.add("cube")
        .move(-3, 0.5, -5).turnY(0.4).scale(2, 0.8, 3)
        .color(0.8, 0.1, 0.1);
   model.add("square")
        .move(-2.8, 0.5, -3.5).turnY(0.4).scale(2, 0.8, 3)
        .color(0.2, 0.2, 0.2);
}

function renderMapHUD(model, triggerJustPressed, getBeamHit) {
   // 1. Moved bit right (X: -0.7) and further away (Z: -1.5)
   const hudRoot = model.add()
        .move(-0.7, 2.1, -1.5) 
        .turnY(0.45); // Slightly reduced angle since it's closer to the center

   // 2. Invisible Hit Target (Made narrower: X scale changed from 0.09 to 0.07)
   const hudHitTarget = hudRoot.add("square")
        .scale(0.07, 0.06, 1) 
        .color(0, 0, 0, 0);

   const isPointingHUD = getBeamHit(hudHitTarget);

   // 3. Visible Button Background (Made narrower: X scale changed from 0.07 to 0.05)
   hudRoot.add("square")
        .move(0, 0, 0.001) 
        .scale(0.05, 0.04, 1)
        .color(
           mapOpen 
              ? (isPointingHUD ? [1.0, 0.95, 0.70] : [0.98, 0.9, 0.55]) 
              : (isPointingHUD ? [0.85, 0.78, 0.58] : [0.75, 0.68, 0.48])
        );

   // 4. Text (Adjusted the X offset from -0.03 to -0.02 to keep it centered in the narrower box)
   hudRoot.add(clay.text("MAP"))
        .move(-0.02, -0.012, 0.002) 
        .scale(0.07)
        .color(0.15, 0.12, 0.08);

   // Toggle logic
   if (triggerJustPressed && isPointingHUD) {
      mapOpen = !mapOpen;
   }
}
// ─── Export: render ──────────────────────────────────────────────────────────
export const render = (model, t, hands) => {
   if (startTime === 0) startTime = t;
   const elapsed = t - startTime;
   const dt = prevFrameTime === 0 ? 0 : Math.min(t - prevFrameTime, 0.05);
   prevFrameTime = t;

   // ── THE GREAT WIPE ──────────────────────────────────────────────────────
   const isEnding = campfireLit && (t - fireStartTime) > 20;

   if (isEnding) {
      // 1. Clear all "model.add" shapes (campfire, map, etc.)
      while (model.nChildren() > 0) model.remove(0);

      // 2. Shrink the Slime to nothing
      if (monsterNode) monsterNode.matrix = cg.mScale(0);

      // 3. Shrink all world chunks to nothing
      for (const chunk of loadedChunks.values()) {
         const hide = (p) => p.node.matrix = cg.mScale(0);
         chunk.floorNodes.forEach(hide);
         chunk.treeNodes.forEach(hide);
         chunk.stoneNodes.forEach(hide);
         chunk.plantNodes.forEach(hide);
      }

      // 4. Create the Blackout (Inverted cube swallows the camera)
      model.add("cube").scale(-20).color(0, 0, 0);

      // 5. Add your Text
      model.add(clay.text("TO BE CONTINUED..."))
         .move(-1.2, 1.5, -3) 
         .scale(6.0)
         .color(1, 1, 1);

      return; // <--- THIS STOPS THE REST OF THE CODE FROM RUNNING
   }

   // 1. QUICK LOADER (if not already loaded)
   // 1. Initial Load (Runs once)
   if (!soundsLoaded) {
      loadSound("../../media/sound/line4.mp3", b => monsterLine4Buffer = b);
      loadSound("../../media/sound/line5.mp3", b => monsterLine5Buffer = b);
      loadSound("../../media/sound/line6.mp3", b => monsterLine6Buffer = b);
      loadSound("../../media/sound/line7.mp3", b => monsterLine7Buffer = b);
      soundsLoaded = true;
   }
   // ── Controller beam — update ONCE per frame ───────────────────────────
   let beamUpdated = false;
   const getBeamHit = (target) => {
      if (!window.beamR) return false;
      if (!beamUpdated) { window.beamR.update(); beamUpdated = true; }
      return !!window.beamR.hitRect(target.getGlobalMatrix());
   };

   // ── Initialise static scene objects (once) ───────────────────────────────
   if (!isInitialized) {
      monsterNode = new Gltf2Node({ url: "../../media/models/cute_slime.glb" });
      global.scene().addNode(monsterNode);
      isInitialized = true;
   }

   // ── Clear dynamic (per-frame) model children ─────────────────────────────
   while (model.nChildren() > 0) model.remove(0);

   const leftHandPos = hands.find(h => h.side === "left"  && Array.isArray(h.pos))?.pos || null;

   // ── Left-thumbstick locomotion for chunk streaming ────────────────────────
   // We keep a virtual player position for the infinite-world system and move
   // it with the left stick. Hand positions are still used for campfire/rift
   // interaction, but not for locomotion.
   const stickX = applyDeadzone(joyStickState.left.x || 0);
   const stickY = applyDeadzone(joyStickState.left.y || 0);
   const [moveX, moveZ] = rotateXZ(stickX, stickY, virtualPlayerYaw);
   virtualPlayerX += moveX * MOVE_SPEED * dt;
   virtualPlayerZ += moveZ * MOVE_SPEED * dt;
   const turnX = joyStickState.right.x || 0;
   if (snapTurnReady && turnX >= SNAP_TURN_THRESHOLD) {
      virtualPlayerYaw -= SNAP_TURN_ANGLE;
      snapTurnReady = false;
   }
   else if (snapTurnReady && turnX <= -SNAP_TURN_THRESHOLD) {
      virtualPlayerYaw += SNAP_TURN_ANGLE;
      snapTurnReady = false;
   }
   else if (Math.abs(turnX) < STICK_DEADZONE) {
      snapTurnReady = true;
   }
   const worldOffsetX = virtualPlayerX;
   const worldOffsetZ = virtualPlayerZ;
   const worldYaw = virtualPlayerYaw;
   const playerToFire = planarDistance(virtualPlayerX, virtualPlayerZ, firePos[0], firePos[2]);

   const triggerPressed = !!window.rightClick;
   const triggerJustPressed = triggerPressed && !mapTriggerLatch;
   mapTriggerLatch = triggerPressed;
   if (window.rightClick) window.rightClick = false;

   // ── Dark sky backdrop ─────────────────────────────────────────────────────
   // Keep the sky centered on the player so it reads like an enclosing night
   // sky rather than world geometry.
   model.add("cube")
        .scale(-80)
        .color(0.015, 0.02, 0.035);

   // ── Infinite chunk streaming ──────────────────────────────────────────────
   updateChunks(virtualPlayerX, virtualPlayerZ + STREAM_CENTER_Z_OFFSET);
   applyChunkWorldOffset(worldOffsetX, worldOffsetZ, worldYaw);

   // ── NPC monster position (bobs gently) ───────────────────────────────────
   const npcPosWorld = [1.5, 1.0 + Math.sin(t * 3) * 0.05, -3];
   const npcPos = offsetPos(npcPosWorld, worldOffsetX, worldOffsetZ, worldYaw);
   monsterNode.matrix = cg.mMultiply(
      cg.mTranslate(npcPos[0], npcPos[1], npcPos[2]),
      cg.mMultiply(cg.mRotateY(Math.PI - 0.5 - worldYaw), cg.mScale(1, 1, 1))
   );

   // ── Matchbox prop ─────────────────────────────────────────────────────────
   // ==========================================
   // 1. WORLD MATCHBOX (If it's on the floor)
   // ==========================================
   if (!matchboxInPocket) {
      const matchboxBasePos = offsetPos([matchboxWorldX, 0.5, matchboxWorldZ], worldOffsetX, worldOffsetZ, worldYaw);
      
      // Invisible Hit Target (Slightly larger for easy clicking)
      const matchboxWorldTarget = model.add("cube")
         .move(...matchboxBasePos)
         .turnY(0.4 - worldYaw)
         .scale(0.35, 0.2, 0.45)
         .color(0, 0, 0, 0);

      const isPointingMatchbox = getBeamHit(matchboxWorldTarget);
      
      model.add("cube")
         .move(...matchboxBasePos)
         .turnY(0.4 - worldYaw)
         .scale(0.13, 0.065, 0.21)
         .color(0.8, 0.1, 0.1);

      //striker
      model.add("cube")
        .move(matchboxBasePos[0], matchboxBasePos[1], matchboxBasePos[2] + 0.01)
        .turnY(0.4 - worldYaw)
        .scale(0.131, 0.04, 0.18)
        .color(0.2, 0.15, 0.1);

      // Floating Text
      model.add(clay.text("[ GRAB MATCHBOX ]"))
         .move(matchboxBasePos[0], matchboxBasePos[1] + 0.5, matchboxBasePos[2])
         .turnY(-worldYaw)
         .scale(3.2)
         .color(1,1,1); 

      if (triggerJustPressed && isPointingMatchbox) {
         matchboxInPocket = true;
      }
   }
   // ==========================================
   // 2. HUD POCKET (If you are carrying it)
   // ==========================================
   if (matchboxInPocket) {
      // 1. Move to match Map HUD, just slightly lower on the Y-axis
      const hudRoot = model.add()
           .move(-0.7, 1.85, -1.5) // Map is at 2.1, this sits right under it
           .turnY(0.45);           // Matches Map rotation exactly

      // 2. Invisible Hit Target (Matches Map hit target size)
      const hudHitTarget = hudRoot.add("square")
           .scale(0.07, 0.06, 1) 
           .color(0, 0, 0, 0);

      const isPointingHUD = getBeamHit(hudHitTarget);

      // 3. Visible Button Background (Matches Map size, keeps Matchbox Red)
      hudRoot.add("square")
           .move(0, 0, 0.001) 
           .scale(0.05, 0.04, 1)
           .color(isPointingHUD ? [1.0, 0.4, 0.4] : [0.8, 0.1, 0.1]);

      // 4. Text (Matches Map text formatting)
      hudRoot.add(clay.text("MATCH"))
           .move(-0.025, -0.012, 0.002) 
           .scale(0.06)
           .color(1, 1, 1);

      // 5. Drop Mechanic
      if (triggerJustPressed && isPointingHUD) {
         matchboxInPocket = false;
         
         const [dropOffsetX, dropOffsetZ] = rotateXZ(0, -2, virtualPlayerYaw);
         matchboxWorldX = virtualPlayerX + dropOffsetX;
         matchboxWorldZ = virtualPlayerZ + dropOffsetZ;
      }
   }


   const mapGiftPosNow = offsetPos(MAP_GIFT_WORLD_POS, worldOffsetX, worldOffsetZ, worldYaw);
   const firePosNow = offsetPos(firePos, worldOffsetX, worldOffsetZ, worldYaw);

   // A flattened dark patch under the fire helps anchor it to the terrain.
   model.add("sphere")
        .move(firePosNow[0], firePosNow[1] - 0.02, firePosNow[2])
        .scale(0.95, 0.05, 0.95)
        .color(0.05, 0.04, 0.04);

   customFire.renderCampfire(model, t, {
      pos: [firePosNow[0], firePosNow[1], firePosNow[2]],
      scale: 1.35,
      yaw: -worldYaw,
      lit: campfireLit,
   });

   if (!campfireLit) {
      model.add("sphere").move(firePosNow[0], firePosNow[1] + 0.12, firePosNow[2]).scale(0.08).color(0.08, 0.08, 0.08);
      model.add(clay.text("[ STRIKE MATCH TO IGNITE ]"))
              .move(CAMPFIRE_WORLD_POS[0], CAMPFIRE_WORLD_POS[1] + 1.2, CAMPFIRE_WORLD_POS[2])
              .turnY(-virtualPlayerYaw) // Face the player
              .scale(3.0)
              .color(1.0, 0.8, 0.2); // Warm yellow/orange text
   }

   if (!mapTaken) {
      const mapHitTarget = model.add("square")
         .move(...mapGiftPosNow)
         .turnY(- worldYaw)
         .scale(0.24, 0.16, 1)
         .color(0, 0, 0, 0);
      const isPointingMap = getBeamHit(mapHitTarget);

      model.add("cube")
           .move(...mapGiftPosNow)
           .turnY(- worldYaw)
           .scale(0.22, 0.14, 0.018)
           .color(...(isPointingMap ? [0.98, 0.9, 0.68] : [0.86, 0.8, 0.62]));
      model.add("square")
           .move(mapGiftPosNow[0], mapGiftPosNow[1], mapGiftPosNow[2] + 0.012)
           .turnY(- worldYaw)
           .scale(0.18, 0.1, 1)
           .color(0.72, 0.64, 0.46);
      if (triggerJustPressed && isPointingMap) {
         mapTaken = true;
         mapOpen = true;
      }
   }
   if (mapTaken) {
      renderMapHUD(model, triggerJustPressed, getBeamHit);
   }
   if (mapOpen && mapTaken) {
      const mapAnchor = leftHandPos
         ? [leftHandPos[0] + 0.12, leftHandPos[1] + 0.04, leftHandPos[2] - 0.22]
         : [-0.42, 1.05, -1.0];
      renderMapPanel(model, mapAnchor, virtualPlayerX, virtualPlayerZ, virtualPlayerYaw);
   }

   // ── Dialogue & fire logic ─────────────────────────────────────────────────
   let dialogue = "";

   if (!mapTaken) {
      // Pre-fire dialogue
      if (elapsed < 3) {
         dialogue = "YOU CAME!";
         if (!played4 && monsterLine4Buffer) {
            playSoundAtPosition(monsterLine4Buffer, npcPos, 3.0);
            played4 = true;
         }
      }
      else if (elapsed < 8) {
         dialogue = "THIS IS MY HOME. IT'S BEEN FROZEN FOR SO LONG.";
         if (!played5 && monsterLine5Buffer) {
            playSoundAtPosition(monsterLine5Buffer, npcPos, 3.0);
            played5 = true;
         }
      }
      else if (elapsed < 13) {
         dialogue = "I DREW YOU A MAP. THE OLD FIRE IS FAR FROM HERE.";
         if (!played6 && monsterLine6Buffer) {
               playSoundAtPosition(monsterLine6Buffer, npcPos, 3.0);
               played6 = true;
         }
      }
      else {
        dialogue = "TAKE IT. FIND THE FIRE.";
        if (!played7 && monsterLine7Buffer) {
            playSoundAtPosition(monsterLine7Buffer, npcPos, 2.0);
            played7 = true;
        }
    }
   } 
   else if (!campfireLit) {
      if (playerToFire > 4.0) dialogue = "FOLLOW THE MAP. FIND THE FIRE.";
      else                    dialogue = "YOU FOUND IT. LIGHT THE FIRE.";

      // create an invisible hit target at the campfire
      const fireHitTarget = model.add("square")
         .move(...firePosNow)
         .scale(0.6, 0.6, 1)
         .color(0, 0, 0);

      const isAimingAtFire = getBeamHit(fireHitTarget);

      if (!campfireLit) {
         if (isAimingAtFire && triggerJustPressed && (t - lastStrikeTime) > STRIKE_COOLDOWN) {
            strikeCount++;
            lastStrikeTime = t;
            // play scratch sound here
            if (strikeCount >= STRIKES_NEEDED) {
               campfireLit = true;
               fireStartTime = t;
               // play ignite sound here
            }
         }

         // show strike progress so player knows what's happening
         if (strikeCount > 0 && !campfireLit) {
            const progress = "/ ".repeat(strikeCount) + "_ ".repeat(STRIKES_NEEDED - strikeCount);
            model.add(clay.text(progress))
               .move(firePosNow[0] - 0.2, firePosNow[1] + 0.5, firePosNow[2])
               .scale(2.0)
               .color(1.0, 0.7, 0.2);
         }
      }
   } else {
      const timeSinceLit = t - fireStartTime;

      // ── Biome swap (once) ────────────────────────────────────────────────
      if (!modelsSwapped) {
         worldBiome = "green";
         rebuildAllChunksForBiome();
         plantGrowthStartTime = t;
         modelsSwapped = true;
      }

      if (timeSinceLit < 12) {
         // Phase A: thawing, fire burning warm
         dialogue = "THANK YOU! THE ICE IS MELTING!";
         const pulse  = 0.5 + 0.15 * Math.sin(t * 8);
         model.add("sphere")
              .move(firePosNow[0], firePosNow[1] + 0.35, firePosNow[2])
              .scale(0.22 + pulse * 0.04, 0.18 + pulse * 0.03, 0.22 + pulse * 0.04)
              .color(1, 0.42 + pulse * 0.3, 0.06);

      } else {
         // Phase B: fire too strong, rift opens
         if (!riftOpened) riftOpened = true;
         dialogue = "";

         const alienPulse = 0.5 * Math.sin(t * 15);
         model.add("sphere")
              .move(firePosNow[0], firePosNow[1] + 0.4, firePosNow[2])
              .scale(0.5 + alienPulse * 0.2)
              .color(0, 1, 0.8 + alienPulse * 0.2);

         // Rift touch triggers Scene 3
         for (const h of hands) {
            if (h.pos && cg.distance(h.pos, firePosNow) < FIRE_INTERACT_RADIUS + 0.2) {
               window.sharedState.gamePhase = "SCENE_3";
            }
         }
      }
   }

   // ── NPC dialogue text ─────────────────────────────────────────────────────
   model.add(clay.text(dialogue))
        .move(npcPos[0] - 0.5, npcPos[1] + 1, npcPos[2])
        .scale(3.5)
        .color(1, 1, 1);

   // ── Hint: show campfire interaction prompt before it is lit ──────────────
   // ── Hint Logic: Only show these if the fire is NOT lit yet ──────────────
   if (!campfireLit) {
      if (playerToFire < 12.0) {
         // 1. If you are close to the fire, this is the most important instruction.
         model.add(clay.text("[ STRIKE MATCH TO LIGHT FIRE (RIGHT CLICK 3 TIMES)]"))
              .move(firePosNow[0] - 0.8, 1.2, firePosNow[2])
              .turnY(-worldYaw)
              .scale(2.5)
              .color(1.0, 0.7, 0.2);
              
      } else if (!mapTaken) {
         // 2. If far from fire and map is still on the pedestal, show map prompt.
         // (Added a check for elapsed >= 8 so it doesn't show immediately at start)
         if (elapsed >= 8) {
            model.add(clay.text("[ AIM AND PRESS RIGHT TRIGGER ]"))
                 .move(mapGiftPosNow[0] - 0.45, mapGiftPosNow[1] + 0.28, mapGiftPosNow[2])
                 .turnY(-worldYaw) // Keep it parallel to the map
                 .scale(1.8)
                 .color(0.95, 0.85, 0.42);
         }
              
      } else {
         // 3. If far from fire and you ALREADY HAVE the map, show how to use the HUD.
         model.add(clay.text("[ RIGHT CLICK TO OPEN/CLOSE MAP ]"))
              .move(-0.9, 2.05, -1.5) 
              .turnY(0.45)            
              .scale(1.5)
              .color(0.72, 0.82, 0.95);
      }
   }
   // Once campfireLit is true, all the above hints disappear automatically!s
};

// ─── Export: resetScene ──────────────────────────────────────────────────────
export const resetScene = () => {
   startTime          = 0;
   campfireLit        = false;
   fireStartTime      = 0;
   riftOpened         = false;
   modelsSwapped      = false;
   isInitialized      = false;
   worldBiome         = "snow";
   plantGrowthStartTime = 0;
   prevFrameTime      = 0;
   virtualPlayerX     = 0;
   virtualPlayerZ     = 0;
   virtualPlayerYaw   = 0;
   snapTurnReady      = true;
   mapTaken           = false;
   mapOpen            = false;
   mapTriggerLatch    = false;

   unloadAllChunks();

   if (monsterNode) {
      global.scene().removeNode(monsterNode);
      monsterNode = null;
   }

   console.log("[micro_world] Scene 2 reset — all chunks unloaded");
};
