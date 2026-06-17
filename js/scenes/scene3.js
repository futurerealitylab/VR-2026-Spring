import * as cg from "../render/core/cg.js";

export const init = async model => {
   // ─── LOAD VISHCHUN (High-Poly Alien Flora) ───
   let alienCore = model.add('gltf', './assets/Vishchun_Core.glb');
   let alienTentacle1 = model.add('gltf', './assets/Vishchun_Flora1.glb');
   let alienTentacle2 = model.add('gltf', './assets/Vishchun_Flora2.glb');

   let startTime = model.time;

   model.animate(() => {
      let t = model.time;
      if (window.beamR) window.beamR.update();

      // The new task: The alien plants are spinning out of control. 
      // The player must use the laser to hit the core and "cool it down".
      let chaosSpeed = 2.0; // Starts fast!
      
      if (alienCore) alienCore.identity().move(0, 1, -3).turnY(t * chaosSpeed).scale(3, 3, 3);
      if (alienTentacle1) alienTentacle1.identity().move(-2, 0, -2).turnZ(Math.sin(t * chaosSpeed)).scale(2, 2, 2);
      if (alienTentacle2) alienTentacle2.identity().move(2, 0, -2).turnZ(-Math.sin(t * chaosSpeed)).scale(2, 2, 2);

      let dialogue = "THE ALIEN CORE IS OVERHEATING! COOL IT DOWN!";
      model.add(clay.text(dialogue)).move(0, 3.0, -3).scale(0.015).color(0, 1, 0.8);
   });
}