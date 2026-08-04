import * as cg from "../render/core/cg.js";

let PIECES = {
   A:{ C:[1.,1.,.1], I:[[-1,-1,-1],[-1,-1, 0],[-1, 0,-1],[ 0, 0,-1]] },
   B:{ C:[.2,.1,.1], I:[[ 1, 0,-1],[ 0,-1,-1],[ 1,-1,-1],[ 0,-1, 0]] },
   L:{ C:[1.,.3,.0], I:[[-1, 1,-1],[ 0, 1,-1],[ 1, 1,-1],[-1, 1, 0]] },
   P:{ C:[1.,.0,.0], I:[[ 1, 1, 0],[ 0, 1, 1],[ 1, 1, 1],[ 1, 0, 1]] },
   T:{ C:[.5,.0,.5], I:[[ 0, 0, 1],[-1,-1, 1],[ 0,-1, 1],[ 1,-1, 1]] },
   V:{ C:[.0,1.,.0], I:[[-1, 1, 1],[-1, 0, 0],[-1, 0, 1]] },
   Z:{ C:[.0,.5,1.], I:[[ 0, 1, 0],[ 0, 0, 0],[ 1, 0, 0],[ 1,-1, 0]] },
};

let keys = Object.keys(PIECES);

const CUBE      = .12;                          // world size (and grid spacing) of one unit cube
const GRAB_R    = .5;                            // reach, in meters, for picking up the nearest piece
const SNAP_DIST = CUBE * .6;                     // how close a face has to get before it snaps
const SNAP_COS  = Math.cos(20 * Math.PI / 180); // how closely a rotation must match the cube grid to snap

const AXES  = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const FACES = AXES;

let bondKey = (a,b) => a < b ? a+'-'+b : b+'-'+a;

// ROUND A ROUGHLY-UNIT VECTOR TO THE NEAREST CARDINAL AXIS, OPTIONALLY EXCLUDING ONE AXIS'S LINE.

let nearestAxis = (v, exclude) => {
   let best = null, bestDot = -Infinity;
   for (let a of AXES) {
      if (exclude && a[0] == -exclude[0] && a[1] == -exclude[1] && a[2] == -exclude[2]) continue;
      if (exclude && a[0] ==  exclude[0] && a[1] ==  exclude[1] && a[2] ==  exclude[2]) continue;
      let d = cg.dot(v, a);
      if (d > bestDot) { bestDot = d; best = a; }
   }
   return { axis: best, dot: bestDot };
}

let basisMatrix = (X,Y,Z,T) => [ X[0],X[1],X[2],0, Y[0],Y[1],Y[2],0, Z[0],Z[1],Z[2],0, T[0],T[1],T[2],1 ];

// SHARED, NETWORKED STATE. A PIECE'S "CLUSTER" IS IDENTIFIED BY THE PIECE ID OF
// ITS ANCHOR (A PIECE THAT IS ITS OWN ANCHOR IS UNGLUED / ITS OWN LONE CLUSTER).

let initialAnchorMatrix = keys.map((key, n) => {
   let angle = 2 * Math.PI * n / keys.length;
   return cg.mTranslate(.4 * Math.sin(angle), 1.2 + .12 * Math.cos(angle), -.7 - .1 * Math.cos(angle));
});

server.init('somaClusterOf',    keys.map((key, n) => n));   // clusterOf[id] = anchor piece id
server.init('somaLocalOffset',  keys.map(() => null));       // 16-matrix, relative to its anchor (null if it IS the anchor)
server.init('somaAnchorMatrix', initialAnchorMatrix);        // 16-matrix, live world pose (meaningful only for anchors)
server.init('somaBonds',        []);                         // array of "smallerId-largerId" glued piece-id pairs
server.init('somaHeldBy',       keys.map(() => null));       // "clientID-hand", or null, per piece

export const init = async model => {

   // BUILD EACH PIECE AS ITS OWN GROUP OF SMALL CUBES.

   let pieces = keys.map(key => {
      let node = model.add();
      let offsets = PIECES[key].I;
      for (let i = 0 ; i < offsets.length ; i++)
         node.add('cube').move(cg.scale(offsets[i], CUBE)).scale(CUBE / 2).color(PIECES[key].C);
      return { key: key, offsets: offsets, node: node };
   });

   let somaClusterOf    = window.somaClusterOf;
   let somaLocalOffset  = window.somaLocalOffset;
   let somaAnchorMatrix = window.somaAnchorMatrix;
   let somaBonds        = window.somaBonds;
   let somaHeldBy       = window.somaHeldBy;

   let held      = { left: null, right: null };   // piece id currently grabbed by MY hands, or null
   let relMatrix = { left: null, right: null };   // piece pose relative to the hand, captured at grab time

   let pieceWorldMatrix = id => {
      let anchorId = somaClusterOf[id];
      return id === anchorId ? somaAnchorMatrix[anchorId]
                              : cg.mMultiply(somaAnchorMatrix[anchorId], somaLocalOffset[id]);
   }

   let membersOf = anchorId => {
      let list = [];
      for (let id = 0 ; id < pieces.length ; id++)
         if (somaClusterOf[id] === anchorId) list.push(id);
      return list;
   }

   // FIND THE UNHELD PIECE NEAREST TO handPos, EXCLUDING PIECES HELD BY ANYONE (LOCAL OR
   // REMOTE), AND EXCLUDING PIECES THAT WOULD FIGHT WITH WHATEVER MY OTHER HAND ALREADY
   // HOLDS (UNLESS THEY'RE DIRECTLY GLUED TOGETHER -- THE ONE CASE WHERE GRABBING BOTH IS
   // MEANT TO DO SOMETHING: DETACH THEM).

   let nearestGrabbable = (handPos, otherHand) => {
      let otherHeldId = held[otherHand];
      let best = null, bestD = GRAB_R;
      for (let n = 0 ; n < pieces.length ; n++) {
         if (somaHeldBy[n]) continue;
         if (otherHeldId !== null && somaClusterOf[n] === somaClusterOf[otherHeldId] &&
             ! somaBonds.includes(bondKey(n, otherHeldId)))
            continue;
         let m = pieceWorldMatrix(n);
         let d = cg.distance([m[12], m[13], m[14]], handPos);
         if (d < bestD) { bestD = d; best = n; }
      }
      return best;
   }

   // ON RELEASE, LOOK FOR A NEARBY GRID FACE Of SOME OTHER CLUSTER TO SNAP AND GLUE TO.

   let trySnap = movedId => {
      let movedAnchorId = somaClusterOf[movedId];
      let movedMembers = membersOf(movedAnchorId);
      let best = null;

      for (let otherAnchorId = 0 ; otherAnchorId < pieces.length ; otherAnchorId++) {
         if (otherAnchorId === movedAnchorId || somaClusterOf[otherAnchorId] !== otherAnchorId) continue;
         let otherMembers = membersOf(otherAnchorId);

         for (let mId of movedMembers)
         for (let oId of otherMembers) {

            let mWorld = pieceWorldMatrix(mId), oWorld = pieceWorldMatrix(oId);
            let rel = cg.mMultiply(cg.mInverse(oWorld), mWorld);   // mId's pose, in oId's local frame
            let rx = nearestAxis(rel.slice(0,3));
            let ry = nearestAxis(rel.slice(4,7), rx.axis);
            if (rx.dot < SNAP_COS || ry.dot < SNAP_COS) continue; // not aligned enough
            let rz = cg.cross(rx.axis, ry.axis);
            let actualT = rel.slice(12,15);

            for (let ci of pieces[mId].offsets)
            for (let cj of pieces[oId].offsets)
            for (let faceDir of FACES) {
               let target = cg.add(cg.scale(cj, CUBE), cg.scale(faceDir, CUBE));
               let ciRotated = cg.add(cg.add(cg.scale(rx.axis, CUBE*ci[0]), cg.scale(ry.axis, CUBE*ci[1])),
                                       cg.scale(rz, CUBE*ci[2]));
               let reqT = cg.subtract(target, ciRotated);
               let d = cg.distance(reqT, actualT);
               if (d < SNAP_DIST && (! best || d < best.dist))
                  best = { dist: d, mId, oId, otherAnchorId, X: rx.axis, Y: ry.axis, Z: rz, T: reqT, mWorld, oWorld };
            }
         }
      }

      if (! best) return;

      let newMWorld = cg.mMultiply(best.oWorld, basisMatrix(best.X, best.Y, best.Z, best.T));
      let deltaTransform = cg.mMultiply(newMWorld, cg.mInverse(best.mWorld));
      let snapshots = movedMembers.map(p => [p, pieceWorldMatrix(p)]);
      let otherAnchorMatrix = somaAnchorMatrix[best.otherAnchorId];

      for (let [p, worldM] of snapshots) {
         somaClusterOf[p] = best.otherAnchorId;
         somaLocalOffset[p] = cg.mMultiply(cg.mInverse(otherAnchorMatrix), cg.mMultiply(deltaTransform, worldM));
         server.broadcastGlobalSlice('somaClusterOf', p, p+1);
         server.broadcastGlobalSlice('somaLocalOffset', p, p+1);
      }

      somaBonds.push(bondKey(best.mId, best.oId));
      server.broadcastGlobal('somaBonds');
   }

   // IF MY TWO HANDS ARE HOLDING TWO DIRECTLY-GLUED PIECES, BREAK JUST THAT JOINT APART.

   let checkDetach = () => {
      if (held.left === null || held.right === null) return;
      let key = bondKey(held.left, held.right);
      let idx = somaBonds.indexOf(key);
      if (idx < 0) return;
      somaBonds.splice(idx, 1);
      server.broadcastGlobal('somaBonds');

      let clusterAnchorId = somaClusterOf[held.left];
      let memberIds = membersOf(clusterAnchorId);

      let worldOf = {};
      for (let id of memberIds) worldOf[id] = pieceWorldMatrix(id);

      let adjacent = id => memberIds.filter(other => other !== id && somaBonds.includes(bondKey(id, other)));
      let seen = new Set(), components = [];
      for (let id of memberIds) {
         if (seen.has(id)) continue;
         let comp = [], stack = [id];
         seen.add(id);
         while (stack.length) {
            let cur = stack.pop();
            comp.push(cur);
            for (let nb of adjacent(cur))
               if (! seen.has(nb)) { seen.add(nb); stack.push(nb); }
         }
         components.push(comp);
      }
      if (components.length <= 1) return;

      for (let comp of components) {
         let newAnchorId = comp[0];
         somaAnchorMatrix[newAnchorId] = worldOf[newAnchorId];
         server.broadcastGlobalSlice('somaAnchorMatrix', newAnchorId, newAnchorId+1);
         for (let id of comp) {
            somaClusterOf[id] = newAnchorId;
            somaLocalOffset[id] = id === newAnchorId ? null : cg.mMultiply(cg.mInverse(worldOf[newAnchorId]), worldOf[id]);
            server.broadcastGlobalSlice('somaClusterOf', id, id+1);
            server.broadcastGlobalSlice('somaLocalOffset', id, id+1);
         }
      }
   }

   inputEvents.onPress = hand => {
      let handMatrix = clientState.hand(clientID, hand);
      if (! handMatrix) return;
      let id = nearestGrabbable(handMatrix.slice(12,15), hand == 'left' ? 'right' : 'left');
      if (id === null) return;
      held[hand] = id;
      relMatrix[hand] = cg.mMultiply(cg.mInverse(handMatrix), pieceWorldMatrix(id));
      somaHeldBy[id] = clientID + '-' + hand;
      server.broadcastGlobalSlice('somaHeldBy', id, id+1);
   }

   inputEvents.onRelease = hand => {
      let id = held[hand];
      held[hand] = null;
      if (id !== null) {
         somaHeldBy[id] = null;
         server.broadcastGlobalSlice('somaHeldBy', id, id+1);
         trySnap(id);
      }
   }

   model.animate(() => {

      for (let hand of ['left','right'])
         if (held[hand] !== null) {
            let handMatrix = clientState.hand(clientID, hand);
            if (handMatrix) {
               let id = held[hand];
               let anchorId = somaClusterOf[id];
               let desiredMatrix = cg.mMultiply(handMatrix, relMatrix[hand]);
               somaAnchorMatrix[anchorId] = id === anchorId ? desiredMatrix
                  : cg.mMultiply(desiredMatrix, cg.mInverse(somaLocalOffset[id]));
               server.broadcastGlobalSlice('somaAnchorMatrix', anchorId, anchorId+1);
            }
         }
      
      // sync up states
      somaClusterOf    = server.synchronize('somaClusterOf');
      somaLocalOffset  = server.synchronize('somaLocalOffset');
      somaAnchorMatrix = server.synchronize('somaAnchorMatrix');
      somaBonds        = server.synchronize('somaBonds');
      somaHeldBy       = server.synchronize('somaHeldBy');

      checkDetach();

      for (let id = 0 ; id < pieces.length ; id++)
         pieces[id].node.setMatrix(pieceWorldMatrix(id));
   });
}
