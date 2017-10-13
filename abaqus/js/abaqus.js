var masterObject = new Vue({
  el: "#masterAbaqus",
  data: {
    packingType: "random",
    smallFib: true,
    lengthMatrix: 100,
    breadthMatrix: 100,
    depthMatrix: 100,
    generatedCenters: [],
    csvCircles: [],
    volumeFraction: 0.3,
    numFibres: 50,
    fibreYM: 100000,
    fibrePR: 0.5,
    matrixYM: 800000,
    matrixPR: 0.8,
    padding: 0,
    uploadFile: false,
    fileName: "sample.py"
  },
  methods: {
    parseCSV : function (event) {
      parse_csv(event.target.files[0]);

    },
    clearCSV : function (event) {
      event.target.value = "";
    }
  }
});

function generate_random() {
  var completed = false;
  var height = masterObject.lengthMatrix;
  var width = masterObject.breadthMatrix

  var numFibres = masterObject.numFibres;
  var volumeFraction = masterObject.volumeFraction;

  var maxRadius = Math.sqrt(volumeFraction * height * width/ (Math.PI * numFibres));
  var minRadius = maxRadius;
  var newCircle = bestCircleGenerator(1.05*maxRadius, 0.05*maxRadius, width , height);

  masterObject.padding = 0.05*maxRadius;

  var fibreArea = volumeFraction * (width)  * (height );

  var k = 1000, // initial number of candidates to consider per circle
  m = 10;

  document.getElementById('svgCS').innerHTML = "";

  var canvas = d3.select("#svgCS").append("canvas")
  .attr("width", width)
  .attr("height", height);

  var context = canvas.node().getContext("2d");

  context.fillStyle = "grey";
  context.fillRect(0, 0, width, height);

  var count = 0;

  var generatedArea = 0;
  var tempArea = 0;
  masterObject.generatedCenters = [];
  d3.timer(function() {
    for (var i = 0; i < m && fibreArea > generatedArea; ++i) {
      var circle = newCircle(k);

      if (!masterObject.smallFib) {
        if (circle[2] < maxRadius) {
          console.log('Smaller fibres eliminated');
          completed = true;
          continue;
        }
      }

      masterObject.generatedCenters.push([circle[0], circle[1], circle[2]]);

      tempArea = removeArea(circle, width, height);
      console.log(tempArea/(Math.PI * circle[2] * circle[2]) + ', ' + tempArea);
      console.log(circle);
      console.log('----------------------------');
      generatedArea += tempArea;
      count++;

      minRadius = Math.min(minRadius, circle[2]);

      //Drawing a circle
      context.fillStyle = "rgba(0, 0, 0, " + circle[2]/maxRadius + ")";
      context.beginPath();
      //context.arc(x-center, y-center, radius, startAngle, endAngle, counterclockwise)
      //A circle would thus look like:
      context.arc(circle[0], circle[1], circle[2], 0,  2 * Math.PI, true);
      context.fill();
      context.closePath();

      // As we add more circles, generate more candidates per circle.
      // Since this takes more effort, gradually reduce circles per frame.
      if (k < 500) k *= maxRadius/circle[2], m *= 2;
    }

    if (completed) {
      var error = ((generatedArea - fibreArea)*(100/fibreArea)).toFixed(3);
      var logMsg = document.createElement('h1');
      logMsg.innerHTML = "Error: " + error + "%";
      var bottom = document.createElement('h5');
      bottom.innerHTML = "greater than required volume fraction";
      alertify.log(logMsg.outerHTML + bottom.outerHTML);

      document.getElementById('minRadius').innerText = "Minimum Radius: " + minRadius.toFixed(5)
                                                       + "\nMaximum Radius: " + maxRadius.toFixed(5);

      return true;
    }

    if (fibreArea <= generatedArea) {
      var error = ((generatedArea - fibreArea)*(100/fibreArea)).toFixed(3);
      var logMsg = document.createElement('h1');
      logMsg.innerHTML = "Error: " + error + "%";
      var bottom = document.createElement('h5');
      bottom.innerHTML = "greater than required volume fraction";
      alertify.log(logMsg.outerHTML + bottom.outerHTML);

      document.getElementById('minRadius').innerText = "Minimum Radius: " + minRadius.toFixed(5)
                                                       + "\nMaximum Radius: " + maxRadius.toFixed(5);

      return true;
    }

  });

  function bestCircleGenerator(maxRadius, padding, width, height) {
    var quadtree = d3.geom.quadtree().extent([[0, 0], [width, height]])([]),
    searchRadius = maxRadius * 2,
    maxRadius2 = maxRadius * maxRadius;

    return function(k) {
      var bestX, bestY, bestDistance = 0;

      for (var i = 0; i < k || bestDistance < padding ; ++i) {
        var x = Math.random() * width,
        y = Math.random() * height,
        rx1 = x - searchRadius,
        rx2 = x + searchRadius,
        ry1 = y - searchRadius,
        ry2 = y + searchRadius,
        minDistance = maxRadius; // minimum distance for this candidate

        quadtree.visit(function(quad, x1, y1, x2, y2) {
          if (p = quad.point) {
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
  }

  else if (x < radius) {
    dist = x;
    already = true;
  }

  if (y > height - radius) {
    dist = height - y;

    if (already) {
      return approxArea(circle, width, height);
    }
  }

  else if (y < radius) {
    dist = y;

    if (already) {
      return approxArea(circle, width, height);
    }
  }

  else if ( x > radius && x < width - radius && y > radius && y < height - radius ) {
    area = Math.PI * radius * radius;
    return area;
  }

  theta = Math.acos(dist/radius);

  area = ((Math.PI - theta) * radius * radius) + dist*Math.sqrt(radius*radius - dist* dist);
  return area;

  function approxArea(circle, width, height) {
    var randomPoints = [];

    for (var i = 0; i <= width; i++) {
      for (var j = 0; j <= height; j++) {
        randomPoints.push([i, j]);
      }
    }

    for (var i = 0.5; i < width; i+=0.5) {
      for (var j = 0.5; j < height; j+=0.5) {
        randomPoints.push([i, j]);
      }
    }

    var inPoints = randomPoints.filter(function (point) {
      var dx = point[0] - circle[0],
      dy = point[1] - circle[1];

      return Math.sqrt(dx*dx + dy*dy) <= circle[2];
    });

    return width * height * inPoints.length / randomPoints.length;

  }

}

function generate_cubic() {
  var width = masterObject.breadthMatrix;

  var numFibres = masterObject.numFibres;
  var volumeFraction = masterObject.volumeFraction;

  var factors = getFactors(numFibres);

  factors = factors.sort(function(a, b) {
    return a - b;
  });

  var ratio, dimensions;

  if (factors.length % 2 == 1) {
    var index = (factors.length - 1)/2;
    dimensions = [factors[index], factors[index]];
    ratio = 1;
  }

  else {
    var index = factors.length/2;
    dimensions = [factors[index], factors[index - 1]];
    ratio = dimensions[1]/dimensions[0];
  }

  var height = ratio * width;
  var radius = Math.sqrt(volumeFraction * height * width/ (Math.PI * numFibres));

  document.getElementById('svgCS').innerHTML = "";

  var canvas = d3.select("#svgCS").append("canvas")
  .attr("width", width)
  .attr("height", height);

  var context = canvas.node().getContext("2d");

  context.fillStyle = "grey";
  context.fillRect(0, 0, width, height);

  var unit = Math.sqrt(width * height / numFibres);

  masterObject.generatedCenters = [];
  for (var i = 0; i < dimensions[1]; i++) {
    for (var j = 0; j < dimensions[0]; j++) {
      var center = [(i+0.5)*unit, (j+0.5)*unit];
      masterObject.generatedCenters.push([center[1], center[0], radius]);

      //Drawing a circle
      context.fillStyle = "black";
      context.beginPath();
      //A circle would thus look like:
      context.arc(center[1], center[0], radius, 0, 2 * Math.PI, true);
      context.fill();
      context.closePath();
    }
  }

}

function generate_hex() {
  var width = masterObject.breadthMatrix;

  var numFibres = masterObject.numFibres;
  var volumeFraction = masterObject.volumeFraction,
  maxFraction = Math.PI/(2*Math.sqrt(3));

  var factors = getFactors(numFibres);

  factors = factors.sort(function(a, b) {
    return a - b;
  });

  var ratio, dimensions;

  if (factors.length % 2 == 1) {
    var index = (factors.length - 1)/2;
    dimensions = [factors[index], factors[index]];
  }

  else {
    var index = factors.length/2;
    dimensions = [factors[index], factors[index - 1]];
  }

  ratio = ((2 + (dimensions[1]-1)*Math.sqrt(3))/(2*dimensions[0]))

  var height = ratio * width;
  var maxRadius = width/(2*dimensions[0]);
  var radius = Math.sqrt(volumeFraction/maxFraction) * maxRadius;

  document.getElementById('svgCS').innerHTML = "";

  var canvas = d3.select("#svgCS").append("canvas")
  .attr("width", width)
  .attr("height", height);

  var context = canvas.node().getContext("2d");

  context.fillStyle = "grey";
  context.fillRect(0, 0, width, height);

  var unit = Math.sqrt(width * height / numFibres);

  masterObject.generatedCenters = [];
  for (var i = 0; i < dimensions[1]; i++) {
    for (var j = 0; j < dimensions[0] + i%2; j++) {
      var center = [maxRadius*((i+1)%2) + j*2*maxRadius, maxRadius + i*maxRadius*Math.sqrt(3)];
      masterObject.generatedCenters.push([center[1], center[0], maxRadius]);

      //Drawing a circle
      context.fillStyle = "black";
      context.beginPath();
      //A circle would thus look like:
      context.arc(center[0], center[1], radius, 0, 2 * Math.PI, true);
      context.fill();
      context.closePath();
    }
  }
}

function generate_upload() {

  var Vec2D = toxi.geom.Vec2D,
  Circle = toxi.geom.Circle;

  var height = masterObject.lengthMatrix;
  var width = masterObject.breadthMatrix

  document.getElementById('svgCS').innerHTML = "";

  var canvas = d3.select("#svgCS").append("canvas")
  .attr("width", width)
  .attr("height", height);

  var context = canvas.node().getContext("2d");

  context.fillStyle = "grey";
  context.fillRect(0, 0, width, height);

  masterObject.generatedCenters = [];

  var p1, p2, p3, circle, row;

  for (var i = 0; i < masterObject.csvCircles.length; i++) {
    row = masterObject.csvCircles[i];
    p1 = new Vec2D(row[0], row[1]);
    p2 = new Vec2D(row[2], row[3]);
    p3 = new Vec2D(row[4], row[5]);
    circle = Circle.from3Points(p1, p2, p3);

    //Drawing a circle
    context.fillStyle = "black";
    context.beginPath();
    context.arc(circle.x, circle.y, circle.getRadius(), 0, 2 * Math.PI, true);
    context.fill();
    context.closePath();    
  }
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

          masterObject.csvCircles = masterObject.csvCircles.filter(function(arr){ return arr.length > 1 });

          masterObject.breadthMatrix = Number(masterObject.csvCircles[0][0]);
          masterObject.lengthMatrix = Number(masterObject.csvCircles[0][1]);
          masterObject.depthMatrix = Number(masterObject.csvCircles[0][2]);
          masterObject.csvCircles = masterObject.csvCircles.slice(1);
          masterObject.numFibres = masterObject.csvCircles.length;
        }
      });

}

function getFile() {
  var fileObject = {};

  fileObject = masterObject.$data;

  // fileObject.components = [];
  // fileObject.directions = [];

  // var comps = ['x', 'y', 'z'];

  // for(s of comps){
  //   fileObject.components.push(Number(document.getElementById(s + 'Comp').checked));
  //   fileObject.directions.push(Number(document.getElementById(s + 'Comp-both').checked))
  // }

  fileObject = 'data = ' + JSON.stringify(fileObject);

  fileObject = fileObject.replace('true', 'True');
  fileObject = fileObject.replace('false', 'False');

  fileObject = pythonFile + fileObject;
  fileObject += '\nautomateMicro(data)';
  var file = new File([fileObject], masterObject.fileName);
  saveAs(file);
}
