
// MASTER-OWNED MULTIPLAYER COMET:
// - CONTROL GOES TO THE MOST RECENT TRIGGER PRESS (master2 pattern).
// - COLOR FOLLOWS LEFT/RIGHT HAND INPUT (multiplayer1 pattern).
// - EVERYONE SEES THE SAME FADING TRAIL.

window.sharedState = {
   time: 0,
   pos: [0, 1.5, 0],
   color: [1, 0.2, 0.2],
   pulse: 0,
   controller: {},
   trail: [],
};

const TRAIL_COUNT = 16;

const colorForInput = (hand, id) => {
   let hash = 0;
   for (let i = 0; i < id.length; i++)
      hash = (hash * 31 + id.charCodeAt(i)) % 997;
   const n = (hash % 100) / 100;
   return hand == 'left' ? [0.2 + 0.5 * n, 1, 0.2] : [0.2, 0.5 + 0.5 * n, 1];
};

export const init = async model => {
   let comet = model.add('sphere');
   let halo = model.add('ringY');
   let trail = [];
   for (let i = 0; i < TRAIL_COUNT; i++)
      trail.push(model.add('sphere'));

   inputEvents.onPress = hand => {
      const id = hand + clientID;
      sharedState.controller[id] = {
         pos: [...inputEvents.pos(hand)],
         time: sharedState.time,
         color: colorForInput(hand, id),
      };
      server.broadcastGlobal('sharedState');
   };

   inputEvents.onDrag = hand => {
      const id = hand + clientID;
      if (sharedState.controller[id]) {
         sharedState.controller[id].pos = [...inputEvents.pos(hand)];
         server.broadcastGlobal('sharedState');
      }
   };

   inputEvents.onRelease = hand => {
      delete sharedState.controller[hand + clientID];
      server.broadcastGlobal('sharedState');
   };

   model.animate(() => {
      sharedState = server.synchronize('sharedState');

      if (clientID == clients[0]) {
         sharedState.time = model.time;

         let newest = null;
         let newestTime = -1;
         for (let id in sharedState.controller)
            if (sharedState.controller[id].time > newestTime) {
               newestTime = sharedState.controller[id].time;
               newest = sharedState.controller[id];
            }

         if (newest) {
            sharedState.pos = [...newest.pos];
            sharedState.color = [...newest.color];
            sharedState.pulse = 1;
            sharedState.trail.unshift({
               pos: [...sharedState.pos],
               color: [...sharedState.color],
               time: sharedState.time,
            });
         } else {
            sharedState.pos = [
               sharedState.pos[0],
               1.45 + 0.1 * Math.sin(2 * sharedState.time),
               sharedState.pos[2],
            ];
            sharedState.pulse *= 0.95;
         }

         while (sharedState.trail.length > TRAIL_COUNT)
            sharedState.trail.pop();
         sharedState.trail = sharedState.trail.filter(p => sharedState.time - p.time < 2.5);
         server.broadcastGlobal('sharedState');
      }

      const pulse = 1 + 0.25 * sharedState.pulse * Math.abs(Math.sin(10 * sharedState.time));
      comet.identity().move(sharedState.pos).scale(0.07 * pulse).color(...sharedState.color);
      halo.identity().move(sharedState.pos).turnY(2 * sharedState.time).scale(0.11).color(...sharedState.color);

      for (let i = 0; i < TRAIL_COUNT; i++) {
         const p = sharedState.trail[i];
         if (!p) {
            trail[i].identity().scale(0);
            continue;
         }
         const age = Math.max(0, sharedState.time - p.time);
         const fade = Math.max(0, 1 - age / 2.5);
         trail[i].identity()
                 .move(p.pos)
                 .scale(0.05 * fade)
                 .color(p.color[0] * fade, p.color[1] * fade, p.color[2] * fade);
      }
   });
};
