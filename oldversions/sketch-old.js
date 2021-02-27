// Copyright (c) 2020 ml5
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/* ===
ml5 Example
BodyPix
=== */

let app = {
  pixelSize: 0
};

let bodypix;
let video;
let segmentation;

const options = {
  outputStride: 32, // 8, 16, or 32, default is 16
  segmentationThreshold: 1, // 0 - 1, defaults to 0.5
};

function preload() {
  bodypix = ml5.bodyPix(options);
}

function setup() {
  createCanvas(320, 240);
  // load up your video
  video = createCapture(VIDEO, videoReady);
  video.size(width, height);
  video.hide();
  
}

function videoReady() {
  bodypix.segment(video, gotResults);
}

function draw() {
  background(255);
  if (segmentation && newSegment) {
    segmentation.backgroundMask.loadPixels();
    let img = segmentation.backgroundMask;

    for (let i = 0; i < img.pixels.length; i += 4 + app.pixelSize) {
      let r = img.pixels[i];
      let g = img.pixels[i+1];
      let b = img.pixels[i+2];

      if ((r == 0 && g == 0 && b == 0 )|| (r == 255 && g == 255 && b == 255)) {
        continue;
      }

      let noiseVal1 = noise((r+i)*.1);
      img.pixels[ i] = r*noiseVal1; // r*noiseVal1;
      img.pixels[i + 1] = 0;
      img.pixels[i + 2] = 0;
      //img.pixels[i + 3] = ;
      
    }

    img.updatePixels();
    push();
    scale(-1,1);
   // image(pm, 0, 0, -width, height);
    image(img, 0, 0, -width, height);

    pop();
    newSegment = false;
  } else if (segmentation) {
    let img = segmentation.backgroundMask;

    push();
    scale(-1,1);
    image(img, 0, 0, -width, height);
    pop();

  }

}

function gotResults(error, result) {
  if (error) {
    console.log(error);
    return;
  }
  segmentation = result;
  newSegment = true;
  bodypix.segment(video, gotResults);
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

function getLocColor(img, x, y) {
  let loc = (x + (y*img.width))*4;
  let r = img.pixels[loc];
  let g = img.pixels[loc+1];
  let b = img.pixels[loc+2];
  return color(r, g, b);
}
