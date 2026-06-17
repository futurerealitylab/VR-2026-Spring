/*
   This is a very simple example of how to use the
   inputEvents object.

   When the scene is in XR mode, the x position of
   the left controller controls the red component
   of the cube's color, and the x position of the
   right controller controls the blue component of
   the cube's color.
*/
export const init = async model => {
   // See what the inputEvents can do
   // console.log(inputEvents);

   model.txtrSrc(1, '../media/textures/tire.png');

   let speed = 0;
   let color = [1,0,0];
   // CREATE NODES WITH NO SHAPES AS JOINTS FOR ANIMATION.
   let carbody = model.add();

   //wheel center joint
   let wheelFLCenter = carbody.add();
   let wheelFRCenter = carbody.add();
   let wheelBLCenter = carbody.add();
   let wheelBRCenter = carbody.add();

   //wheel joint
   let wheelFL = wheelFLCenter.add();
   let wheelFR = wheelFRCenter.add();
   let wheelBL = wheelBLCenter.add();
   let wheelBR = wheelBRCenter.add();

   // CREATE AND PLACE SHAPES THAT WILL MOVE WITH EACH JOINT.
   // carboday
   let chassis = carbody.add('cube').scale(.8,.25,.4).move(0.8,1.5,-1).color(color);
   //car cabin
   carbody.add('cube').scale(.5,.2,.35).move(0.8,3.8,-1.2).color(1,1,1);;

   // wheel centers
   wheelFRCenter.move(1.2,0,0)
   wheelBLCenter.move(0,0,-0.8)
   wheelFLCenter.move(1.2,0,-0.8)

   wheelBR.add('torusZ').scale(.18,.18,.2).txtr(1);;
   wheelFR.add('torusZ').scale(.18,.18,.2).txtr(1);;
   wheelBL.add('torusZ').scale(.18,.18,.2).txtr(1);;
   wheelFL.add('torusZ').scale(.18,.18,.2).txtr(1);;

   // USING THE GLOBAL inputEvents OBJECT

   inputEvents.onMove = hand => {
      if (isXR()) {
         if (hand == 'left'){
            color[0] = inputEvents.pos(hand)[0] * .5 + .5;
            color[1] = inputEvents.pos(hand)[2] * .5 + .5;
         }
      }
   }

   model.scale(0.3).move(-0.5,4.5,0).animate(() => {
      if (inputEvents.isPressed('right')) {
         speed += 0.005; 
      } else {
         speed *= 0.95; 
      }
            
      //.identity resets everything
      carbody.identity().move(speed * 2, 0, 0);
      chassis.color(color);

      wheelFL.identity()
      .turnZ(-speed*model.time*.7);
      wheelFR.identity()
      .turnZ(-speed*model.time*.7);
      wheelBL.identity()
      .turnZ(-speed*model.time*.7);
      wheelBR.identity()
      .turnZ(-speed*model.time*.7);

   });
}

