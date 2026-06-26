/*
   This is a very simple example of how to use the
   inputEvents object.

   When the scene is in XR mode, the x position of
   the left controller controls the red component
   of the cube's color, and the x position of the
   right controller controls the blue component of
   the cube's color.
*/

import {Puck} from "../third-party/puck.js";

function getDistance(x1,y1,z1,x2,y2,z2)
{
    let dx = x2 - x1;
    let dy = y2 - y1;
    let dz = z2 - z1;
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

export const init = async model => {
   console.log("Loaded watchTest2");
   let watchCommand = 
                "\x10" +
                "Bangle.buzz(10,1);\n" +
                "g.clear(1);\n" + 
                "g.setFontAlign(0,0);\n" +
                "g.setFont('Vector', 10);\n" + // 80 might be too big for the screen!
                "g.drawString('Connected to watchTest2', g.getWidth()/2, g.getHeight()/2);\n" +
                "Bangle.setLCDPower(1);\n"; // Forces the screen on, just in case it went to sleep
   Puck.write(watchCommand);
   watchCommand = 
               "function makeWatchBuzz() {Bangle.buzz(90,0.2);}\n";
   Puck.write(watchCommand);


   let obj1 = model.add('cube');
   let debugTextNode = model.add();
   let wasInside = false;
   let lastBuzzTime = 0;

   // USING THE GLOBAL inputEvents OBJECT

   //inputEvents.onPress = hand => color = [0,0,1];
   //inputEvents.onRelease = hand => color = [1,0,0];

   inputEvents.onMove = hand => {
      if (isXR()) {
         //Should I put code in animate or onMove?
         let handPos = inputEvents.pos('right');
         console.log("Cur handPos" + handPos);

         //let boxMatrix = obj1.getGlobalMatrix();
         //   //Transformation matrix
         //   let boxX = boxMatrix[12];
         //   let boxY = boxMatrix[13];
         //   let boxZ = boxMatrix[14];
         //let dist = getDistance(rightHandPos[0], rightHandPos[1], rightHandPos[2], boxX, boxY, boxZ);
         //console.log(dist);*/


      }
   }

   let color = [.5,.5,.5];
   model.move(0,1.5,0).scale(.1).animate(() => {
      
      obj1.identity().color(color);
      if (true)//(isXR()) 
      {
         //Should I put code in animate or onMove?
         //let handPos = inputEvents.pos('right');
         let handPos = inputEvents.pos('right') ?? [0, 0, 0];
         console.log("Cur handPos" + handPos);
         let boxMatrix = obj1.getGlobalMatrix();
         //Transformation matrix
         let boxX = boxMatrix[12];
         let boxY = boxMatrix[13];
         let boxZ = boxMatrix[14];
         let dist = getDistance(handPos[0], handPos[1], handPos[2], boxX, boxY, boxZ);
         
         while (debugTextNode.nChildren() > 0) {
                debugTextNode.remove(0);
            }
         //debugTextNode.add(clay.text("HELLO WORLD")).move(1, 1.8, -1).scale(30);
         debugTextNode.add(clay.text("hand pos "+ handPos)).move(1, 1.8, -1).scale(30);
         debugTextNode.add(clay.text("Distance "+ dist)).move(1, 1.0, -1).scale(30);
         
         if(dist < 0.4)
         {
            obj1.color(1,0,0);
            if(!wasInside)
            {
               let command =
                           "\x10" +
                           "g.clear(1);\n" +
                           "g.setFontAlign(0,0);\n" +
                           "g.setFont('Vector', 20);\n" +
                           "g.drawString('Touching box', g.getWidth()/2, g.getHeight()/2);\n" +
                           "Bangle.setLCDPower(1);\n" +
                           "clearInterval(global.counterInterval);\n" +
                           "global.counterInterval = setInterval(makeWatchBuzz, 100);\n";
               Puck.write(command);
               wasInside = true;
            }
         }
         else
         {
            obj1.color(.5,.5,.5);
            if(wasInside)
            {
               let exitCommand = 
                           "\x10" +
                           "g.clear(1);\n" +
                           "clearInterval(global.counterInterval);\n" +
                           "Bangle.setLCDPower(0);\n" +
                           "g.drawString('Not touching box', g.getWidth()/2, g.getHeight()/2);\n"
               Puck.write(exitCommand);
               wasInside = false;

            }
         }

         /*
         if(dist < 0.4)
         {
            obj1.color(1,1,0);
            if(!wasInside)
            {
               let screenCommand = 
                    "\x10" +
                    "g.clear(1);\n" + 
                    "g.setFontAlign(0,0);\n" +
                    "g.setFont('Vector', 40);\n" + 
                    "g.drawString('Inside!', g.getWidth()/2, g.getHeight()/2);\n" +
                    "Bangle.setLCDPower(1);\n";
               Puck.write(screenCommand);
               wasInside = true;
            }

            let curTime = Date.now();
            if(curTime - lastBuzzTime > 200)
            {
               let watchCommand = 
                    "\x10" +
                    "Bangle.buzz(160,0.2);\n";
               Puck.write(watchCommand);
               lastBuzzTime = curTime;
            }

            
         }
         */
      }
   });
}
