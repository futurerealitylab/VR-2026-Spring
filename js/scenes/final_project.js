import * as cg from "../render/core/cg.js";
import { loadSound, playSoundAtPosition } from "../util/positional-audio.js";
import { loadStereoSound, playStereoAudio, stopStereoLoopingAudio } from "../util/stereo-audio.js";
import * as act2 from "./micro_world.js";

// ─── 游戏阶段 ───────────────────────────────────────────
// "DARK"       → 全黑，等待玩家找到火柴
// "MATCH_HELD" → 火柴在手，等待划火柴手势
// "LIGHTING"   → 点火成功，灯慢慢变亮
// "LIT"        → 第一幕完成，准备进入第二幕
let gamePhase = "DARK";

// 玩家的选择和倒计时
let choiceMade = null;      // "FOLLOW" 或 "STAY"
let stayTimer = 10;         // 如果不跟，10秒后灯灭
let portalChoicePos = [0, 1.5, -0.8]; // 选项弹出的位置（玩家正前方）

export const init = async model => {

   // ─── 场景节点 ────────────────────────────────────────
   const matchBox  = model.add("cube");      // 火柴盒
   const matchBoxStrip = model.add("square"); // 火柴盒侧面擦火条
   const matchStick = model.add("cube");     // 火柴（从盒中取出）
   const matchTip  = model.add("sphere");    // 火柴头（红色小球）
   const flameNode = model.add("coneY");     // 火苗（点燃后出现）
   const lampNode  = model.add("sphere");    // 天花板灯泡
   const floor     = model.add("square");
   const wallBack  = model.add("square");
   const table     = model.add("cube");
   const noteNode  = model.add("square");    // 纸条
   const monsterNode = model.add("sphere"); // 小怪物的身体
   const maskNode    = model.add("square"); // 滑稽的面具
   const holeNode    = model.add("square"); // 墙上的老鼠洞
   const BASE_NODES = 13;

   // ─── 状态变量 ────────────────────────────────────────
   let igniteBuffer = null;
   await loadSound("media/sound/ignite.mp3", buffer => igniteBuffer = buffer);
   let bgmBuffer = null;
   await loadStereoSound("media/sound/bgm01.mp3", buffer => bgmBuffer = buffer);
   if (bgmBuffer)
      playStereoAudio(bgmBuffer);
   let lightLevel   = 0.0;   // 0 = 全黑，1.0 = 全亮
   const ROOM_Y_OFFSET =-0.05;  // 整个房间下移
   const ROOM_Z_OFFSET = 0.4;  // 整个房间向玩家移动
   let matchBoxPos = [0.25, 0.9 + ROOM_Y_OFFSET, -0.55 + ROOM_Z_OFFSET]; // 火柴盒位置（可抓取）
   const notePos = [0.2, 0.862 + ROOM_Y_OFFSET, -0.55 + ROOM_Z_OFFSET];  // float it up high //0.86会穿模
   let matchPos     = [...matchBoxPos];  // 火柴当前位置
   let matchHeld    = false;
   let matchHeldBy  = null;
   let matchBoxHeldBy = null;
   let matchDir     = [1, 0, 0]; // 火柴朝向（世界坐标）
   let flameLife    = 0.0;   // 火苗强度，点燃后从0涨到1
   let noteRead     = false;
   // ─── 新增：状态变量 ────────────────────────────────────────
   const holePos = [-0.8, 0.76 + ROOM_Y_OFFSET, -1.49 + ROOM_Z_OFFSET]; // 墙角老鼠洞的位置
   const underTablePos = [0.2, 0.3 + ROOM_Y_OFFSET, -0.6 + ROOM_Z_OFFSET]; // 桌底藏匿位置
   let monsterPos = [...underTablePos];
   let monsterState = "HIDDEN"; // 状态：HIDDEN -> REVEALED -> SNATCHING -> ESCAPING -> IDLE_NPC
   let monsterSnatchTimer = 0.0;

   // 划火柴手势检测
   let prevHandX    = null;  // 上一帧手的X坐标
   let swipeSpeed   = 0.0;   // 当前帧手的X方向速度
   const SWIPE_THRESHOLD = 1.8;  // 划得够快才算（单位：米/秒）

   // ─── 数据记录 ────────────────────────────────────────
   const eventLog = [];
   const logEvent = (type, hand, pos) =>
      eventLog.push({ t: model.time, type, hand, pos: [...(pos || [0,0,0])] });

   // ─── 半径常量 ────────────────────────────────────────
   const GRAB_RADIUS = 0.18;
   const NEAR_RADIUS = 0.32;
   const STRIKE_RADIUS = 0.14; // 火柴靠近火柴盒才能划燃
   const MATCH_LENGTH = 0.09;
   const MATCH_HALF   = MATCH_LENGTH / 2;
   const MATCH_TIP_OFFSET = MATCH_LENGTH + 0.005;
   const MATCH_THICKNESS = 0.006;
   const MATCH_TILT   = -Math.PI / 6; // 介于水平与垂直的倾斜角
   const tipOffset2D = () => ([
      -MATCH_TIP_OFFSET * Math.cos(MATCH_TILT),
      -MATCH_TIP_OFFSET * Math.sin(MATCH_TILT),
   ]);

   model.animate(() => {
      const t  = model.time;
      const dt = model.deltaTime;

      const leftHand  = clientState.finger(clientID, "left",  1);
      const rightHand = clientState.finger(clientID, "right", 1);
      const leftHandMat  = clientState.hand(clientID, "left");
      const rightHandMat = clientState.hand(clientID, "right");
      const pinchLeft  = clientState.pinch(clientID, "left",  1);
      const pinchRight = clientState.pinch(clientID, "right", 1);

      const hands = [
         { pos: leftHand,  side: "left",  pinch: pinchLeft  },
         { pos: rightHand, side: "right", pinch: pinchRight },
      ];

      // 让火柴盒可抓取：若手上有盒子则跟随，否则保持原位
      if (matchBoxHeldBy) {
         if (matchBoxHeldBy === "monster") {
            // 如果是被怪物拿着，位置由怪物的逻辑控制，这里什么都不做
         } else {
            const boxPos = matchBoxHeldBy === "left" ? leftHand : rightHand;
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
         // 确保火苗不可见（未抓取火柴前不显示）
         flameNode.identity().scale(0);
         matchTip.identity().scale(0);

         let nearMatch = false;

         for (const { pos: hPos, side, pinch } of hands) {
            if (!Array.isArray(hPos)) continue;
            const dist = cg.distance(hPos, matchBoxPos);

            if (dist < GRAB_RADIUS && pinch) {
               // 从盒中取火柴
               matchHeld   = true;
               matchHeldBy = side;
               prevHandX   = hPos[0];
               matchPos[0] = hPos[0];
               matchPos[1] = hPos[1];
               matchPos[2] = hPos[2];
               gamePhase   = "MATCH_HELD";
               logEvent("match_grabbed", side, matchBoxPos);
               break;
            }
            if (dist < NEAR_RADIUS) nearMatch = true;
         }

         // 火柴盒渲染：黑暗中只有靠近才看到轮廓
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
         // 火柴未取出前不可见
         matchStick.identity().scale(0);
      }

      // ══════════════════════════════════════════════════
      // 阶段二：MATCH_HELD — 检测划火柴手势
      // ══════════════════════════════════════════════════
      if (gamePhase === "MATCH_HELD") {
         // 仍未点燃，火苗隐藏
         flameNode.identity().scale(0);

         const hPos = matchHeldBy === "left" ? leftHand : rightHand;
         const isPinching = matchHeldBy === "left" ? pinchLeft : pinchRight;

         if (!Array.isArray(hPos) || !isPinching) {
            // 手追踪丢失，重置
            matchHeld = false;
            matchHeldBy = null;
            gamePhase = "DARK";
         } else {
            // 火柴跟手走
            matchPos[0] = hPos[0];
            matchPos[1] = hPos[1];
            matchPos[2] = hPos[2];
            const hMat = matchHeldBy === "left" ? leftHandMat : rightHandMat;
            if (hMat) {
               const d = cg.normalize([hMat[0], hMat[1], hMat[2]]);
               if (d) matchDir = d;
            }

            // 计算X方向速度（划火柴就是横向快速移动）
            if (prevHandX !== null) {
               swipeSpeed = Math.abs(hPos[0] - prevHandX) / dt;
            }
            prevHandX = hPos[0];

            const nearBox = cg.distance(matchPos, matchBoxPos) < STRIKE_RADIUS;
            if (swipeSpeed > SWIPE_THRESHOLD && nearBox) {
               // 划火柴成功！
               gamePhase = "LIGHTING";
               flameLife = 1.0;
               logEvent("match_struck", matchHeldBy, matchPos);
               if (igniteBuffer) {
                  playSoundAtPosition(igniteBuffer, matchPos,3.0);
                  // Slightly boost perceived loudness by layering a second hit.
                  setTimeout(() => playSoundAtPosition(igniteBuffer, matchPos), 30);
               }
            }
         }

         // 若另一只手靠近并捏合，可抓起火柴盒
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

         // 火柴盒渲染：可在桌上或手中
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
         // 手里的火柴
         {
            const hMat = matchHeldBy === "left" ? leftHandMat : rightHandMat;
            if (hMat)
               matchStick.identity().setMatrix(hMat).turnZ(MATCH_TILT).scale(MATCH_LENGTH, MATCH_THICKNESS, MATCH_THICKNESS)
                        .color(0.85, 0.75, 0.55);
            else
               matchStick.identity().move(matchPos).turnZ(MATCH_TILT).scale(MATCH_LENGTH, MATCH_THICKNESS, MATCH_THICKNESS)
                        .color(0.85, 0.75, 0.55);
         }
         // 火柴头（红色球形）
         {
            const hMat = matchHeldBy === "left" ? leftHandMat : rightHandMat;
            if (hMat)
               matchTip.identity().setMatrix(hMat).turnZ(MATCH_TILT).move(-MATCH_TIP_OFFSET, 0, 0).scale(0.010)
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

         // 火柴继续跟手
         const hPos = matchHeldBy === "left" ? leftHand : rightHand;
         const isPinching = matchHeldBy === "left" ? pinchLeft : pinchRight;
         const hMat = matchHeldBy === "left" ? leftHandMat : rightHandMat;
         if (Array.isArray(hPos) && isPinching) {
            matchPos[0] = hPos[0];
            matchPos[1] = hPos[1];
            matchPos[2] = hPos[2];
            if (hMat) {
               const d = cg.normalize([hMat[0], hMat[1], hMat[2]]);
               if (d) matchDir = d;
            }
         } else {
            matchHeld = false;
            matchHeldBy = null;
         }

         // 火苗慢慢熄灭（火柴燃烧时间有限）
         flameLife -= dt * 0.18;
         flameLife  = Math.max(flameLife, 0);

         // 同时灯光慢慢变亮
         lightLevel += dt * 0.22;

         if (lightLevel >= 1.0) {
            lightLevel = 1.0;
            gamePhase  = "LIT";
            logEvent("room_lit", null, [0,0,0]);
         }

         // 火苗节点：在火柴顶端出现
         const flameFlicker = flameLife * (0.8 + 0.2 * Math.sin(30 * t));
         if (hMat)
            flameNode.identity()
                     .setMatrix(hMat)
                     .turnZ(MATCH_TILT + Math.PI / 2)
                     .move(0, MATCH_TIP_OFFSET * 1.1, 0)
                     .scale(0.015, 0.04 * flameFlicker, 0.015)
                     .color(1.0, 0.6 * flameFlicker, 0.05);
         else
         {
            const [ox, oy] = tipOffset2D();
            flameNode.identity()
                     .turnZ(Math.PI / 2)
                     .move(matchPos[0] + ox, matchPos[1] + oy, matchPos[2])
                     .scale(0.015, 0.04 * flameFlicker, 0.015)
                     .color(1.0, 0.6 * flameFlicker, 0.05);
         }

         // 若另一只手靠近并捏合，可抓起火柴盒
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

         // 火柴盒本身橙色
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
         // 手里的火柴
         if (hMat)
            matchStick.identity().setMatrix(hMat).turnZ(MATCH_TILT).scale(MATCH_LENGTH, MATCH_THICKNESS, MATCH_THICKNESS)
                     .color(0.9, 0.8, 0.6);
         else
            matchStick.identity().move(matchPos).turnZ(MATCH_TILT).scale(MATCH_LENGTH, MATCH_THICKNESS, MATCH_THICKNESS)
                     .color(0.9, 0.8, 0.6);
         // 火柴头（红色球形）
         {
            if (hMat)
               matchTip.identity().setMatrix(hMat).turnZ(MATCH_TILT).move(-MATCH_TIP_OFFSET, 0, 0).scale(0.010)
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
         // 仍可抓取与移动火柴（点亮后也可交互）
         let grabbed = false;
         for (const { pos: hPos, side, pinch } of hands) {
            if (side === matchBoxHeldBy) continue;
            if (!Array.isArray(hPos)) continue;
            const dist = cg.distance(hPos, matchPos);
            if (dist < GRAB_RADIUS && pinch) {
               matchHeld = true;
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
            matchHeld = false;
            matchHeldBy = null;
         }

         // 仍可抓取火柴盒
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

         // 火柴盒渲染
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
         // 火柴（点亮后仍可抓取）
         {
            const hMat = matchHeldBy === "left" ? leftHandMat : rightHandMat;
            if (hMat && matchHeld)
               matchStick.identity().setMatrix(hMat).turnZ(MATCH_TILT).scale(MATCH_LENGTH, MATCH_THICKNESS, MATCH_THICKNESS)
                        .color(0.7 * lightLevel, 0.6 * lightLevel, 0.4 * lightLevel);
            else
               matchStick.identity().move(matchPos).turnZ(MATCH_TILT).scale(MATCH_LENGTH, MATCH_THICKNESS, MATCH_THICKNESS)
                        .color(0.7 * lightLevel, 0.6 * lightLevel, 0.4 * lightLevel);
         }
         // 火柴头（红色球形）
         {
            const hMat = matchHeldBy === "left" ? leftHandMat : rightHandMat;
            if (hMat && matchHeld)
               matchTip.identity().setMatrix(hMat).turnZ(MATCH_TILT).move(-MATCH_TIP_OFFSET, 0, 0).scale(0.010)
                       .color(0.8 * lightLevel, 0.12 * lightLevel, 0.06 * lightLevel);
            else {
               const [ox, oy] = tipOffset2D();
               matchTip.identity()
                       .move(matchPos[0] + ox, matchPos[1] + oy, matchPos[2])
                       .scale(0.010)
                       .color(0.8 * lightLevel, 0.12 * lightLevel, 0.06 * lightLevel);
            }
         }
         // 火苗消失
         flameNode.identity().scale(0);

         // 新增低头
         // 假设你的框架能获取头部的坐标(或者我们可以用手高度来代替)
         // 如果没有 clientState.head，你可以判断 leftHand[1] < 1.0 (手伸向了桌底)
         const headHeight = clientState.head ? clientState.head(clientID)[1] : 
                        (Array.isArray(leftHand) ? leftHand[1] : 1.5);

         // 在 LIT 阶段，如果玩家读了纸条并且弯下了腰（高度变低）
         if (gamePhase === "LIT" && noteRead && headHeight < 0.0 + ROOM_Y_OFFSET) {
            monsterState = "REVEALED";
            gamePhase = "MONSTER_EVENT";
            logEvent("monster_revealed", null, monsterPos);
         }
      }

      // ══════════════════════════════════════════════════
      // 阶段五：MONSTER_EVENT — 现身、对视与抢夺
      // ══════════════════════════════════════════════════
      if (gamePhase === "MONSTER_EVENT") {
         
         // 1. 现身：在桌底待1秒钟，让玩家低头时能看清它
         if (monsterState === "REVEALED") {
            monsterSnatchTimer += dt;
            if (monsterSnatchTimer > 1.0) {
               monsterState = "JUMP_TO_TABLE";
               monsterSnatchTimer = 0.0; // 重置计时器给后面用
               // TODO: 未来可以在这里播放一声“嘻嘻嘻”的笑声
            }
         } 
         // 2. 跳上桌子：迅速移动到火柴盒旁边 15 厘米处
         else if (monsterState === "JUMP_TO_TABLE") {
            const targetPos = [matchBoxPos[0] + 0.15, matchBoxPos[1], matchBoxPos[2]];
            const speed = 2.0; // 跳上桌子的速度很快
            const dx = targetPos[0] - monsterPos[0];
            const dy = targetPos[1] - monsterPos[1];
            const dz = targetPos[2] - monsterPos[2];
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (dist > 0.05) {
               monsterPos[0] += (dx / dist) * speed * dt;
               monsterPos[1] += (dy / dist) * speed * dt;
               monsterPos[2] += (dz / dist) * speed * dt;
            } else {
               monsterState = "TAUNTING"; // 到达桌边，进入挑衅状态
            }
         } 
         // 3. 挑衅对视：在桌面上停顿 1.5 秒，让玩家明白它的意图
         else if (monsterState === "TAUNTING") {
            monsterSnatchTimer += dt;
            // 此时怪物会在火柴盒旁边伴随一点弹跳动画（在下方的渲染逻辑里自带了）
            if (monsterSnatchTimer > 1.5) {
               monsterState = "SNATCHING";
            }
         }
         // 4. 抢夺：伸手猛扑向火柴盒
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
               // 抓到了！强制夺走火柴盒
               matchBoxHeldBy = "monster"; 
               monsterState = "ESCAPING";
               // TODO: 未来可以在这里播放一声“嗖”的抢夺音效
            }
         } 
         // 5. 逃跑：带着火柴盒跑向老鼠洞
         else if (monsterState === "ESCAPING") {
            // 关键：让火柴盒的位置每帧都跟着怪物的坐标走
            matchBoxPos[0] = monsterPos[0];
            matchBoxPos[1] = monsterPos[1] + 0.05; // 稍微抬高一点，像被举着
            matchBoxPos[2] = monsterPos[2];
            //小怪物移动
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
               // 成功钻入老鼠洞
               console.log("【test】小怪物已经走到洞口啦,准备进入下一阶段"); 
               monsterState = "IDLE_NPC";
               gamePhase = "QUEST_HUB";
               matchBoxHeldBy = null;   // 释放火柴盒，不再被“拿”着
               logEvent("entered_quest_hub", null, holePos);
            }
         }

         // 在这个阶段，专门为小怪物渲染火柴盒
         if (matchBoxHeldBy === "monster") {
            // 被怪物拿着，跟着怪物跑
            matchBox.identity().move(matchBoxPos).scale(0.06, 0.03, 0.1)
                    .color(0.55 * lightLevel, 0.38 * lightLevel, 0.18 * lightLevel);
            matchBoxStrip.identity()
                    .move(matchBoxPos[0] + 0.061, matchBoxPos[1], matchBoxPos[2])
                    .turnY(Math.PI / 2).scale(0.1, 0.03, 1)
                    .color(0.55 * lightLevel, 0.15 * lightLevel, 0.08 * lightLevel);
         } else {
            // 怪物还没抢走时，依然画在桌面上
            matchBox.identity().move(matchBoxPos).scale(0.06, 0.03, 0.1)
                    .color(0.55 * lightLevel, 0.38 * lightLevel, 0.18 * lightLevel);
            matchBoxStrip.identity()
                    .move(matchBoxPos[0] + 0.061, matchBoxPos[1], matchBoxPos[2])
                    .turnY(Math.PI / 2).scale(0.1, 0.03, 1)
                    .color(0.55 * lightLevel, 0.15 * lightLevel, 0.08 * lightLevel);
         }
      }
      
      // ══════════════════════════════════════════════════
      // 阶段六：QUEST HUB  任务选择 (只做逻辑检测，不在这里画文字)
      // ══════════════════════════════════════════════════
      if (gamePhase === "QUEST_HUB") {
         // 设置 UI 坐标在玩家脸前 (水平0, 高1.3, 距离玩家0.6)
         let uiPos = [0, 1.3, -0.6]; 
         let followBtnPos = [uiPos[0] - 0.25, uiPos[1] - 0.05, uiPos[2] + 0.01];
         let stayBtnPos   = [uiPos[0] + 0.25, uiPos[1] - 0.05, uiPos[2] + 0.01];
         
         let isNearFollow = false;
         let isNearStay = false;
         let isSelecting = false;

         // 检测手/手柄
         for (let n = 0 ; n < hands.length ; n++) {
            let hPos = hands[n].pos;
            if (!Array.isArray(hPos)) continue;

            // 检测是否靠近按钮 (范围扩大到 0.4 米，非常轻松)
            if (cg.distance(hPos, followBtnPos) < 0.4) isNearFollow = true;
            if (cg.distance(hPos, stayBtnPos) < 0.4) isNearStay = true;

            // 检测交互动作：捏合 (Pinch) 或 手柄扳机/A键 (通常映射在 hands[n].pressed 或 pinch)
            if (hands[n].pinch || hands[n].pressed) {
               isSelecting = true;
            }
         }

         // 3. 执行选择逻辑
         if (isSelecting) {
            if (isNearFollow) {
               choiceMade = "FOLLOW";
               // 先进入开门动画阶段
               gamePhase = "PORTAL_TRANSITION";
               window.portalStartTime = t; // 记录开门的时间
               monsterState = "HIDDEN";
               matchHeld = false;
               matchHeldBy = null;
               matchBoxHeldBy = null;
               console.log("选择了: 跟随小怪物");
            } else if (isNearStay) {
               choiceMade = "STAY";
               // 可以在这里加一个灯灭的逻辑
               console.log("选择了: 留在原地");
            }
         }
      }

      // ══════════════════════════════════════════════════
      // 阶段八：选择yes 进入微观世界
      // ══════════════════════════════════════════════════
      if (gamePhase === "ACT2") {
         act2.render(model, t, hands);
         return
      }

      // ══════════════════════════════════════════════════
      // 场景渲染 — 所有颜色乘以 lightLevel
      // ══════════════════════════════════════════════════
      const l = lightLevel;  // 简写

      // 天花板灯泡：点亮后发光
      const lampGlow = l > 0.5 ? l + 0.15 * Math.sin(3 * t) : l * 0.3;
      lampNode.identity().move(0, 2.3 + ROOM_Y_OFFSET, -1.0 + ROOM_Z_OFFSET).scale(0.08 + lampGlow * 0.04)
              .color(lampGlow, lampGlow * 0.95, lampGlow * 0.7);

      // 地板、墙、桌子都乘亮度
      floor.identity().move(0, 0.2 + ROOM_Y_OFFSET, -1.5 + ROOM_Z_OFFSET)
           .turnX(-Math.PI / 2).scale(3.0, 3.0, 1)
           .color(0.12 * l, 0.09 * l, 0.07 * l);

      wallBack.identity().move(0, 1.8 + ROOM_Y_OFFSET, -2 + ROOM_Z_OFFSET).scale(3.5, 2, 1)
              .color(0.15 * l, 0.11 * l, 0.09 * l);

      table.identity().move(0.2, 0.8 + ROOM_Y_OFFSET, -0.6 + ROOM_Z_OFFSET).scale(0.5, 0.06, 0.35)
           .color(0.28 * l, 0.18 * l, 0.1 * l);

      // 纸条：只有亮起来才能看见
      noteNode.identity()
              .move(...notePos)
              .turnX(-Math.PI / 2)
              .scale(0.08, 0.06, 1)
              .color(0.9 * l, 0.85 * l, 0.7 * l);

      // 亮了以后可以互动（靠近视为“读到”）
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

      // 老鼠洞渲染（纯黑色半圆或方块，灯亮了才明显）
      holeNode.identity()
              .move(...holePos)
              .scale(0.12, 0.15, 1)
              .color(0.02 * l, 0.01 * l, 0.01 * l);
              
      // 渲染小捣蛋鬼
      if (monsterState !== "HIDDEN" && monsterState !== "IDLE_NPC") {
         // 添加一点弹跳动画，让它看起来很调皮
         const bounce = monsterState === "IDLE_NPC" ? 0.02 * Math.sin(4 * t) : 0.06 * Math.abs(Math.sin(15 * t));
         
         // 身体：深蓝色
         monsterNode.identity()
                    .move(monsterPos[0], monsterPos[1] + bounce, monsterPos[2])
                    .scale(0.08)
                    .color(0.2 * l, 0.25 * l, 0.4 * l);

         // 滑稽面具：亮白色，贴在身体前方朝向玩家
         maskNode.identity()
                 .move(monsterPos[0], monsterPos[1] + bounce, monsterPos[2] + 0.08)
                 .scale(0.05, 0.05, 1)
                 .color(0.9 * l, 0.85 * l, 0.8 * l);
      } else {
         // --- 强制把隐藏状态下的节点缩放到 0，防止它们变成巨大的白色默认模型 ---
         monsterNode.identity().scale(0);
         maskNode.identity().scale(0);

         // 当怪物进洞并且阶段变为 QUEST_HUB 时，让火柴盒也彻底消失
         if (gamePhase === "QUEST_HUB") {
             matchBox.identity().scale(0);
             matchBoxStrip.identity().scale(0);
         }
      }

      // ══════════════════════════════════════════════════
      // HUD (清屏/清理多余节点)
      // ══════════════════════════════════════════════════
      while (model.nChildren() > BASE_NODES)
         model.remove(BASE_NODES);

      // QUEST_HUB 的选项文字
      if (gamePhase === "QUEST_HUB") {
         let uiPos = [0.12, 1.3, -0.6];
         let titlePos = [uiPos[0] - 0.08, uiPos[1] + 0.04, uiPos[2] + 0.01];
         
         // 定义按钮的精确位置
         let followBtnPos = [uiPos[0] - 0.15, uiPos[1] - 0.04, uiPos[2]];
         let stayBtnPos   = [uiPos[0] + 0.15, uiPos[1] - 0.04, uiPos[2]];

         // 补上被我遗漏的距离判定（用于让按钮变色）
         let isNearFollow = false;
         let isNearStay = false;
         for (let n = 0 ; n < hands.length ; n++) {
            let hPos = hands[n].pos;
            if (!Array.isArray(hPos)) continue;
            if (cg.distance(hPos, followBtnPos) < 0.4) isNearFollow = true;
            if (cg.distance(hPos, stayBtnPos) < 0.4) isNearStay = true;
         }

         // 1. 渲染半透明白色的背景“筐”
         model.add("cube").move(uiPos[0], uiPos[1], uiPos[2] - 0.01)
              .scale(0.38, 0.15, 0.005) 
              .color(1, 1, 1, 0.1); // 更轻一点的半透明白色

         // 2. 渲染文字标题
         model.add(clay.text("Follow the little thief?"))
              .move(...titlePos)
              .scale(0.6)
              .color(0, 0, 0); // 黑色文字

         // 3. 渲染 YES 按钮
         model.add(clay.text("[ YES ]"))
              .move(...followBtnPos)
              .scale(0.5)
              .color(isNearFollow ? [0, 0.6, 0] : [0.3, 0.3, 0.3]); // 靠近变深绿

         // 4. 渲染 NO 按钮
         model.add(clay.text("[ NO ]"))
              .move(...stayBtnPos)
              .scale(0.5)
              .color(isNearStay ? [0.8, 0, 0] : [0.3, 0.3, 0.3]); // 靠近变深红
      }

      const hint =
         gamePhase === "DARK"          ? "FIND SOMETHING IN THE DARK..." :
         gamePhase === "MATCH_HELD"    ? "STRIKE THE MATCH — SWIPE FAST" :
         gamePhase === "LIGHTING"      ? "..." :
         gamePhase === "LIT"           ? (noteRead ? "WHO WROTE THIS...?" : "ACT I COMPLETE") :
         gamePhase === "MONSTER_EVENT" ? "HEY! MY MATCHBOX!" :
         gamePhase === "QUEST_HUB"     ? "TALK TO THE LITTLE THIEF..." : "";

      const hintColor =
         gamePhase === "DARK"       ? [0.4, 0.4, 0.5] :
         gamePhase === "MATCH_HELD" ? [0.9, 0.7, 0.3] :
         gamePhase === "LIGHTING"   ? [1.0, 0.8, 0.4] :
                                      [0.5, 1.0, 0.7];

      model.add(clay.text(hint))
           .move(-0.9, 2.1 + ROOM_Y_OFFSET, -1.8 + ROOM_Z_OFFSET).scale(1.1)
           .color(...hintColor);

      model.add(clay.text("EVENTS: " + eventLog.length))
           .move(-0.9, 1.92 + ROOM_Y_OFFSET, -1.8 + ROOM_Z_OFFSET).scale(0.85)
           .color(0.5, 0.5, 0.7);

      if (l > 0.2) {
         model.add(clay.text("You are not alone."))
              .move(notePos[0]-0.03, notePos[1] + 0.001, notePos[2])
              .turnX(-Math.PI / 2)
              .scale(0.4)
              .color(0.08 * l, 0.06 * l, 0.04 * l);

         // 读了纸条之后才显示第二行
         if (noteRead) {
            model.add(clay.text("CHECK UNDER THE TABLE."))
               .move(notePos[0]-0.03, notePos[1] + 0.001, notePos[2] + 0.02)
               .turnX(-Math.PI / 2).scale(0.4)
               .color(0.6 * l, 0.3 * l, 0.1 * l); // 更旧更暗的颜色，像铅笔字
         }
      }

      // ══════════════════════════════════════════════════
      // 阶段七：处理传送门的视觉过渡
      // ══════════════════════════════════════════════════
      if (gamePhase === "PORTAL_TRANSITION") {
         let pTime = t - window.portalStartTime;
         let duration = 5.0; 
         let progress = pTime / duration; 

         // 1. 纯黑频闪 (Strobe Effect)
         let isDarkFlicker = Math.sin(t * 20 * progress) < 0;
         if (isDarkFlicker) {
            model.add("cube")
                 .move(0, ROOM_Y_OFFSET, ROOM_Z_OFFSET) 
                 .scale(10) // 巨大的黑盒子，瞬间剥夺视觉
                 .color(0, 0, 0); // 删除了 .custom()，直接用纯黑色！
         }

         // 2. 吸入感
         let suckingMove = progress * progress * 2; 
         let currentZ = ROOM_Z_OFFSET + suckingMove;

         // 3. 渲染“多重旋转星云”传送门
         for (let i = 0; i < 5; i++) {
            let spin = t * (1 + i);
            let layerScale = 0.15 + Math.sin(t * 2 + i) * 0.05;
            if (progress > 0.8) {
               layerScale += (progress - 0.8) * 50; 
            }

            model.add("square")
                 .move(holePos[0], holePos[1], holePos[2] + 0.01 + i * 0.001)
                 .turnZ(spin)
                 .scale(layerScale)
                 .color(0.1, 0.6 + i * 0.1, 1.0); // 删除了 .custom()，用纯色堆叠
         }

         // 4. 粒子吸入效果
         for (let i = 0; i < 8; i++) {
            let pOffset = ( (t * 2 + i * 0.5) % 2 ); 
            model.add("sphere")
                 .move(holePos[0] * (1-pOffset), 1.5, holePos[2] * (1-pOffset))
                 .scale(0.01)
                 .color(0.5, 0.8, 1);
         }

         // 5. 脸前浮现的文字
         let shake = (Math.random() - 0.5) * 0.02 * progress;
         model.add(clay.text("ACT II : THE MICRO-WORLD"))
              .move(shake, 1.5 + shake, -0.8)
              .scale(0.15 + progress * 0.05)
              .color(0.5, 1, 1);

         // 6. 正式切换
         if (pTime > duration) {
            gamePhase = "ACT2";
            while (model.nChildren() > 0) model.remove(0); 
         }
      }
   });
};

export const deinit = () => {
   stopStereoLoopingAudio();
};
