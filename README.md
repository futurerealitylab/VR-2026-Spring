# VR-2026-Spring

Software for CSCI-GA.3033-​097 Virtual Reality 2026 Spring.

---

## Final Project: ONE MATCH

* **Video Demo:** [Demo](https://drive.google.com/file/d/1hcZmToe40c4seTaOOcKJAmMABfISPNRJ/view?usp=drive_link)
* **Code:** 
  * `js/scenes/final_project.js`
  * `js/scenes/micro_world.js`

---

## Assignments Demo Videos

* **Assignment 1: Car** 
  * **Video Demo:** [Assignment 1 Demo](https://drive.google.com/file/d/1Gta9nbOM10y1SD-sA6ITCxklQPSvHXZj/view?usp=drive_link)
  * **Code:** `js/scenes/car.js`

* **Assignment 2: Car Drive**
  * **Video Demo:** [Assignment 2 Demo](https://drive.google.com/file/d/1PRdBgv2hsOrSPU_klBabnfIkiDOFTRDW/view?usp=drive_link)
  * **Code:** `js/scenes/carDrive.js`


* **Assignment 3: Campfire** 
  * **Video Demo:** [Assignment 3 Demo](https://drive.google.com/file/d/1zaMHrFpwI21bqsKqNw5JxlqIVy6axHd6/view?usp=drive_link)
  * **Code:** `js/scenes/campFire.js`

* **Assignment 4: Text Party**
  * **Video Demo:** [Assignment 4 Demo](https://drive.google.com/file/d/1th_Ud-LDqwSxh8X0xEZjG6v583vUt9uo/view?usp=drive_link)
  * **Code:** `js/scenes/textHW.js`

* **Assignment 5: Spirit Exercise**
  * **Video Demo:** [Assignment 5 Demo](https://drive.google.com/file/d/1I7-1yRY8cPxwxCbqNgO94Vv5jAc6i_o-/view?usp=drive_link)
  * **Code:** `js/scenes/spirit_exercise.js`

* **Assignment 6: Headgaze Exercise**
  * **Video Demo:** [Assignment 6 Demo](https://drive.google.com/file/d/1wHeAjisn9--nFuDG4DWscihcDw95RE81/view?usp=drive_link)
  * **Code:** `js/scenes/headGazeExercise.js`
    
* **Extra Exercise: Master**
  * **Video Demo:** [Master Exercise Demo](https://drive.google.com/file/d/1FbCLOqYvVAQyVaVW9qjcx53Iw2fukeES/view?usp=drive_link)
  * **Code:** `js/scenes/master2.js`

* **Final Project**
  * **Video Demo:** [Final Project Demo](./media/videos/final_demo.mp4)
  * **Code:** `js/scenes/final_project.js`

---
# How to setup the environment

install Node.js and npm if you haven't. This project was tested using **Node v18.20.8**; if you run into issues, we recommend switching to this version.
Then in the command line, do
```sh
npm install
cd server
npm install
source patch
```
If source patch does not work, try
```sh
sh patch_fixed.sh
```

# How to run on your local computer

1. At the root folder, do ``./startserver``
2. Go to chrome://flags/ in your Google Chrome browser
3. Search: ***"Insecure origins treated as secure"*** and enable the flag
4. Add http://[your-computer's-ip-address]:2026 to the text box. For example http://10.19.127.1:2026
5. Relaunch the chrome browser on your computer and go to http://localhost:2026

# How to run in VR

1. Run the program locally on your computer
2. Open the browser on your VR headset
3. Go to chrome://flags/
4. Search: ***"Insecure origins treated as secure"*** and enable the flag
5. Add http://[your-computer's-ip-address]:2026 to the text box. For example http://10.19.127.1:2026
7. Relaunch the browser on your VR headset and go to http://[your-computer's-ip-address]:2026 

# How to debug in VR

1. On your Oculus app, go to *Devices*, select your headset from the device list, and wait for it to connect. Then select *Developer Mode* and turn on *Developer Mode*.
2. Connect your quest with your computer using your Oculus Quest cable.
3. Go to chrome://inspect#devices on your computer
4. Go to your VR headset and accept *Allow USB Debugging* when prompted on the headset
5. On the chrome://inspect#devices on your computer, you should be able to see your device under the *Remote Target* and its active programs. You can then inspect the *VR-2026-Spring* window on your computer.

# How to create your own demo

1. Go to the [scenes folder](https://github.com/futurerealitylab/VR-2026-Spring/tree/master/js/scenes/) and create a .js file based on the template of [shapes.js](https://github.com/futurerealitylab/VR-2026-Spring/tree/master/js/scenes/shapes.js)
2. Change the name and the content of the demo to whatever you like!
3. Go to [scenes.js](https://github.com/futurerealitylab/VR-2026-Spring/tree/master/js/scenes/scenes.js), add the name of your demo and its path to the returned value of [```scenes```](https://github.com/futurerealitylab/VR-2026-Spring/tree/master/js/scenes/scenes.js#L13)
4. Note that the [```enableSceneReloading```](https://github.com/futurerealitylab/VR-2026-Spring/tree/master/js/scenes/scenes.js#L12) is set to true so that you can hot-reload the changes in your demo. 

# How to enable your hand-tracking

1. Enable the experimental feature in the browser (Oculus Browser 11)
2. Visit chrome://flags/
3. Enable WebXR experiences with joint tracking (#webxr-hands)
4. Enable WebXR Layers depth sorting (#webxr-depth-sorting)
5. Enable WebXR Layers (#webxr-layers)
6. Enable phase sync support (#webxr-phase-sync)
7. Enable "Auto Enable Hands or Controllers" (Quest Settings (Gear Icon) -> Device -> Hands and Controllers)
8. Enter the VR experience
