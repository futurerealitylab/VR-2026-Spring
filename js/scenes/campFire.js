/*
   This scene is an example of how to use procedural texture
   to animate the shape of an object. In this case the object
   is a waving flag. The noise function is used to animate
   the position of each vertex of the flag geometry.
*/

import * as cg from "../render/core/cg.js";

function ensureCampfireMesh() {
   if (!window.__campfireFlameMeshDefined) {
      clay.defineMesh('flame', clay.createGrid(20, 30));
      window.__campfireFlameMeshDefined = true;
   }
}

export const renderCampfire = (model, t, options = {}) => {
   ensureCampfireMesh();

   const pos   = options.pos   || [0, 0, 0];
   const scale = options.scale ?? 0.3;
   const yaw   = options.yaw   ?? 0;
   const lit   = options.lit   ?? true;

   const root = model.add().move(...pos).turnY(yaw).scale(scale);

   // Grounding elements: a low ember bed and a loose stone ring help the fire
   // read as resting on terrain instead of floating over it.
   root.add('sphere')
       .move(0, -0.03, 0)
       .scale(0.75, 0.07, 0.75)
       .color(0.14, 0.08, 0.05);

   for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      root.add('sphere')
          .move(Math.cos(angle) * 0.72, -0.01, Math.sin(angle) * 0.72)
          .scale(0.14, 0.09, 0.12)
          .color(0.34, 0.34, 0.36);
   }

   for (let i = 0; i < 6; i++) {
      root.add('tubeX')
          .color(0.36, 0.24, 0.18)
          .move(0, 0.03, 0)
          .turnY(i * Math.PI / 3)
          .scale(1.3, 0.07, 0.07);
   }

   if (!lit) return root;

   for (let i = 0; i < 6; i++) {
      const fire = root.add('flame').color(1, 0.45, 0.05);
      fire.turnY(i * Math.PI / 3);
      fire.setVertices((u, v) => [
         0.8 * (u - 0.5) * (1 - v),
         2 * v,
         0.3 * v * cg.noise(5 * u, 5 * v - t * 3, t),
      ]);
   }

   return root;
};

export const init = async model => {
   model.scale(0.3).move(0,4,0).animate(() => {
      while (model.nChildren() > 0) model.remove(0);
      renderCampfire(model, model.time, { pos: [0, 0, 0], scale: 1, lit: true });
   });
}
