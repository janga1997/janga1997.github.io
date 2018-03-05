importScripts('../js/libs/d3.v4.min.js', '../js/libs/d3-quadtree.v1.min.js')

var newCircle, generatedArea = 0, tempArea = 0, k = 10;

onmessage = function(e) {
  var data = e.data;
  var maxRadius = data[0], width = data[1], height = data[2], fibreArea = data[3], minRatio = data[4], mitchellSamples = data[5],
    randomType = data[6];

  newCircle = bestCircleGenerator(1.05 * maxRadius, 0.05 * maxRadius, width, height);
  mitchell(fibreArea, width, height, maxRadius, minRatio, mitchellSamples, randomType);
}

function mitchell(fibreArea, width, height, maxRadius, minRatio, mitchellSamples, randomType) {

  var count = 1;
  var minRadius = maxRadius;
  // var circle = new Array(3).fill(0);

  while (fibreArea > generatedArea && minRadius >= minRatio*maxRadius) {

    var circle = newCircle(k);
    count++;

    tempArea = removeArea(circle, width, height);
    generatedArea += tempArea;

    minRadius = Math.min(minRadius, circle[2]);

    postMessage([circle, generatedArea/fibreArea]);

    if (randomType) {
      k = 100*count;
    } else {
      k = mitchellSamples;
    }

  }

  var message = "Minimum Radius: " + minRadius.toFixed(5) + " |||| Maximum Radius: " + maxRadius.toFixed(5);
  postMessage(['finished', generatedArea/fibreArea, message, minRadius])

  close();

}

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

