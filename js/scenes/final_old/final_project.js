import * as cg from "../../render/core/cg.js";
import { loadSound, playSoundAtPosition } from "../../util/positional-audio.js";
import { loadStereoSound, playStereoAudio, stopStereoLoopingAudio } from "../../util/stereo-audio.js";
import * as act2 from "./micro_world.js";
import * as global from "../../global.js";
import { Gltf2Node } from "../../render/nodes/gltf2.js";
import { ControllerBeam } from "../../render/core/controllerInput.js";

// ─── 游戏阶段 ───────────────────────────────────────────
// "DARK"             → 全黑，等待玩家找到火柴
// "MATCH_HELD"       → 火柴在手，等待划火柴手势
// "LIGHTING"         → 点火成功，灯慢慢变亮
// "LIT"              → 第一幕完成，准备进入第二幕
// "MONSTER_EVENT"    → 小怪物出现并抢走火柴盒
// "QUEST_HUB"        → 玩家做选择：跟随或留下
// "PORTAL_TRANSITION"→ 传送门动画
// "ACT2"             → 进入微观世界
// "GAME_OVER_STAY"   → 玩家选择留下，灯灭结局

// ─── FIX #1: 用 window.sharedState 暴露 gamePhase ───────
// micro_world.js 需要能把游戏推进到 SCENE_3，
// 所以我们把 gamePhase 放进一个全局共享对象，而不是用 let。
window.sharedState = { gamePhase: "DARK" };

// 方便读写的本地别名（每次读/写都通过 window.sharedState.gamePhase）
const getPhase = () => window.sharedState.gamePhase;
const setPhase = (p) => { window.sharedState.gamePhase = p; };

// 玩家的选择和倒计时
let choiceMade = null;      // "FOLLOW" 或 "STAY"
let stayTimer = 10;         // 如果不跟，10秒后灯灭

export const init = async model => {

   // right controller 
   window.beamR = new ControllerBeam(model, 'right');
   window.rightClick = false;
   // Create the buttons ONCE
   window.followBtn = model.add('square');
   window.stayBtn = model.add('square');
   
   inputEvents.onPress = hand => { 
       if (hand === 'right') window.rightClick = true; 
   };

   // ─── 场景节点 ────────────────────────────────────────
   const matchBox      = model.add("cube");      // 火柴盒
   const matchBoxStrip = model.add("square");    // 火柴盒侧面擦火条
   const matchStick    = model.add("cube");      // 火柴（从盒中取出）
   const matchTip      = model.add("sphere");    // 火柴头（红色小球）
   const flameNode     = model.add("coneY");     // 火苗（点燃后出现）
   const floor         = model.add("square");
   const wallBack      = model.add("square");
   const table         = model.add("cube");
   const noteNode      = model.add("square");    // 纸条
   const holeNode      = model.add("square");    // 墙上的老鼠洞

   const lampNode = new Gltf2Node({ url: "../../media/models/Chandelier.glb" });
   lampNode.scale = [0.04, 0.04, 0.04]; 
   lampNode.translation = [0, 1.5, 0];
   global.scene().addNode(lampNode);

   const monsterNode = new Gltf2Node({ url: "../../media/models/cute_slime.glb" });
   monsterNode.scale = [0.2, 0.2, 0.2];
   monsterNode.translation = [0, -1, 0]; // 初始位置（在桌子底下）
   monsterNode.rotation = [0, 1, 0, 0];
   global.scene().addNode(monsterNode);
   const BASE_NODES = 12;

   // ─── 状态变量 ────────────────────────────────────────
   let igniteBuffer = null;
   await loadSound("media/sound/ignite.mp3", buffer => igniteBuffer = buffer);
   let bgmBuffer = null;
   await loadStereoSound("media/sound/bgm01.mp3", buffer => bgmBuffer = buffer);
   if (bgmBuffer)
      playStereoAudio(bgmBuffer);

   let lightLevel   = 0.0;   // 0 = 全黑，1.0 = 全亮
   const ROOM_Y_OFFSET = -0.05;  // 整个房间下移
   const ROOM_Z_OFFSET =  0.4;   // 整个房间向玩家移动

   let matchBoxPos   = [0.25, 0.9 + ROOM_Y_OFFSET, -0.55 + ROOM_Z_OFFSET];
   const notePos     = [0.2, 0.862 + ROOM_Y_OFFSET, -0.55 + ROOM_Z_OFFSET];
   let matchPos      = [...matchBoxPos];
   let matchHeld     = false;
   let matchHeldBy   = null;
   let matchBoxHeldBy = null;
   let matchDir      = [1, 0, 0];
   let flameLife     = 0.0;
   let noteRead      = false;

   const holePos        = [-0.8, 0.76 + ROOM_Y_OFFSET, -1.49 + ROOM_Z_OFFSET];
   const underTablePos  = [0.2,  0.3  + ROOM_Y_OFFSET, -0.6  + ROOM_Z_OFFSET];
   let monsterPos       = [...underTablePos];
   let monsterState     = "HIDDEN";
   let monsterSnatchTimer = 0.0;

   // 划火柴手势检测
   let prevHandX    = null;
   let swipeSpeed   = 0.0;
   const SWIPE_THRESHOLD = 1.8;

   // ─── 数据记录 ────────────────────────────────────────
   const eventLog = [];
   const logEvent = (type, hand, pos) =>
      eventLog.push({ t: model.time, type, hand, pos: [...(pos || [0,0,0])] });

   // ─── 半径常量 ────────────────────────────────────────
   const GRAB_RADIUS    = 0.18;
   const NEAR_RADIUS    = 0.32;
   const STRIKE_RADIUS  = 0.14;
   const MATCH_LENGTH   = 0.09;
   const MATCH_TIP_OFFSET  = MATCH_LENGTH + 0.005;
   const MATCH_THICKNESS   = 0.006;
   const MATCH_TILT        = -Math.PI / 6;
   const tipOffset2D = () => ([
      -MATCH_TIP_OFFSET * Math.cos(MATCH_TILT),
      -MATCH_TIP_OFFSET * Math.sin(MATCH_TILT),
   ]);

   // ─── GAME_OVER_STAY 专用变量 ─────────────────────────
   let gameOverTimer = 0.0;   // 灯从亮到灭的倒计时累加器
   const GAME_OVER_FADE_DURATION = 4.0; // 灯光渐灭用多少秒

   model.animate(() => {
      // HUD 清理多余动态节点
      while (model.nChildren() > BASE_NODES)
         model.remove(BASE_NODES);

      const t  = model.time;
      const dt = model.deltaTime;

      // 每帧从共享对象读取阶段，方便统一判断
      const gamePhase = getPhase();

      const leftHand     = clientState.finger(clientID, "left",  1);
      const rightHand    = clientState.finger(clientID, "right", 1);
      const leftHandMat  = clientState.hand(clientID, "left");
      const rightHandMat = clientState.hand(clientID, "right");
      const pinchLeft    = clientState.pinch(clientID, "left",  1);
      const pinchRight   = clientState.pinch(clientID, "right", 1);

      const hands = [
         { pos: leftHand,  side: "left",  pinch: pinchLeft  },
         { pos: rightHand, side: "right", pinch: pinchRight },
      ];

      // ══════════════════════════════════════════════════
      // 阶段八：ACT2 — 完全交给 micro_world 处理
      // ══════════════════════════════════════════════════
      if (gamePhase === "ACT2") {
         act2.render(model, t, hands);
         return;
      }

      // ══════════════════════════════════════════════════
      // 让火柴盒可抓取：若手上有盒子则跟随，否则保持原位
      // ══════════════════════════════════════════════════
      if (matchBoxHeldBy) {
         if (matchBoxHeldBy === "monster") {
            // 位置由怪物逻辑控制
         } else {
            const boxPos   = matchBoxHeldBy === "left" ? leftHand  : rightHand;
            const boxPinch = matchBoxHeldBy === "left" ? pinchLeft : pinchRight;
            if (Array.isArray(boxPos) && boxPinch) {
               matchBoxPos = [boxPos[0], boxPos[1], boxPos[2]];
            } else {
               matchBoxHeldBy = null;
            }
         }
      }

      // 保证同一只手不会同时持有火柴与火柴盒
      if (matchHeldBy && matchBoxHeldBy && matchHeldBy === matchBoxHeldBy)
         matchBoxHeldBy = null;

      // ══════════════════════════════════════════════════
      // 阶段一：DARK — 找火柴盒
      // ══════════════════════════════════════════════════
      if (gamePhase === "DARK") {
         flameNode.identity().scale(0);
         matchTip.identity().scale(0);

         let nearMatch = false;

         for (const { pos: hPos, side, pinch } of hands) {
            if (!Array.isArray(hPos)) continue;
            const dist = cg.distance(hPos, matchBoxPos);

            if (dist < GRAB_RADIUS && pinch) {
               matchHeld   = true;
               matchHeldBy = side;
               prevHandX   = hPos[0];
               matchPos[0] = hPos[0];
               matchPos[1] = hPos[1];
               matchPos[2] = hPos[2];
               setPhase("MATCH_HELD");
               logEvent("match_grabbed", side, matchBoxPos);
               break;
            }
            if (dist < NEAR_RADIUS) nearMatch = true;
         }

         const nearGlow = nearMatch ? (0.15 + 0.1 * Math.sin(10 * t)) : 0.03;
         {
            const boxMat = matchBoxHeldBy === "left" ? leftHandMat :
                           matchBoxHeldBy === "right" ? rightHandMat : null;
            if (boxMat)
               matchBox.identity().setMatrix(boxMat).scale(0.06, 0.03, 0.1)
                       .color(nearGlow * 2.5, nearGlow * 1.8, nearGlow * 0.6);
            else
               matchBox.identity().move(matchBoxPos).scale(0.06, 0.03, 0.1)
                       .color(nearGlow * 2.5, nearGlow * 1.8, nearGlow * 0.6);
         }
         {
            const stripColor = [0.55 * nearGlow, 0.15 * nearGlow, 0.08 * nearGlow];
            const boxMat = matchBoxHeldBy === "left" ? leftHandMat :
                           matchBoxHeldBy === "right" ? rightHandMat : null;
            if (boxMat)
               matchBoxStrip.identity().setMatrix(boxMat).move(0.061, 0, 0).turnY(Math.PI / 2)
                            .scale(0.1, 0.03, 1).color(...stripColor);
            else
               matchBoxStrip.identity()
                            .move(matchBoxPos[0] + 0.061, matchBoxPos[1], matchBoxPos[2])
                            .turnY(Math.PI / 2).scale(0.1, 0.03, 1).color(...stripColor);
         }
         matchStick.identity().scale(0);
      }

      // ══════════════════════════════════════════════════
      // 阶段二：MATCH_HELD — 检测划火柴手势
      // ══════════════════════════════════════════════════
      if (gamePhase === "MATCH_HELD") {
         flameNode.identity().scale(0);

         const hPos       = matchHeldBy === "left" ? leftHand  : rightHand;
         const isPinching = matchHeldBy === "left" ? pinchLeft : pinchRight;

         if (!Array.isArray(hPos) || !isPinching) {
            matchHeld   = false;
            matchHeldBy = null;
            setPhase("DARK");
         } else {
            matchPos[0] = hPos[0];
            matchPos[1] = hPos[1];
            matchPos[2] = hPos[2];
            const hMat = matchHeldBy === "left" ? leftHandMat : rightHandMat;
            if (hMat) {
               const d = cg.normalize([hMat[0], hMat[1], hMat[2]]);
               if (d) matchDir = d;
            }

            if (prevHandX !== null) {
               swipeSpeed = Math.abs(hPos[0] - prevHandX) / dt;
            }
            prevHandX = hPos[0];

            const nearBox = cg.distance(matchPos, matchBoxPos) < STRIKE_RADIUS;
            if (swipeSpeed > SWIPE_THRESHOLD && nearBox) {
               setPhase("LIGHTING");
               flameLife = 1.0;
               logEvent("match_struck", matchHeldBy, matchPos);
               if (igniteBuffer) {
                  playSoundAtPosition(igniteBuffer, matchPos, 3.0);
                  setTimeout(() => playSoundAtPosition(igniteBuffer, matchPos), 30);
               }
            }
         }

         if (!matchBoxHeldBy) {
            for (const { pos: bPos, side, pinch } of hands) {
               if (side === matchHeldBy) continue;
               if (!Array.isArray(bPos) || !pinch) continue;
               if (cg.distance(bPos, matchBoxPos) < GRAB_RADIUS) {
                  matchBoxHeldBy = side;
                  matchBoxPos = [bPos[0], bPos[1], bPos[2]];
                  break;
               }
            }
         }

         {
            const boxMat = matchBoxHeldBy === "left" ? leftHandMat :
                           matchBoxHeldBy === "right" ? rightHandMat : null;
            if (boxMat)
               matchBox.identity().setMatrix(boxMat).scale(0.06, 0.03, 0.1)
                       .color(0.6, 0.35, 0.1);
            else
               matchBox.identity().move(matchBoxPos).scale(0.06, 0.03, 0.1)
                       .color(0.6, 0.35, 0.1);
         }
         {
            const stripR = 0.55 + 0.15 * Math.sin(6 * t);
            const stripColor = [stripR, 0.15, 0.08];
            const boxMat = matchBoxHeldBy === "left" ? leftHandMat :
                           matchBoxHeldBy === "right" ? rightHandMat : null;
            if (boxMat)
               matchBoxStrip.identity().setMatrix(boxMat).move(0.061, 0, 0).turnY(Math.PI / 2)
                            .scale(0.1, 0.03, 1).color(...stripColor);
            else
               matchBoxStrip.identity()
                            .move(matchBoxPos[0] + 0.061, matchBoxPos[1], matchBoxPos[2])
                            .turnY(Math.PI / 2).scale(0.1, 0.03, 1).color(...stripColor);
         }
         {
            const hMat = matchHeldBy === "left" ? leftHandMat : rightHandMat;
            if (hMat)
               matchStick.identity().setMatrix(hMat).turnZ(MATCH_TILT)
                         .scale(MATCH_LENGTH, MATCH_THICKNESS, MATCH_THICKNESS)
                         .color(0.85, 0.75, 0.55);
            else
               matchStick.identity().move(matchPos).turnZ(MATCH_TILT)
                         .scale(MATCH_LENGTH, MATCH_THICKNESS, MATCH_THICKNESS)
                         .color(0.85, 0.75, 0.55);
         }
         {
            const hMat = matchHeldBy === "left" ? leftHandMat : rightHandMat;
            if (hMat)
               matchTip.identity().setMatrix(hMat).turnZ(MATCH_TILT)
                       .move(-MATCH_TIP_OFFSET, 0, 0).scale(0.010)
                       .color(0.8, 0.12, 0.06);
            else {
               const [ox, oy] = tipOffset2D();
               matchTip.identity()
                       .move(matchPos[0] + ox, matchPos[1] + oy, matchPos[2])
                       .scale(0.010)
                       .color(0.8, 0.12, 0.06);
            }
         }
      }

      // ══════════════════════════════════════════════════
      // 阶段三：LIGHTING — 灯慢慢变亮
      // ══════════════════════════════════════════════════
      if (gamePhase === "LIGHTING") {
         const hPos       = matchHeldBy === "left" ? leftHand  : rightHand;
         const isPinching = matchHeldBy === "left" ? pinchLeft : pinchRight;
         const hMat       = matchHeldBy === "left" ? leftHandMat : rightHandMat;
         if (Array.isArray(hPos) && isPinching) {
            matchPos[0] = hPos[0];
            matchPos[1] = hPos[1];
            matchPos[2] = hPos[2];
            if (hMat) {
               const d = cg.normalize([hMat[0], hMat[1], hMat[2]]);
               if (d) matchDir = d;
            }
         } else {
            matchHeld   = false;
            matchHeldBy = null;
         }

         flameLife  -= dt * 0.18;
         flameLife   = Math.max(flameLife, 0);
         lightLevel += dt * 0.22;

         if (lightLevel >= 1.0) {
            lightLevel = 1.0;
            setPhase("LIT");
            logEvent("room_lit", null, [0,0,0]);
         }

         const flameFlicker = flameLife * (0.8 + 0.2 * Math.sin(30 * t));
         if (hMat)
            flameNode.identity()
                     .setMatrix(hMat)
                     .turnZ(MATCH_TILT + Math.PI / 2)
                     .move(0, MATCH_TIP_OFFSET * 1.1, 0)
                     .scale(0.015, 0.04 * flameFlicker, 0.015)
                     .color(1.0, 0.6 * flameFlicker, 0.05);
         else {
            const [ox, oy] = tipOffset2D();
            flameNode.identity()
                     .turnZ(Math.PI / 2)
                     .move(matchPos[0] + ox, matchPos[1] + oy, matchPos[2])
                     .scale(0.015, 0.04 * flameFlicker, 0.015)
                     .color(1.0, 0.6 * flameFlicker, 0.05);
         }

         if (!matchBoxHeldBy) {
            for (const { pos: bPos, side, pinch } of hands) {
               if (side === matchHeldBy) continue;
               if (!Array.isArray(bPos) || !pinch) continue;
               if (cg.distance(bPos, matchBoxPos) < GRAB_RADIUS) {
                  matchBoxHeldBy = side;
                  matchBoxPos = [bPos[0], bPos[1], bPos[2]];
                  break;
               }
            }
         }

         {
            const boxMat = matchBoxHeldBy === "left" ? leftHandMat :
                           matchBoxHeldBy === "right" ? rightHandMat : null;
            if (boxMat)
               matchBox.identity().setMatrix(boxMat).scale(0.06, 0.03, 0.1)
                       .color(0.8, 0.45, 0.1);
            else
               matchBox.identity().move(matchBoxPos).scale(0.06, 0.03, 0.1)
                       .color(0.8, 0.45, 0.1);
         }
         {
            const stripColor = [0.55, 0.15, 0.08];
            const boxMat = matchBoxHeldBy === "left" ? leftHandMat :
                           matchBoxHeldBy === "right" ? rightHandMat : null;
            if (boxMat)
               matchBoxStrip.identity().setMatrix(boxMat).move(0.061, 0, 0).turnY(Math.PI / 2)
                            .scale(0.1, 0.03, 1).color(...stripColor);
            else
               matchBoxStrip.identity()
                            .move(matchBoxPos[0] + 0.061, matchBoxPos[1], matchBoxPos[2])
                            .turnY(Math.PI / 2).scale(0.1, 0.03, 1).color(...stripColor);
         }
         {
            const hMatR = matchHeldBy === "left" ? leftHandMat : rightHandMat;
            if (hMatR)
               matchStick.identity().setMatrix(hMatR).turnZ(MATCH_TILT)
                         .scale(MATCH_LENGTH, MATCH_THICKNESS, MATCH_THICKNESS)
                         .color(0.9, 0.8, 0.6);
            else
               matchStick.identity().move(matchPos).turnZ(MATCH_TILT)
                         .scale(MATCH_LENGTH, MATCH_THICKNESS, MATCH_THICKNESS)
                         .color(0.9, 0.8, 0.6);
         }
         {
            const hMatR = matchHeldBy === "left" ? leftHandMat : rightHandMat;
            if (hMatR)
               matchTip.identity().setMatrix(hMatR).turnZ(MATCH_TILT)
                       .move(-MATCH_TIP_OFFSET, 0, 0).scale(0.010)
                       .color(0.9, 0.18, 0.08);
            else {
               const [ox, oy] = tipOffset2D();
               matchTip.identity()
                       .move(matchPos[0] + ox, matchPos[1] + oy, matchPos[2])
                       .scale(0.010)
                       .color(0.9, 0.18, 0.08);
            }
         }
      }

      // ══════════════════════════════════════════════════
      // 阶段四：LIT — 第一幕结束
      // ══════════════════════════════════════════════════
      if (gamePhase === "LIT") {
         let grabbed = false;
         for (const { pos: hPos, side, pinch } of hands) {
            if (side === matchBoxHeldBy) continue;
            if (!Array.isArray(hPos)) continue;
            const dist = cg.distance(hPos, matchPos);
            if (dist < GRAB_RADIUS && pinch) {
               matchHeld   = true;
               matchHeldBy = side;
               matchPos[0] = hPos[0];
               matchPos[1] = hPos[1];
               matchPos[2] = hPos[2];
               const hMat = side === "left" ? leftHandMat : rightHandMat;
               if (hMat) {
                  const d = cg.normalize([hMat[0], hMat[1], hMat[2]]);
                  if (d) matchDir = d;
               }
               grabbed = true;
               break;
            }
         }
         if (!grabbed) {
            matchHeld   = false;
            matchHeldBy = null;
         }

         if (!matchBoxHeldBy) {
            for (const { pos: bPos, side, pinch } of hands) {
               if (side === matchHeldBy) continue;
               if (!Array.isArray(bPos) || !pinch) continue;
               if (cg.distance(bPos, matchBoxPos) < GRAB_RADIUS) {
                  matchBoxHeldBy = side;
                  matchBoxPos = [bPos[0], bPos[1], bPos[2]];
                  break;
               }
            }
         }

         {
            const boxMat = matchBoxHeldBy === "left" ? leftHandMat :
                           matchBoxHeldBy === "right" ? rightHandMat : null;
            if (boxMat)
               matchBox.identity().setMatrix(boxMat).scale(0.06, 0.03, 0.1)
                       .color(0.55 * lightLevel, 0.38 * lightLevel, 0.18 * lightLevel);
            else
               matchBox.identity().move(matchBoxPos).scale(0.06, 0.03, 0.1)
                       .color(0.55 * lightLevel, 0.38 * lightLevel, 0.18 * lightLevel);
         }
         {
            const stripColor = [0.55 * lightLevel, 0.15 * lightLevel, 0.08 * lightLevel];
            const boxMat = matchBoxHeldBy === "left" ? leftHandMat :
                           matchBoxHeldBy === "right" ? rightHandMat : null;
            if (boxMat)
               matchBoxStrip.identity().setMatrix(boxMat).move(0.061, 0, 0).turnY(Math.PI / 2)
                            .scale(0.1, 0.03, 1).color(...stripColor);
            else
               matchBoxStrip.identity()
                            .move(matchBoxPos[0] + 0.061, matchBoxPos[1], matchBoxPos[2])
                            .turnY(Math.PI / 2).scale(0.1, 0.03, 1).color(...stripColor);
         }
         {
            const hMat = matchHeldBy === "left" ? leftHandMat : rightHandMat;
            if (hMat && matchHeld)
               matchStick.identity().setMatrix(hMat).turnZ(MATCH_TILT)
                         .scale(MATCH_LENGTH, MATCH_THICKNESS, MATCH_THICKNESS)
                         .color(0.7 * lightLevel, 0.6 * lightLevel, 0.4 * lightLevel);
            else
               matchStick.identity().move(matchPos).turnZ(MATCH_TILT)
                         .scale(MATCH_LENGTH, MATCH_THICKNESS, MATCH_THICKNESS)
                         .color(0.7 * lightLevel, 0.6 * lightLevel, 0.4 * lightLevel);
         }
         {
            const hMat = matchHeldBy === "left" ? leftHandMat : rightHandMat;
            if (hMat && matchHeld)
               matchTip.identity().setMatrix(hMat).turnZ(MATCH_TILT)
                       .move(-MATCH_TIP_OFFSET, 0, 0).scale(0.010)
                       .color(0.8 * lightLevel, 0.12 * lightLevel, 0.06 * lightLevel);
            else {
               const [ox, oy] = tipOffset2D();
               matchTip.identity()
                       .move(matchPos[0] + ox, matchPos[1] + oy, matchPos[2])
                       .scale(0.010)
                       .color(0.8 * lightLevel, 0.12 * lightLevel, 0.06 * lightLevel);
            }
         }
         flameNode.identity().scale(0);

         // ─── FIX #3: 降低低头触发阈值 ────────────────
         // 原始阈值 0.0 + ROOM_Y_OFFSET = -0.05m，玩家几乎不可能触发。
         // 改为 0.9m（站立时头部高度约 1.6m，弯腰低头时约 1.0–1.1m）。
         const headHeight = clientState.head ? clientState.head(clientID)[1] :
                            (Array.isArray(leftHand) ? leftHand[1] : 1.5);

         if (noteRead && headHeight < 0.9) {
            monsterState = "REVEALED";
            setPhase("MONSTER_EVENT");
            logEvent("monster_revealed", null, monsterPos);
         }
      }

      // ══════════════════════════════════════════════════
      // 阶段五：MONSTER_EVENT — 现身、对视与抢夺
      // ══════════════════════════════════════════════════
      if (gamePhase === "MONSTER_EVENT") {
         
         if (monsterState === "REVEALED") {
            monsterSnatchTimer += dt;
            if (monsterSnatchTimer > 1.0) {
               monsterState = "JUMP_TO_TABLE";
               monsterSnatchTimer = 0.0;
            }
         } 
         else if (monsterState === "JUMP_TO_TABLE") {
            const targetPos = [matchBoxPos[0] + 0.15, matchBoxPos[1], matchBoxPos[2]];
            const speed = 2.0;
            const dx = targetPos[0] - monsterPos[0];
            const dy = targetPos[1] - monsterPos[1];
            const dz = targetPos[2] - monsterPos[2];
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (dist > 0.05) {
               monsterPos[0] += (dx / dist) * speed * dt;
               monsterPos[1] += (dy / dist) * speed * dt;
               monsterPos[2] += (dz / dist) * speed * dt;
            } else {
               monsterState = "TAUNTING";
            }
         } 
         else if (monsterState === "TAUNTING") {
            monsterSnatchTimer += dt;
            if (monsterSnatchTimer > 1.5) {
               monsterState = "SNATCHING";
            }
         }
         else if (monsterState === "SNATCHING") {
            const speed = 2.0; 
            const dx = matchBoxPos[0] - monsterPos[0];
            const dy = matchBoxPos[1] - monsterPos[1];
            const dz = matchBoxPos[2] - monsterPos[2];
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (dist > 0.05) {
               monsterPos[0] += (dx / dist) * speed * dt;
               monsterPos[1] += (dy / dist) * speed * dt;
               monsterPos[2] += (dz / dist) * speed * dt;
            } else {
               matchBoxHeldBy = "monster"; 
               monsterState   = "ESCAPING";
            }
         } 
         else if (monsterState === "ESCAPING") {
            matchBoxPos[0] = monsterPos[0];
            matchBoxPos[1] = monsterPos[1] + 0.05;
            matchBoxPos[2] = monsterPos[2];

            const speed = 2.5;
            const dx = holePos[0] - monsterPos[0];
            const dy = holePos[1] - monsterPos[1];
            const dz = holePos[2] - monsterPos[2];
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (dist > 0.2) {
               monsterPos[0] += (dx / dist) * speed * dt;
               monsterPos[1] += (dy / dist) * speed * dt;
               monsterPos[2] += (dz / dist) * speed * dt;
            } else {
               monsterState   = "IDLE_NPC";
               setPhase("QUEST_HUB");
               matchBoxHeldBy = null;
               logEvent("entered_quest_hub", null, holePos);
            }
         }

         if (matchBoxHeldBy === "monster") {
            matchBox.identity().move(matchBoxPos).scale(0.06, 0.03, 0.1)
                    .color(0.55 * lightLevel, 0.38 * lightLevel, 0.18 * lightLevel);
            matchBoxStrip.identity()
                    .move(matchBoxPos[0] + 0.061, matchBoxPos[1], matchBoxPos[2])
                    .turnY(Math.PI / 2).scale(0.1, 0.03, 1)
                    .color(0.55 * lightLevel, 0.15 * lightLevel, 0.08 * lightLevel);
         } else {
            matchBox.identity().move(matchBoxPos).scale(0.06, 0.03, 0.1)
                    .color(0.55 * lightLevel, 0.38 * lightLevel, 0.18 * lightLevel);
            matchBoxStrip.identity()
                    .move(matchBoxPos[0] + 0.061, matchBoxPos[1], matchBoxPos[2])
                    .turnY(Math.PI / 2).scale(0.1, 0.03, 1)
                    .color(0.55 * lightLevel, 0.15 * lightLevel, 0.08 * lightLevel);
         }
      }

      // ══════════════════════════════════════════════════
      // 阶段六：QUEST_HUB — 任务选择
      // ══════════════════════════════════════════════════
      if (gamePhase === "QUEST_HUB") {
         // ─── FIX #2: 统一按钮位置 ─────────────────────
         // 原来碰撞检测和文字标签各自定义了不同的 uiPos，导致视觉与交互偏移。
         // 现在只定义一套坐标，碰撞检测、按钮几何体、文字标签全部用同一套。
         const uiPos        = [0.12, 1.3, -0.6];
         const titlePos     = [uiPos[0] - 0.08, uiPos[1] + 0.04, uiPos[2] + 0.01];
         const followBtnPos = [uiPos[0] - 0.15, uiPos[1] - 0.04, uiPos[2]];
         const stayBtnPos   = [uiPos[0] + 0.15, uiPos[1] - 0.04, uiPos[2]];

         // 定位可交互按钮方块（供 hitRect 检测用）
         window.followBtn.identity().move(...followBtnPos).scale(0.06, 0.03, 0.01);
         window.stayBtn.identity().move(...stayBtnPos).scale(0.06, 0.03, 0.01);

         window.beamR.update();

         let isPointingFollow = false;
         let isPointingStay   = false;
         let isSelecting      = false;

         if (window.beamR.hitRect(window.followBtn.getGlobalMatrix())) {
            isPointingFollow = true;
            window.followBtn.color(0.8, 0.8, 1);
         } else {
            window.followBtn.color(0.2, 0.5, 0.2);
         }

         if (window.beamR.hitRect(window.stayBtn.getGlobalMatrix())) {
            isPointingStay = true;
            window.stayBtn.color(1, 0.8, 0.8);
         } else {
            window.stayBtn.color(0.5, 0.2, 0.2);
         }

         // 近身手部判定（手追踪 fallback）
         let isNearFollow = false;
         let isNearStay   = false;
         for (const { pos: hPos, pinch } of hands) {
            if (!Array.isArray(hPos)) continue;
            if (cg.distance(hPos, followBtnPos) < 0.12) { isNearFollow = true; if (pinch) isSelecting = true; }
            if (cg.distance(hPos, stayBtnPos)   < 0.12) { isNearStay   = true; if (pinch) isSelecting = true; }
         }
         for (const { pinch, pressed } of hands) {
            if (pinch || pressed) isSelecting = true;
         }

         if (isSelecting) {
            if (isPointingFollow || isNearFollow) {
               choiceMade     = "FOLLOW";
               setPhase("PORTAL_TRANSITION");
               window.portalStartTime = t;
               monsterState   = "HIDDEN";
               matchHeld      = false;
               matchHeldBy    = null;
               matchBoxHeldBy = null;
            } else if (isPointingStay || isNearStay) {
               choiceMade = "STAY";
               setPhase("GAME_OVER_STAY");
               gameOverTimer = 0.0;
            }
         }

         // 文字标签对齐按钮坐标
         model.add("cube")
              .move(uiPos[0], uiPos[1], uiPos[2] - 0.01)
              .scale(0.38, 0.15, 0.005)
              .color(1, 1, 1, 0.1);

         model.add(clay.text("Follow the little thief?"))
              .move(...titlePos).scale(0.7).color(0, 0, 0);

         model.add(clay.text("[ YES ]"))
              .move(...followBtnPos).scale(0.5)
              .color(isPointingFollow || isNearFollow ? [0, 0.6, 0] : [0.3, 0.3, 0.3]);

         model.add(clay.text("[ NO ]"))
              .move(...stayBtnPos).scale(0.5)
              .color(isPointingStay || isNearStay ? [0.8, 0, 0] : [0.3, 0.3, 0.3]);

      } else {
         if (window.followBtn) window.followBtn.identity().scale(0);
         if (window.stayBtn)   window.stayBtn.identity().scale(0);
      }

      // ══════════════════════════════════════════════════
      // FIX #4：阶段 GAME_OVER_STAY — 留下时的结局
      // ══════════════════════════════════════════════════
      if (gamePhase === "GAME_OVER_STAY") {
         gameOverTimer += dt;
         const fadeProgress = Math.min(gameOverTimer / GAME_OVER_FADE_DURATION, 1.0);

         // 灯光渐灭
         lightLevel = 1.0 - fadeProgress;

         // 全屏遮罩：随灯光变暗越来越浓
         if (fadeProgress > 0.1) {
            model.add("cube")
                 .move(0, ROOM_Y_OFFSET, ROOM_Z_OFFSET)
                 .scale(10)
                 .color(0, 0, 0);
         }

         // 屏幕中央文字
         const alpha = Math.min(fadeProgress * 2, 1.0);
         if (alpha > 0.1) {
            model.add(clay.text("You chose to stay."))
                 .move(-0.25, 1.5, -0.8)
                 .scale(1.2)
                 .color(alpha * 0.8, alpha * 0.7, alpha * 0.6);

            if (fadeProgress > 0.6) {
               model.add(clay.text("The light fades."))
                    .move(-0.18, 1.35, -0.8)
                    .scale(1.0)
                    .color(alpha * 0.5, alpha * 0.4, alpha * 0.4);
            }
         }
      }

      // ══════════════════════════════════════════════════
      // 阶段七：PORTAL_TRANSITION — 传送门动画
      // ══════════════════════════════════════════════════
      if (gamePhase === "PORTAL_TRANSITION") {
         let pTime    = t - window.portalStartTime;
         let duration = 5.0;
         let progress = pTime / duration;

         let isDarkFlicker = Math.sin(t * 20 * progress) < 0;
         if (isDarkFlicker) {
            model.add("cube")
                 .move(0, ROOM_Y_OFFSET, ROOM_Z_OFFSET)
                 .scale(10)
                 .color(0, 0, 0);
         }

         for (let i = 0; i < 5; i++) {
            let spin       = t * (1 + i);
            let layerScale = 0.15 + Math.sin(t * 2 + i) * 0.05;
            if (progress > 0.8) layerScale += (progress - 0.8) * 50;

            model.add("square")
                 .move(holePos[0], holePos[1], holePos[2] + 0.01 + i * 0.001)
                 .turnZ(spin)
                 .scale(layerScale)
                 .color(0.1, 0.6 + i * 0.1, 1.0);
         }

         for (let i = 0; i < 8; i++) {
            let pOffset = ((t * 2 + i * 0.5) % 2);
            model.add("sphere")
                 .move(holePos[0] * (1 - pOffset), 1.5, holePos[2] * (1 - pOffset))
                 .scale(0.01)
                 .color(0.5, 0.8, 1);
         }

         let shake = (Math.random() - 0.5) * 0.02 * progress;
         model.add(clay.text("ACT II : THE MICRO-WORLD"))
              .move(shake, 1.5 + shake, -0.8)
              .scale(1.5 + progress * 0.05)
              .color(0, 0, 0);

         if (pTime > duration) {
            setPhase("ACT2");
            act2.resetScene(); // 通知 micro_world 重置状态，避免遗留帧数据
            while (model.nChildren() > 0) model.remove(0);
         }
      }

      // ══════════════════════════════════════════════════
      // 场景渲染 — 所有颜色乘以 lightLevel
      // ══════════════════════════════════════════════════
      const l = lightLevel;

      floor.identity()
           .move(0, 0.2 + ROOM_Y_OFFSET, -1.5 + ROOM_Z_OFFSET)
           .turnX(-Math.PI / 2).scale(3.0, 3.0, 1)
           .color(0.12 * l, 0.09 * l, 0.07 * l);

      wallBack.identity()
              .move(0, 1.8 + ROOM_Y_OFFSET, -2 + ROOM_Z_OFFSET)
              .scale(3.5, 2, 1)
              .color(0.15 * l, 0.11 * l, 0.09 * l);

      table.identity()
           .move(0.2, 0.8 + ROOM_Y_OFFSET, -0.6 + ROOM_Z_OFFSET)
           .scale(0.5, 0.06, 0.35)
           .color(0.28 * l, 0.18 * l, 0.1 * l);

      noteNode.identity()
              .move(...notePos)
              .turnX(-Math.PI / 2)
              .scale(0.08, 0.06, 1)
              .color(0.9 * l, 0.85 * l, 0.7 * l);

      if (l > 0.5 && !noteRead) {
         for (const { pos: hPos } of hands) {
            if (!Array.isArray(hPos)) continue;
            if (cg.distance(hPos, notePos) < GRAB_RADIUS) {
               noteRead = true;
               logEvent("note_read", null, notePos);
               break;
            }
         }
      }

      holeNode.identity()
              .move(...holePos)
              .scale(0.12, 0.15, 1)
              .color(0.02 * l, 0.01 * l, 0.01 * l);

      // 渲染小捣蛋鬼
      if (monsterState !== "HIDDEN" && monsterState !== "IDLE_NPC") {
         const bounce = 0.06 * Math.abs(Math.sin(15 * t));
         monsterNode.matrix = cg.mMultiply(
            cg.mTranslate(monsterPos[0], monsterPos[1] + bounce, monsterPos[2]),
            cg.mMultiply(
               cg.mRotateY(Math.PI),
               cg.mScale(0.2, 0.2, 0.2)
            )
         );
      } else {
         monsterNode.matrix = cg.mScale(0, 0, 0);
         if (gamePhase === "QUEST_HUB") {
            matchBox.identity().scale(0);
            matchBoxStrip.identity().scale(0);
            global.scene().removeNode(lampNode);
         }
      }

      // Hint 文字
      const hint =
         gamePhase === "DARK"             ? "FIND SOMETHING IN THE DARK..." :
         gamePhase === "MATCH_HELD"       ? "STRIKE THE MATCH — SWIPE FAST" :
         gamePhase === "LIGHTING"         ? "..."                           :
         gamePhase === "LIT"              ? (noteRead ? "WHO WROTE THIS...?" : "ACT I COMPLETE") :
         gamePhase === "MONSTER_EVENT"    ? "HEY! MY MATCHBOX!"             :
         gamePhase === "QUEST_HUB"        ? "TALK TO THE LITTLE THIEF..."   :
         gamePhase === "GAME_OVER_STAY"   ? ""                              : "";

      const hintColor =
         gamePhase === "DARK"         ? [0.4, 0.4, 0.5] :
         gamePhase === "MATCH_HELD"   ? [0.9, 0.7, 0.3] :
         gamePhase === "LIGHTING"     ? [1.0, 0.8, 0.4] :
                                        [0.5, 1.0, 0.7];

      if (hint) {
         model.add(clay.text(hint))
              .move(-0.8, 2 + ROOM_Y_OFFSET, -1.8 + ROOM_Z_OFFSET).scale(1.2)
              .color(...hintColor);
      }

      model.add(clay.text("EVENTS: " + eventLog.length))
           .move(-0.8, 1.8 + ROOM_Y_OFFSET, -1.8 + ROOM_Z_OFFSET).scale(0.85)
           .color(0.5, 0.5, 0.7);

      if (l > 0.2) {
         model.add(clay.text("You are not alone."))
              .move(notePos[0] - 0.03, notePos[1] + 0.001, notePos[2])
              .turnX(-Math.PI / 2)
              .scale(0.4)
              .color(0.08 * l, 0.06 * l, 0.04 * l);

         if (noteRead) {
            model.add(clay.text("CHECK UNDER THE TABLE."))
                 .move(notePos[0] - 0.03, notePos[1] + 0.001, notePos[2] + 0.02)
                 .turnX(-Math.PI / 2).scale(0.4)
                 .color(0.6 * l, 0.3 * l, 0.1 * l);
         }
      }
   });
};

export const deinit = () => {
   stopStereoLoopingAudio();
};
