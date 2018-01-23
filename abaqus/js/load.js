function handleLoad(centers, breadth, length, depth, direction) {

  var axes = {
      'x': 0,
      'y': 1
    },
    dims = [breadth, length];
  var index = axes[direction],
    comp = Number(!axes[direction]);

  var centers = centers.map(function(val, index) {
    return val.concat(index);
  });

  var lower = centers.filter(function(val) {
    return val[index] < val[2];
  });

  var upper = centers.filter(function(val) {
    return val[index] > dims[index] - val[2];
  });

  var total = [lower, upper],
    answer = [],
    dummy = [0, 0, depth / 2];

  for (var i = 0; i < total.length; i++) {
    var current = total[i];

    current = current.sort(function(a, b) {
      return a[comp] - b[comp];
    });

    var edge = i * dims[index];

    if (current.length == 0) {
      dummy[index] = edge;
      dummy[comp] =  dims[comp]/ 2;
      answer.push(['Matrix'].concat(dummy.slice()))
      continue;
    }

    var start = current[0][comp],
      mean;

    if (current[0][comp] > current[0][2]) {
      dummy[index] = edge;
      dummy[comp] = (current[0][comp] - current[0][2])/ 2;
      answer.push(['Matrix'].concat(dummy.slice()));
    }

    dummy[index] = edge;
    dummy[comp] = current[0][comp];
    answer.push(['Fibre_'+current[0][3]].concat(dummy.slice()));
    for (var j = 1; j < current.length; j++) {
      mean = (start + current[j][comp]) / 2;

      dummy[index] = edge;
      dummy[comp] = mean;
      answer.push(['Matrix'].concat(dummy.slice()))

      start = current[j][comp];

      dummy[index] = edge;
      dummy[comp] = current[j][comp];
      answer.push(['Fibre_'+current[j][3]].concat(dummy.slice()));
    }

    var max = current[current.length - 1];
    if (max[comp] < dims[comp] - max[2]) {
      dummy[index] = edge;
      dummy[comp] = (max[comp] + max[2] + dims[comp]) / 2;
      answer.push(['Matrix'].concat(dummy.slice()))
    }
  }

  return answer;

}