import * as cg from "../render/core/cg.js";

// 微观世界的全局变量
let startTime = 0;
let crystalLit = false; // 记录玩家是否点亮了核心

export const render = (model, t, hands) => {
   if (startTime === 0) startTime = t;
   let elapsed = t - startTime;

   // 1. 每帧清理
   while (model.nChildren() > 0) model.remove(0);

   // ══════════════════════════════════════════════════
   // 环境构建 (欺骗视觉的巨大化物体)
   // ══════════════════════════════════════════════════
   // 幽暗的青苔地面
   model.add("cube").move(0, -1.5, 0).scale(10, 0.1, 10).color(0.05, 0.15, 0.1); 

   // ✨ 核心道具：被偷走的火柴盒（放大了 20 倍，像一栋楼一样掉在旁边！）
   model.add("cube").move(-3, -0.5, -4).turnY(0.4).scale(1.5, 0.5, 2.5).color(0.8, 0.1, 0.1); // 红色的火柴盒
   model.add("square").move(-2.8, -0.5, -2.5).turnY(0.4).scale(1.5, 0.5, 2.5).color(0.2, 0.2, 0.2); // 侧面的黑色擦火条

   // 枯萎/发光的微观水晶（目标物品）
   let crystalPos = [2, -0.5, -2.5];
   let crystalColor = crystalLit ? [0.2, 1.0, 0.8] : [0.1, 0.2, 0.2]; // 点亮后变成耀眼的青色
   model.add("tubeZ").move(...crystalPos).turnX(Math.PI/2).scale(0.5, 0.5, 1.5).color(...crystalColor);
   
   // ══════════════════════════════════════════════════
   // NPC 渲染：小怪物 (The Little Thief)
   // ══════════════════════════════════════════════════
   let npcPos = [0, -0.8 + Math.sin(t * 3) * 0.05, -2]; // 让小怪物有呼吸起伏的动画

   // 怪物的黑色毛球身体
   model.add("sphere").move(...npcPos).scale(0.4).color(0.1, 0.1, 0.1);
   // 怪物发光的黄眼睛
   model.add("sphere").move(npcPos[0] - 0.15, npcPos[1] + 0.1, npcPos[2] + 0.3).scale(0.06).color(1, 0.8, 0);
   model.add("sphere").move(npcPos[0] + 0.15, npcPos[1] + 0.1, npcPos[2] + 0.3).scale(0.06).color(1, 0.8, 0);

   // ══════════════════════════════════════════════════
   // 核心逻辑：NPC 对话指引与手部交互
   // ══════════════════════════════════════════════════
   let dialogue = "";

   // 对话系统：根据玩家进入世界的时间，NPC 吐出不同的台词
   if (elapsed < 3) {
      dialogue = "YOU FOLLOWED ME...";
   } else if (elapsed < 8) {
      dialogue = "I HAD TO STEAL IT. MY WORLD IS DYING.";
   } else if (!crystalLit) {
      // 指引阶段：告诉玩家怎么做
      dialogue = "TOUCH THE DEAD CRYSTAL ON THE RIGHT!";
      
      // 在这里检测玩家的手是否碰到了水晶
      for (let i = 0; i < hands.length; i++) {
         let hPos = hands[i].pos;
         if (hPos && cg.distance(hPos, [crystalPos[0], crystalPos[1] + 1, crystalPos[2]]) < 0.6) {
            crystalLit = true; // 触发！水晶被点亮
         }
      }
   } else {
      // 成功通关阶段
      dialogue = "THANK YOU! THE LIGHT IS RESTORED!";
      // 额外奖励视觉：整个场景稍微亮一点
      model.add("sphere").move(...crystalPos).scale(3).color(0, 1, 1).custom("opacity", 0.2); // 水晶散发光晕
   }

   // 渲染 NPC 浮在头顶的对话框
   model.add(clay.text(dialogue))
        .move(npcPos[0]-0.5, npcPos[1] + 1.2, npcPos[2])
        .scale(2)
        .color(1, 1, 1);
};