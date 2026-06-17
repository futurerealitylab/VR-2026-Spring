import * as cg from "../../render/core/cg.js";
import * as global from "../../global.js";
import { Gltf2Node } from "../../render/nodes/gltf2.js";
import * as customFire from "../campFire.js";

let startTime = 0;
let campfireLit = false; 
let fireStartTime = 0;
let riftOpened = false;

// 新增：追踪模型是否已经被物理替换
let modelsSwapped = false; 

let isInitialized = false;
let monsterNode;

// 存储节点的数组
let snowFloorNodes = [];
let greenFloorNodes = [];
let snowTreeNodes = [];
let greenTreeNodes = [];
let plantNodes = [];

// 预定义位置数据 (x, y, z, rotY, scale)
const floorData = [
   [-3, -4, -6, 0, 3], [0, -4, -6, 0, 3], [3, -4, -6, 0, 3],
   [-3, -4, -3, 0, 3], [0, -4, -3, 0, 3], [3, -4, -3, 0, 3],
   [-3, -4,  0, 0, 3], [0, -4,  0, 0, 3], [3, -4,  0, 0, 3]
];

const treeData = [
   [-4, -1.0, -4, 0.5, 2.5],  
   [ 3, -1.0, -4.5, -0.3, 3], 
   [-3.5, -1.0, -1, 1.2, 2.0],
   [ 4, -1.0, -1.5, -0.8, 2.2]
];

const plantData = [
   [-2.5, -1.0, -3.5, 0.4, 1.5],
   [ 2.0, -1.0, -3.0, -0.2, 1.8],
   [-1.5, -1.0, -2.0, 1.0, 1.2],
   [ 1.5, -1.0, -1.5, -0.5, 1.6],
   [-0.5, -1.0, -3.5, 0.1, 2.0] 
];

export const render = (model, t, hands) => {
   if (startTime === 0) startTime = t;
   let elapsed = t - startTime;

   // ══════════════════════════════════════════════════
   // 初始化加载 (只将雪地模型加入场景)
   // ══════════════════════════════════════════════════
   if (!isInitialized) {
      monsterNode = new Gltf2Node({ url: "../../media/models/cute_slime.glb" });
      global.scene().addNode(monsterNode);

      // 初始化地板
      for (let i = 0; i < floorData.length; i++) {
         let [x, y, z, rotY, s] = floorData[i];
         let matrix = cg.mMultiply(cg.mTranslate(x, y, z), cg.mMultiply(cg.mRotateY(rotY), cg.mScale(s, s, s)));

         let snowF = new Gltf2Node({ url: "../../media/models/nature/block-snow-large.glb" });
         snowF.matrix = matrix; 
         global.scene().addNode(snowF); // 只有雪地被加进场景
         snowFloorNodes.push(snowF);

         let greenF = new Gltf2Node({ url: "../../media/models/nature/block-grass-large.glb" });
         greenF.matrix = matrix; // 提前算好矩阵，但不加进场景
         greenFloorNodes.push(greenF);
      }

      // 初始化树木
      for (let i = 0; i < treeData.length; i++) {
         let [x, y, z, rotY, s] = treeData[i];
         let matrix = cg.mMultiply(cg.mTranslate(x, y, z), cg.mMultiply(cg.mRotateY(rotY), cg.mScale(s, s, s)));

         let snowUrl = i % 2 === 0 ? "../../media/models/nature/tree-snow.glb" : "../../media/models/nature/tree-pine-snow.glb";
         let greenUrl = i % 2 === 0 ? "../../media/models/nature/tree.glb" : "../../media/models/nature/tree-pine.glb";
         
         let snowT = new Gltf2Node({ url: snowUrl });
         snowT.matrix = matrix;
         global.scene().addNode(snowT); // 只有雪树被加进场景
         snowTreeNodes.push(snowT);

         let greenT = new Gltf2Node({ url: greenUrl });
         greenT.matrix = matrix;
         greenTreeNodes.push(greenT);
      }

      // 初始化植物 (不加进场景)
      for (let i = 0; i < plantData.length; i++) {
         let plantUrl = i % 2 === 0 ? "../../media/models/nature/mushrooms.glb" : "../../media/models/nature/flowers.glb";
         let plant = new Gltf2Node({ url: plantUrl });
         plantNodes.push(plant);
      }

      isInitialized = true;
   }

   while (model.nChildren() > 0) model.remove(0);

   // 巨型火柴盒背景
   model.add("cube").move(-3, 0.5, -5).turnY(0.4).scale(2, 0.8, 3).color(0.8, 0.1, 0.1); 
   model.add("square").move(-2.8, 0.5, -3.5).turnY(0.4).scale(2, 0.8, 3).color(0.2, 0.2, 0.2); 

   let firePos = [0, 0.5, -2];
   let npcPos = [1.5, 1.0 + Math.sin(t * 3) * 0.05, -3]; 

   monsterNode.matrix = cg.mMultiply(
      cg.mTranslate(npcPos[0], npcPos[1], npcPos[2]),
      cg.mMultiply(cg.mRotateY(Math.PI - 0.5), 
      cg.mScale(1, 1, 1))
   );

   // ══════════════════════════════════════════════════
   // 交互逻辑
   // ══════════════════════════════════════════════════
   let dialogue = "";

   if (!campfireLit) {
      if (elapsed < 3) dialogue = "YOU FOLLOWED ME...";
      else if (elapsed < 8) dialogue = "I HAD TO STEAL IT. MY WORLD IS FROZEN.";
      else dialogue = "I NEED TO LIGHT THE FIRE.";

      model.add("sphere").move(...firePos).scale(0.1).color(0.1, 0.1, 0.1); 

      // 点火判定
      for (let i = 0; i < hands.length; i++) {
         if (hands[i].pos && cg.distance(hands[i].pos, firePos) < 0.6) {
            campfireLit = true;
            fireStartTime = t; 
         }
      }
   } else {
      let timeSinceLit = t - fireStartTime;

      // ─── 直接物理替换节点 (Direct Remove & Add) ───
      if (!modelsSwapped) {
         // 1. 删除所有雪地模型
         for (let i = 0; i < snowFloorNodes.length; i++) global.scene().removeNode(snowFloorNodes[i]);
         for (let i = 0; i < snowTreeNodes.length; i++) global.scene().removeNode(snowTreeNodes[i]);

         // 2. 将绿地模型和植物加入场景
         for (let i = 0; i < greenFloorNodes.length; i++) global.scene().addNode(greenFloorNodes[i]);
         for (let i = 0; i < greenTreeNodes.length; i++) global.scene().addNode(greenTreeNodes[i]);
         for (let i = 0; i < plantNodes.length; i++) global.scene().addNode(plantNodes[i]);
         
         modelsSwapped = true; // 确保只执行一次！
      }

      if (timeSinceLit < 6) {
         dialogue = "THANK YOU! THE ICE IS MELTING!";
         
         let pulse = 0.5 + 0.15 * Math.sin(t * 8);
         let fScale = 0.3 + pulse * 0.05;
         
         model.add("sphere").move(...firePos).scale(fScale, fScale*1.5, fScale).color(1, pulse * 0.8, 0);

         // 给刚加进场景的植物计算生长动画
         let growth = Math.min(1, timeSinceLit / 2.0); 
         let bouncyGrowth = growth + 0.1 * Math.sin(growth * Math.PI) * (1 - growth);

         for (let i = 0; i < plantNodes.length; i++) {
            let [x, y, z, rotY, targetScale] = plantData[i];
            let currentScale = bouncyGrowth * targetScale;
            plantNodes[i].matrix = cg.mMultiply(
               cg.mTranslate(x, y, z), 
               cg.mMultiply(cg.mRotateY(rotY), cg.mScale(currentScale, currentScale, currentScale))
            );
         }
      } else {
         if (!riftOpened) riftOpened = true;
         dialogue = "WAIT... THE FIRE IS TOO STRONG! TOUCH THE RIFT!";

         let alienPulse = 0.5 + 0.5 * Math.sin(t * 15);
         model.add("sphere").move(...firePos).scale(0.5 + alienPulse * 0.2).color(0, 1, 0.8 + alienPulse * 0.2);

         for (let i = 0; i < hands.length; i++) {
            if (hands[i].pos && cg.distance(hands[i].pos, firePos) < 0.8) {
               window.sharedState.gamePhase = "SCENE_3";
            }
         }
      }
   }

   model.add(clay.text(dialogue))
        .move(npcPos[0] - 0.5, npcPos[1] + 1, npcPos[2])
        .scale(3.5)
        .color(1, 1, 1);
};

export const resetScene = () => {
   // 时间，流程
   startTime = 0;
   campfireLit = false;
   fireStartTime = 0;
   riftOpened = false;

   // 状态
   modelsSwapped = false;
   isInitialized = false;

   // 清空节点数组
   snowFloorNodes = [];
   greenFloorNodes = [];
   snowTreeNodes = [];
   greenTreeNodes = [];
   plantNodes = [];

   // 可选：移除旧 monster
   if (monsterNode) {
      global.scene().removeNode(monsterNode);
      monsterNode = null;
   }

   console.log("Scene 2 reset");
};
