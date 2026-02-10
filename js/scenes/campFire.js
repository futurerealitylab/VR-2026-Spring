/*
   This scene is an example of how to use procedural texture
   to animate the shape of an object. In this case the object
   is a waving flag. The noise function is used to animate
   the position of each vertex of the flag geometry.
*/

import * as cg from "../render/core/cg.js";

export const init = async model => {
   // Define a tall, thin grid for the flame
   clay.defineMesh('flame', clay.createGrid(20, 30));

   // fire layer holder
   let fireLayers = [];
   for (let i = 0; i < 6; i++){
      let fire = model.add('flame').color(1, .4, 0); // Orange color
      fire.angle = i * 30; // angle = 0, 60, 120.
      fireLayers.push(fire);
   }

   // logs
   model.txtrSrc(1, '../media/textures/log1.png');
   let logs =[]
   for (let i = 0; i < 6; i++){
      let log =model.add('tubeX').color(0.4,0.3,0.3).txtr(1).scale(1.3,0.07,0.07).move(0,0,0);
      log.angle = i * 30
      //log.turnY(log.angle);
      logs.push(log);
   }

   model.scale(0.3).move(0,4,0).animate(() => {
      // Animate the flame by modifying its vertices
      fireLayers.forEach(fire => {
         fire.identity().turnY(fire.angle);
         fire.setVertices((u,v) => {
            return [0.8*(u-0.5)*(1-v),
                  2*v,
                  .3 * v * cg.noise(5*u,5*v-model.time*3,model.time)
                ];
         });
      });

      // logs.forEach(log => {
      //    log.identity().turnY(log.angle);
      // });
   });
}
