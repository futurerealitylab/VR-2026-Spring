import * as cg from "../render/core/cg.js";
import { RTC } from "../render/core/RTC.js";

export const init = async model => {
   let r2 = Math.sqrt(2);
   model.animate(() => {
      while (model.nChildren() > 0)
         model.remove(0);

      //model.identity().move(0,1.5,0).scale(.1).turnY(-.6).turnX(.25).turnZ(-.2);

      model.identity().move(0,.5,0).scale(.1).turnY(-.1);

      // ROOF

      model.add('cube').color(1,0,0).move(0,1+r2/2,0).turnZ( Math.PI/4).move(-.7,.25,0).scale(1,.05,1.1);
      model.add('cube').color(1,0,0).move(0,1+r2/2,0).turnZ(-Math.PI/4).move( .7,.25,0).scale(1,.05,1.1);

      // HOUSE

      model.add('cube').color(1,.5,.5);
      model.add('cube').color(1,.5,.5).move(0,1,0).turnZ(Math.PI/4).scale(r2/2,r2/2,.99);

      let dark = [.05,.05,.05];

      // CHIMNEY

      model.add('cube').color(.5,.1,.1).move(.7,1,-.5).scale(.2,1,.2);
      model.add('cube').color(.5,.1,.1).move(.7,2,-.5).scale(.25,.1,.25);
      model.add('cube').color(dark)    .move(.7,2,-.5).scale(.15,.11,.15);

      // FRONT DOOR

      model.add('cube').color(0,0,0).dull().move(0,-.52,1).scale(.28,.48,.01);

      // FRONT WINDOWS

      model.add('cube').color(dark).move(-.6,.5,1).scale(.2,.3,.01);
      model.add('cube').color(dark).move( .6,.5,1).scale(.2,.3,.01);

      // FRONT WINDOW SHADES

      model.add('cube').color(.8,1,1).move(-.6,.7,1).scale(.201,.101,.02);
      model.add('cube').color(.8,1,1).move( .6,.7,1).scale(.201,.101,.02);

      // BACK WINDOW AND SHUTTERS

      model.add('cube').color(.1,.1,.1).dull().move(  0,.5,-1).scale(.3,.4,.01);
      model.add('cube').color(.5,.1,.1)    .move(-.3,.5,-1).scale(.1,.42,.02);
      model.add('cube').color(.5,.1,.1)    .move( .3,.5,-1).scale(.1,.42,.02);

      // BUILD AND DISPLAY THE RAY TRACED HOUSE.

      let m = [], c = [];
      for (let n = 0 ; n < model.nChildren() ; n++) {
         c.push(model.child(n)._color);
         m.push(model.child(n).getMatrix());
      }
      (new RTC(model, m, c)).update();
   });
}
