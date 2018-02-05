var timer;
var animationId, scene, masterGeom, masterMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    opacity: 0
  }), arrowHelper;
var d3Timer;
var tempCircle = [];
var interval;

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
    fileName: "sample.py"
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

    }

  }
});


function generate_random() {
  var completed = false;
  var height = masterObject.lengthMatrix;
  var width = masterObject.breadthMatrix;
  var vertical = masterObject.depthMatrix;

  var numFibres = masterObject.numFibres;
  var volumeFraction = masterObject.volumeFraction;

  var maxRadius = Math.sqrt(volumeFraction * height * width / (Math.PI * numFibres));
  var minRadius = maxRadius;
  var newCircle = bestCircleGenerator(1.05 * maxRadius, 0.05 * maxRadius, width, height);

  masterObject.padding = 0.1 * maxRadius;

  var fibreArea = volumeFraction * (width) * (height);

  var k = 10, // initial number of candidates to consider per circle
    m = 10;

  scene = add_scene();
  masterGeom = new THREE.Geometry();
  add_cube(scene);

  var count = 0;

  var generatedArea = 0;
  var tempArea = 0;
  masterObject.generatedCenters = [];

  if (d3Timer) {
    d3Timer.stop();
  }

  d3Timer = d3.timer(function() {
    for (var i = 0; i < m && fibreArea > generatedArea; ++i) {
      var circle = newCircle(k);

      if (!masterObject.smallFib) {
        if (circle[2] < maxRadius) {
          // console.log('Smaller fibres eliminated');
          completed = true;
          continue;
        }
      }

      masterObject.generatedCenters.push([circle[0], circle[1], circle[2]]);

      tempArea = removeArea(circle, width, height);
      // console.log(tempArea/(Math.PI * circle[2] * circle[2]) + ', ' + tempArea);
      // console.log(circle);
      // console.log('----------------------------');
      generatedArea += tempArea;
      count++;

      minRadius = Math.min(minRadius, circle[2]);

      masterGeom.merge( ...add_fibre(circle[0], circle[1], circle[2]) );

      // As we add more circles, generate more candidates per circle.
      // Since this takes more effort, gradually reduce circles per frame.
      // if (k < 500) k *= maxRadius/circle[2], m *= 2;

      k = 10 * masterObject.generatedCenters.length;
    }

    if (completed) {
      var error = ((generatedArea - fibreArea) * (100 / fibreArea)).toFixed(3);
      var logMsg = document.createElement('h1');
      logMsg.innerHTML = "Error: " + error + "%";
      var bottom = document.createElement('h5');
      bottom.innerHTML = "greater than required volume fraction";
      alertify.log(logMsg.outerHTML + bottom.outerHTML);

      scene.add(new THREE.Mesh(masterGeom, masterMat));

      document.getElementById('minRadius').innerText = "Minimum Radius: " + minRadius.toFixed(5) +
        "::Maximum Radius: " + maxRadius.toFixed(5);

      masterObject.loadSurfaces = handleLoad(masterObject.generatedCenters, width, height, vertical, masterObject.loadDir);

      d3Timer.stop();
    }

    if (fibreArea <= generatedArea) {
      var error = ((generatedArea - fibreArea) * (100 / fibreArea)).toFixed(3);
      var logMsg = document.createElement('h1');
      logMsg.innerHTML = "Error: " + error + "%";
      var bottom = document.createElement('h5');
      bottom.innerHTML = "greater than required volume fraction";
      alertify.log(logMsg.outerHTML + bottom.outerHTML);

      document.getElementById('minRadius').innerText = "Minimum Radius: " + minRadius.toFixed(5) +
        "\nMaximum Radius: " + maxRadius.toFixed(5);

      scene.add(new THREE.Mesh(masterGeom, masterMat));

      masterObject.loadSurfaces = handleLoad(masterObject.generatedCenters, width, height, vertical, masterObject.loadDir);

      d3Timer.stop();
    }

  });

  function bestCircleGenerator(maxRadius, padding, width, height) {
    var quadtree = d3.quadtree().extent([
        [0, 0],
        [width, height]
      ]),
      searchRadius = maxRadius * 2,
      maxRadius2 = maxRadius * maxRadius;

    return function(k) {
      var bestX, bestY, bestDistance = 0;

      for (var i = 0; i < k || bestDistance < padding; ++i) {
        var x = Math.random() * width,
          y = Math.random() * height,
          rx1 = x - searchRadius,
          rx2 = x + searchRadius,
          ry1 = y - searchRadius,
          ry2 = y + searchRadius,
          minDistance = maxRadius; // minimum distance for this candidate

        quadtree.visit(function(quad, x1, y1, x2, y2) {
          if (p = quad.data) {
            var p,
              dx = x - p[0],
              dy = y - p[1],
              d2 = dx * dx + dy * dy,
              r2 = p[2] * p[2];
            if (d2 < r2) return minDistance = 0, true; // within a circle
            var d = Math.sqrt(d2) - p[2];
            if (d < minDistance) minDistance = d;
          }
          return !minDistance || x1 > rx2 || x2 < rx1 || y1 > ry2 || y2 < ry1; // or outside search radius
        });

        if (minDistance > bestDistance) bestX = x, bestY = y, bestDistance = minDistance;
      }

      var best = [bestX, bestY, bestDistance - padding];
      quadtree.add(best);
      return best;
    };
  }

}

function removeArea(circle, width, height) {
  var x = circle[0],
    y = circle[1],
    radius = circle[2],
    theta, dist, area,
    already = false;

  if (x > width - radius) {
    dist = width - x;
    already = true;
  } else if (x < radius) {
    dist = x;
    already = true;
  }

  if (y > height - radius) {
    dist = height - y;

    if (already) {
      return approxArea(circle, width, height);
    }
  } else if (y < radius) {
    dist = y;

    if (already) {
      return approxArea(circle, width, height);
    }
  } else if (x > radius && x < width - radius && y > radius && y < height - radius) {
    area = Math.PI * radius * radius;
    return area;
  }

  theta = Math.acos(dist / radius);

  area = ((Math.PI - theta) * radius * radius) + dist * Math.sqrt(radius * radius - dist * dist);
  return area;

  function approxArea(circle, width, height) {
    var randomPoints = [];

    for (var i = 0; i <= width; i++) {
      for (var j = 0; j <= height; j++) {
        randomPoints.push([i, j]);
      }
    }

    for (var i = 0.5; i < width; i += 0.5) {
      for (var j = 0.5; j < height; j += 0.5) {
        randomPoints.push([i, j]);
      }
    }

    var inPoints = randomPoints.filter(function(point) {
      var dx = point[0] - circle[0],
        dy = point[1] - circle[1];

      return Math.sqrt(dx * dx + dy * dy) <= circle[2];
    });

    return width * height * inPoints.length / randomPoints.length;

  }

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

function alertAbaqus() {
  // body...
  var msg = "<h3>Error : 0.1 %</h3>" +
    "<p>greater than the required fibre area</p>";
  alertify.log(msg);
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

  var geometry = new THREE.BoxGeometry(breadth, length, depth);
  var material = new THREE.MeshBasicMaterial({
    color: 0x2F4F4F,
    opacity: 0.95,
    transparent: true
  });
  var edges = new THREE.EdgesGeometry(geometry);
  var line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
    color: 0xffffff
  }));
  scene.add(line);
  var cube = new THREE.Mesh(geometry, material);
  cube.name = 'Matrix';
  scene.add(cube);

  line.position.set(breadth / 2, length / 2, depth / 2);
  cube.position.set(breadth / 2, length / 2, depth / 2);

  scene.add( add_arrow(breadth, length, depth) );

}

function add_arrow(breadth, length, depth) {

  var origin = [ breadth/2, length/2, depth/2 ];
  var length = Math.max(breadth, length, depth) / 2;
  var hex = 0xffff00;
  var dir = {'x':0, 'y':1, 'z':2};
  var dirVec = [0, 0, 0];
  dirVec[dir[masterObject.loadDir]] = 1;
  origin[dir[masterObject.loadDir]] *= 2;

  arrowHelper = new THREE.ArrowHelper( new THREE.Vector3( ...dirVec ), new THREE.Vector3( ...origin ), length, hex , length/2, length/3);

  return arrowHelper;

}

function add_fibre(x, y, radius) {

  var depth = Number(masterObject.depthMatrix);

  var geometry = new THREE.CylinderGeometry(radius, radius, 1.01 * depth, 20);
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

  arrowHelper.position.fromArray(origin);
  arrowHelper.setDirection(new THREE.Vector3( ...dirVec ));

}

function getFile() {
  var fileObject = {};

  fileObject = masterObject.$data;

  fileObject = "data = '" + JSON.stringify(fileObject) + "'";


  fileObject = pythonFile + fileObject;
  fileObject += '\nautomateMicro(json.loads(data))';
  var file = new File([fileObject], masterObject.fileName);
  saveAs(file);
}