import * as cg from "../render/core/cg.js";

// Simple head-gaze focus: look at the cube to fill a ring.

const DWELL_TIME = 1.0;
const FOCUS_COLOR = [0.2, 0.9, 0.45];
const IDLE_COLOR = [0.85, 0.85, 0.9];

const mixColor = (a, b, t) => [
   a[0] + (b[0] - a[0]) * t,
   a[1] + (b[1] - a[1]) * t,
   a[2] + (b[2] - a[2]) * t,
];

export const init = async model => {
   const target = model.add().move(0, 1.6, -1.3);
   target.add("cube").scale(0.04);
   const progressRing = model.add("ringZ");

   let dwell = 0;

   model.animate(() => {
      const dt = model.deltaTime || 0;
      const mm = cg.mMultiply(clay.root().viewMatrix(0), worldCoords);
      const m = cg.mMultiply(mm, target.getMatrix());
      const distanceToGaze = m[12]*m[12] + m[13]*m[13];
      const inFront = m[14] < 0;

      if (inFront && distanceToGaze < 0.02)
         dwell = Math.min(DWELL_TIME, dwell + dt);
      else
         dwell = Math.max(0, dwell - dt);

      const t = dwell / DWELL_TIME;
      const color = mixColor(IDLE_COLOR, FOCUS_COLOR, t);
      const scale = 0.25 + 0.05 * t;

      target.child(0).color(color).identity().scale(scale);

      const ringScale = 0.22 + 0.4 * t;
      progressRing.identity()
         .move(0, 1.7, -0.9)
         .scale(ringScale)
         .color(color);
   });
}
