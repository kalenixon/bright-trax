const BRIGHTTHRESH = 90;
const COLORTHRESH = 70;
const PSYCHWAITTIME = 8000;
const MOTION_LINE = 1;
const MOTION_REV = 2;
const detectionOptions = {
  withLandmarks: true,
  withDescriptors: false,
};

let app = {
	pixelSize: 5,
  nodeDim: 15,
  numNodes: 2,
  nodeCollideThresh: 35,
	drawSquare: true,
  trackR: 255,
  trackG: 255,
  trackB: 255,
  fillR: 255,
  fillG: 0,
  fillB: 0,
  cthresh: 0,
  bthresh: 0,
  useShader: false,
  motion: MOTION_LINE,
  ns: .01,
  faceOnly: true,
  leftPart: 'leftEye',
  rightPart: 'rightEye'
};

let faceapi;
let detections;
let poseNet;
let pose;
let saved = []; // array of PsychPixs
let savedColors = [];
let nodes = []; // array of PixNodes
let faceX = 0;
let faceY = 0;
let faceW = 0;
let faceH = 0;
let init = false;

function setup() {
	createCanvas(640, 480);
	capture = createCapture(VIDEO, videoReady);
	capture.hide();

  poseNet = ml5.poseNet(capture, modelLoaded);
  poseNet.on('pose', gotPoses);
  faceapi = ml5.faceApi(capture, detectionOptions, modelReady);

  app.bthresh = BRIGHTTHRESH;
  app.cthresh = COLORTHRESH;

  setFillColors({mode: 'random'});
  colorMode(HSB, 100);
}

function videoReady() {
  for (let i = 0; i < app.numNodes; i++) {
    let node = {};
    let speed = parseInt(random(10)) % 2 == 0 ? app.pixelSize : -app.pixelSize;
    let div = 100/app.numNodes;

    node.color = color(parseInt(div*(i+1)), 50, 75);
    node.speed = speed + parseInt(random(0, 2));
    node.dim = app.nodeDim;
    node.x = random(width);
    node.y = random(height);
    nodes[i] = new PixNode(node);
  }
  init = true;
}

function modelLoaded() {
  console.log('poseNet ready');
}

function modelReady() {
  console.log("faceapi ready!");
  console.log(faceapi);
  faceapi.detect(gotResults);
}

function gotResults(err, result) {
  if (err) {
    console.log(err);
    return;
  }

  detections = result;
  if (detections) {
    if (detections.length > 0) {
      drawBox(detections);
    }
  }
  faceapi.detect(gotResults);
}

function drawBox(detections) {
  for (let i = 0; i < detections.length; i += 1) {
    const alignedRect = detections[i].alignedRect;
    faceX = width - alignedRect._box._x -1;
    faceY = alignedRect._box._y;
    faceW = alignedRect._box._width;
    faceH = alignedRect._box._height;
  }
}

function gotPoses(poses) {
  if (poses.length > 0) {
    pose = poses[0].pose;
  }
}

function draw() {
  if (!init) {
    return;
  }

  let ns = app.ns;
  capture.loadPixels();

  colorMode(RGB, 255);
  background(255);

  saved = [];
  savedColors = [];

	for (let x = 0; x < capture.width; x += app.pixelSize) {
  	for (let y = 0; y < capture.height; y += app.pixelSize) {
      let c = getLocColor(width-x-1, y);
      
      if (!app.faceOnly || (app.faceOnly && x >= faceX-faceW && y >= faceY && x <= faceX  && y <= faceY+faceH)) {     
        let d = dist(
          red(c),
          green(c),
          blue(c),
            app.trackR,
            app.trackG,
            app.trackB
        );

        if (d < app.cthresh) {
          if (!savedColors[x]) {
            savedColors[x] = [];
          }

          savedColors[x][y] = 1;
        } 

        if (savedColors[x] && savedColors[x][y] == 1) {
          let nc = color(app.fillR, app.fillG, app.fillB);
          colorMode(HSB, 100);  

          if (app.useShader) {
            nc = getShaderColor(nc, x, y, ns);
          }  

          fill(hue(nc), saturation(nc), brightness(c) * 2);
          drawPixel(app.pixelSize , app.drawSquare, x, y);  
          colorMode(RGB, 255);
        }  
      }

      if (brightness(c) > app.bthresh) {
        if (!saved[x]) {
          saved[x] = [];
        }

        saved[x][y] = new PsychPix(width-x-1, y);
        let node = saved[x][y].getNode();

        if (!node || node == null) {
          let div = height / nodes.length;
          let idx = null;
          for (let i = 0; i < nodes.length; i++) {
            if (y >= div*i && y < div * (i+1)) {
              idx = i;
              break;
            }
          }
          saved[x][y].setNode(nodes[idx]);
        }  
      } else {
        // This is not a bright pixel, move on to next iteration
        if (saved[x] && saved[x][y] != null) {
          saved[x][y].hide();
        }
        continue;
      }
 
      saved[x][y].setColor(c, ns);
	  }
  }

  for (let x = 0; x < capture.width; x += app.pixelSize) {
    for (let y = 0; y < capture.height; y += app.pixelSize) {
      if (saved[x] && saved[x][y]) {
        saved[x][y].display();
      }
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    nodes[i].draw();
    nodes[i].move();
  }

  if (!pose) return;

  // Loop through nodes, if two are near enough, collide them
  // If one is near an eye, lock it to the eye
  for (let i = 0; i < nodes.length; i++) {
    for (let j = 0; j < nodes.length; j++) {
      let n = nodes[i];

      if (i != j && !nodes[i].collision && !nodes[j].collision && (abs(nodes[i].location.x - nodes[j].location.x) < app.nodeCollideThresh && 
        abs(nodes[i].location.y - nodes[j].location.y) < app.nodeCollideThresh)) 
      {
        nodes[i].collide(nodes[j]);
      }

      if (!n.locked && !n.lockWait && app.motion != MOTION_REV) {
        let lw = pose[app.leftPart];
        let rw = pose[app.rightPart];
        let lyd = abs(n.location.y - lw.y);
        let lxd = abs(n.location.x - (width - lw.x -1));
        let ryd = abs(n.location.y - rw.y);
        let rxd = abs(n.location.x - (width - rw.x - 1));

        if (lyd <= app.nodeCollideThresh+20 && lxd <= app.nodeCollideThresh+20) {
          n.lock(app.leftPart);
        } else if (ryd <= app.nodeCollideThresh+20 && rxd <= app.nodeCollideThresh+20) {
          n.lock(app.rightPart);
        }
      }
    }
  }
}

class PixNode {
  constructor(node) {
    this.info = node;
    this.location = createVector(node.x, node.y);
    this.velocity = createVector(node.speed, node.speed);
    this.dim = node.dim; // w/h of visible node circle
    this.speed = node.speed;
    this.color = node.color;
    this.collision = false;
    this.angle = 0;
    this.angleDir = 1;
    this.locked = false;
    this.lockWait = false;
  }
  move() {
    if (this.locked) {
      return;
    }

    if (app.motion == MOTION_LINE) {
      this.location.add(this.velocity);
      
      if (this.location.x >= width) {
        this.location.x = width-1;
        this.velocity.x = -this.velocity.x - parseInt(random(-2, 2));
      }
      if (this.location.x <= 0) {
        this.location.x = 0;
        this.velocity.x = abs(this.velocity.x) + parseInt(random(-2, 2));
      }
      if (this.location.y >= height) {
        this.location.y = height - 1;
        this.velocity.y = -this.velocity.y - parseInt(random(-2, 2));
      }
      if (this.location.y <= 0) {
        this.location.y = 0;
        this.velocity.y = abs(this.velocity.y) + parseInt(random(-2, 2));
      } 
    } else if (app.motion == MOTION_REV) {
      push();
      translate(this.location.x, this.location.y);
      this.location.rotate(this.angle);  
      //rotate(this.angle);
      if (this.angleDir == 0) {
        this.angle -= 0.001;
        if (this.angle <= 0) {
          this.angleDir = 1;
          this.angle = 0;
        }
      } else {
        this.angle += 0.001;
        if (this.angle >= 1) {
          this.angleDir = 0;
          this.angle = 1;
        }
      }

      //if (this.angle >= 1) this.angle = 0;
      pop();
    }
  }
  collide(node) {
    if (this.locked) return;
    if (app.motion == MOTION_LINE) {
      let self = this;
      let saved = createVector(this.velocity.x, this.velocity.y);

      this.velocity.set(node.velocity.x, node.velocity.y);
      node.velocity.set(saved.x, saved.y);
      node.collision = true;
      this.collision = true;

      console.log('COLLISION!');

      setTimeout(function() {
        node.collision = false;
        self.collision = false;
      }, 100);
    }
  }
  draw() {
    fill(this.color);
    noStroke();

    if (this.locked) {
      this.location.x = width - pose[this.part].x -1;
      this.location.y = pose[this.part].y;
    }
  
    ellipse(this.location.x , this.location.y, this.dim, this.dim);
  }
  lock(part) {
    this.locked = true;
    this.part = part;
  }
  unlock() {
    let self = this;

    this.locked = false;
    this.part = null;
    this.lockWait = true;

    setTimeout(function() {
      self.lockWait = false;
    }, 1000);
  }
}

class PsychPix {
  constructor(x, y){
    this.location = createVector(x, y);
    this.velocity = createVector(0, 0);
    this.add = true;
    this.amt = 10;
    this.sum = 0;
    this.node = null;
    this.color = null;
  }

  getNode() {
    return this.node;
  }

  setNode(node) {
    this.node = node;
  }

  move(){
    this.velocity = createVector(this.amt, this.amt);

    if (this.add) {
      this.location.add(this.velocity);
      this.sum += this.amt;
    } else {
      this.location.sub(this.velocity);
      this.sum -= this.amt;
    }

    if (this.sum > 100 && this.add) {
      this.add = false;
    } else if (this.sum <= 0 && !this.add) {
      this.add = true;
    }
  }
  setColor(c, ns) {
    //colorMode(HSB, 100);
    if (app.useShader) {
      c = getRGBShader(c, this.location.x, this.location.y, ns);
    }
  // c = getShaderColor(c, this.location.x, this.location.y, ns);
    this.color = c;
  }
  
  display(){
    stroke(this.color);
    strokeWeight(app.pixelSize);
    line(this.node.location.x, this.node.location.y, width - this.location.x -1, this.location.y);
  }
  hide() {

  }
}

function setFillColors(opts) {
  switch(opts.mode) {
    case 'random' : 
      app.fillR = random(255);
      app.fillG = random(255);
      app.fillB = random(255);
  }
}

function mouseClicked() {
  let loc = (width - mouseX  - 1 + (mouseY*capture.width))*4;
  app.trackR = capture.pixels[loc];
  app.trackG = capture.pixels[loc+1];
  app.trackB = capture.pixels[loc+2];
}

function keyPressed() {
  for (let i = 0; i < nodes.length; i++) {
    if (keyCode == 81) {  // q
      nodes[i].velocity.x *= 2;
      nodes[i].velocity.y *= 2;
    } else if (keyCode == 87) {  //w
      nodes[i].velocity.x = parseInt(nodes[i].velocity.x / 2);
      nodes[i].velocity.y = parseInt(nodes[i].velocity.y / 2);
      if (nodes[i].velocity.x <= 0) nodes[i].velocity.x = 1;
      if (nodes[i].velocity.y <= 0) nodes[i].velocity.y = 1;
    } else if (keyCode == 85) { // u
        nodes[i].unlock();
    }
  }

  if (keyCode == 90) {  //z
    app.useShader = !app.useShader;
  } else if (keyCode == 88) { // x
    if (app.motion == MOTION_LINE) {
      app.motion = MOTION_REV;
    } else if (app.motion == MOTION_REV) {
      app.motion = MOTION_LINE;
    }
  } else if (keyCode == 65) { // a
    app.ns = random(0, 1) / 100;
  } else if (keyCode == 67) { // c
    setFillColors({mode: 'random'});
  } else if (keyCode == 70) { // f
    app.faceOnly = !app.faceOnly;
  } 
}

function drawPixel(pixelSize, drawSquare, x, y) {
  noStroke();
  if (drawSquare) {
      square(x , y, pixelSize);
    } else {
      ellipse(x, y, pixelSize, pixelSize);
    }
}

function getLocColor(x, y) {
  let loc = (x + (y*capture.width))*4;
  let r = capture.pixels[loc];
  let g = capture.pixels[loc+1];
  let b = capture.pixels[loc+2];
  return color(r, g, b);
}

function getShaderColor(c, i, j, noiseScale) {
  let h = hue(c);
  let s = saturation(c);
  let b = brightness(c);
  let noiseVal1 = noise((h+i)*noiseScale, (h+j)*noiseScale);
  let noiseVal2 = noise((s+i)*noiseScale, (s+j)*noiseScale);
  let noiseVal3 = noise((b+i)*noiseScale, (b+j)*noiseScale);
  c = color(
    (h*noiseVal1), 
    (s*noiseVal2), 
    (b*noiseVal3*2)
  );
    
  return c;
}

function getRGBShader(c, i, j, noiseScale) {
  let r = red(c);
  let g = green(c);
  let b = blue(c);

  if (noiseScale) {
    let noiseVal1 = noise((r+i)*noiseScale, (r+j)*noiseScale);
    let noiseVal2 = noise((g+i)*noiseScale, (g+j)*noiseScale);
    let noiseVal3 = noise((b+i)*noiseScale, (b+j)*noiseScale);
    c = color(
      (r*noiseVal1), 
      (g*noiseVal2), 
      (b*noiseVal3)
    );

    colorMode(HSB, 100);
    c = color(hue(c), saturation(c), brightness(c)*2);
    colorMode(RGB, 255);
  }
  return c;
}
