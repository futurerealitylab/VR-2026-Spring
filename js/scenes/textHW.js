export const init = async model => {
   let words = [
      "WOW",
      "PLAY",
      "DANCE",
      "BOUNCE",
      "SPIN",
      "LAUGH",
      "JUMP",
      "GLOW"
   ];

   let t = 0;
   let speed = 0.004;
   let zOffset = -2.2;

   let wordPose = (i, tt) => {
      let a = 0.75 * tt + (2 * Math.PI * i) / words.length;
      let r = 1.9 + 0.08 * Math.sin(1.5 * tt + i);
      return {
         x: r * Math.cos(a) - 0.23,
         y: 2.1 + 0.1 * Math.sin(2 * tt + i) + 0.04,
         z: -1.25 + r * Math.sin(a) + zOffset,
      };
   };

   model.animate(() => {
      while (model.nChildren())
         model.remove(0);

      let paused = false;
      if (typeof inputEvents.isPressed == "function")
         paused = inputEvents.isPressed("left") || inputEvents.isPressed("right");

      if (!paused)
         t += speed;

      model.add(clay.text("TEXT PARTY"))
           .move(-0.95, 1.18, -0.59+zOffset)
           .scale(4.8)
           .color(1, 0.2, 0.95);

      for (let i = 0; i < words.length; i++) {
         let w = wordPose(i, t);
         let red = 0.5 + 0.5 * Math.sin(1.4 * t + i);
         let green = 0.5 + 0.5 * Math.sin(1.4 * t + i + 2.1);
         let blue = 0.5 + 0.5 * Math.sin(1.4 * t + i + 4.2);

         model.add(clay.text(words[i]))
              .move(w.x, w.y, w.z)
              .scale(2.2)
              .color(paused ? 1 : red, paused ? 0.95 : green, paused ? 0.2 : blue);
      }

      let hint = paused ? "PAUSED - RELEASE TRIGGER TO RESUME" : "HOLD LEFT/RIGHT TRIGGER TO PAUSE";
      model.add(clay.text(hint))
           .move(-0.95, 0.5, -0.59+zOffset)
           .scale(1.6)
           .color(0.2, 1, 0.95);
   });
};
