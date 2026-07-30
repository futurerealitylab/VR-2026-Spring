import * as cg from "../render/core/cg.js";

export const init = async model => {
   let thing = model.add('square');

   let fovX = Math.tan(59/2 * Math.PI / 180);
   let fovY = Math.tan(37/2 * Math.PI / 180);

   model.animate(() => {
      thing.hud().scale(2*fovX,2*fovY,1);
   });

}
