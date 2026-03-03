import * as cg from "../render/core/cg.js";
import { loadSound, playSoundAtPosition } from "../util/positional-audio.js";

const TARGET_COUNT = 36;
const TRAIL_COUNT = 24;
const STRIKE_Z = -0.55;
const DESPAWN_Z = -0.15;
const SPAWN_Z = -5.6;

const lanes = [-1.0, -0.35, 0.35, 1.0];
const heights = [1.15, 1.5, 1.85];

const leftColor = [0.22, 0.9, 1.0];
const rightColor = [1.0, 0.35, 0.25];
const neutralColor = [0.95, 0.9, 0.35];
const pulseColor = [0.2, 0.9, 0.5];

let soundBuffer = [], loadSounds = [];
for (let i = 0; i < 6; i++)
   loadSounds.push(loadSound("../../media/sound/bounce/" + i + ".wav", buffer => soundBuffer[i] = buffer));
Promise.all(loadSounds);

const makeTarget = () => ({
   active: false,
   hand: "any",
   lane: 0,
   level: 1,
   spawnTime: 0,
   life: 0,
   speed: 0,
   hitFlash: 0,
   pos: [0, 1.5, SPAWN_Z],
});

const targetColor = hand => hand == "left" ? leftColor : hand == "right" ? rightColor : neutralColor;

const choosePattern = beat => {
   const phase = beat % 16;

   if (phase == 12 || phase == 13 || phase == 14)
      return { step: 0.23, count: 1, speed: 3.4, mode: "burst" };

   if (phase >= 8)
      return { step: 0.36, count: 1, speed: 3.0, mode: "cross" };

   return { step: 0.42, count: 1, speed: 2.7, mode: "flow" };
};

export const init = async model => {
   let beat = 0;
   let nextSpawnTime = 0;
   let combo = 0;
   let bestCombo = 0;
   let score = 0;
   let hits = 0;
   let misses = 0;
   let coachPulse = 0;

   let targets = [];
   let trails = [];

   for (let i = 0; i < TARGET_COUNT; i++) {
      targets.push(makeTarget());
      model.add("sphere");
   }

   for (let i = 0; i < TRAIL_COUNT; i++) {
      trails.push({ pos: [0, 1.5, -1], life: 0, color: [1, 1, 1] });
      model.add("sphere");
   }

   const leftGuide = model.add("ringZ");
   const rightGuide = model.add("ringZ");
   const pulseRing = model.add("ringY");

   const horizon = model.add("square");
   const floor = model.add("square");
   const leftPeak = model.add("coneY");
   const rightPeak = model.add("coneY");
   const moon = model.add("sphere");

   let addTrail = (pos, color) => {
      trails.unshift({ pos: [...pos], life: 1, color: [...color] });
      trails.pop();
   };

   let spawnTarget = (spawnAt, patternMode, speed) => {
      for (let i = 0; i < TARGET_COUNT; i++) {
         if (targets[i].active)
            continue;

         const lane = patternMode == "cross"
            ? (beat % 2 == 0 ? 0 : 3)
            : 4 * Math.random() >> 0;

         const level = patternMode == "burst"
            ? ((beat + i) % 3)
            : (3 * Math.random() >> 0);

         let hand = "any";
         if (lane < 2)
            hand = "left";
         if (lane > 1)
            hand = "right";
         if (patternMode == "flow" && beat % 4 == 3)
            hand = "any";

         targets[i].active = true;
         targets[i].hand = hand;
         targets[i].lane = lane;
         targets[i].level = level;
         targets[i].spawnTime = spawnAt;
         targets[i].life = 1;
         targets[i].speed = speed;
         targets[i].hitFlash = 0;
         targets[i].pos = [lanes[lane], heights[level], SPAWN_Z];
         return;
      }
   };

   let playHit = index => {
      if (soundBuffer.length == 0)
         return;
      playSoundAtPosition(soundBuffer[index % soundBuffer.length], targets[index].pos);
   };

   model.animate(() => {
      const t = model.time;
      const dt = model.deltaTime;
      const bpm = 132 + 16 * Math.sin(0.05 * t);
      const beatDuration = 60 / bpm;

      while (t >= nextSpawnTime) {
         const pattern = choosePattern(beat);
         for (let i = 0; i < pattern.count; i++)
            spawnTarget(nextSpawnTime + i * pattern.step, pattern.mode, pattern.speed);

         nextSpawnTime += beatDuration;
         beat++;
         coachPulse = 1;
      }

      const leftHand = clientState.finger(clientID, "left", 1);
      const rightHand = clientState.finger(clientID, "right", 1);

      if (Array.isArray(leftHand))
         addTrail(leftHand, leftColor);
      if (Array.isArray(rightHand))
         addTrail(rightHand, rightColor);

      coachPulse *= 0.93;

      for (let i = 0; i < TARGET_COUNT; i++) {
         const targetNode = model.child(i);
         const target = targets[i];

         if (!target.active) {
            targetNode.identity().scale(0);
            continue;
         }

         target.pos[2] += target.speed * dt;
         target.hitFlash *= 0.86;

         let gotHit = false;
         const hitRadius = 0.28;

         if (Array.isArray(leftHand) && target.hand != "right" && cg.distance(leftHand, target.pos) < hitRadius)
            gotHit = true;

         if (Array.isArray(rightHand) && target.hand != "left" && cg.distance(rightHand, target.pos) < hitRadius)
            gotHit = true;

         if (gotHit) {
            target.hitFlash = 1;
            target.active = false;
            combo++;
            hits++;
            score += 10 + combo;
            bestCombo = Math.max(bestCombo, combo);
            coachPulse = 1;
            playHit(i);
            continue;
         }

         if (target.pos[2] > DESPAWN_Z) {
            target.active = false;
            misses++;
            combo = 0;
            continue;
         }

         const c = targetColor(target.hand);
         const glow = 0.2 + 0.25 * Math.sin(14 * t + i);
         const depthScale = 1.05 + 0.8 * (target.pos[2] - STRIKE_Z) / (SPAWN_Z - STRIKE_Z);

         targetNode.identity()
            .move(target.pos)
            .scale(0.13 * depthScale)
            .color(c[0] + glow, c[1] + glow, c[2] + glow);
      }

      for (let i = 0; i < TRAIL_COUNT; i++) {
         const n = model.child(TARGET_COUNT + i);
         const tr = trails[i];
         tr.life *= 0.9;

         if (tr.life < 0.06) {
            n.identity().scale(0);
            continue;
         }

         n.identity().move(tr.pos).scale(0.04 * tr.life)
          .color(tr.color[0] * tr.life, tr.color[1] * tr.life, tr.color[2] * tr.life);
      }

      const leftGuidePos = Array.isArray(leftHand) ? leftHand : [-0.45, 1.4, -0.55];
      const rightGuidePos = Array.isArray(rightHand) ? rightHand : [0.45, 1.4, -0.55];

      leftGuide.identity().move(leftGuidePos).scale(0.1 + 0.03 * Math.sin(9 * t)).color(...leftColor);
      rightGuide.identity().move(rightGuidePos).scale(0.1 + 0.03 * Math.sin(9 * t + 1)).color(...rightColor);

      pulseRing.identity().move(0, 1.5, STRIKE_Z - 0.02)
         .turnY(2 * t)
         .scale(1.0 + 0.45 * coachPulse)
         .color(pulseColor[0], pulseColor[1], pulseColor[2]);

      horizon.identity().move(0, 2.0, -7.5).scale(9.5, 4.8, 1).color(0.06, 0.1, 0.2);
      floor.identity().move(0, 0.72, -2.8).turnX(-Math.PI / 2).scale(3.2, 3.2, 1).color(0.04, 0.06, 0.12);
      leftPeak.identity().move(-4.8, 0.8, -8.0).scale(1.8, 3.2, 1.8).color(0.08, 0.14, 0.2);
      rightPeak.identity().move(4.8, 0.82, -8.1).scale(2.1, 3.4, 2.1).color(0.09, 0.12, 0.22);
      moon.identity().move(2.4, 3.1, -7.0).scale(0.32).color(0.85, 0.95, 1.0);

      const total = hits + misses;
      const accuracy = total > 0 ? Math.floor(100 * hits / total) : 100;

      while (model.nChildren() > TARGET_COUNT + TRAIL_COUNT + 8)
         model.remove(TARGET_COUNT + TRAIL_COUNT + 8);

      model.add(clay.text("RHYTHM CARDIO")).move(-1.05, 2.52, -1.85).scale(1.95).color(0.9, 1.0, 1.0);
      model.add(clay.text("SCORE " + score)).move(-1.05, 2.30, -1.85).scale(1.2).color(0.85, 0.95, 1.0);
      model.add(clay.text("COMBO " + combo + "  BEST " + bestCombo)).move(-1.05, 2.13, -1.85).scale(1.08).color(1.0, 0.95, 0.5);
      model.add(clay.text("ACCURACY " + accuracy + "%"))
           .move(-1.05, 1.96, -1.85).scale(1.08).color(0.5, 1.0, 0.8);
      model.add(clay.text("STRIKE IN TIME WITH THE BEAT"))
           .move(-1.05, 1.73, -1.85).scale(0.92).color(0.65, 0.85, 1.0);
   });
};
