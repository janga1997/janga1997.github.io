var timer, animationId, scene,
masterGeom, cubeGeometry,
masterMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    opacity: 0
  }), arrowHelpers, mitchellWorker,
d3Timer, tempCircle = [], interval;

var masterObject = new Vue({
  el: "#masterAbaqus",
  data: {
    packingType: "random",
    smallFib: true,
    lengthMatrix: 100,
    breadthMatrix: 100,
    depthMatrix: 100,
    generatedCenters: [],
    loadSurfaces: [],
    csvCircles: [],
    imageCircles: [],
    volumeFraction: 0.3,
    numFibres: 50,
    fibreYM: 72000,
    fibrePR: 0.2,
    matrixYM: 3500,
    matrixPR: 0.2,
    meshSeed: 2,
    loadDir: 'x',
    loadMagnitude: 10,
    padding: Infinity,
    uploadFile: false,
    imageData: "Image",
    fileName: "sample"
  },
  methods: {
    parseCSV: function(event) {
      parse_csv(event.target.files[0]);
    },

    clearCSV: function(event) {

      event.target.value = "";
    },

    clearEverything: function() {

      if (this.imageData != "Image" && this.uploadFile == true) {
        document.getElementById('imageUpload').value = null;
      }

      console.log('Cleared interval');
      clearInterval(interval);
      $(document).off('keydown');
      masterObject.imageCircles = [];
      tempCircle = [];
    },

    handleImage: function(e) {

      this.clearEverything();

      document.getElementById('svgCS').innerHTML = "";
      var canvas = document.createElement('canvas');
      document.getElementById('svgCS').appendChild(canvas);
      var context = canvas.getContext("2d");
      var mapSprite = new Image();

      var reader = new FileReader();
      reader.onload = function(event) {
        mapSprite.onload = function() {
          masterObject.breadthMatrix = mapSprite.width;
          masterObject.lengthMatrix = mapSprite.height;
          canvas.width = mapSprite.width;
          canvas.height = mapSprite.height;
          context.drawImage(mapSprite, 0, 0);
        }
        mapSprite.src = event.target.result;
      }
      reader.readAsDataURL(e.target.files[0]);

      masterObject.generatedCenters = [];
      canvas.addEventListener("mousedown", mouseClicked, false);

      $(document).keydown(function(e) {
        if (e.which === 90 && e.ctrlKey) {
          masterObject.imageCircles = masterObject.imageCircles.slice(0, -1);
          console.log('Key Pressed');

        }
      });

      interval = setInterval(function() {

        console.log('Janga Redyd');

        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(mapSprite, 0, 0, mapSprite.width, mapSprite.height);

        for (var i = 0; i < tempCircle.length; i++) {
          context.fillStyle = "red";
          context.beginPath();
          context.arc(tempCircle[i][0], tempCircle[i][1], 5, 0, 2 * Math.PI);
          context.fill();
        }

        for (var i = 0; i < masterObject.imageCircles.length; i++) {

          var circle = masterObject.imageCircles[i]
          context.fillStyle = "red";
          context.beginPath();
          context.arc(circle.x, circle.y, circle.getRadius(), 0, 2 * Math.PI);
          context.fill();
        }


      }, 30);
    },

    loadChange: function() {
      var centers = masterObject.generatedCenters,
        breadth = masterObject.breadthMatrix,
        length = masterObject.lengthMatrix,
        depth = masterObject.depthMatrix;

      if (!centers.length) {
        return;
      }

      masterObject.loadSurfaces = handleLoad(centers, breadth, length, depth, masterObject.loadDir);

      change_arrow(breadth, length, depth);

    },

  }
});

killWorker = function () {
  if (typeof(mitchellWorker) != 'undefined') {
    console.log('Worker Stopper');
    mitchellWorker.terminate();
    mitchellWorker = undefined;
  }
}

function generate_random() {
  var completed = false;
  var height = masterObject.lengthMatrix;
  var width = masterObject.breadthMatrix;
  var vertical = masterObject.depthMatrix;

  var numFibres = masterObject.numFibres;
  var volumeFraction = masterObject.volumeFraction;

  var maxRadius = Math.sqrt(volumeFraction * height * width / (Math.PI * numFibres));
  var minRadius = maxRadius;

  masterObject.padding = 0.1 * maxRadius;
  masterObject.meshSeed = Math.round(8*masterObject.padding * 10**4 ) / 10**4;

  var fibreArea = volumeFraction * (width) * (height);

  scene = add_scene();
  masterGeom = new THREE.Geometry();
  add_cube(scene);

  masterObject.generatedCenters = [];

  mitchellWorker = new Worker('js/2Dworker.js');
  mitchellWorker.postMessage([maxRadius, width, height, fibreArea, masterObject.smallFib]);

  mitchellWorker.onmessage = function(event) {
    var circle = event.data[0];

    document.getElementById('minRadius').innerText = (100 * event.data[1]).toFixed(2);

    if (circle == 'finished') {
      master_bsp = new ThreeBSP(masterGeom);
      cube_bsp = new ThreeBSP(cubeGeometry);

      scene.add(cube_bsp.intersect(master_bsp).toMesh(masterMat));
      // scene.add(new THREE.Mesh(masterGeom, masterMat));
      document.getElementById('minRadius').innerText = event.data[1];
      masterObject.loadSurfaces = handleLoad(masterObject.generatedCenters, width, height, vertical, masterObject.loadDir);

    }
    else {
      masterObject.generatedCenters.push([circle[0], circle[1], circle[2]]);
      masterGeom.merge( ...add_fibre(circle[0], circle[1], circle[2]) );
    }
  };

}

function generate_random3D() {
  var completed = false;
  var height = masterObject.lengthMatrix;
  var width = masterObject.breadthMatrix;
  var vertical = masterObject.depthMatrix;

  var numFibres = masterObject.numFibres;
  var volumeFraction = masterObject.volumeFraction;

  var maxRadius = Math.pow(volumeFraction * height * width * vertical/ ((4/3) * Math.PI * numFibres), 1/3);
  var minRadius = maxRadius;

  masterObject.padding = 0.1 * maxRadius;
  masterObject.meshSeed = Math.round(8*masterObject.padding * 10**4 ) / 10**4;

  var fibreVolume = volumeFraction * (width) * (height) * vertical;

  scene = add_scene();
  masterGeom = new THREE.Geometry();
  add_cube(scene);

  masterObject.generatedCenters = [];

  mitchellWorker = new Worker('js/3Dworker.js');
  mitchellWorker.postMessage([maxRadius, width, height, vertical, fibreVolume, masterObject.smallFib]);

  mitchellWorker.onmessage = function(event) {
    var sphere = event.data[0];

    document.getElementById('minRadius').innerText = (100 * event.data[1]).toFixed(2);

    if (sphere == 'finished') {
      master_bsp = new ThreeBSP(masterGeom);
      cube_bsp = new ThreeBSP(cubeGeometry);

      scene.add(cube_bsp.intersect(master_bsp).toMesh(masterMat));

      // scene.add(new THREE.Mesh(masterGeom, masterMat));
      document.getElementById('minRadius').innerText = event.data[1];
      // masterObject.loadSurfaces = handleLoad(masterObject.generatedCenters, width, height, vertical, masterObject.loadDir);

    }
    else {
      masterObject.generatedCenters.push([sphere[0], sphere[1], sphere[2], sphere[3]]);
      masterGeom.merge( ...add_sphere_fibre(sphere[0], sphere[1], sphere[2], sphere[3]) );
    }
  };

}

function generate_cubic() {
  var width = masterObject.breadthMatrix,
    depth = masterObject.depthMatrix;

  var numFibres = masterObject.numFibres;
  var volumeFraction = masterObject.volumeFraction;

  var factors = getFactors(numFibres);

  factors = factors.sort(function(a, b) {
    return a - b;
  });

  var ratio, dimensions;

  if (factors.length % 2 == 1) {
    var index = (factors.length - 1) / 2;
    dimensions = [factors[index], factors[index]];
    ratio = 1;
  } else {
    var index = factors.length / 2;
    dimensions = [factors[index], factors[index - 1]];
    ratio = dimensions[1] / dimensions[0];
  }

  var height = masterObject.lengthMatrix = ratio * width;
  var radius = Math.sqrt(volumeFraction * height * width / (Math.PI * numFibres));

  scene = add_scene();
  masterGeom = new THREE.Geometry();
  add_cube(scene);

  var unit = Math.sqrt(width * height / numFibres);

  masterObject.padding = (unit / 2) - radius;

  masterObject.generatedCenters = [];

  for (var i = 0; i < dimensions[1]; i++) {
    for (var j = 0; j < dimensions[0]; j++) {
      var center = [(i + 0.5) * unit, (j + 0.5) * unit];
      masterObject.generatedCenters.push([center[1], center[0], radius]);

      masterGeom.merge( ...add_fibre(center[1], center[0], radius));
    }
  }

  scene.add(new THREE.Mesh(masterGeom, masterMat));
  masterObject.loadSurfaces = handleLoad(masterObject.generatedCenters, width, height, depth, masterObject.loadDir);

}

function generate_hex() {
  var width = masterObject.breadthMatrix,
    depth = masterObject.depthMatrix;

  var numFibres = masterObject.numFibres;
  var volumeFraction = masterObject.volumeFraction,
    maxFraction = Math.PI / (2 * Math.sqrt(3));

  var factors = getFactors(numFibres);

  factors = factors.sort(function(a, b) {
    return a - b;
  });

  var ratio, dimensions;

  if (factors.length % 2 == 1) {
    var index = (factors.length - 1) / 2;
    dimensions = [factors[index], factors[index]];
  } else {
    var index = factors.length / 2;
    dimensions = [factors[index], factors[index - 1]];
  }

  ratio = ((2 + (dimensions[1] - 1) * Math.sqrt(3)) / (2 * dimensions[0]))

  var height = masterObject.lengthMatrix = ratio * width;
  var maxRadius = width / (2 * dimensions[0]);
  var radius = Math.sqrt(volumeFraction / maxFraction) * maxRadius;

  masterObject.padding = maxRadius - radius;

  scene = add_scene();
  masterGeom = new THREE.Geometry();
  add_cube(scene);

  var unit = Math.sqrt(width * height / numFibres);

  masterObject.generatedCenters = [];
  for (var i = 0; i < dimensions[1]; i++) {
    for (var j = 0; j < dimensions[0] + i % 2; j++) {
      var center = [maxRadius * ((i + 1) % 2) + j * 2 * maxRadius, maxRadius + i * maxRadius * Math.sqrt(3)];
      masterObject.generatedCenters.push([center[0], center[1], radius]);

      masterGeom.merge( ...add_fibre(center[0], center[1], radius));
    }
  }

  scene.add(new THREE.Mesh(masterGeom, masterMat));
  masterObject.loadSurfaces = handleLoad(masterObject.generatedCenters, width, height, depth, masterObject.loadDir);
}

var mouseClicked = function(mouse) {

  if (mouse.button != 0) {
    return;
  }


  var canvas = document.getElementById('svgCS').childNodes[0];
  var rect = canvas.getBoundingClientRect();
  var mouseXPos = (mouse.x - rect.left);
  var mouseYPos = (mouse.y - rect.top);


  // Move the marker when placed to a better location
  var marker = [mouseXPos, mouseYPos];

  tempCircle.push(marker);

  if (tempCircle.length == 3) {

    var Vec2D = toxi.geom.Vec2D,
      Circle = toxi.geom.Circle;

    var p1, p2, p3, circle;

    for (var i = 0; i < tempCircle.length; i++) {
      tempCircle[i] = new Vec2D(tempCircle[i][0], tempCircle[i][1]);
    }

    circle = Circle.from3Points(tempCircle[0], tempCircle[1], tempCircle[2]);
    masterObject.imageCircles.push(circle);

    tempCircle = [];
  }
}

function generate_upload_Image() {

  document.getElementById('imageUpload').value = null;
  clearInterval(interval);
  $(document).off('keydown');

  scene = add_scene();
  masterGeom = new THREE.Geometry();
  add_cube(scene);

  masterObject.generatedCenters = [];

  var row, radius, fibreArea = 0;

  for (var i = 0; i < masterObject.imageCircles.length; i++) {
    row = masterObject.imageCircles[i];

    radius = row.getRadius();
    fibreArea += Math.PI * radius * radius;

    masterObject.generatedCenters.push([row.x, row.y, radius]);
    masterGeom.merge( ...add_fibre(row.x, row.y, radius));
  }

  scene.add(new THREE.Mesh(masterGeom, masterMat));
  masterObject.volumeFraction = fibreArea / (masterObject.breadthMatrix * masterObject.lengthMatrix);

}

function generate_upload_CSVCenter() {

  scene = add_scene();
  masterGeom = new THREE.Geometry();
  add_cube(scene);

  masterObject.generatedCenters = [];

  var row;
  var fibreArea = 0;

  for (var i = 0; i < masterObject.csvCircles.length; i++) {
    row = masterObject.csvCircles[i];

    //Drawing a circle
    masterObject.generatedCenters.push([row[1], row[2], row[0]]);
    masterGeom.merge( ...add_fibre(row[1], row[2], row[0]));
  }

  scene.add(new THREE.Mesh(masterGeom, masterMat));

}

function generate_upload_CSVThree() {

  var Vec2D = toxi.geom.Vec2D,
    Circle = toxi.geom.Circle;

  var height = masterObject.lengthMatrix;
  var width = masterObject.breadthMatrix

  scene = add_scene();
  masterGeom = new THREE.Geometry();
  add_cube(scene);

  masterObject.generatedCenters = [];

  var p1, p2, p3, circle, row;

  for (var i = 0; i < masterObject.csvCircles.length; i++) {
    row = masterObject.csvCircles[i];
    p1 = new Vec2D(row[0], row[1]);
    p2 = new Vec2D(row[2], row[3]);
    p3 = new Vec2D(row[4], row[5]);
    circle = Circle.from3Points(p1, p2, p3);

    //Drawing a circle
    masterObject.generatedCenters.push([circle.x, circle.y, circle.getRadius()]);
    masterGeom.merge( ...add_fibre(circle.x, circle.y, circle.getRadius()));
  }

  scene.add(new THREE.Mesh(masterGeom, masterMat));

}

function getFactors(num) {
  const isEven = num % 2 === 0;
  let inc = isEven ? 1 : 2;
  let factors = [1, num];

  for (let curFactor = isEven ? 2 : 3; Math.pow(curFactor, 2) <= num; curFactor += inc) {
    if (num % curFactor !== 0) continue;
    factors.push(curFactor);
    let compliment = num / curFactor;
    if (compliment !== curFactor) factors.push(compliment);
  }

  return factors;
}

function parse_csv(file) {

  Papa.parse(file, {
    dynamicTyping: true,
    complete: function(results) {
      masterObject.csvCircles = results.data; // results appear in dev console

      masterObject.csvCircles = masterObject.csvCircles.filter(function(arr) {
        return arr.length > 1
      });

      masterObject.breadthMatrix = Number(masterObject.csvCircles[0][0]);
      masterObject.lengthMatrix = Number(masterObject.csvCircles[0][1]);
      masterObject.depthMatrix = Number(masterObject.csvCircles[0][2]);
      masterObject.csvCircles = masterObject.csvCircles.slice(1);
      masterObject.numFibres = masterObject.csvCircles.length;
    }
  });

}

function add_scene() {

  if (typeof(mitchellWorker) != 'undefined') {
    mitchellWorker.terminate();
    mitchellWorker = undefined;
  }

  var length = masterObject.lengthMatrix,
    breadth = masterObject.breadthMatrix,
    depth = masterObject.depthMatrix;

  document.getElementById('svgCS').innerHTML = "";

  var container = document.getElementById('svgCS');

  scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(75, (container.clientWidth/1.1) / (window.innerHeight/1.2), 0.6, 5000);

  var cameraPos = Math.max(length, breadth, depth);
  cameraPos = 1.5 * cameraPos;
  camera.position.set(cameraPos, cameraPos, cameraPos); // all components equal
  camera.lookAt(breadth / 2, length / 2, depth / 2); // or the origin

  var renderer = new THREE.WebGLRenderer();
  renderer.setSize(container.clientWidth/1.1, window.innerHeight/1.2);
  container.appendChild(renderer.domElement);

  var controls = new THREE.TrackballControls(camera, renderer.domElement);
  controls.target.set(breadth / 2, length / 2, depth / 2);

  controls.rotateSpeed = 0.5;


  var animate = function() {

    timer = setTimeout(function() {
      animationId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
      controls.update();
    }, 1000 / 60);

  };

  if (!timer) {
    animate();
    console.log(timer);
    console.log(animationId);
  } else {
    cancelAnimationFrame(animationId);
    clearTimeout(timer);
    animate();
  }

  return scene;
}

function add_cube(scene) {

  var length = masterObject.lengthMatrix,
    breadth = masterObject.breadthMatrix,
    depth = masterObject.depthMatrix;

  var axisHelper = new THREE.AxisHelper(1.5 * Math.max(length, breadth, depth));
  scene.add(axisHelper);

  cubeGeometry = new THREE.BoxGeometry(breadth, length, depth);
  cubeGeometry.translate(breadth/2, length/2, depth/2);
  var material = new THREE.MeshBasicMaterial({
    color: 0x2F4F4F,
    opacity: 0.9,
    transparent: true
  });
  var edges = new THREE.EdgesGeometry(cubeGeometry);
  var line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
    color: 0xffffff
  }));
  scene.add(line);
  var cube = new THREE.Mesh(cubeGeometry, material);
  cube.name = 'Matrix';
  cube.scale.set(0.999, 0.999, 0.99);
  scene.add(cube);

  // line.position.set(breadth / 2, length / 2, depth / 2);
  // cube.position.set(breadth / 2, length / 2, depth / 2);

  add_arrow(breadth, length, depth).forEach(function(element) {
    scene.add(element);
  });

}

function add_arrow(breadth, length, depth) {

  var origin = [ breadth/2, length/2, depth/2 ];
  var length = Math.max(breadth, length, depth) / 2;
  var hex = 0xffff00;
  var dir = {'x':0, 'y':1, 'z':2};
  var dirVec = [0, 0, 0];
  dirVec[dir[masterObject.loadDir]] = 1;
  origin[dir[masterObject.loadDir]] *= 2;

  arrowHelpers = [new THREE.ArrowHelper( new THREE.Vector3( ...dirVec ), new THREE.Vector3( ...origin ), length, hex , length/2, length/3)];

  dirVec[dir[masterObject.loadDir]] = -1;
  origin[dir[masterObject.loadDir]] *= 0;
  arrowHelpers.push(new THREE.ArrowHelper( new THREE.Vector3( ...dirVec ), new THREE.Vector3( ...origin ), length, hex , length/2, length/3))

  return arrowHelpers;

}

function add_sphere_fibre(x, y, z, radius) {
	var geometry = new THREE.SphereGeometry(radius);
  var matrix = new THREE.Matrix4();
  matrix.setPosition(new THREE.Vector3( x, y, z ));

  return [geometry, matrix];

}

function add_fibre(x, y, radius) {

  var depth = Number(masterObject.depthMatrix);

  var geometry = new THREE.CylinderGeometry(radius, radius, 1.01 * depth, 20);
  var geometry_bsp = new ThreeBSP(geometry);

  var matrix = new THREE.Matrix4();
  matrix.makeRotationX( Math.PI/2 ).setPosition(new THREE.Vector3( x, y, depth/2 ));

  return [geometry, matrix];

}

function change_arrow(breadth, length, depth) {

  var origin = [ breadth/2, length/2, depth/2 ];
  var length = Math.max(breadth, length, depth) / 2;
  var hex = 0xffff00;
  var dir = {'x':0, 'y':1, 'z':2};
  var dirVec = [0, 0, 0];
  dirVec[dir[masterObject.loadDir]] = 1;
  origin[dir[masterObject.loadDir]] *= 2;

  arrowHelpers[0].position.fromArray(origin);
  arrowHelpers[0].setDirection(new THREE.Vector3( ...dirVec ));

  dirVec[dir[masterObject.loadDir]] = -1;
  origin[dir[masterObject.loadDir]] *= 0;

  arrowHelpers[1].position.fromArray(origin);
  arrowHelpers[1].setDirection(new THREE.Vector3( ...dirVec ));

}

function getFile() {
  let fileObject = {};

  fileObject = masterObject.$data;

  fileObject = "data = '" + JSON.stringify(fileObject) + "'";


  fileObject = pythonFile + fileObject;
  fileObject += '\nautomateMicro(json.loads(data))';
  let file = new File([fileObject], masterObject.fileName+'.py');
  saveAs(file);
}

function getData() {
  let fileObject = masterObject.generatedCenters.map(x => x.join(',')).join('\r\n');
  fileObject = 'x,y,r\r\n' + fileObject;

  let file = new File([fileObject], masterObject.fileName+'.txt');
  saveAs(file);

}
