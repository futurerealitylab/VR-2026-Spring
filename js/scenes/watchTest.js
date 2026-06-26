import {ControllerBeam} from "../render/core/controllerInput.js";
//import {Puck} from "../third-party/puck.js";

let beams = null;

function getDistance(x1,y1,z1,x2,y2,z2)
{
    let dx = x2 - x1;
    let dy = y2 - y1;
    let dz = z2 - z1;
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

export const init = async model => {
    //Create a box
    let targetBox = model.add('cube').move(0,1.5,-0.5).scale(0.15).color(1,1,1);
    beams = {   left : new ControllerBeam(model, 'left' ),
                right: new ControllerBeam(model, 'right') 
            };
    let debugTextNode = model.add();
    let targetBox2 = model.add('sphere').move(0,1.5,-0.5).scale(0.25).color(1,1,1);
    

    model.animate(() => {
        
        beams.left.update();
        beams.right.update();

        // Use the global inputEvents to get the controller position
        let rightHandPos = inputEvents.pos('right');
        
        // Clear the previous frame's text geometry
        while (debugTextNode.nChildren() > 0) {
                debugTextNode.remove(0);
            }
        debugTextNode.add(clay.text("HELLO WORLD")).move(1, 1.8, -1).scale(10);
        console.log(rightHandPos);

        /*
        if (rightHandPos) {
            // Get the current [X, Y, Z] position of the target box (the cube)
            let boxMatrix = targetBox.getGlobalMatrix();
            //Transformation matrix
            let boxX = boxMatrix[12];
            let boxY = boxMatrix[13];
            let boxZ = boxMatrix[14];

            //Calculate how far the hand is from the box
            let distance = getDistance(boxX, boxY, boxZ, rightHandPos[0], rightHandPos[1], rightHandPos[2]);
            
            let coordString = `Pos: ${rightHandPos[0].toFixed(2)}, ${rightHandPos[1].toFixed(2)}, ${rightHandPos[2].toFixed(2)}\nDist: ${distance.toFixed(2)}`;
            
            // Add text with color and a larger scale (0.1) to ensure it is visible in VR
            debugTextNode.add(clay.text(coordString)).move(0, 1.8, -1).scale(0.1).color(1, 1, 1);

            while (debugTextNode.nChildren() > 0) {
                debugTextNode.remove(0);
            }
            //let coordString = `X: ${rightHandPos[0].toFixed(2)}   Y: ${rightHandPos[1].toFixed(2)}   Z: ${rightHandPos[2].toFixed(2)} X: ${distance.toFixed(2)}`;
            let coordString = "Hello";
            //debugTextNode.add(clay.text(coordString)).move(0, 1.8, -1).scale(0.04);
            debugTextNode.add(clay.text("HELLO WORLD")).move(0, 1.8, -1).scale(0.04);
            // Trigger visual feedback (red color) when touching the box
            targetBox.color(distance <= 0.15 ? [1, 0, 0] : [1, 1, 1]);


            if (distance <= 0.15)
            {
                targetBox.color(1,0,0);
            }
            else
            {
                targetBox.color(1,1,1)
            }
        } else {
            // Fallback text if the controller isn't detected
            debugTextNode.add(clay.text("Waiting for controller...")).move(0, 1.8, -1).scale(0.1).color(1, 1, 1);
        }*/

    });
};