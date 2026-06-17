/*
   Create and animate hierarchical joints.
*/
let speed = 0.8

export const init = async model => {

   model.txtrSrc(1, '../media/textures/tire.png');

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
   carbody.add('cube').scale(.8,.25,.4).move(0.8,1.5,-1).color(1,0,0);
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

   // ANIMATE THE JOINTS OVER TIME.
   model.scale(0.8,0.8,0.8).move(-0.5,1.3,0).animate(() => {
      carbody.identity()
      .turnY(Math.sin(speed*model.time)*.7+.7);

      wheelFL.identity()
      .turnZ(Math.sin(speed*model.time)*.7+.7);
      wheelFR.identity()
      .turnZ(Math.sin(speed*model.time)*.7+.7);
      wheelBL.identity()
      .turnZ(Math.sin(speed*model.time)*.7+.7);
      wheelBR.identity()
      .turnZ(Math.sin(speed*model.time)*.7+.7);
   });
}

