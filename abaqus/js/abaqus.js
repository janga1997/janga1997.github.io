function generateCS() {
    var length = document.getElementById('lengthMatrix').value;
    var breadth = document.getElementById('breadthMatrix').value;

    var numFibres = document.getElementById('numFibres').value;
    var volumeFraction = document.getElementById('volumeFraction').value;

    var fibreRadius = Math.sqrt(volumeFraction * length * breadth/ (Math.PI * numFibres));
    console.log(fibreRadius);

    var sample = bestCandidateSampler(breadth - 2*fibreRadius, length - 2*fibreRadius, numFibres * 10, numFibres, 2 * fibreRadius);

    document.getElementById("svgCS").innerHTML = "";

    var canvas = d3.select("body").select("div#svgCS").append("canvas")
    .attr("width", breadth)
    .attr("height", length);

    var context = canvas.node().getContext("2d");

    var hila = 0;

    var t = d3.timer(function() {
      for (var i = 0; i < 10; ++i) {
        var s;

        try {
          s = sample();
        }

        catch(err) {
          return true;
        }

        if (typeof(s) !== "object") {
          continue;
      }

      if (!s) {
        return true;
      }

      //Drawing a circle
      context.fillStyle = "black";
      context.beginPath();
      //context.arc(x-center, y-center, radius, startAngle, endAngle, counterclockwise)
      //A circle would thus look like:
      context.arc(s[0] + fibreRadius, s[1] + fibreRadius, fibreRadius, 0,  2 * Math.PI, true);               
      context.fill();
      context.closePath();

      hila += 1;
                console.log(hila);

      // svg.append("circle")
      // .attr("cx", s[0] + fibreRadius)
      // .attr("cy", s[1] + fibreRadius)
      // .attr("r", 0)
      // .transition()
      // .attr("r", fibreRadius);
  }
});

}

function getPyFile() {
    var fileText = "This is just some placeholder text for now."
    var file = new File(["Hello, world!"], "test_script.py", {type: "text/plain;charset=utf-8"});
    saveAs(file);
}
