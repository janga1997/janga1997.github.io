function bestCandidateSampler(width, height, numCandidates, numSamplesMax, minDistance) {
  var numSamples = 0;

  var quadtree = d3.geom.quadtree()
    .extent([
      [0, 0],
      [width, height]
    ])
    ([
      [Math.random() * width, Math.random() * height]
    ]);

  return function() {
    if (++numSamples > numSamplesMax) return;
    var bestCandidate, bestDistance = 0;
    for (var i = 0; i < numCandidates; ++i) {
      var c = [Math.random() * width, Math.random() * height],
        d = distance(search(c[0], c[1]), c);

      if (d < minDistance) {
        continue;
      } else if (d > bestDistance) {
        bestDistance = d;
        bestCandidate = c;
      }
    }
    quadtree.add(bestCandidate);
    return bestCandidate;
  };

  function distance(a, b) {
    var dx = a[0] - b[0],
      dy = a[1] - b[1];
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Find the closest node to the specified point.
  function search(x, y) {
    var x0 = 0,
      y0 = 0,
      x3 = Math.max(width, height),
      y3 = Math.max(width, height),
      minDistance2 = Infinity,
      closestPoint;

    (function find(node, x1, y1, x2, y2) {
      var point;

      // stop searching if this cell can’t contain a closer node
      if (x1 > x3 || y1 > y3 || x2 < x0 || y2 < y0) return;

      // visit this point
      if (point = node.point) {
        var dx = x - point[0],
          dy = y - point[1],
          distance2 = Math.sqrt(dx * dx + dy * dy);
        if (distance2 < minDistance2) {
          var distance = minDistance2 = distance2;
          x0 = x - distance, y0 = y - distance;
          x3 = x + distance, y3 = y + distance;
          closestPoint = point;
        }
        // else {
        //   closestPoint = 
        // }
      }

      // bisect the current node
      var children = node.nodes,
        xm = (x1 + x2) * .5,
        ym = (y1 + y2) * .5,
        right = x > xm,
        below = y > ym;

      // visit closest cell first
      if (node = children[below << 1 | right]) find(node, right ? xm : x1, below ? ym : y1, right ? x2 : xm, below ? y2 : ym);
      if (node = children[below << 1 | !right]) find(node, right ? x1 : xm, below ? ym : y1, right ? xm : x2, below ? y2 : ym);
      if (node = children[!below << 1 | right]) find(node, right ? xm : x1, below ? y1 : ym, right ? x2 : xm, below ? ym : y2);
      if (node = children[!below << 1 | !right]) find(node, right ? x1 : xm, below ? y1 : ym, right ? xm : x2, below ? ym : y2);
    })(quadtree, x0, y0, x3, y3);

    return closestPoint;
  }
}