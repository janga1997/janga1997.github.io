var generatedCentres = [];

function generate_random() {
  var height = document.getElementById('lengthMatrix').value;
  var width = document.getElementById('breadthMatrix').value;

  var numFibres = document.getElementById('numFibres').value;
  var volumeFraction = document.getElementById('volumeFraction').value;

  var maxRadius = Math.sqrt(volumeFraction * height * width/ (Math.PI * numFibres));
  var minRadius = maxRadius;
  var newCircle = bestCircleGenerator(1.05*maxRadius, 0.05*maxRadius, width - 2*maxRadius , height - 2*maxRadius);


  var fibreArea = volumeFraction * (width)  * (height );

  var k = 100, // initial number of candidates to consider per circle
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

  generatedCentres = [];
  d3.timer(function() {
    for (var i = 0; i < m && fibreArea > generatedArea; ++i) {
      var circle = newCircle(k);
      generatedCentres.push([circle[0] + maxRadius, circle[1] + maxRadius, circle[2]]);

      console.log('Janga');

      generatedArea += Math.PI * circle[2] * circle[2];

      // janga.add(circle[2]);
      count++ ;

      minRadius = Math.min(minRadius, circle[2]);

      //Drawing a circle
      context.fillStyle = "rgba(0, 0, 0, " + circle[2]/maxRadius + ")";
      context.beginPath();
      //context.arc(x-center, y-center, radius, startAngle, endAngle, counterclockwise)
      //A circle would thus look like:
      context.arc(circle[0] + maxRadius, circle[1] + maxRadius, circle[2], 0,  2 * Math.PI, true);
      context.fill();
      context.closePath();

      // As we add more circles, generate more candidates per circle.
      // Since this takes more effort, gradually reduce circles per frame.
      if (k < 500) k *= maxRadius/circle[2], m *= .998;
  }
  
  if (fibreArea <= generatedArea) {
    var error = ((generatedArea - fibreArea)*(100/fibreArea)).toFixed(3);
    var logMsg = document.createElement('h1');
    logMsg.innerHTML = "Error: " + error + "%";
    var bottom = document.createElement('h5');
    bottom.innerHTML = "greater than required volume fraction";
    alertify.log(logMsg.outerHTML + bottom.outerHTML);

    document.getElementById('minRadius').innerText = "Minimum Radius: " + minRadius.toFixed(5);

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

function alertAbaqus() {
  // body...
  var msg = "<h3>Error : 0.1 %</h3>" +
  "<p>greater than the required fibre area</p>";
  alertify.log(msg);
}

function generate_cubic() {
  // body...
  var width = document.getElementById('breadthMatrix').value;

  var numFibres = document.getElementById('numFibres').value;
  var volumeFraction = document.getElementById('volumeFraction').value;

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

  generatedCentres = [];
  for (var i = 0; i < dimensions[1]; i++) {
    for (var j = 0; j < dimensions[0]; j++) {
      var center = [(i+0.5)*unit, (j+0.5)*unit];
      generatedCentres.push([center[1], center[0], radius]);

      //Drawing a circle
      context.fillStyle = "black";
      context.beginPath();
      //A circle would thus look like:
      console.log(center);
      context.arc(center[1], center[0], radius, 0, 2 * Math.PI, true);
      context.fill();
      context.closePath();
    }
  }

}

function generate_hex() {
  console.log('Hexagonal being generated');
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

$("#packingType").change(function () {
  console.log('Janga');
  var button = document.getElementById('buttonCS');
  button.onclick = Function("generate_" + $("#packingType").val() + "()");
});

function getFile() {
  var fileObject = {};

  fileObject.packingType = $("#packingType").val();
  fileObject.length = document.getElementById('lengthMatrix').value;
  fileObject.breadth = document.getElementById('breadthMatrix').value;
  fileObject.depth = document.getElementById('depthMatrix').value;
  fileObject.numFibres = document.getElementById('numFibres').value;
  fileObject.volumeFraction = document.getElementById('volumeFraction').value;

  fileObject.centers = generatedCentres;

  fileObject.fibreProperty = document.getElementById('fibreProperty').value;
  fileObject.matrixProperty = document.getElementById('matrixProperty').value;
  fileObject.elementType = document.getElementById('elementType').value;
  fileObject.meshSeed = document.getElementById('meshSeed').value;
  fileObject.loading = document.getElementById('loading').value;

  fileObject.components = [];
  fileObject.directions = [];

  var comps = ['x', 'y', 'z'];

  for(s of comps){
    fileObject.components.push(Number(document.getElementById(s + 'Comp').checked));
    fileObject.directions.push(Number(document.getElementById(s + 'Comp-both').checked))
  }

  fileObject = JSON.stringify(fileObject);
  var file = new File([fileObject], document.getElementById('fileName').value);
  saveAs(file);
}
