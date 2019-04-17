importScripts('../js/libs/d3.v4.min.js', '../js/libs/d3-octree.min.js', '../js/libs/csg.js')

var newSphere, generatedVolume = 0,
  tempVolume = 0,
  k = 10, totalVolume;

onmessage = function(e) {
  var data = e.data;
  var maxRadius = data[0],
    width = data[1],
    height = data[2],
    depth = data[3],
    fibreVolume = data[4],
    smallFib = data[5];

  newSphere = bestSphereGenerator(1.05 * maxRadius, 0.05 * maxRadius, width, height, depth);

  totalVolume = janga.CSG.cube({corner1: [0, 0, 0], corner2: [width, height, depth]});

  mitchell(fibreVolume, width, height, depth, maxRadius, smallFib);
}

function mitchell(fibreVolume, width, height, depth, maxRadius, smallFib) {

  var count = 1;
  var minRadius = maxRadius;

  while (fibreVolume > generatedVolume) {

    var sphere = newSphere(k);
    console.log(sphere);
    count++;

    if (!smallFib) {
      if (sphere[3] < maxRadius) {
        break;
      }
    }

    tempVolume = removeVolume(sphere, width, height, depth);
    generatedVolume += tempVolume;

    console.log('Generated : ' + generatedVolume);
    console.log(generatedVolume/ fibreVolume);

    minRadius = Math.min(minRadius, sphere[3]);

    postMessage([sphere, generatedVolume / fibreVolume]);

    k = 10 * count;
  }

  var message = `Minimum Radius: ${minRadius.toFixed(5)} ||\
                 Maximum Radius: ${maxRadius.toFixed(5)} ||\
                 Error: ${((generatedVolume/fibreVolume-1)*100).toFixed(3)}%`;
  postMessage(['finished', message]);

  close();

}

function bestSphereGenerator(maxRadius, padding, width, height, depth) {
  var octree = d3.octree().extent([
      [0, 0, 0],
      [width, height, depth]
    ]),
    searchRadius = maxRadius * 2,
    maxRadius2 = maxRadius**2;

  return function(k) {
    var bestX =0 , bestY = 0, bestZ = 0, bestDistance = 0;

    for (var i = 0; i < k || bestDistance < padding; ++i) {
      var x = Math.random() * width,
        y = Math.random() * height,
        z = Math.random() * depth,
        rx1 = x - searchRadius,
        rx2 = x + searchRadius,
        ry1 = y - searchRadius,
        ry2 = y + searchRadius,
        rz1 = z - searchRadius,
        rz2 = z + searchRadius,
        minDistance = maxRadius; // minimum distance for this candidate

      octree.visit(function(node, x1, y1, z1, x2, y2, z2) {
        if (p = node.data) {
          var p,
            dx = x - p[0],
            dy = y - p[1],
            dz = z - p[2],
            d2 = dx**2 + dy**2 + dz**2,
            r2 = p[3]**2;
          if (d2 < r2) return minDistance = 0, true; // within a sphere
          var d = Math.sqrt(d2) - p[3];
          if (d < minDistance) minDistance = d;
        }
        return !minDistance || x1 > rx2 || x2 < rx1 || y1 > ry2 || y2 < ry1 || z1 > rz2 || z2 < rz1; // or outside search radius
      });

      if (minDistance > bestDistance) bestX = x, bestY = y, bestZ = z, bestDistance = minDistance;
    }

    var best = [bestX, bestY, bestZ, bestDistance - padding];
    octree.add(best);
    return best;
  };
}

function removeVolume(sphere, width, height, depth) {
  var x = sphere[0],
    y = sphere[1],
    z = sphere[2],
    radius = sphere[3],
    theta, dist, volume,
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
      return approxVolume(sphere, width, height, depth);
    }
    else already = true;
  } else if (y < radius) {
    dist = y;

    if (already) {
      return approxVolume(sphere, width, height, depth);
    }
    else already = true;
  }

  if (z > depth - radius) {
    dist = depth - z;

    if (already) {
      return approxVolume(sphere, width, height, depth);
    }
  } else if (z < radius) {
    dist = z;

    if (already) {
      return approxVolume(sphere, width, height, depth);
    }
  } else if (x > radius && x < width - radius && y > radius && y < height - radius && z > radius && z < depth - radius) {
    volume = (4/3) * Math.PI * radius**3;
    return volume;
  }

  theta = Math.acos(dist / radius);
  solidTheta = 2 * Math.PI * (1 + Math.cos(theta));
  volume = solidTheta * radius**3 / 3 + Math.PI * dist * (radius**2 - dist**2) / 3;
  return volume;

  function approxVolume(sphere, width, height, depth) {

    if (!totalVolume) {
      totalVolume = janga.CSG.cube({corner1: [0, 0, 0], corner2: [width, height, depth]});
    }

    var currentSphere = janga.CSG.sphere({center: sphere.slice(0, 3), radius: radius, resolution: 50});

    return totalVolume.intersect(currentSphere).getFeatures('volume');

  }
}