(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.janga = f()}})(function(){var define,module,exports;return (function(){function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s}return e})()({1:[function(require,module,exports){
/*
## License

Copyright (c) 2014 bebbi (elghatta@gmail.com)
Copyright (c) 2013 Eduard Bespalov (edwbes@gmail.com)
Copyright (c) 2012 Joost Nieuwenhuijse (joost@newhouse.nl)
Copyright (c) 2011 Evan Wallace (http://evanw.github.com/csg.js/)
Copyright (c) 2012 Alexandre Girard (https://github.com/alx)

All code released under MIT license

## Overview

For an overview of the CSG process see the original csg.js code:
http://evanw.github.com/csg.js/

CSG operations through BSP trees suffer from one problem: heavy fragmentation
of polygons. If two CSG solids of n polygons are unified, the resulting solid may have
in the order of n*n polygons, because each polygon is split by the planes of all other
polygons. After a few operations the number of polygons explodes.

This version of CSG.js solves the problem in 3 ways:

1. Every polygon split is recorded in a tree (CSG.PolygonTreeNode). This is a separate
tree, not to be confused with the CSG tree. If a polygon is split into two parts but in
the end both fragments have not been discarded by the CSG operation, we can retrieve
the original unsplit polygon from the tree, instead of the two fragments.

This does not completely solve the issue though: if a polygon is split multiple times
the number of fragments depends on the order of subsequent splits, and we might still
end up with unncessary splits:
Suppose a polygon is first split into A and B, and then into A1, B1, A2, B2. Suppose B2 is
discarded. We will end up with 2 polygons: A and B1. Depending on the actual split boundaries
we could still have joined A and B1 into one polygon. Therefore a second approach is used as well:

2. After CSG operations all coplanar polygon fragments are joined by a retesselating
operation. See CSG.reTesselated(). Retesselation is done through a
linear sweep over the polygon surface. The sweep line passes over the y coordinates
of all vertices in the polygon. Polygons are split at each sweep line, and the fragments
are joined horizontally and vertically into larger polygons (making sure that we
will end up with convex polygons).
This still doesn't solve the problem completely: due to floating point imprecisions
we may end up with small gaps between polygons, and polygons may not be exactly coplanar
anymore, and as a result the retesselation algorithm may fail to join those polygons.
Therefore:

3. A canonicalization algorithm is implemented: it looks for vertices that have
approximately the same coordinates (with a certain tolerance, say 1e-5) and replaces
them with the same vertex. If polygons share a vertex they will actually point to the
same CSG.Vertex instance. The same is done for polygon planes. See CSG.canonicalized().

Performance improvements to the original CSG.js:

Replaced the flip() and invert() methods by flipped() and inverted() which don't
modify the source object. This allows to get rid of all clone() calls, so that
multiple polygons can refer to the same CSG.Plane instance etc.

The original union() used an extra invert(), clipTo(), invert() sequence just to remove the
coplanar front faces from b; this is now combined in a single b.clipTo(a, true) call.

Detection whether a polygon is in front or in back of a plane: for each polygon
we are caching the coordinates of the bounding sphere. If the bounding sphere is
in front or in back of the plane we don't have to check the individual vertices
anymore.

Other additions to the original CSG.js:

CSG.Vector class has been renamed into CSG.Vector3D

Classes for 3D lines, 2D vectors, 2D lines, and methods to find the intersection of
a line and a plane etc.

Transformations: CSG.transform(), CSG.translate(), CSG.rotate(), CSG.scale()

Expanding or contracting a solid: CSG.expand() and CSG.contract(). Creates nice
smooth corners.

The vertex normal has been removed since it complicates retesselation. It's not needed
for solid CAD anyway.

*/

const {addTransformationMethodsToPrototype, addCenteringToPrototype} = require('./src/core/mutators')
let CSG = require('./src/core/CSG')
let CAG = require('./src/core/CAG')

// FIXME: how many are actual usefull to be exposed as API ?? looks like a code smell
const { _CSGDEBUG,
  defaultResolution2D,
  defaultResolution3D,
  EPS,
  angleEPS,
  areaEPS,
  all,
  top,
  bottom,
  left,
  right,
  front,
  back,
  staticTag,
  getTag} = require('./src/core/constants')

CSG._CSGDEBUG = _CSGDEBUG
CSG.defaultResolution2D = defaultResolution2D
CSG.defaultResolution3D = defaultResolution3D
CSG.EPS = EPS
CSG.angleEPS = angleEPS
CSG.areaEPS = areaEPS
CSG.all = all
CSG.top = top
CSG.bottom = bottom
CSG.left = left
CSG.right = right
CSG.front = front
CSG.back = back
CSG.staticTag = staticTag
CSG.getTag = getTag

// eek ! all this is kept for backwards compatibility...for now
CSG.Vector2D = require('./src/core/math/Vector2')
CSG.Vector3D = require('./src/core/math/Vector3')
CSG.Vertex = require('./src/core/math/Vertex3')
CAG.Vertex = require('./src/core/math/Vertex2')
CSG.Plane = require('./src/core/math/Plane')
CSG.Polygon = require('./src/core/math/Polygon3')
CSG.Polygon2D = require('./src/core/math/Polygon2')
CSG.Line2D = require('./src/core/math/Line2')
CSG.Line3D = require('./src/core/math/Line3')
CSG.Path2D = require('./src/core/math/Path2')
CSG.OrthoNormalBasis = require('./src/core/math/OrthoNormalBasis')
CSG.Matrix4x4 = require('./src/core/math/Matrix4')

CAG.Side = require('./src/core/math/Side')

CSG.Connector = require('./src/core/connectors').Connector
CSG.ConnectorList = require('./src/core/connectors').ConnectorList
CSG.Properties = require('./src/core/Properties')

const {circle, ellipse, rectangle, roundedRectangle} = require('./src/api/primitives2d')
const {sphere, cube, roundedCube, cylinder, roundedCylinder, cylinderElliptic, polyhedron} = require('./src/api/primitives3d')

CSG.sphere = sphere
CSG.cube = cube
CSG.roundedCube = roundedCube
CSG.cylinder = cylinder
CSG.roundedCylinder = roundedCylinder
CSG.cylinderElliptic = cylinderElliptic
CSG.polyhedron = polyhedron

CAG.circle = circle
CAG.ellipse = ellipse
CAG.rectangle = rectangle
CAG.roundedRectangle = roundedRectangle

// injecting factories
const {fromPolygons, fromCompactBinary, fromObject, fromSlices} = require('./src/core/CSGFactories')
CSG.fromCompactBinary = fromCompactBinary
CSG.fromObject = fromObject
CSG.fromSlices = fromSlices
CSG.fromPolygons = fromPolygons

CSG.toPointCloud = require('./src/api/debugHelpers').toPointCloud

const CAGFactories = require('./src/core/CAGFactories')
CAG.fromSides = CAGFactories.fromSides
CAG.fromObject = CAGFactories.fromObject
CAG.fromPoints = CAGFactories.fromPoints
CAG.fromPointsNoCheck = CAGFactories.fromPointsNoCheck
CAG.fromPath2 = CAGFactories.fromPath2
CAG.fromFakeCSG = CAGFactories.fromFakeCSG
CAG.fromCompactBinary = CAGFactories.fromCompactBinary

/// ////////////////////////////////////
// option parsers
const optionsParsers = require('./src/api/optionParsers')

// ////////////////////////////////////
addTransformationMethodsToPrototype(CSG.prototype)
addTransformationMethodsToPrototype(CSG.Vector2D.prototype)
addTransformationMethodsToPrototype(CSG.Vector3D.prototype)
addTransformationMethodsToPrototype(CSG.Vertex.prototype)
addTransformationMethodsToPrototype(CSG.Plane.prototype)
addTransformationMethodsToPrototype(CSG.Polygon.prototype)
addTransformationMethodsToPrototype(CSG.Line2D.prototype)
addTransformationMethodsToPrototype(CSG.Line3D.prototype)
addTransformationMethodsToPrototype(CSG.Path2D.prototype)
addTransformationMethodsToPrototype(CSG.OrthoNormalBasis.prototype)
addTransformationMethodsToPrototype(CSG.Connector.prototype)

addTransformationMethodsToPrototype(CAG.prototype)
addTransformationMethodsToPrototype(CAG.Side.prototype)
addTransformationMethodsToPrototype(CAG.Vertex.prototype)

addCenteringToPrototype(CSG.prototype, ['x', 'y', 'z'])
addCenteringToPrototype(CAG.prototype, ['x', 'y'])

CSG.parseOptionAs2DVector = optionsParsers.parseOptionAs3DVector
CSG.parseOptionAs3DVector = optionsParsers.parseOptionAs3DVector
CSG.parseOptionAs3DVectorList = optionsParsers.parseOptionAs3DVectorList
CSG.parseOptionAsBool = optionsParsers.parseOptionAsBool
CSG.parseOptionAsFloat = optionsParsers.parseOptionAsFloat
CSG.parseOptionAsInt = optionsParsers.parseOptionAsInt
// this is needed for now, otherwise there are missing features in Polygon2D
CSG.Polygon2D.prototype = CAG.prototype

// utilities
const {isCAG, isCSG} = require('./src/core/utils')

const globalApi = Object.assign({}, {CSG, CAG}, optionsParsers, {isCAG, isCSG})

module.exports = globalApi

},{"./src/api/debugHelpers":3,"./src/api/optionParsers":9,"./src/api/primitives2d":10,"./src/api/primitives3d":11,"./src/core/CAG":13,"./src/core/CAGFactories":14,"./src/core/CSG":15,"./src/core/CSGFactories":16,"./src/core/Properties":20,"./src/core/connectors":21,"./src/core/constants":22,"./src/core/math/Line2":23,"./src/core/math/Line3":24,"./src/core/math/Matrix4":25,"./src/core/math/OrthoNormalBasis":26,"./src/core/math/Path2":27,"./src/core/math/Plane":28,"./src/core/math/Polygon2":29,"./src/core/math/Polygon3":30,"./src/core/math/Side":31,"./src/core/math/Vector2":32,"./src/core/math/Vector3":33,"./src/core/math/Vertex2":34,"./src/core/math/Vertex3":35,"./src/core/mutators":38,"./src/core/utils":40}],2:[function(require,module,exports){
const Path2D = require('../core/math/Path2')

const cagoutlinePaths = function (_cag) {
  let cag = _cag.canonicalized()
  let sideTagToSideMap = {}
  let startVertexTagToSideTagMap = {}
  cag.sides.map(function (side) {
    let sidetag = side.getTag()
    sideTagToSideMap[sidetag] = side
    let startvertextag = side.vertex0.getTag()
    if (!(startvertextag in startVertexTagToSideTagMap)) {
      startVertexTagToSideTagMap[startvertextag] = []
    }
    startVertexTagToSideTagMap[startvertextag].push(sidetag)
  })
  let paths = []
  while (true) {
    let startsidetag = null
    for (let aVertexTag in startVertexTagToSideTagMap) {
      let sidesForcagVertex = startVertexTagToSideTagMap[aVertexTag]
      startsidetag = sidesForcagVertex[0]
      sidesForcagVertex.splice(0, 1)
      if (sidesForcagVertex.length === 0) {
        delete startVertexTagToSideTagMap[aVertexTag]
      }
      break
    }
    if (startsidetag === null) break // we've had all sides
    let connectedVertexPoints = []
    let sidetag = startsidetag
    let cagside = sideTagToSideMap[sidetag]
    let startvertextag = cagside.vertex0.getTag()
    while (true) {
      connectedVertexPoints.push(cagside.vertex0.pos)
      let nextvertextag = cagside.vertex1.getTag()
      if (nextvertextag === startvertextag) break // we've closed the polygon
      if (!(nextvertextag in startVertexTagToSideTagMap)) {
        throw new Error('Area is not closed!')
      }
      let nextpossiblesidetags = startVertexTagToSideTagMap[nextvertextag]
      let nextsideindex = -1
      if (nextpossiblesidetags.length === 1) {
        nextsideindex = 0
      } else {
                  // more than one side starting at the same vertex. cag means we have
                  // two shapes touching at the same corner
        let bestangle = null
        let cagangle = cagside.direction().angleDegrees()
        for (let sideindex = 0; sideindex < nextpossiblesidetags.length; sideindex++) {
          let nextpossiblesidetag = nextpossiblesidetags[sideindex]
          let possibleside = sideTagToSideMap[nextpossiblesidetag]
          let angle = possibleside.direction().angleDegrees()
          let angledif = angle - cagangle
          if (angledif < -180) angledif += 360
          if (angledif >= 180) angledif -= 360
          if ((nextsideindex < 0) || (angledif > bestangle)) {
            nextsideindex = sideindex
            bestangle = angledif
          }
        }
      }
      let nextsidetag = nextpossiblesidetags[nextsideindex]
      nextpossiblesidetags.splice(nextsideindex, 1)
      if (nextpossiblesidetags.length === 0) {
        delete startVertexTagToSideTagMap[nextvertextag]
      }
      cagside = sideTagToSideMap[nextsidetag]
    } // inner loop
    // due to the logic of fromPoints()
    // move the first point to the last
    if (connectedVertexPoints.length > 0) {
      connectedVertexPoints.push(connectedVertexPoints.shift())
    }
    let path = new Path2D(connectedVertexPoints, true)
    paths.push(path)
  } // outer loop
  return paths
}

module.exports = cagoutlinePaths

},{"../core/math/Path2":27}],3:[function(require,module,exports){
const CSG = require('../core/CSG')
const {cube} = require('./primitives3d')

// For debugging
// Creates a new solid with a tiny cube at every vertex of the source solid
// this is seperated from the CSG class itself because of the dependency on cube
const toPointCloud = function (csg, cuberadius) {
  csg = csg.reTesselated()

  let result = new CSG()

    // make a list of all unique vertices
    // For each vertex we also collect the list of normals of the planes touching the vertices
  let vertexmap = {}
  csg.polygons.map(function (polygon) {
    polygon.vertices.map(function (vertex) {
      vertexmap[vertex.getTag()] = vertex.pos
    })
  })

  for (let vertextag in vertexmap) {
    let pos = vertexmap[vertextag]
    let _cube = cube({
      center: pos,
      radius: cuberadius
    })
    result = result.unionSub(_cube, false, false)
  }
  result = result.reTesselated()
  return result
}

module.exports = {toPointCloud}

},{"../core/CSG":15,"./primitives3d":11}],4:[function(require,module,exports){
const Vertex3 = require('../core/math/Vertex3')
const Vector3 = require('../core/math/Vector3')
const Polygon3 = require('../core/math/Polygon3')

// FIXME: this is to have more readable/less extremely verbose code below
const vertexFromVectorArray = array => {
  return new Vertex3(new Vector3(array))
}

const polygonFromPoints = points => {
  // EEK talk about wrapping wrappers !
  const vertices = points.map(point => new Vertex3(new Vector3(point)))
  return new Polygon3(vertices)
}

// Simplified, array vector rightMultiply1x3Vector
const rightMultiply1x3VectorToArray = (matrix, vector) => {
  const [v0, v1, v2] = vector
  const v3 = 1
  let x = v0 * matrix.elements[0] + v1 * matrix.elements[1] + v2 * matrix.elements[2] + v3 * matrix.elements[3]
  let y = v0 * matrix.elements[4] + v1 * matrix.elements[5] + v2 * matrix.elements[6] + v3 * matrix.elements[7]
  let z = v0 * matrix.elements[8] + v1 * matrix.elements[9] + v2 * matrix.elements[10] + v3 * matrix.elements[11]
  let w = v0 * matrix.elements[12] + v1 * matrix.elements[13] + v2 * matrix.elements[14] + v3 * matrix.elements[15]

  // scale such that fourth element becomes 1:
  if (w !== 1) {
    const invw = 1.0 / w
    x *= invw
    y *= invw
    z *= invw
  }
  return [x, y, z]
}

function clamp (value, min, max) {
  return Math.min(Math.max(value, min), max)
}

const cagToPointsArray = input => {
  let points
  if ('sides' in input) { // this is a cag
    points = []
    input.sides.forEach(side => {
      points.push([side.vertex0.pos.x, side.vertex0.pos.y])
      points.push([side.vertex1.pos.x, side.vertex1.pos.y])
    })
    // cag.sides.map(side => [side.vertex0.pos.x, side.vertex0.pos.y])
    //, side.vertex1.pos.x, side.vertex1.pos.y])
    // due to the logic of CAG.fromPoints()
    // move the first point to the last
    /* if (points.length > 0) {
      points.push(points.shift())
    } */
  } else if ('points' in input) {
    points = input.points.map(p => ([p.x, p.y]))
  }

  return points
}

const degToRad = deg => (Math.PI / 180) * deg

module.exports = {cagToPointsArray, clamp, rightMultiply1x3VectorToArray, polygonFromPoints}

},{"../core/math/Polygon3":30,"../core/math/Vector3":33,"../core/math/Vertex3":35}],5:[function(require,module,exports){
const Matrix4x4 = require('../core/math/Matrix4.js')
const Vector3D = require('../core/math/Vector3.js')
const {Connector} = require('../core/connectors.js')
const {fromPoints} = require('../core/CAGFactories')
const Vector2D = require('../core/math/Vector2')

// Get the transformation that transforms this CSG such that it is lying on the z=0 plane,
// as flat as possible (i.e. the least z-height).
// So that it is in an orientation suitable for CNC milling
const getTransformationAndInverseTransformationToFlatLying = function (_csg) {
  if (_csg.polygons.length === 0) {
    let m = new Matrix4x4() // unity
    return [m, m]
  } else {
          // get a list of unique planes in the CSG:
    let csg = _csg.canonicalized()
    let planemap = {}
    csg.polygons.map(function (polygon) {
      planemap[polygon.plane.getTag()] = polygon.plane
    })
          // try each plane in the CSG and find the plane that, when we align it flat onto z=0,
          // gives the least height in z-direction.
          // If two planes give the same height, pick the plane that originally had a normal closest
          // to [0,0,-1].
    let xvector = new Vector3D(1, 0, 0)
    let yvector = new Vector3D(0, 1, 0)
    let zvector = new Vector3D(0, 0, 1)
    let z0connectorx = new Connector([0, 0, 0], [0, 0, -1], xvector)
    let z0connectory = new Connector([0, 0, 0], [0, 0, -1], yvector)
    let isfirst = true
    let minheight = 0
    let maxdotz = 0
    let besttransformation, bestinversetransformation
    for (let planetag in planemap) {
      let plane = planemap[planetag]
      let pointonplane = plane.normal.times(plane.w)
      let transformation, inversetransformation
              // We need a normal vecrtor for the transformation
              // determine which is more perpendicular to the plane normal: x or y?
              // we will align this as much as possible to the x or y axis vector
      let xorthogonality = plane.normal.cross(xvector).length()
      let yorthogonality = plane.normal.cross(yvector).length()
      if (xorthogonality > yorthogonality) {
                  // x is better:
        let planeconnector = new Connector(pointonplane, plane.normal, xvector)
        transformation = planeconnector.getTransformationTo(z0connectorx, false, 0)
        inversetransformation = z0connectorx.getTransformationTo(planeconnector, false, 0)
      } else {
                  // y is better:
        let planeconnector = new Connector(pointonplane, plane.normal, yvector)
        transformation = planeconnector.getTransformationTo(z0connectory, false, 0)
        inversetransformation = z0connectory.getTransformationTo(planeconnector, false, 0)
      }
      let transformedcsg = csg.transform(transformation)
      let dotz = -plane.normal.dot(zvector)
      let bounds = transformedcsg.getBounds()
      let zheight = bounds[1].z - bounds[0].z
      let isbetter = isfirst
      if (!isbetter) {
        if (zheight < minheight) {
          isbetter = true
        } else if (zheight === minheight) {
          if (dotz > maxdotz) isbetter = true
        }
      }
      if (isbetter) {
                  // translate the transformation around the z-axis and onto the z plane:
        let translation = new Vector3D([-0.5 * (bounds[1].x + bounds[0].x), -0.5 * (bounds[1].y + bounds[0].y), -bounds[0].z])
        transformation = transformation.multiply(Matrix4x4.translation(translation))
        inversetransformation = Matrix4x4.translation(translation.negated()).multiply(inversetransformation)
        minheight = zheight
        maxdotz = dotz
        besttransformation = transformation
        bestinversetransformation = inversetransformation
      }
      isfirst = false
    }
    return [besttransformation, bestinversetransformation]
  }
}

const getTransformationToFlatLying = function (csg) {
  let result = csg.getTransformationAndInverseTransformationToFlatLying()
  return result[0]
}

const lieFlat = function (csg) {
  let transformation = csg.getTransformationToFlatLying()
  return csg.transform(transformation)
}

/** cag = cag.overCutInsideCorners(cutterradius);
 * Using a CNC router it's impossible to cut out a true sharp inside corner. The inside corner
 * will be rounded due to the radius of the cutter. This function compensates for this by creating
 * an extra cutout at each inner corner so that the actual cut out shape will be at least as large
 * as needed.
 * @param {Object} _cag - input cag
 * @param {Float} cutterradius - radius to cut inside corners by
 * @returns {CAG} cag with overcutInsideCorners
 */
const overCutInsideCorners = function (_cag, cutterradius) {
  let cag = _cag.canonicalized()
  // for each vertex determine the 'incoming' side and 'outgoing' side:
  let pointmap = {} // tag => {pos: coord, from: [], to: []}
  cag.sides.map(function (side) {
    if (!(side.vertex0.getTag() in pointmap)) {
      pointmap[side.vertex0.getTag()] = {
        pos: side.vertex0.pos,
        from: [],
        to: []
      }
    }
    pointmap[side.vertex0.getTag()].to.push(side.vertex1.pos)
    if (!(side.vertex1.getTag() in pointmap)) {
      pointmap[side.vertex1.getTag()] = {
        pos: side.vertex1.pos,
        from: [],
        to: []
      }
    }
    pointmap[side.vertex1.getTag()].from.push(side.vertex0.pos)
  })
          // overcut all sharp corners:
  let cutouts = []
  for (let pointtag in pointmap) {
    let pointobj = pointmap[pointtag]
    if ((pointobj.from.length === 1) && (pointobj.to.length === 1)) {
                  // ok, 1 incoming side and 1 outgoing side:
      let fromcoord = pointobj.from[0]
      let pointcoord = pointobj.pos
      let tocoord = pointobj.to[0]
      let v1 = pointcoord.minus(fromcoord).unit()
      let v2 = tocoord.minus(pointcoord).unit()
      let crossproduct = v1.cross(v2)
      let isInnerCorner = (crossproduct < 0.001)
      if (isInnerCorner) {
                      // yes it's a sharp corner:
        let alpha = v2.angleRadians() - v1.angleRadians() + Math.PI
        if (alpha < 0) {
          alpha += 2 * Math.PI
        } else if (alpha >= 2 * Math.PI) {
          alpha -= 2 * Math.PI
        }
        let midvector = v2.minus(v1).unit()
        let circlesegmentangle = 30 / 180 * Math.PI // resolution of the circle: segments of 30 degrees
                      // we need to increase the radius slightly so that our imperfect circle will contain a perfect circle of cutterradius
        let radiuscorrected = cutterradius / Math.cos(circlesegmentangle / 2)
        let circlecenter = pointcoord.plus(midvector.times(radiuscorrected))
                      // we don't need to create a full circle; a pie is enough. Find the angles for the pie:
        let startangle = alpha + midvector.angleRadians()
        let deltaangle = 2 * (Math.PI - alpha)
        let numsteps = 2 * Math.ceil(deltaangle / circlesegmentangle / 2) // should be even
                      // build the pie:
        let points = [circlecenter]
        for (let i = 0; i <= numsteps; i++) {
          let angle = startangle + i / numsteps * deltaangle
          let p = Vector2D.fromAngleRadians(angle).times(radiuscorrected).plus(circlecenter)
          points.push(p)
        }
        cutouts.push(fromPoints(points))
      }
    }
  }
  return cag.subtract(cutouts)
}

module.exports = {lieFlat, getTransformationToFlatLying, getTransformationAndInverseTransformationToFlatLying, overCutInsideCorners}

},{"../core/CAGFactories":14,"../core/connectors.js":21,"../core/math/Matrix4.js":25,"../core/math/Vector2":32,"../core/math/Vector3.js":33}],6:[function(require,module,exports){
const {EPS} = require('../core/constants')
const Plane = require('../core/math/Plane')
const Vector2 = require('../core/math/Vector2')
const Vertex3 = require('../core/math/Vertex3')
const Polygon3 = require('../core/math/Polygon3')
const OrthoNormalBasis = require('../core/math/OrthoNormalBasis')

/** cuts a csg along a orthobasis
 * @param  {CSG} csg the csg object to cut
 * @param  {Orthobasis} orthobasis the orthobasis to cut along
 */
const sectionCut = function (csg, orthobasis) {
  let plane1 = orthobasis.plane
  let plane2 = orthobasis.plane.flipped()
  plane1 = new Plane(plane1.normal, plane1.w)
  plane2 = new Plane(plane2.normal, plane2.w + (5 * EPS))
  let cut3d = csg.cutByPlane(plane1)
  cut3d = cut3d.cutByPlane(plane2)
  return cut3d.projectToOrthoNormalBasis(orthobasis)
}

/** Cut the solid by a plane. Returns the solid on the back side of the plane
 * @param  {Plane} plane
 * @returns {CSG} the solid on the back side of the plane
 */
const cutByPlane = function (csg, plane) {
  if (csg.polygons.length === 0) {
    const CSG = require('../core/CSG') // FIXME: circular dependency ! CSG => cutByPlane => CSG
    return new CSG()
  }
  // Ideally we would like to do an intersection with a polygon of inifinite size
  // but this is not supported by our implementation. As a workaround, we will create
  // a cube, with one face on the plane, and a size larger enough so that the entire
  // solid fits in the cube.
  // find the max distance of any vertex to the center of the plane:
  let planecenter = plane.normal.times(plane.w)
  let maxdistance = 0
  csg.polygons.map(function (polygon) {
    polygon.vertices.map(function (vertex) {
      let distance = vertex.pos.distanceToSquared(planecenter)
      if (distance > maxdistance) maxdistance = distance
    })
  })
  maxdistance = Math.sqrt(maxdistance)
  maxdistance *= 1.01 // make sure it's really larger
  // Now build a polygon on the plane, at any point farther than maxdistance from the plane center:
  let vertices = []
  let orthobasis = new OrthoNormalBasis(plane)
  vertices.push(new Vertex3(orthobasis.to3D(new Vector2(maxdistance, -maxdistance))))
  vertices.push(new Vertex3(orthobasis.to3D(new Vector2(-maxdistance, -maxdistance))))
  vertices.push(new Vertex3(orthobasis.to3D(new Vector2(-maxdistance, maxdistance))))
  vertices.push(new Vertex3(orthobasis.to3D(new Vector2(maxdistance, maxdistance))))
  const polygon = new Polygon3(vertices, null, plane.flipped())

  // and extrude the polygon into a cube, backwards of the plane:
  const cube = polygon.extrude(plane.normal.times(-maxdistance))

  // Now we can do the intersection:
  let result = csg.intersect(cube)
  result.properties = csg.properties // keep original properties
  return result
}

module.exports = {sectionCut, cutByPlane}

},{"../core/CSG":15,"../core/constants":22,"../core/math/OrthoNormalBasis":26,"../core/math/Plane":28,"../core/math/Polygon3":30,"../core/math/Vector2":32,"../core/math/Vertex3":35}],7:[function(require,module,exports){

const {EPS, angleEPS} = require('../core/constants')
const Vertex = require('../core/math/Vertex3')
const Vector2D = require('../core/math/Vector2')
const Polygon = require('../core/math/Polygon3')
const {fnNumberSort, isCSG} = require('../core/utils')
const {fromPoints, fromPointsNoCheck} = require('../core/CAGFactories')

const expand = function (shape, radius, resolution) {
  let result
  if (isCSG(shape)) {
    result = shape.union(expandedShellOfCCSG(shape, radius, resolution))
    result = result.reTesselated()
    result.properties = shape.properties // keep original properties
  } else {
    result = shape.union(expandedShellOfCAG(shape, radius, resolution))
  }
  return result
}

const contract = function (shape, radius, resolution) {
  let result
  if (isCSG(shape)) {
    result = shape.subtract(expandedShellOfCCSG(shape, radius, resolution))
    result = result.reTesselated()
    result.properties = shape.properties // keep original properties
  } else {
    result = shape.subtract(expandedShellOfCAG(shape, radius, resolution))
  }
  return result
}

const expandedShellOfCAG = function (_cag, radius, resolution) {
  const CAG = require('../core/CAG') // FIXME, circular dependency !!
  resolution = resolution || 8
  if (resolution < 4) resolution = 4
  let cags = []
  let pointmap = {}
  let cag = _cag.canonicalized()
  cag.sides.map(function (side) {
    let d = side.vertex1.pos.minus(side.vertex0.pos)
    let dl = d.length()
    if (dl > EPS) {
      d = d.times(1.0 / dl)
      let normal = d.normal().times(radius)
      let shellpoints = [
        side.vertex1.pos.plus(normal),
        side.vertex1.pos.minus(normal),
        side.vertex0.pos.minus(normal),
        side.vertex0.pos.plus(normal)
      ]
      //      let newcag = fromPointsNoCheck(shellpoints);
      let newcag = fromPoints(shellpoints)
      cags.push(newcag)
      for (let step = 0; step < 2; step++) {
        let p1 = (step === 0) ? side.vertex0.pos : side.vertex1.pos
        let p2 = (step === 0) ? side.vertex1.pos : side.vertex0.pos
        let tag = p1.x + ' ' + p1.y
        if (!(tag in pointmap)) {
          pointmap[tag] = []
        }
        pointmap[tag].push({
          'p1': p1,
          'p2': p2
        })
      }
    }
  })
  for (let tag in pointmap) {
    let m = pointmap[tag]
    let angle1, angle2
    let pcenter = m[0].p1
    if (m.length === 2) {
      let end1 = m[0].p2
      let end2 = m[1].p2
      angle1 = end1.minus(pcenter).angleDegrees()
      angle2 = end2.minus(pcenter).angleDegrees()
      if (angle2 < angle1) angle2 += 360
      if (angle2 >= (angle1 + 360)) angle2 -= 360
      if (angle2 < angle1 + 180) {
        let t = angle2
        angle2 = angle1 + 360
        angle1 = t
      }
      angle1 += 90
      angle2 -= 90
    } else {
      angle1 = 0
      angle2 = 360
    }
    let fullcircle = (angle2 > angle1 + 359.999)
    if (fullcircle) {
      angle1 = 0
      angle2 = 360
    }
    if (angle2 > (angle1 + angleEPS)) {
      let points = []
      if (!fullcircle) {
        points.push(pcenter)
      }
      let numsteps = Math.round(resolution * (angle2 - angle1) / 360)
      if (numsteps < 1) numsteps = 1
      for (let step = 0; step <= numsteps; step++) {
        let angle = angle1 + step / numsteps * (angle2 - angle1)
        if (step === numsteps) angle = angle2 // prevent rounding errors
        let point = pcenter.plus(Vector2D.fromAngleDegrees(angle).times(radius))
        if ((!fullcircle) || (step > 0)) {
          points.push(point)
        }
      }
      let newcag = fromPointsNoCheck(points)
      cags.push(newcag)
    }
  }
  let result = new CAG()
  result = result.union(cags)
  return result
}

/**
 * Create the expanded shell of the solid:
 * All faces are extruded to get a thickness of 2*radius
 * Cylinders are constructed around every side
 * Spheres are placed on every vertex
 * unionWithThis: if true, the resulting solid will be united with 'this' solid;
 * the result is a true expansion of the solid
 * If false, returns only the shell
 * @param  {Float} radius
 * @param  {Integer} resolution
 * @param  {Boolean} unionWithThis
 */
const expandedShellOfCCSG = function (_csg, radius, resolution, unionWithThis) {
  const CSG = require('../core/CSG') // FIXME: circular dependency ! CSG => this => CSG
  const {fromPolygons} = require('../core/CSGFactories') // FIXME: circular dependency !
  // const {sphere} = require('./primitives3d') // FIXME: circular dependency !
  let csg = _csg.reTesselated()
  let result
  if (unionWithThis) {
    result = csg
  } else {
    result = new CSG()
  }

  // first extrude all polygons:
  csg.polygons.map(function (polygon) {
    let extrudevector = polygon.plane.normal.unit().times(2 * radius)
    let translatedpolygon = polygon.translate(extrudevector.times(-0.5))
    let extrudedface = translatedpolygon.extrude(extrudevector)
    result = result.unionSub(extrudedface, false, false)
  })

    // Make a list of all unique vertex pairs (i.e. all sides of the solid)
    // For each vertex pair we collect the following:
    //   v1: first coordinate
    //   v2: second coordinate
    //   planenormals: array of normal vectors of all planes touching this side
  let vertexpairs = {} // map of 'vertex pair tag' to {v1, v2, planenormals}
  csg.polygons.map(function (polygon) {
    let numvertices = polygon.vertices.length
    let prevvertex = polygon.vertices[numvertices - 1]
    let prevvertextag = prevvertex.getTag()
    for (let i = 0; i < numvertices; i++) {
      let vertex = polygon.vertices[i]
      let vertextag = vertex.getTag()
      let vertextagpair
      if (vertextag < prevvertextag) {
        vertextagpair = vertextag + '-' + prevvertextag
      } else {
        vertextagpair = prevvertextag + '-' + vertextag
      }
      let obj
      if (vertextagpair in vertexpairs) {
        obj = vertexpairs[vertextagpair]
      } else {
        obj = {
          v1: prevvertex,
          v2: vertex,
          planenormals: []
        }
        vertexpairs[vertextagpair] = obj
      }
      obj.planenormals.push(polygon.plane.normal)

      prevvertextag = vertextag
      prevvertex = vertex
    }
  })

  // now construct a cylinder on every side
  // The cylinder is always an approximation of a true cylinder: it will have <resolution> polygons
  // around the sides. We will make sure though that the cylinder will have an edge at every
  // face that touches this side. This ensures that we will get a smooth fill even
  // if two edges are at, say, 10 degrees and the resolution is low.
  // Note: the result is not retesselated yet but it really should be!
  for (let vertextagpair in vertexpairs) {
    let vertexpair = vertexpairs[vertextagpair]
    let startpoint = vertexpair.v1.pos
    let endpoint = vertexpair.v2.pos
                // our x,y and z vectors:
    let zbase = endpoint.minus(startpoint).unit()
    let xbase = vertexpair.planenormals[0].unit()
    let ybase = xbase.cross(zbase)

      // make a list of angles that the cylinder should traverse:
    let angles = []

    // first of all equally spaced around the cylinder:
    for (let i = 0; i < resolution; i++) {
      angles.push(i * Math.PI * 2 / resolution)
    }

    // and also at every normal of all touching planes:
    for (let i = 0, iMax = vertexpair.planenormals.length; i < iMax; i++) {
      let planenormal = vertexpair.planenormals[i]
      let si = ybase.dot(planenormal)
      let co = xbase.dot(planenormal)
      let angle = Math.atan2(si, co)

      if (angle < 0) angle += Math.PI * 2
      angles.push(angle)
      angle = Math.atan2(-si, -co)
      if (angle < 0) angle += Math.PI * 2
      angles.push(angle)
    }

    // this will result in some duplicate angles but we will get rid of those later.
    // Sort:
    angles = angles.sort(fnNumberSort)

    // Now construct the cylinder by traversing all angles:
    let numangles = angles.length
    let prevp1
    let prevp2
    let startfacevertices = []
    let endfacevertices = []
    let polygons = []
    for (let i = -1; i < numangles; i++) {
      let angle = angles[(i < 0) ? (i + numangles) : i]
      let si = Math.sin(angle)
      let co = Math.cos(angle)
      let p = xbase.times(co * radius).plus(ybase.times(si * radius))
      let p1 = startpoint.plus(p)
      let p2 = endpoint.plus(p)
      let skip = false
      if (i >= 0) {
        if (p1.distanceTo(prevp1) < EPS) {
          skip = true
        }
      }
      if (!skip) {
        if (i >= 0) {
          startfacevertices.push(new Vertex(p1))
          endfacevertices.push(new Vertex(p2))
          let polygonvertices = [
            new Vertex(prevp2),
            new Vertex(p2),
            new Vertex(p1),
            new Vertex(prevp1)
          ]
          let polygon = new Polygon(polygonvertices)
          polygons.push(polygon)
        }
        prevp1 = p1
        prevp2 = p2
      }
    }
    endfacevertices.reverse()
    polygons.push(new Polygon(startfacevertices))
    polygons.push(new Polygon(endfacevertices))
    let cylinder = fromPolygons(polygons)
    result = result.unionSub(cylinder, false, false)
  }

        // make a list of all unique vertices
        // For each vertex we also collect the list of normals of the planes touching the vertices
  let vertexmap = {}
  csg.polygons.map(function (polygon) {
    polygon.vertices.map(function (vertex) {
      let vertextag = vertex.getTag()
      let obj
      if (vertextag in vertexmap) {
        obj = vertexmap[vertextag]
      } else {
        obj = {
          pos: vertex.pos,
          normals: []
        }
        vertexmap[vertextag] = obj
      }
      obj.normals.push(polygon.plane.normal)
    })
  })

        // and build spheres at each vertex
        // We will try to set the x and z axis to the normals of 2 planes
        // This will ensure that our sphere tesselation somewhat matches 2 planes
  for (let vertextag in vertexmap) {
    let vertexobj = vertexmap[vertextag]
            // use the first normal to be the x axis of our sphere:
    let xaxis = vertexobj.normals[0].unit()
            // and find a suitable z axis. We will use the normal which is most perpendicular to the x axis:
    let bestzaxis = null
    let bestzaxisorthogonality = 0
    for (let i = 1; i < vertexobj.normals.length; i++) {
      let normal = vertexobj.normals[i].unit()
      let cross = xaxis.cross(normal)
      let crosslength = cross.length()
      if (crosslength > 0.05) {
        if (crosslength > bestzaxisorthogonality) {
          bestzaxisorthogonality = crosslength
          bestzaxis = normal
        }
      }
    }
    if (!bestzaxis) {
      bestzaxis = xaxis.randomNonParallelVector()
    }
    let yaxis = xaxis.cross(bestzaxis).unit()
    let zaxis = yaxis.cross(xaxis)
    let _sphere = CSG.sphere({
      center: vertexobj.pos,
      radius: radius,
      resolution: resolution,
      axes: [xaxis, yaxis, zaxis]
    })
    result = result.unionSub(_sphere, false, false)
  }

  return result
}

module.exports = {
  expand,
  contract,
  expandedShellOfCAG,
  expandedShellOfCCSG
}

},{"../core/CAG":13,"../core/CAGFactories":14,"../core/CSG":15,"../core/CSGFactories":16,"../core/constants":22,"../core/math/Polygon3":30,"../core/math/Vector2":32,"../core/math/Vertex3":35,"../core/utils":40}],8:[function(require,module,exports){
const {EPS, defaultResolution3D} = require('../core/constants')
const OrthoNormalBasis = require('../core/math/OrthoNormalBasis')
const {parseOptionAs3DVector, parseOptionAsBool, parseOptionAsFloat, parseOptionAsInt} = require('./optionParsers')
const Vector3D = require('../core/math/Vector3')
const Matrix4 = require('../core/math/Matrix4')
const Path2D = require('../core/math/Path2')
const {Connector} = require('../core/connectors')
const {fromPolygons} = require('../core/CSGFactories')
const {cagToPointsArray, clamp, rightMultiply1x3VectorToArray, polygonFromPoints} = require('./helpers')
const {fromPoints} = require('../core/CAGFactories')

/** extrude the CAG in a certain plane.
 * Giving just a plane is not enough, multiple different extrusions in the same plane would be possible
 * by rotating around the plane's origin. An additional right-hand vector should be specified as well,
 * and this is exactly a OrthoNormalBasis.
 * @param  {CAG} cag the cag to extrude
 * @param  {Orthonormalbasis} orthonormalbasis characterizes the plane in which to extrude
 * @param  {Float} depth thickness of the extruded shape. Extrusion is done upwards from the plane
 *  (unless symmetrical option is set, see below)
 * @param  {Object} [options] - options for construction
 * @param {Boolean} [options.symmetrical=true] - extrude symmetrically in two directions about the plane
 */
const extrudeInOrthonormalBasis = function (cag, orthonormalbasis, depth, options) {
      // first extrude in the regular Z plane:
  if (!(orthonormalbasis instanceof OrthoNormalBasis)) {
    throw new Error('extrudeInPlane: the first parameter should be a OrthoNormalBasis')
  }
  let extruded = cag.extrude({
    offset: [0, 0, depth]
  })
  if (parseOptionAsBool(options, 'symmetrical', false)) {
    extruded = extruded.translate([0, 0, -depth / 2])
  }
  let matrix = orthonormalbasis.getInverseProjectionMatrix()
  extruded = extruded.transform(matrix)
  return extruded
}

/** Extrude in a standard cartesian plane, specified by two axis identifiers. Each identifier can be
 * one of ["X","Y","Z","-X","-Y","-Z"]
 * The 2d x axis will map to the first given 3D axis, the 2d y axis will map to the second.
 * See OrthoNormalBasis.GetCartesian for details.
 * @param  {CAG} cag the cag to extrude
 * @param  {String} axis1 the first axis
 * @param  {String} axis2 the second axis
 * @param  {Float} depth thickness of the extruded shape. Extrusion is done upwards from the plane
 * @param  {Object} [options] - options for construction
 * @param {Boolean} [options.symmetrical=true] - extrude symmetrically in two directions about the plane
 */
const extrudeInPlane = function (cag, axis1, axis2, depth, options) {
  return extrudeInOrthonormalBasis(cag, OrthoNormalBasis.GetCartesian(axis1, axis2), depth, options)
}

/** linear extrusion of 2D shape, with optional twist
 * @param  {CAG} cag the cag to extrude
 * @param  {Object} [options] - options for construction
 * @param {Array} [options.offset=[0,0,1]] - The 2d shape is placed in in z=0 plane and extruded into direction <offset>
 * (a 3D vector as a 3 component array)
 * @param {Boolean} [options.twiststeps=defaultResolution3D] - twiststeps determines the resolution of the twist (should be >= 1)
 * @param {Boolean} [options.twistangle=0] - twistangle The final face is rotated <twistangle> degrees. Rotation is done around the origin of the 2d shape (i.e. x=0, y=0)
 * @returns {CSG} the extrude shape, as a CSG object
 * @example extruded=cag.extrude({offset: [0,0,10], twistangle: 360, twiststeps: 100});
*/
const extrude = function (cag, options) {
  const CSG = require('../core/CSG') // FIXME: circular dependencies CAG=>CSG=>CAG
  if (cag.sides.length === 0) {
    // empty! : FIXME: should this throw ?
    return new CSG()
  }
  let offsetVector = parseOptionAs3DVector(options, 'offset', [0, 0, 1])
  let twistangle = parseOptionAsFloat(options, 'twistangle', 0)
  let twiststeps = parseOptionAsInt(options, 'twiststeps', defaultResolution3D)
  if (offsetVector.z === 0) {
    throw new Error('offset cannot be orthogonal to Z axis')
  }
  if (twistangle === 0 || twiststeps < 1) {
    twiststeps = 1
  }
  let normalVector = Vector3D.Create(0, 1, 0)

  let polygons = []
  // bottom and top
  polygons = polygons.concat(cag._toPlanePolygons({
    translation: [0, 0, 0],
    normalVector: normalVector,
    flipped: !(offsetVector.z < 0)}
  ))
  polygons = polygons.concat(cag._toPlanePolygons({
    translation: offsetVector,
    normalVector: normalVector.rotateZ(twistangle),
    flipped: offsetVector.z < 0}))
  // walls
  for (let i = 0; i < twiststeps; i++) {
    let c1 = new Connector(offsetVector.times(i / twiststeps), [0, 0, offsetVector.z],
              normalVector.rotateZ(i * twistangle / twiststeps))
    let c2 = new Connector(offsetVector.times((i + 1) / twiststeps), [0, 0, offsetVector.z],
              normalVector.rotateZ((i + 1) * twistangle / twiststeps))
    polygons = polygons.concat(cag._toWallPolygons({toConnector1: c1, toConnector2: c2}))
  }

  return fromPolygons(polygons)
}

// THIS IS AN OLD untested !!! version of rotate extrude
/** Extrude to into a 3D solid by rotating the origin around the Y axis.
 * (and turning everything into XY plane)
 * @param {Object} options - options for construction
 * @param {Number} [options.angle=360] - angle of rotation
 * @param {Number} [options.resolution=defaultResolution3D] - number of polygons per 360 degree revolution
 * @returns {CSG} new 3D solid
 */
const rotateExtrude = function (cag, options) { // FIXME options should be optional
  let alpha = parseOptionAsFloat(options, 'angle', 360)
  let resolution = parseOptionAsInt(options, 'resolution', defaultResolution3D)

  alpha = alpha > 360 ? alpha % 360 : alpha
  let origin = [0, 0, 0]
  let axisV = Vector3D.Create(0, 1, 0)
  let normalV = [0, 0, 1]
  let polygons = []
  // planes only needed if alpha > 0
  let connS = new Connector(origin, axisV, normalV)
  if (alpha > 0 && alpha < 360) {
          // we need to rotate negative to satisfy wall function condition of
          // building in the direction of axis vector
    let connE = new Connector(origin, axisV.rotateZ(-alpha), normalV)
    polygons = polygons.concat(
              cag._toPlanePolygons({toConnector: connS, flipped: true}))
    polygons = polygons.concat(
              cag._toPlanePolygons({toConnector: connE}))
  }
  let connT1 = connS
  let connT2
  let step = alpha / resolution
  for (let a = step; a <= alpha + EPS; a += step) { // FIXME Should this be angelEPS?
    connT2 = new Connector(origin, axisV.rotateZ(-a), normalV)
    polygons = polygons.concat(cag._toWallPolygons(
              {toConnector1: connT1, toConnector2: connT2}))
    connT1 = connT2
  }
  return fromPolygons(polygons).reTesselated()
}

// FIXME: right now linear & rotate extrude take params first, while rectangular_extrude
// takes params second ! confusing and incoherent ! needs to be changed (BREAKING CHANGE !)

/** linear extrusion of the input 2d shape
 * @param {Object} [options] - options for construction
 * @param {Float} [options.height=1] - height of the extruded shape
 * @param {Integer} [options.slices=10] - number of intermediary steps/slices
 * @param {Integer} [options.twist=0] - angle (in degrees to twist the extusion by)
 * @param {Boolean} [options.center=false] - whether to center extrusion or not
 * @param {CAG} baseShape input 2d shape
 * @returns {CSG} new extruded shape
 *
 * @example
 * let revolved = linear_extrude({height: 10}, square())
 */
function linear_extrude (params, baseShape) {
  const defaults = {
    height: 1,
    slices: 10,
    twist: 0,
    center: false
  }
  /* convexity = 10, */
  const {height, twist, slices, center} = Object.assign({}, defaults, params)

  // if(params.convexity) convexity = params.convexity      // abandoned
  let output = baseShape.extrude({offset: [0, 0, height], twistangle: twist, twiststeps: slices})
  if (center === true) {
    const b = output.getBounds() // b[0] = min, b[1] = max
    const offset = (b[1].plus(b[0])).times(-0.5)
    output = output.translate(offset)
  }
  return output
}

/** rotate extrusion / revolve of the given 2d shape
 * @param {Object} [options] - options for construction
 * @param {Integer} [options.fn=1] - resolution/number of segments of the extrusion
 * @param {Float} [options.startAngle=1] - start angle of the extrusion, in degrees
 * @param {Float} [options.angle=1] - angle of the extrusion, in degrees
 * @param {Float} [options.overflow='cap'] - what to do with points outside of bounds (+ / - x) :
 * defaults to capping those points to 0 (only supported behaviour for now)
 * @param {CAG} baseShape input 2d shape
 * @returns {CSG} new extruded shape
 *
 * @example
 * let revolved = rotate_extrude({fn: 10}, square())
 */
function rotate_extrude (params, baseShape) {
  // note, we should perhaps alias this to revolve() as well
  const defaults = {
    fn: 32,
    startAngle: 0,
    angle: 360,
    overflow: 'cap'
  }
  params = Object.assign({}, defaults, params)
  let {fn, startAngle, angle, overflow} = params
  if (overflow !== 'cap') {
    throw new Error('only capping of overflowing points is supported !')
  }

  if (arguments.length < 2) { // FIXME: what the hell ??? just put params second !
    baseShape = params
  }
  // are we dealing with a positive or negative angle (for normals flipping)
  const flipped = angle > 0
  // limit actual angle between 0 & 360, regardless of direction
  const totalAngle = flipped ? clamp((startAngle + angle), 0, 360) : clamp((startAngle + angle), -360, 0)
  // adapt to the totalAngle : 1 extra segment per 45 degs if not 360 deg extrusion
  // needs to be at least one and higher then the input resolution
  const segments = Math.max(
    Math.floor(Math.abs(totalAngle) / 45),
    1,
    fn
  )
  // maximum distance per axis between two points before considering them to be the same
  const overlapTolerance = 0.00001
  // convert baseshape to just an array of points, easier to deal with
  let shapePoints = cagToPointsArray(baseShape)

  // determine if the rotate_extrude can be computed in the first place
  // ie all the points have to be either x > 0 or x < 0

  // generic solution to always have a valid solid, even if points go beyond x/ -x
  // 1. split points up between all those on the 'left' side of the axis (x<0) & those on the 'righ' (x>0)
  // 2. for each set of points do the extrusion operation IN OPOSITE DIRECTIONS
  // 3. union the two resulting solids

  // 1. alt : OR : just cap of points at the axis ?

  // console.log('shapePoints BEFORE', shapePoints, baseShape.sides)

  const pointsWithNegativeX = shapePoints.filter(x => x[0] < 0)
  const pointsWithPositiveX = shapePoints.filter(x => x[0] >= 0)
  const arePointsWithNegAndPosX = pointsWithNegativeX.length > 0 && pointsWithPositiveX.length > 0

  if (arePointsWithNegAndPosX && overflow === 'cap') {
    if (pointsWithNegativeX.length > pointsWithPositiveX.length) {
      shapePoints = shapePoints.map(function (point) {
        return [Math.min(point[0], 0), point[1]]
      })
    } else if (pointsWithPositiveX.length >= pointsWithNegativeX.length) {
      shapePoints = shapePoints.map(function (point) {
        return [Math.max(point[0], 0), point[1]]
      })
    }
  }

  // console.log('negXs', pointsWithNegativeX, 'pointsWithPositiveX', pointsWithPositiveX, 'arePointsWithNegAndPosX', arePointsWithNegAndPosX)
 //  console.log('shapePoints AFTER', shapePoints, baseShape.sides)

  let polygons = []

  // for each of the intermediary steps in the extrusion
  for (let i = 1; i < segments + 1; i++) {
    // for each side of the 2d shape
    for (let j = 0; j < shapePoints.length - 1; j++) {
      // 2 points of a side
      const curPoint = shapePoints[j]
      const nextPoint = shapePoints[j + 1]

      // compute matrix for current and next segment angle
      let prevMatrix = Matrix4.rotationZ((i - 1) / segments * angle + startAngle)
      let curMatrix = Matrix4.rotationZ(i / segments * angle + startAngle)

      const pointA = rightMultiply1x3VectorToArray(prevMatrix, [curPoint[0], 0, curPoint[1]])
      const pointAP = rightMultiply1x3VectorToArray(curMatrix, [curPoint[0], 0, curPoint[1]])
      const pointB = rightMultiply1x3VectorToArray(prevMatrix, [nextPoint[0], 0, nextPoint[1]])
      const pointBP = rightMultiply1x3VectorToArray(curMatrix, [nextPoint[0], 0, nextPoint[1]])

      // console.log(`point ${j} edge connecting ${j} to ${j + 1}`)
      let overlappingPoints = false
      if (Math.abs(pointA[0] - pointAP[0]) < overlapTolerance && Math.abs(pointB[1] - pointBP[1]) < overlapTolerance) {
        // console.log('identical / overlapping points (from current angle and next one), what now ?')
        overlappingPoints = true
      }

      // we do not generate a single quad because:
      // 1. it does not allow eliminating unneeded triangles in case of overlapping points
      // 2. the current cleanup routines of csg.js create degenerate shapes from those quads
      // let polyPoints = [pointA, pointB, pointBP, pointAP]
      // polygons.push(polygonFromPoints(polyPoints))

      if (flipped) {
        // CW
        polygons.push(polygonFromPoints([pointA, pointB, pointBP]))
        if (!overlappingPoints) {
          polygons.push(polygonFromPoints([pointBP, pointAP, pointA]))
        }
      } else {
        // CCW
        if (!overlappingPoints) {
          polygons.push(polygonFromPoints([pointA, pointAP, pointBP]))
        }
        polygons.push(polygonFromPoints([pointBP, pointB, pointA]))
      }
    }
    // if we do not do a full extrusion, we want caps at both ends (closed volume)
    if (Math.abs(angle) < 360) {
      // we need to recreate the side with capped points where applicable
      const sideShape = fromPoints(shapePoints)
      const endMatrix = Matrix4.rotationX(90).multiply(
        Matrix4.rotationZ(-startAngle)
      )
      const endCap = sideShape._toPlanePolygons({flipped: flipped})
        .map(x => x.transform(endMatrix))

      const startMatrix = Matrix4.rotationX(90).multiply(
        Matrix4.rotationZ(-angle - startAngle)
      )
      const startCap = sideShape._toPlanePolygons({flipped: !flipped})
        .map(x => x.transform(startMatrix))
      polygons = polygons.concat(endCap).concat(startCap)
    }
  }
  return fromPolygons(polygons).reTesselated().canonicalized()
}

/** rectangular extrusion of the given array of points
 * @param {Array} basePoints array of points (nested) to extrude from
 * layed out like [ [0,0], [10,0], [5,10], [0,10] ]
 * @param {Object} [options] - options for construction
 * @param {Float} [options.h=1] - height of the extruded shape
 * @param {Float} [options.w=10] - width of the extruded shape
 * @param {Integer} [options.fn=1] - resolution/number of segments of the extrusion
 * @param {Boolean} [options.closed=false] - whether to close the input path for the extrusion or not
 * @param {Boolean} [options.round=true] - whether to round the extrusion or not
 * @returns {CSG} new extruded shape
 *
 * @example
 * let revolved = rectangular_extrude({height: 10}, square())
 */
function rectangular_extrude (basePoints, params) {
  const defaults = {
    w: 1,
    h: 1,
    fn: 8,
    closed: false,
    round: true
  }
  const {w, h, fn, closed, round} = Object.assign({}, defaults, params)
  return new Path2D(basePoints, closed).rectangularExtrude(w, h, fn, round)
}

module.exports = {
  extrudeInOrthonormalBasis,
  extrudeInPlane,
  extrude,
  linear_extrude,
  rotate_extrude,
  rotateExtrude,
  rectangular_extrude
}

},{"../core/CAGFactories":14,"../core/CSG":15,"../core/CSGFactories":16,"../core/connectors":21,"../core/constants":22,"../core/math/Matrix4":25,"../core/math/OrthoNormalBasis":26,"../core/math/Path2":27,"../core/math/Vector3":33,"./helpers":4,"./optionParsers":9}],9:[function(require,module,exports){
const Vector3D = require('../core/math/Vector3')
const Vector2D = require('../core/math/Vector2')

// Parse an option from the options object
// If the option is not present, return the default value
const parseOption = function (options, optionname, defaultvalue) {
  var result = defaultvalue
  if (options && optionname in options) {
    result = options[optionname]
  }
  return result
}

  // Parse an option and force into a Vector3D. If a scalar is passed it is converted
  // into a vector with equal x,y,z
const parseOptionAs3DVector = function (options, optionname, defaultvalue) {
  var result = parseOption(options, optionname, defaultvalue)
  result = new Vector3D(result)
  return result
}

const parseOptionAs3DVectorList = function (options, optionname, defaultvalue) {
  var result = parseOption(options, optionname, defaultvalue)
  return result.map(function (res) {
    return new Vector3D(res)
  })
}

  // Parse an option and force into a Vector2D. If a scalar is passed it is converted
  // into a vector with equal x,y
const parseOptionAs2DVector = function (options, optionname, defaultvalue) {
  var result = parseOption(options, optionname, defaultvalue)
  result = new Vector2D(result)
  return result
}

const parseOptionAsFloat = function (options, optionname, defaultvalue) {
  var result = parseOption(options, optionname, defaultvalue)
  if (typeof (result) === 'string') {
    result = Number(result)
  }
  if (isNaN(result) || typeof (result) !== 'number') {
    throw new Error('Parameter ' + optionname + ' should be a number')
  }
  return result
}

const parseOptionAsInt = function (options, optionname, defaultvalue) {
  var result = parseOption(options, optionname, defaultvalue)
  result = Number(Math.floor(result))
  if (isNaN(result)) {
    throw new Error('Parameter ' + optionname + ' should be a number')
  }
  return result
}

const parseOptionAsBool = function (options, optionname, defaultvalue) {
  var result = parseOption(options, optionname, defaultvalue)
  if (typeof (result) === 'string') {
    if (result === 'true') result = true
    else if (result === 'false') result = false
    else if (result === 0) result = false
  }
  result = !!result
  return result
}

module.exports = {
  parseOption,
  parseOptionAsInt,
  parseOptionAsFloat,
  parseOptionAsBool,
  parseOptionAs3DVector,
  parseOptionAs2DVector,
  parseOptionAs3DVectorList
}

},{"../core/math/Vector2":32,"../core/math/Vector3":33}],10:[function(require,module,exports){
const CAG = require('../core/CAG')
const {parseOptionAs2DVector, parseOptionAsFloat, parseOptionAsInt} = require('./optionParsers')
const {defaultResolution2D} = require('../core/constants')
const Vector2D = require('../core/math/Vector2')
const Vertex2 = require('../core/math/Vertex2')
const Path2D = require('../core/math/Path2')
const {fromCompactBinary, fromPoints, fromPath2, fromSides} = require('../core/CAGFactories')

/** Construct a circle.
 * @param {Object} [options] - options for construction
 * @param {Vector2D} [options.center=[0,0]] - center of circle
 * @param {Number} [options.radius=1] - radius of circle
 * @param {Number} [options.resolution=defaultResolution2D] - number of sides per 360 rotation
 * @returns {CAG} new CAG object
 */
const circle = function (options) {
  options = options || {}
  let center = parseOptionAs2DVector(options, 'center', [0, 0])
  let radius = parseOptionAsFloat(options, 'radius', 1)
  let resolution = parseOptionAsInt(options, 'resolution', defaultResolution2D)
  let points = []
  for (let i = 0; i < resolution; i++) {
    let radians = 2 * Math.PI * i / resolution
    let point = Vector2D.fromAngleRadians(radians).times(radius).plus(center)
    points.push(point)
  }
  return fromPoints(points)
}

/** Construct an ellispe.
 * @param {Object} [options] - options for construction
 * @param {Vector2D} [options.center=[0,0]] - center of ellipse
 * @param {Vector2D} [options.radius=[1,1]] - radius of ellipse, width and height
 * @param {Number} [options.resolution=defaultResolution2D] - number of sides per 360 rotation
 * @returns {CAG} new CAG object
 */
const ellipse = function (options) {
  options = options || {}
  let c = parseOptionAs2DVector(options, 'center', [0, 0])
  let r = parseOptionAs2DVector(options, 'radius', [1, 1])
  r = r.abs() // negative radii make no sense
  let res = parseOptionAsInt(options, 'resolution', defaultResolution2D)

  let e2 = new Path2D([[c.x, c.y + r.y]])
  e2 = e2.appendArc([c.x, c.y - r.y], {
    xradius: r.x,
    yradius: r.y,
    xaxisrotation: 0,
    resolution: res,
    clockwise: true,
    large: false
  })
  e2 = e2.appendArc([c.x, c.y + r.y], {
    xradius: r.x,
    yradius: r.y,
    xaxisrotation: 0,
    resolution: res,
    clockwise: true,
    large: false
  })
  e2 = e2.close()
  return fromPath2(e2)
}

/** Construct a rectangle.
 * @param {Object} [options] - options for construction
 * @param {Vector2D} [options.center=[0,0]] - center of rectangle
 * @param {Vector2D} [options.radius=[1,1]] - radius of rectangle, width and height
 * @param {Vector2D} [options.corner1=[0,0]] - bottom left corner of rectangle (alternate)
 * @param {Vector2D} [options.corner2=[0,0]] - upper right corner of rectangle (alternate)
 * @returns {CAG} new CAG object
 */
const rectangle = function (options) {
  options = options || {}
  let c, r
  if (('corner1' in options) || ('corner2' in options)) {
    if (('center' in options) || ('radius' in options)) {
      throw new Error('rectangle: should either give a radius and center parameter, or a corner1 and corner2 parameter')
    }
    let corner1 = parseOptionAs2DVector(options, 'corner1', [0, 0])
    let corner2 = parseOptionAs2DVector(options, 'corner2', [1, 1])
    c = corner1.plus(corner2).times(0.5)
    r = corner2.minus(corner1).times(0.5)
  } else {
    c = parseOptionAs2DVector(options, 'center', [0, 0])
    r = parseOptionAs2DVector(options, 'radius', [1, 1])
  }
  r = r.abs() // negative radii make no sense
  let rswap = new Vector2D(r.x, -r.y)
  let points = [
    c.plus(r), c.plus(rswap), c.minus(r), c.minus(rswap)
  ]
  return fromPoints(points)
}

/** Construct a rounded rectangle.
 * @param {Object} [options] - options for construction
 * @param {Vector2D} [options.center=[0,0]] - center of rounded rectangle
 * @param {Vector2D} [options.radius=[1,1]] - radius of rounded rectangle, width and height
 * @param {Vector2D} [options.corner1=[0,0]] - bottom left corner of rounded rectangle (alternate)
 * @param {Vector2D} [options.corner2=[0,0]] - upper right corner of rounded rectangle (alternate)
 * @param {Number} [options.roundradius=0.2] - round radius of corners
 * @param {Number} [options.resolution=defaultResolution2D] - number of sides per 360 rotation
 * @returns {CAG} new CAG object
 *
 * @example
 * let r = roundedRectangle({
 *   center: [0, 0],
 *   radius: [5, 10],
 *   roundradius: 2,
 *   resolution: 36,
 * });
 */
const roundedRectangle = function (options) {
  options = options || {}
  let center, radius
  if (('corner1' in options) || ('corner2' in options)) {
    if (('center' in options) || ('radius' in options)) {
      throw new Error('roundedRectangle: should either give a radius and center parameter, or a corner1 and corner2 parameter')
    }
    let corner1 = parseOptionAs2DVector(options, 'corner1', [0, 0])
    let corner2 = parseOptionAs2DVector(options, 'corner2', [1, 1])
    center = corner1.plus(corner2).times(0.5)
    radius = corner2.minus(corner1).times(0.5)
  } else {
    center = parseOptionAs2DVector(options, 'center', [0, 0])
    radius = parseOptionAs2DVector(options, 'radius', [1, 1])
  }
  radius = radius.abs() // negative radii make no sense
  let roundradius = parseOptionAsFloat(options, 'roundradius', 0.2)
  let resolution = parseOptionAsInt(options, 'resolution', defaultResolution2D)
  let maxroundradius = Math.min(radius.x, radius.y)
  maxroundradius -= 0.1
  roundradius = Math.min(roundradius, maxroundradius)
  roundradius = Math.max(0, roundradius)
  radius = new Vector2D(radius.x - roundradius, radius.y - roundradius)
  let rect = rectangle({
    center: center,
    radius: radius
  })
  if (roundradius > 0) {
    rect = rect.expand(roundradius, resolution)
  }
  return rect
}

/** Reconstruct a CAG from the output of toCompactBinary().
 * @param {CompactBinary} bin - see toCompactBinary()
 * @returns {CAG} new CAG object
 */
/*fromCompactBinary = function (bin) {
  if (bin['class'] !== 'CAG') throw new Error('Not a CAG')
  let vertices = []
  let vertexData = bin.vertexData
  let numvertices = vertexData.length / 2
  let arrayindex = 0
  for (let vertexindex = 0; vertexindex < numvertices; vertexindex++) {
    let x = vertexData[arrayindex++]
    let y = vertexData[arrayindex++]
    let pos = new Vector2D(x, y)
    let vertex = new Vertex2(pos)
    vertices.push(vertex)
  }

  let sides = []
  let numsides = bin.sideVertexIndices.length / 2
  arrayindex = 0
  for (let sideindex = 0; sideindex < numsides; sideindex++) {
    let vertexindex0 = bin.sideVertexIndices[arrayindex++]
    let vertexindex1 = bin.sideVertexIndices[arrayindex++]
    let side = new Side(vertices[vertexindex0], vertices[vertexindex1])
    sides.push(side)
  }
  let cag = fromSides(sides)
  cag.isCanonicalized = true
  return cag
}*/

module.exports = {
  circle,
  ellipse,
  rectangle,
  roundedRectangle,
  fromCompactBinary
}

},{"../core/CAG":13,"../core/CAGFactories":14,"../core/constants":22,"../core/math/Path2":27,"../core/math/Vector2":32,"../core/math/Vertex2":34,"./optionParsers":9}],11:[function(require,module,exports){
const {parseOption, parseOptionAs3DVector, parseOptionAs2DVector, parseOptionAs3DVectorList, parseOptionAsFloat, parseOptionAsInt} = require('./optionParsers')
const {defaultResolution3D, defaultResolution2D, EPS} = require('../core/constants')
const Vector3 = require('../core/math/Vector3')
const Vertex3 = require('../core/math/Vertex3')
const Polygon3 = require('../core/math/Polygon3')
const {Connector} = require('../core/connectors')
const Properties = require('../core/Properties')
const {fromPolygons} = require('../core/CSGFactories')

/** Construct an axis-aligned solid cuboid.
 * @param {Object} [options] - options for construction
 * @param {Vector3} [options.center=[0,0,0]] - center of cube
 * @param {Vector3} [options.radius=[1,1,1]] - radius of cube, single scalar also possible
 * @returns {CSG} new 3D solid
 *
 * @example
 * let cube = CSG.cube({
 *   center: [5, 5, 5],
 *   radius: 5, // scalar radius
 * });
 */
const cube = function (options) {
  let c
  let r
  let corner1
  let corner2
  options = options || {}
  if (('corner1' in options) || ('corner2' in options)) {
    if (('center' in options) || ('radius' in options)) {
      throw new Error('cube: should either give a radius and center parameter, or a corner1 and corner2 parameter')
    }
    corner1 = parseOptionAs3DVector(options, 'corner1', [0, 0, 0])
    corner2 = parseOptionAs3DVector(options, 'corner2', [1, 1, 1])
    c = corner1.plus(corner2).times(0.5)
    r = corner2.minus(corner1).times(0.5)
  } else {
    c = parseOptionAs3DVector(options, 'center', [0, 0, 0])
    r = parseOptionAs3DVector(options, 'radius', [1, 1, 1])
  }
  r = r.abs() // negative radii make no sense
  let result = fromPolygons([
    [
            [0, 4, 6, 2],
            [-1, 0, 0]
    ],
    [
            [1, 3, 7, 5],
            [+1, 0, 0]
    ],
    [
            [0, 1, 5, 4],
            [0, -1, 0]
    ],
    [
            [2, 6, 7, 3],
            [0, +1, 0]
    ],
    [
            [0, 2, 3, 1],
            [0, 0, -1]
    ],
    [
            [4, 5, 7, 6],
            [0, 0, +1]
    ]
  ].map(function (info) {
    let vertices = info[0].map(function (i) {
      let pos = new Vector3(
                c.x + r.x * (2 * !!(i & 1) - 1), c.y + r.y * (2 * !!(i & 2) - 1), c.z + r.z * (2 * !!(i & 4) - 1))
      return new Vertex3(pos)
    })
    return new Polygon3(vertices, null /* , plane */)
  }))
  result.properties.cube = new Properties()
  result.properties.cube.center = new Vector3(c)
    // add 6 connectors, at the centers of each face:
  result.properties.cube.facecenters = [
    new Connector(new Vector3([r.x, 0, 0]).plus(c), [1, 0, 0], [0, 0, 1]),
    new Connector(new Vector3([-r.x, 0, 0]).plus(c), [-1, 0, 0], [0, 0, 1]),
    new Connector(new Vector3([0, r.y, 0]).plus(c), [0, 1, 0], [0, 0, 1]),
    new Connector(new Vector3([0, -r.y, 0]).plus(c), [0, -1, 0], [0, 0, 1]),
    new Connector(new Vector3([0, 0, r.z]).plus(c), [0, 0, 1], [1, 0, 0]),
    new Connector(new Vector3([0, 0, -r.z]).plus(c), [0, 0, -1], [1, 0, 0])
  ]
  return result
}

/** Construct a solid sphere
 * @param {Object} [options] - options for construction
 * @param {Vector3} [options.center=[0,0,0]] - center of sphere
 * @param {Number} [options.radius=1] - radius of sphere
 * @param {Number} [options.resolution=defaultResolution3D] - number of polygons per 360 degree revolution
 * @param {Array} [options.axes] -  an array with 3 vectors for the x, y and z base vectors
 * @returns {CSG} new 3D solid
 *
 *
 * @example
 * let sphere = CSG.sphere({
 *   center: [0, 0, 0],
 *   radius: 2,
 *   resolution: 32,
 * });
*/
const sphere = function (options) {
  options = options || {}
  let center = parseOptionAs3DVector(options, 'center', [0, 0, 0])
  let radius = parseOptionAsFloat(options, 'radius', 1)
  let resolution = parseOptionAsInt(options, 'resolution', defaultResolution3D)
  let xvector, yvector, zvector
  if ('axes' in options) {
    xvector = options.axes[0].unit().times(radius)
    yvector = options.axes[1].unit().times(radius)
    zvector = options.axes[2].unit().times(radius)
  } else {
    xvector = new Vector3([1, 0, 0]).times(radius)
    yvector = new Vector3([0, -1, 0]).times(radius)
    zvector = new Vector3([0, 0, 1]).times(radius)
  }
  if (resolution < 4) resolution = 4
  let qresolution = Math.round(resolution / 4)
  let prevcylinderpoint
  let polygons = []
  for (let slice1 = 0; slice1 <= resolution; slice1++) {
    let angle = Math.PI * 2.0 * slice1 / resolution
    let cylinderpoint = xvector.times(Math.cos(angle)).plus(yvector.times(Math.sin(angle)))
    if (slice1 > 0) {
            // cylinder vertices:
      let vertices = []
      let prevcospitch, prevsinpitch
      for (let slice2 = 0; slice2 <= qresolution; slice2++) {
        let pitch = 0.5 * Math.PI * slice2 / qresolution
        let cospitch = Math.cos(pitch)
        let sinpitch = Math.sin(pitch)
        if (slice2 > 0) {
          vertices = []
          vertices.push(new Vertex3(center.plus(prevcylinderpoint.times(prevcospitch).minus(zvector.times(prevsinpitch)))))
          vertices.push(new Vertex3(center.plus(cylinderpoint.times(prevcospitch).minus(zvector.times(prevsinpitch)))))
          if (slice2 < qresolution) {
            vertices.push(new Vertex3(center.plus(cylinderpoint.times(cospitch).minus(zvector.times(sinpitch)))))
          }
          vertices.push(new Vertex3(center.plus(prevcylinderpoint.times(cospitch).minus(zvector.times(sinpitch)))))
          polygons.push(new Polygon3(vertices))
          vertices = []
          vertices.push(new Vertex3(center.plus(prevcylinderpoint.times(prevcospitch).plus(zvector.times(prevsinpitch)))))
          vertices.push(new Vertex3(center.plus(cylinderpoint.times(prevcospitch).plus(zvector.times(prevsinpitch)))))
          if (slice2 < qresolution) {
            vertices.push(new Vertex3(center.plus(cylinderpoint.times(cospitch).plus(zvector.times(sinpitch)))))
          }
          vertices.push(new Vertex3(center.plus(prevcylinderpoint.times(cospitch).plus(zvector.times(sinpitch)))))
          vertices.reverse()
          polygons.push(new Polygon3(vertices))
        }
        prevcospitch = cospitch
        prevsinpitch = sinpitch
      }
    }
    prevcylinderpoint = cylinderpoint
  }
  let result = fromPolygons(polygons)
  result.properties.sphere = new Properties()
  result.properties.sphere.center = new Vector3(center)
  result.properties.sphere.facepoint = center.plus(xvector)
  return result
}

/** Construct a solid cylinder.
 * @param {Object} [options] - options for construction
 * @param {Vector} [options.start=[0,-1,0]] - start point of cylinder
 * @param {Vector} [options.end=[0,1,0]] - end point of cylinder
 * @param {Number} [options.radius=1] - radius of cylinder, must be scalar
 * @param {Number} [options.resolution=defaultResolution3D] - number of polygons per 360 degree revolution
 * @returns {CSG} new 3D solid
 *
 * @example
 * let cylinder = CSG.cylinder({
 *   start: [0, -10, 0],
 *   end: [0, 10, 0],
 *   radius: 10,
 *   resolution: 16
 * });
 */
const cylinder = function (options) {
  let s = parseOptionAs3DVector(options, 'start', [0, -1, 0])
  let e = parseOptionAs3DVector(options, 'end', [0, 1, 0])
  let r = parseOptionAsFloat(options, 'radius', 1)
  let rEnd = parseOptionAsFloat(options, 'radiusEnd', r)
  let rStart = parseOptionAsFloat(options, 'radiusStart', r)
  let alpha = parseOptionAsFloat(options, 'sectorAngle', 360)
  alpha = alpha > 360 ? alpha % 360 : alpha

  if ((rEnd < 0) || (rStart < 0)) {
    throw new Error('Radius should be non-negative')
  }
  if ((rEnd === 0) && (rStart === 0)) {
    throw new Error('Either radiusStart or radiusEnd should be positive')
  }

  let slices = parseOptionAsInt(options, 'resolution', defaultResolution2D) // FIXME is this 3D?
  let ray = e.minus(s)
  let axisZ = ray.unit() //, isY = (Math.abs(axisZ.y) > 0.5);
  let axisX = axisZ.randomNonParallelVector().unit()

    //  let axisX = new Vector3(isY, !isY, 0).cross(axisZ).unit();
  let axisY = axisX.cross(axisZ).unit()
  let start = new Vertex3(s)
  let end = new Vertex3(e)
  let polygons = []

  function point (stack, slice, radius) {
    let angle = slice * Math.PI * alpha / 180
    let out = axisX.times(Math.cos(angle)).plus(axisY.times(Math.sin(angle)))
    let pos = s.plus(ray.times(stack)).plus(out.times(radius))
    return new Vertex3(pos)
  }
  if (alpha > 0) {
    for (let i = 0; i < slices; i++) {
      let t0 = i / slices
      let t1 = (i + 1) / slices
      if (rEnd === rStart) {
        polygons.push(new Polygon3([start, point(0, t0, rEnd), point(0, t1, rEnd)]))
        polygons.push(new Polygon3([point(0, t1, rEnd), point(0, t0, rEnd), point(1, t0, rEnd), point(1, t1, rEnd)]))
        polygons.push(new Polygon3([end, point(1, t1, rEnd), point(1, t0, rEnd)]))
      } else {
        if (rStart > 0) {
          polygons.push(new Polygon3([start, point(0, t0, rStart), point(0, t1, rStart)]))
          polygons.push(new Polygon3([point(0, t0, rStart), point(1, t0, rEnd), point(0, t1, rStart)]))
        }
        if (rEnd > 0) {
          polygons.push(new Polygon3([end, point(1, t1, rEnd), point(1, t0, rEnd)]))
          polygons.push(new Polygon3([point(1, t0, rEnd), point(1, t1, rEnd), point(0, t1, rStart)]))
        }
      }
    }
    if (alpha < 360) {
      polygons.push(new Polygon3([start, end, point(0, 0, rStart)]))
      polygons.push(new Polygon3([point(0, 0, rStart), end, point(1, 0, rEnd)]))
      polygons.push(new Polygon3([start, point(0, 1, rStart), end]))
      polygons.push(new Polygon3([point(0, 1, rStart), point(1, 1, rEnd), end]))
    }
  }
  let result = fromPolygons(polygons)
  result.properties.cylinder = new Properties()
  result.properties.cylinder.start = new Connector(s, axisZ.negated(), axisX)
  result.properties.cylinder.end = new Connector(e, axisZ, axisX)
  let cylCenter = s.plus(ray.times(0.5))
  let fptVec = axisX.rotate(s, axisZ, -alpha / 2).times((rStart + rEnd) / 2)
  let fptVec90 = fptVec.cross(axisZ)
    // note this one is NOT a face normal for a cone. - It's horizontal from cyl perspective
  result.properties.cylinder.facepointH = new Connector(cylCenter.plus(fptVec), fptVec, axisZ)
  result.properties.cylinder.facepointH90 = new Connector(cylCenter.plus(fptVec90), fptVec90, axisZ)
  return result
}

/** Construct a cylinder with rounded ends.
 * @param {Object} [options] - options for construction
 * @param {Vector3} [options.start=[0,-1,0]] - start point of cylinder
 * @param {Vector3} [options.end=[0,1,0]] - end point of cylinder
 * @param {Number} [options.radius=1] - radius of rounded ends, must be scalar
 * @param {Vector3} [options.normal] - vector determining the starting angle for tesselation. Should be non-parallel to start.minus(end)
 * @param {Number} [options.resolution=defaultResolution3D] - number of polygons per 360 degree revolution
 * @returns {CSG} new 3D solid
 *
 * @example
 * let cylinder = CSG.roundedCylinder({
 *   start: [0, -10, 0],
 *   end: [0, 10, 0],
 *   radius: 2,
 *   resolution: 16
 * });
 */
const roundedCylinder = function (options) {
  let p1 = parseOptionAs3DVector(options, 'start', [0, -1, 0])
  let p2 = parseOptionAs3DVector(options, 'end', [0, 1, 0])
  let radius = parseOptionAsFloat(options, 'radius', 1)
  let direction = p2.minus(p1)
  let defaultnormal
  if (Math.abs(direction.x) > Math.abs(direction.y)) {
    defaultnormal = new Vector3(0, 1, 0)
  } else {
    defaultnormal = new Vector3(1, 0, 0)
  }
  let normal = parseOptionAs3DVector(options, 'normal', defaultnormal)
  let resolution = parseOptionAsInt(options, 'resolution', defaultResolution3D)
  if (resolution < 4) resolution = 4
  let polygons = []
  let qresolution = Math.floor(0.25 * resolution)
  let length = direction.length()
  if (length < EPS) {
    return sphere({
      center: p1,
      radius: radius,
      resolution: resolution
    })
  }
  let zvector = direction.unit().times(radius)
  let xvector = zvector.cross(normal).unit().times(radius)
  let yvector = xvector.cross(zvector).unit().times(radius)
  let prevcylinderpoint
  for (let slice1 = 0; slice1 <= resolution; slice1++) {
    let angle = Math.PI * 2.0 * slice1 / resolution
    let cylinderpoint = xvector.times(Math.cos(angle)).plus(yvector.times(Math.sin(angle)))
    if (slice1 > 0) {
            // cylinder vertices:
      let vertices = []
      vertices.push(new Vertex3(p1.plus(cylinderpoint)))
      vertices.push(new Vertex3(p1.plus(prevcylinderpoint)))
      vertices.push(new Vertex3(p2.plus(prevcylinderpoint)))
      vertices.push(new Vertex3(p2.plus(cylinderpoint)))
      polygons.push(new Polygon3(vertices))
      let prevcospitch, prevsinpitch
      for (let slice2 = 0; slice2 <= qresolution; slice2++) {
        let pitch = 0.5 * Math.PI * slice2 / qresolution
                // let pitch = Math.asin(slice2/qresolution);
        let cospitch = Math.cos(pitch)
        let sinpitch = Math.sin(pitch)
        if (slice2 > 0) {
          vertices = []
          vertices.push(new Vertex3(p1.plus(prevcylinderpoint.times(prevcospitch).minus(zvector.times(prevsinpitch)))))
          vertices.push(new Vertex3(p1.plus(cylinderpoint.times(prevcospitch).minus(zvector.times(prevsinpitch)))))
          if (slice2 < qresolution) {
            vertices.push(new Vertex3(p1.plus(cylinderpoint.times(cospitch).minus(zvector.times(sinpitch)))))
          }
          vertices.push(new Vertex3(p1.plus(prevcylinderpoint.times(cospitch).minus(zvector.times(sinpitch)))))
          polygons.push(new Polygon3(vertices))
          vertices = []
          vertices.push(new Vertex3(p2.plus(prevcylinderpoint.times(prevcospitch).plus(zvector.times(prevsinpitch)))))
          vertices.push(new Vertex3(p2.plus(cylinderpoint.times(prevcospitch).plus(zvector.times(prevsinpitch)))))
          if (slice2 < qresolution) {
            vertices.push(new Vertex3(p2.plus(cylinderpoint.times(cospitch).plus(zvector.times(sinpitch)))))
          }
          vertices.push(new Vertex3(p2.plus(prevcylinderpoint.times(cospitch).plus(zvector.times(sinpitch)))))
          vertices.reverse()
          polygons.push(new Polygon3(vertices))
        }
        prevcospitch = cospitch
        prevsinpitch = sinpitch
      }
    }
    prevcylinderpoint = cylinderpoint
  }
  let result = fromPolygons(polygons)
  let ray = zvector.unit()
  let axisX = xvector.unit()
  result.properties.roundedCylinder = new Properties()
  result.properties.roundedCylinder.start = new Connector(p1, ray.negated(), axisX)
  result.properties.roundedCylinder.end = new Connector(p2, ray, axisX)
  result.properties.roundedCylinder.facepoint = p1.plus(xvector)
  return result
}

/** Construct an elliptic cylinder.
 * @param {Object} [options] - options for construction
 * @param {Vector3} [options.start=[0,-1,0]] - start point of cylinder
 * @param {Vector3} [options.end=[0,1,0]] - end point of cylinder
 * @param {Vector2D} [options.radius=[1,1]] - radius of rounded ends, must be two dimensional array
 * @param {Vector2D} [options.radiusStart=[1,1]] - OPTIONAL radius of rounded start, must be two dimensional array
 * @param {Vector2D} [options.radiusEnd=[1,1]] - OPTIONAL radius of rounded end, must be two dimensional array
 * @param {Number} [options.resolution=defaultResolution2D] - number of polygons per 360 degree revolution
 * @returns {CSG} new 3D solid
 *
 * @example
 *     let cylinder = CSG.cylinderElliptic({
 *       start: [0, -10, 0],
 *       end: [0, 10, 0],
 *       radiusStart: [10,5],
 *       radiusEnd: [8,3],
 *       resolution: 16
 *     });
 */

const cylinderElliptic = function (options) {
  let s = parseOptionAs3DVector(options, 'start', [0, -1, 0])
  let e = parseOptionAs3DVector(options, 'end', [0, 1, 0])
  let r = parseOptionAs2DVector(options, 'radius', [1, 1])
  let rEnd = parseOptionAs2DVector(options, 'radiusEnd', r)
  let rStart = parseOptionAs2DVector(options, 'radiusStart', r)

  if ((rEnd._x < 0) || (rStart._x < 0) || (rEnd._y < 0) || (rStart._y < 0)) {
    throw new Error('Radius should be non-negative')
  }
  if ((rEnd._x === 0 || rEnd._y === 0) && (rStart._x === 0 || rStart._y === 0)) {
    throw new Error('Either radiusStart or radiusEnd should be positive')
  }

  let slices = parseOptionAsInt(options, 'resolution', defaultResolution2D) // FIXME is this correct?
  let ray = e.minus(s)
  let axisZ = ray.unit() //, isY = (Math.abs(axisZ.y) > 0.5);
  let axisX = axisZ.randomNonParallelVector().unit()

    //  let axisX = new Vector3(isY, !isY, 0).cross(axisZ).unit();
  let axisY = axisX.cross(axisZ).unit()
  let start = new Vertex3(s)
  let end = new Vertex3(e)
  let polygons = []

  function point (stack, slice, radius) {
    let angle = slice * Math.PI * 2
    let out = axisX.times(radius._x * Math.cos(angle)).plus(axisY.times(radius._y * Math.sin(angle)))
    let pos = s.plus(ray.times(stack)).plus(out)
    return new Vertex3(pos)
  }
  for (let i = 0; i < slices; i++) {
    let t0 = i / slices
    let t1 = (i + 1) / slices

    if (rEnd._x === rStart._x && rEnd._y === rStart._y) {
      polygons.push(new Polygon3([start, point(0, t0, rEnd), point(0, t1, rEnd)]))
      polygons.push(new Polygon3([point(0, t1, rEnd), point(0, t0, rEnd), point(1, t0, rEnd), point(1, t1, rEnd)]))
      polygons.push(new Polygon3([end, point(1, t1, rEnd), point(1, t0, rEnd)]))
    } else {
      if (rStart._x > 0) {
        polygons.push(new Polygon3([start, point(0, t0, rStart), point(0, t1, rStart)]))
        polygons.push(new Polygon3([point(0, t0, rStart), point(1, t0, rEnd), point(0, t1, rStart)]))
      }
      if (rEnd._x > 0) {
        polygons.push(new Polygon3([end, point(1, t1, rEnd), point(1, t0, rEnd)]))
        polygons.push(new Polygon3([point(1, t0, rEnd), point(1, t1, rEnd), point(0, t1, rStart)]))
      }
    }
  }
  let result = fromPolygons(polygons)
  result.properties.cylinder = new Properties()
  result.properties.cylinder.start = new Connector(s, axisZ.negated(), axisX)
  result.properties.cylinder.end = new Connector(e, axisZ, axisX)
  result.properties.cylinder.facepoint = s.plus(axisX.times(rStart))
  return result
}

/** Construct an axis-aligned solid rounded cuboid.
 * @param {Object} [options] - options for construction
 * @param {Vector3} [options.center=[0,0,0]] - center of rounded cube
 * @param {Vector3} [options.radius=[1,1,1]] - radius of rounded cube, single scalar is possible
 * @param {Number} [options.roundradius=0.2] - radius of rounded edges
 * @param {Number} [options.resolution=defaultResolution3D] - number of polygons per 360 degree revolution
 * @returns {CSG} new 3D solid
 *
 * @example
 * let cube = CSG.roundedCube({
 *   center: [2, 0, 2],
 *   radius: 15,
 *   roundradius: 2,
 *   resolution: 36,
 * });
 */
const roundedCube = function (options) {
  let minRR = 1e-2 // minroundradius 1e-3 gives rounding errors already
  let center
  let cuberadius
  let corner1
  let corner2
  options = options || {}
  if (('corner1' in options) || ('corner2' in options)) {
    if (('center' in options) || ('radius' in options)) {
      throw new Error('roundedCube: should either give a radius and center parameter, or a corner1 and corner2 parameter')
    }
    corner1 = parseOptionAs3DVector(options, 'corner1', [0, 0, 0])
    corner2 = parseOptionAs3DVector(options, 'corner2', [1, 1, 1])
    center = corner1.plus(corner2).times(0.5)
    cuberadius = corner2.minus(corner1).times(0.5)
  } else {
    center = parseOptionAs3DVector(options, 'center', [0, 0, 0])
    cuberadius = parseOptionAs3DVector(options, 'radius', [1, 1, 1])
  }
  cuberadius = cuberadius.abs() // negative radii make no sense
  let resolution = parseOptionAsInt(options, 'resolution', defaultResolution3D)
  if (resolution < 4) resolution = 4
  if (resolution % 2 === 1 && resolution < 8) resolution = 8 // avoid ugly
  let roundradius = parseOptionAs3DVector(options, 'roundradius', [0.2, 0.2, 0.2])
    // slight hack for now - total radius stays ok
  roundradius = Vector3.Create(Math.max(roundradius.x, minRR), Math.max(roundradius.y, minRR), Math.max(roundradius.z, minRR))
  let innerradius = cuberadius.minus(roundradius)
  if (innerradius.x < 0 || innerradius.y < 0 || innerradius.z < 0) {
    throw new Error('roundradius <= radius!')
  }
  let res = sphere({radius: 1, resolution: resolution})
  res = res.scale(roundradius)
  innerradius.x > EPS && (res = res.stretchAtPlane([1, 0, 0], [0, 0, 0], 2 * innerradius.x))
  innerradius.y > EPS && (res = res.stretchAtPlane([0, 1, 0], [0, 0, 0], 2 * innerradius.y))
  innerradius.z > EPS && (res = res.stretchAtPlane([0, 0, 1], [0, 0, 0], 2 * innerradius.z))
  res = res.translate([-innerradius.x + center.x, -innerradius.y + center.y, -innerradius.z + center.z])
  res = res.reTesselated()
  res.properties.roundedCube = new Properties()
  res.properties.roundedCube.center = new Vertex3(center)
  res.properties.roundedCube.facecenters = [
    new Connector(new Vector3([cuberadius.x, 0, 0]).plus(center), [1, 0, 0], [0, 0, 1]),
    new Connector(new Vector3([-cuberadius.x, 0, 0]).plus(center), [-1, 0, 0], [0, 0, 1]),
    new Connector(new Vector3([0, cuberadius.y, 0]).plus(center), [0, 1, 0], [0, 0, 1]),
    new Connector(new Vector3([0, -cuberadius.y, 0]).plus(center), [0, -1, 0], [0, 0, 1]),
    new Connector(new Vector3([0, 0, cuberadius.z]).plus(center), [0, 0, 1], [1, 0, 0]),
    new Connector(new Vector3([0, 0, -cuberadius.z]).plus(center), [0, 0, -1], [1, 0, 0])
  ]
  return res
}

/** Create a polyhedron using Openscad style arguments.
 * Define face vertices clockwise looking from outside.
 * @param {Object} [options] - options for construction
 * @returns {CSG} new 3D solid
 */
const polyhedron = function (options) {
  options = options || {}
  if (('points' in options) !== ('faces' in options)) {
    throw new Error("polyhedron needs 'points' and 'faces' arrays")
  }
  let vertices = parseOptionAs3DVectorList(options, 'points', [
            [1, 1, 0],
            [1, -1, 0],
            [-1, -1, 0],
            [-1, 1, 0],
            [0, 0, 1]
  ])
        .map(function (pt) {
          return new Vertex3(pt)
        })
  let faces = parseOption(options, 'faces', [
            [0, 1, 4],
            [1, 2, 4],
            [2, 3, 4],
            [3, 0, 4],
            [1, 0, 3],
            [2, 1, 3]
  ])
    // Openscad convention defines inward normals - so we have to invert here
  faces.forEach(function (face) {
    face.reverse()
  })
  let polygons = faces.map(function (face) {
    return new Polygon3(face.map(function (idx) {
      return vertices[idx]
    }))
  })

    // TODO: facecenters as connectors? probably overkill. Maybe centroid
    // the re-tesselation here happens because it's so easy for a user to
    // create parametrized polyhedrons that end up with 1-2 dimensional polygons.
    // These will create infinite loops at CSG.Tree()
  return fromPolygons(polygons).reTesselated()
}

module.exports = {
  cube,
  sphere,
  roundedCube,
  cylinder,
  roundedCylinder,
  cylinderElliptic,
  polyhedron
}

},{"../core/CSGFactories":16,"../core/Properties":20,"../core/connectors":21,"../core/constants":22,"../core/math/Polygon3":30,"../core/math/Vector3":33,"../core/math/Vertex3":35,"./optionParsers":9}],12:[function(require,module,exports){
const Polygon = require('../core/math/Polygon3')
const {fromPolygons} = require('../core/CSGFactories')
const {fnSortByIndex} = require('../core/utils')

// FIXME: WHY is this for 3D polygons and not for 2D shapes ?
/**
 * Creates solid from slices (Polygon) by generating walls
 * @param {Object} options Solid generating options
 *  - numslices {Number} Number of slices to be generated
 *  - callback(t, slice) {Function} Callback function generating slices.
 *          arguments: t = [0..1], slice = [0..numslices - 1]
 *          return: Polygon or null to skip
 *  - loop {Boolean} no flats, only walls, it's used to generate solids like a tor
 */
const solidFromSlices = function (polygon, options) {
  let polygons = []
  let csg = null
  let prev = null
  let bottom = null
  let top = null
  let numSlices = 2
  let bLoop = false
  let fnCallback
  let flipped = null

  if (options) {
    bLoop = Boolean(options['loop'])

    if (options.numslices) { numSlices = options.numslices }

    if (options.callback) {
      fnCallback = options.callback
    }
  }
  if (!fnCallback) {
    let square = Polygon.createFromPoints([
                  [0, 0, 0],
                  [1, 0, 0],
                  [1, 1, 0],
                  [0, 1, 0]
    ])
    fnCallback = function (t, slice) {
      return t === 0 || t === 1 ? square.translate([0, 0, t]) : null
    }
  }
  for (let i = 0, iMax = numSlices - 1; i <= iMax; i++) {
    csg = fnCallback.call(polygon, i / iMax, i)
    if (csg) {
      if (!(csg instanceof Polygon)) {
        throw new Error('Polygon.solidFromSlices callback error: Polygon expected')
      }
      csg.checkIfConvex()

      if (prev) { // generate walls
        if (flipped === null) { // not generated yet
          flipped = prev.plane.signedDistanceToPoint(csg.vertices[0].pos) < 0
        }
        _addWalls(polygons, prev, csg, flipped)
      } else { // the first - will be a bottom
        bottom = csg
      }
      prev = csg
    } // callback can return null to skip that slice
  }
  top = csg

  if (bLoop) {
    let bSameTopBottom = bottom.vertices.length === top.vertices.length &&
                  bottom.vertices.every(function (v, index) {
                    return v.pos.equals(top.vertices[index].pos)
                  })
    // if top and bottom are not the same -
    // generate walls between them
    if (!bSameTopBottom) {
      _addWalls(polygons, top, bottom, flipped)
    } // else - already generated
  } else {
    // save top and bottom
    // TODO: flip if necessary
    polygons.unshift(flipped ? bottom : bottom.flipped())
    polygons.push(flipped ? top.flipped() : top)
  }
  return fromPolygons(polygons)
}

/**
 * @param walls Array of wall polygons
 * @param bottom Bottom polygon
 * @param top Top polygon
 */
const _addWalls = function (walls, bottom, top, bFlipped) {
  let bottomPoints = bottom.vertices.slice(0) // make a copy
  let topPoints = top.vertices.slice(0) // make a copy
  let color = top.shared || null

        // check if bottom perimeter is closed
  if (!bottomPoints[0].pos.equals(bottomPoints[bottomPoints.length - 1].pos)) {
    bottomPoints.push(bottomPoints[0])
  }

        // check if top perimeter is closed
  if (!topPoints[0].pos.equals(topPoints[topPoints.length - 1].pos)) {
    topPoints.push(topPoints[0])
  }
  if (bFlipped) {
    bottomPoints = bottomPoints.reverse()
    topPoints = topPoints.reverse()
  }

  let iTopLen = topPoints.length - 1
  let iBotLen = bottomPoints.length - 1
  let iExtra = iTopLen - iBotLen// how many extra triangles we need
  let bMoreTops = iExtra > 0
  let bMoreBottoms = iExtra < 0

  let aMin = [] // indexes to start extra triangles (polygon with minimal square)
        // init - we need exactly /iExtra/ small triangles
  for (let i = Math.abs(iExtra); i > 0; i--) {
    aMin.push({
      len: Infinity,
      index: -1
    })
  }

  let len
  if (bMoreBottoms) {
    for (let i = 0; i < iBotLen; i++) {
      len = bottomPoints[i].pos.distanceToSquared(bottomPoints[i + 1].pos)
                // find the element to replace
      for (let j = aMin.length - 1; j >= 0; j--) {
        if (aMin[j].len > len) {
          aMin[j].len = len
          aMin.index = j
          break
        }
      } // for
    }
  } else if (bMoreTops) {
    for (let i = 0; i < iTopLen; i++) {
      len = topPoints[i].pos.distanceToSquared(topPoints[i + 1].pos)
                // find the element to replace
      for (let j = aMin.length - 1; j >= 0; j--) {
        if (aMin[j].len > len) {
          aMin[j].len = len
          aMin.index = j
          break
        }
      } // for
    }
  } // if
  // sort by index
  aMin.sort(fnSortByIndex)
  let getTriangle = function addWallsPutTriangle (pointA, pointB, pointC, color) {
    return new Polygon([pointA, pointB, pointC], color)
  // return bFlipped ? triangle.flipped() : triangle;
  }

  let bpoint = bottomPoints[0]
  let tpoint = topPoints[0]
  let secondPoint
  let nBotFacet
  let nTopFacet // length of triangle facet side
  for (let iB = 0, iT = 0, iMax = iTopLen + iBotLen; iB + iT < iMax;) {
    if (aMin.length) {
      if (bMoreTops && iT === aMin[0].index) { // one vertex is on the bottom, 2 - on the top
        secondPoint = topPoints[++iT]
                    // console.log('<<< extra top: ' + secondPoint + ', ' + tpoint + ', bottom: ' + bpoint);
        walls.push(getTriangle(
                        secondPoint, tpoint, bpoint, color
                    ))
        tpoint = secondPoint
        aMin.shift()
        continue
      } else if (bMoreBottoms && iB === aMin[0].index) {
        secondPoint = bottomPoints[++iB]
        walls.push(getTriangle(
                        tpoint, bpoint, secondPoint, color
                    ))
        bpoint = secondPoint
        aMin.shift()
        continue
      }
    }
            // choose the shortest path
    if (iB < iBotLen) { // one vertex is on the top, 2 - on the bottom
      nBotFacet = tpoint.pos.distanceToSquared(bottomPoints[iB + 1].pos)
    } else {
      nBotFacet = Infinity
    }
    if (iT < iTopLen) { // one vertex is on the bottom, 2 - on the top
      nTopFacet = bpoint.pos.distanceToSquared(topPoints[iT + 1].pos)
    } else {
      nTopFacet = Infinity
    }
    if (nBotFacet <= nTopFacet) {
      secondPoint = bottomPoints[++iB]
      walls.push(getTriangle(
                    tpoint, bpoint, secondPoint, color
                ))
      bpoint = secondPoint
    } else if (iT < iTopLen) { // nTopFacet < Infinity
      secondPoint = topPoints[++iT]
                // console.log('<<< top: ' + secondPoint + ', ' + tpoint + ', bottom: ' + bpoint);
      walls.push(getTriangle(
                    secondPoint, tpoint, bpoint, color
                ))
      tpoint = secondPoint
    };
  }
  return walls
}

module.exports = solidFromSlices

},{"../core/CSGFactories":16,"../core/math/Polygon3":30,"../core/utils":40}],13:[function(require,module,exports){
const {Connector} = require('./connectors')
const Vertex3D = require('./math/Vertex3')
const Vector2D = require('./math/Vector2')
const Vector3D = require('./math/Vector3')
const Polygon = require('./math/Polygon3')

const {fromPolygons} = require('./CSGFactories')
const {fromSides, fromFakeCSG} = require('./CAGFactories')

const canonicalize = require('./utils/canonicalize')
const retesselate = require('./utils/retesellate')
const {isCAGValid, isSelfIntersecting} = require('./utils/cagValidation')
const {area, getBounds} = require('./utils/cagMeasurements')

// all of these are good candidates for elimination in this scope, since they are part of a functional api
const {overCutInsideCorners} = require('../api/ops-cnc')
const {extrudeInOrthonormalBasis, extrudeInPlane, extrude, rotateExtrude} = require('../api/ops-extrusions')
const cagoutlinePaths = require('../api/cagOutlinePaths')
const {expand, contract, expandedShellOfCAG} = require('../api/ops-expandContract')
/**
 * Class CAG
 * Holds a solid area geometry like CSG but 2D.
 * Each area consists of a number of sides.
 * Each side is a line between 2 points.
 * @constructor
 */
let CAG = function () {
  this.sides = []
  this.isCanonicalized = false
}

CAG.prototype = {
  union: function (cag) {
    let cags
    if (cag instanceof Array) {
      cags = cag
    } else {
      cags = [cag]
    }
    let r = this._toCSGWall(-1, 1)
    r = r.union(
            cags.map(function (cag) {
              return cag._toCSGWall(-1, 1).reTesselated()
            }), false, false)
    return fromFakeCSG(r).canonicalized()
  },

  subtract: function (cag) {
    let cags
    if (cag instanceof Array) {
      cags = cag
    } else {
      cags = [cag]
    }
    let r = this._toCSGWall(-1, 1)
    cags.map(function (cag) {
      r = r.subtractSub(cag._toCSGWall(-1, 1), false, false)
    })
    r = r.reTesselated()
    r = r.canonicalized()
    r = fromFakeCSG(r)
    r = r.canonicalized()
    return r
  },

  intersect: function (cag) {
    let cags
    if (cag instanceof Array) {
      cags = cag
    } else {
      cags = [cag]
    }
    let r = this._toCSGWall(-1, 1)
    cags.map(function (cag) {
      r = r.intersectSub(cag._toCSGWall(-1, 1), false, false)
    })
    r = r.reTesselated()
    r = r.canonicalized()
    r = fromFakeCSG(r)
    r = r.canonicalized()
    return r
  },

  transform: function (matrix4x4) {
    let ismirror = matrix4x4.isMirroring()
    let newsides = this.sides.map(function (side) {
      return side.transform(matrix4x4)
    })
    let result = fromSides(newsides)
    if (ismirror) {
      result = result.flipped()
    }
    return result
  },

  flipped: function () {
    let newsides = this.sides.map(function (side) {
      return side.flipped()
    })
    newsides.reverse()
    return fromSides(newsides)
  },

  // ALIAS !
  expandedShell: function (radius, resolution) {
    return expandedShellOfCAG(this, radius, resolution)
  },

  // ALIAS !
  expand: function (radius, resolution) {
    return expand(this, radius, resolution)
  },

  contract: function (radius, resolution) {
    return contract(this, radius, resolution)
  },

  // ALIAS !
  area: function () {
    return area(this)
  },

  // ALIAS !
  getBounds: function () {
    return getBounds(this)
  },
  // ALIAS !
  isSelfIntersecting: function (debug) {
    return isSelfIntersecting(this, debug)
  },
  // extrusion: all aliases to simple functions
  extrudeInOrthonormalBasis: function (orthonormalbasis, depth, options) {
    return extrudeInOrthonormalBasis(this, orthonormalbasis, depth, options)
  },

  // ALIAS !
  extrudeInPlane: function (axis1, axis2, depth, options) {
    return extrudeInPlane(this, axis1, axis2, depth, options)
  },

  // ALIAS !
  extrude: function (options) {
    return extrude(this, options)
  },

  // ALIAS !
  rotateExtrude: function (options) { // FIXME options should be optional
    return rotateExtrude(this, options)
  },

  // ALIAS !
  check: function () {
    return isCAGValid(this)
  },

  // ALIAS !
  canonicalized: function () {
    return canonicalize(this)
  },

  // ALIAS !
  reTesselated: function () {
    return retesselate(this)
  },

  // ALIAS !
  getOutlinePaths: function () {
    return cagoutlinePaths(this)
  },

  // ALIAS !
  overCutInsideCorners: function (cutterradius) {
    return overCutInsideCorners(this, cutterradius)
  },

  // All the toXXX functions
  toString: function () {
    let result = 'CAG (' + this.sides.length + ' sides):\n'
    this.sides.map(function (side) {
      result += '  ' + side.toString() + '\n'
    })
    return result
  },

  _toCSGWall: function (z0, z1) {
    let polygons = this.sides.map(function (side) {
      return side.toPolygon3D(z0, z1)
    })
    return fromPolygons(polygons)
  },

  _toVector3DPairs: function (m) {
        // transform m
    let pairs = this.sides.map(function (side) {
      let p0 = side.vertex0.pos
      let p1 = side.vertex1.pos
      return [Vector3D.Create(p0.x, p0.y, 0),
        Vector3D.Create(p1.x, p1.y, 0)]
    })
    if (typeof m !== 'undefined') {
      pairs = pairs.map(function (pair) {
        return pair.map(function (v) {
          return v.transform(m)
        })
      })
    }
    return pairs
  },

  /*
    * transform a cag into the polygons of a corresponding 3d plane, positioned per options
    * Accepts a connector for plane positioning, or optionally
    * single translation, axisVector, normalVector arguments
    * (toConnector has precedence over single arguments if provided)
    */
  _toPlanePolygons: function (options) {
    const defaults = {
      flipped: false
    }
    options = Object.assign({}, defaults, options)
    let {flipped} = options
    // reference connector for transformation
    let origin = [0, 0, 0]
    let defaultAxis = [0, 0, 1]
    let defaultNormal = [0, 1, 0]
    let thisConnector = new Connector(origin, defaultAxis, defaultNormal)
    // translated connector per options
    let translation = options.translation || origin
    let axisVector = options.axisVector || defaultAxis
    let normalVector = options.normalVector || defaultNormal
    // will override above if options has toConnector
    let toConnector = options.toConnector ||
            new Connector(translation, axisVector, normalVector)
    // resulting transform
    let m = thisConnector.getTransformationTo(toConnector, false, 0)
    // create plane as a (partial non-closed) CSG in XY plane
    let bounds = this.getBounds()
    bounds[0] = bounds[0].minus(new Vector2D(1, 1))
    bounds[1] = bounds[1].plus(new Vector2D(1, 1))
    let csgshell = this._toCSGWall(-1, 1)
    let csgplane = fromPolygons([new Polygon([
      new Vertex3D(new Vector3D(bounds[0].x, bounds[0].y, 0)),
      new Vertex3D(new Vector3D(bounds[1].x, bounds[0].y, 0)),
      new Vertex3D(new Vector3D(bounds[1].x, bounds[1].y, 0)),
      new Vertex3D(new Vector3D(bounds[0].x, bounds[1].y, 0))
    ])])
    if (flipped) {
      csgplane = csgplane.invert()
    }
    // intersectSub -> prevent premature retesselate/canonicalize
    csgplane = csgplane.intersectSub(csgshell)
    // only keep the polygons in the z plane:
    let polys = csgplane.polygons.filter(function (polygon) {
      return Math.abs(polygon.plane.normal.z) > 0.99
    })
    // finally, position the plane per passed transformations
    return polys.map(function (poly) {
      return poly.transform(m)
    })
  },

  /*
    * given 2 connectors, this returns all polygons of a "wall" between 2
    * copies of this cag, positioned in 3d space as "bottom" and
    * "top" plane per connectors toConnector1, and toConnector2, respectively
    */
  _toWallPolygons: function (options) {
        // normals are going to be correct as long as toConn2.point - toConn1.point
        // points into cag normal direction (check in caller)
        // arguments: options.toConnector1, options.toConnector2, options.cag
        //     walls go from toConnector1 to toConnector2
        //     optionally, target cag to point to - cag needs to have same number of sides as this!
    let origin = [0, 0, 0]
    let defaultAxis = [0, 0, 1]
    let defaultNormal = [0, 1, 0]
    let thisConnector = new Connector(origin, defaultAxis, defaultNormal)
        // arguments:
    let toConnector1 = options.toConnector1
        // let toConnector2 = new Connector([0, 0, -30], defaultAxis, defaultNormal);
    let toConnector2 = options.toConnector2
    if (!(toConnector1 instanceof Connector && toConnector2 instanceof Connector)) {
      throw new Error('could not parse Connector arguments toConnector1 or toConnector2')
    }
    if (options.cag) {
      if (options.cag.sides.length !== this.sides.length) {
        throw new Error('target cag needs same sides count as start cag')
      }
    }
        // target cag is same as this unless specified
    let toCag = options.cag || this
    let m1 = thisConnector.getTransformationTo(toConnector1, false, 0)
    let m2 = thisConnector.getTransformationTo(toConnector2, false, 0)
    let vps1 = this._toVector3DPairs(m1)
    let vps2 = toCag._toVector3DPairs(m2)

    let polygons = []
    vps1.forEach(function (vp1, i) {
      polygons.push(new Polygon([
        new Vertex3D(vps2[i][1]), new Vertex3D(vps2[i][0]), new Vertex3D(vp1[0])]))
      polygons.push(new Polygon([
        new Vertex3D(vps2[i][1]), new Vertex3D(vp1[0]), new Vertex3D(vp1[1])]))
    })
    return polygons
  },

    /**
     * Convert to a list of points.
     * @return {points[]} list of points in 2D space
     */
  toPoints: function () {
    let points = this.sides.map(function (side) {
      let v0 = side.vertex0
      // let v1 = side.vertex1
      return v0.pos
    })
    // due to the logic of fromPoints()
    // move the first point to the last
    if (points.length > 0) {
      points.push(points.shift())
    }
    return points
  },

    /** Convert to compact binary form.
   * See fromCompactBinary.
   * @return {CompactBinary}
   */
  toCompactBinary: function () {
    let cag = this.canonicalized()
    let numsides = cag.sides.length
    let vertexmap = {}
    let vertices = []
    let numvertices = 0
    let sideVertexIndices = new Uint32Array(2 * numsides)
    let sidevertexindicesindex = 0
    cag.sides.map(function (side) {
      [side.vertex0, side.vertex1].map(function (v) {
        let vertextag = v.getTag()
        let vertexindex
        if (!(vertextag in vertexmap)) {
          vertexindex = numvertices++
          vertexmap[vertextag] = vertexindex
          vertices.push(v)
        } else {
          vertexindex = vertexmap[vertextag]
        }
        sideVertexIndices[sidevertexindicesindex++] = vertexindex
      })
    })
    let vertexData = new Float64Array(numvertices * 2)
    let verticesArrayIndex = 0
    vertices.map(function (v) {
      let pos = v.pos
      vertexData[verticesArrayIndex++] = pos._x
      vertexData[verticesArrayIndex++] = pos._y
    })
    let result = {
      'class': 'CAG',
      sideVertexIndices: sideVertexIndices,
      vertexData: vertexData
    }
    return result
  }
}

module.exports = CAG

},{"../api/cagOutlinePaths":2,"../api/ops-cnc":5,"../api/ops-expandContract":7,"../api/ops-extrusions":8,"./CAGFactories":14,"./CSGFactories":16,"./connectors":21,"./math/Polygon3":30,"./math/Vector2":32,"./math/Vector3":33,"./math/Vertex3":35,"./utils/cagMeasurements":41,"./utils/cagValidation":42,"./utils/canonicalize":43,"./utils/retesellate":47}],14:[function(require,module,exports){
const Side = require('./math/Side')
const Vector2D = require('./math/Vector2')
const Vertex2 = require('./math/Vertex2')
const {areaEPS} = require('./constants')
const {isSelfIntersecting} = require('./utils/cagValidation')

/** Construct a CAG from a list of `Side` instances.
 * @param {Side[]} sides - list of sides
 * @returns {CAG} new CAG object
 */
const fromSides = function (sides) {
  const CAG = require('./CAG') // circular dependency CAG => fromSides => CAG
  let cag = new CAG()
  cag.sides = sides
  return cag
}

// Converts a CSG to a  The CSG must consist of polygons with only z coordinates +1 and -1
// as constructed by _toCSGWall(-1, 1). This is so we can use the 3D union(), intersect() etc
const fromFakeCSG = function (csg) {
  let sides = csg.polygons.map(function (p) {
    return Side._fromFakePolygon(p)
  })
  .filter(function (s) {
    return s !== null
  })
  return fromSides(sides)
}

/** Construct a CAG from a list of points (a polygon).
 * The rotation direction of the points is not relevant.
 * The points can define a convex or a concave polygon.
 * The polygon must not self intersect.
 * @param {points[]} points - list of points in 2D space
 * @returns {CAG} new CAG object
 */
const fromPoints = function (points) {
  let numpoints = points.length
  if (numpoints < 3) throw new Error('CAG shape needs at least 3 points')
  let sides = []
  let prevpoint = new Vector2D(points[numpoints - 1])
  let prevvertex = new Vertex2(prevpoint)
  points.map(function (p) {
    let point = new Vector2D(p)
    let vertex = new Vertex2(point)
    let side = new Side(prevvertex, vertex)
    sides.push(side)
    prevvertex = vertex
  })
  let result = fromSides(sides)
  if (isSelfIntersecting(result)) {
    throw new Error('Polygon is self intersecting!')
  }
  let area = result.area()
  if (Math.abs(area) < areaEPS) {
    throw new Error('Degenerate polygon!')
  }
  if (area < 0) {
    result = result.flipped()
  }
  result = result.canonicalized()
  return result
}

/** Reconstruct a CAG from an object with identical property names.
 * @param {Object} obj - anonymous object, typically from JSON
 * @returns {CAG} new CAG object
 */
const fromObject = function (obj) {
  let sides = obj.sides.map(function (s) {
    return Side.fromObject(s)
  })
  let cag = fromSides(sides)
  cag.isCanonicalized = obj.isCanonicalized
  return cag
}

/** Construct a CAG from a list of points (a polygon).
 * Like fromPoints() but does not check if the result is a valid polygon.
 * The points MUST rotate counter clockwise.
 * The points can define a convex or a concave polygon.
 * The polygon must not self intersect.
 * @param {points[]} points - list of points in 2D space
 * @returns {CAG} new CAG object
 */
const fromPointsNoCheck = function (points) {
  let sides = []
  let prevpoint = new Vector2D(points[points.length - 1])
  let prevvertex = new Vertex2(prevpoint)
  points.map(function (p) {
    let point = new Vector2D(p)
    let vertex = new Vertex2(point)
    let side = new Side(prevvertex, vertex)
    sides.push(side)
    prevvertex = vertex
  })
  return fromSides(sides)
}

/** Construct a CAG from a 2d-path (a closed sequence of points).
 * Like fromPoints() but does not check if the result is a valid polygon.
 * @param {path} Path2 - a Path2 path
 * @returns {CAG} new CAG object
 */
const fromPath2 = function (path) {
  if (!path.isClosed()) throw new Error('The path should be closed!')
  return fromPoints(path.getPoints())
}

/** Reconstruct a CAG from the output of toCompactBinary().
 * @param {CompactBinary} bin - see toCompactBinary()
 * @returns {CAG} new CAG object
 */
const fromCompactBinary = function (bin) {
  if (bin['class'] !== 'CAG') throw new Error('Not a CAG')
  let vertices = []
  let vertexData = bin.vertexData
  let numvertices = vertexData.length / 2
  let arrayindex = 0
  for (let vertexindex = 0; vertexindex < numvertices; vertexindex++) {
    let x = vertexData[arrayindex++]
    let y = vertexData[arrayindex++]
    let pos = new Vector2D(x, y)
    let vertex = new Vertex2(pos)
    vertices.push(vertex)
  }
  let sides = []
  let numsides = bin.sideVertexIndices.length / 2
  arrayindex = 0
  for (let sideindex = 0; sideindex < numsides; sideindex++) {
    let vertexindex0 = bin.sideVertexIndices[arrayindex++]
    let vertexindex1 = bin.sideVertexIndices[arrayindex++]
    let side = new Side(vertices[vertexindex0], vertices[vertexindex1])
    sides.push(side)
  }
  let cag = fromSides(sides)
  cag.isCanonicalized = true
  return cag
}

module.exports = {
  fromSides,
  fromObject,
  fromPoints,
  fromPointsNoCheck,
  fromPath2,
  fromFakeCSG,
  fromCompactBinary
}

},{"./CAG":13,"./constants":22,"./math/Side":31,"./math/Vector2":32,"./math/Vertex2":34,"./utils/cagValidation":42}],15:[function(require,module,exports){
const Tree = require('./trees')
const Polygon = require('./math/Polygon3')
const Plane = require('./math/Plane')
const OrthoNormalBasis = require('./math/OrthoNormalBasis')

const CAG = require('./CAG') // FIXME: for some weird reason if CAG is imported AFTER frompolygons, a lot of things break???

const Properties = require('./Properties')
const {fromPolygons} = require('./CSGFactories') // FIXME: circular dependency !

const fixTJunctions = require('./utils/fixTJunctions')
const canonicalize = require('./utils/canonicalize')
const retesselate = require('./utils/retesellate')
const {bounds} = require('./utils/csgMeasurements')
const {projectToOrthoNormalBasis} = require('./utils/csgProjections')

const {lieFlat, getTransformationToFlatLying, getTransformationAndInverseTransformationToFlatLying} = require('../api/ops-cnc')
const {sectionCut, cutByPlane} = require('../api/ops-cuts')
const {expand, contract, expandedShellOfCCSG} = require('../api/ops-expandContract')

/** Class CSG
 * Holds a binary space partition tree representing a 3D solid. Two solids can
 * be combined using the `union()`, `subtract()`, and `intersect()` methods.
 * @constructor
 */
let CSG = function () {
  this.polygons = []
  this.properties = new Properties()
  this.isCanonicalized = true
  this.isRetesselated = true
}

CSG.prototype = {
  /**
   * Return a new CSG solid representing the space in either this solid or
   * in the given solids. Neither this solid nor the given solids are modified.
   * @param {CSG[]} csg - list of CSG objects
   * @returns {CSG} new CSG object
   * @example
   * let C = A.union(B)
   * @example
   * +-------+            +-------+
   * |       |            |       |
   * |   A   |            |       |
   * |    +--+----+   =   |       +----+
   * +----+--+    |       +----+       |
   *      |   B   |            |       |
   *      |       |            |       |
   *      +-------+            +-------+
   */
  union: function (csg) {
    let csgs
    if (csg instanceof Array) {
      csgs = csg.slice(0)
      csgs.push(this)
    } else {
      csgs = [this, csg]
    }

    let i
    // combine csg pairs in a way that forms a balanced binary tree pattern
    for (i = 1; i < csgs.length; i += 2) {
      csgs.push(csgs[i - 1].unionSub(csgs[i]))
    }
    return csgs[i - 1].reTesselated().canonicalized()
  },

  unionSub: function (csg, retesselate, canonicalize) {
    if (!this.mayOverlap(csg)) {
      return this.unionForNonIntersecting(csg)
    } else {
      let a = new Tree(this.polygons)
      let b = new Tree(csg.polygons)
      a.clipTo(b, false)

            // b.clipTo(a, true); // ERROR: this doesn't work
      b.clipTo(a)
      b.invert()
      b.clipTo(a)
      b.invert()

      let newpolygons = a.allPolygons().concat(b.allPolygons())
      let result = fromPolygons(newpolygons)
      result.properties = this.properties._merge(csg.properties)
      if (retesselate) result = result.reTesselated()
      if (canonicalize) result = result.canonicalized()
      return result
    }
  },

  // Like union, but when we know that the two solids are not intersecting
  // Do not use if you are not completely sure that the solids do not intersect!
  unionForNonIntersecting: function (csg) {
    let newpolygons = this.polygons.concat(csg.polygons)
    let result = fromPolygons(newpolygons)
    result.properties = this.properties._merge(csg.properties)
    result.isCanonicalized = this.isCanonicalized && csg.isCanonicalized
    result.isRetesselated = this.isRetesselated && csg.isRetesselated
    return result
  },

  /**
   * Return a new CSG solid representing space in this solid but
   * not in the given solids. Neither this solid nor the given solids are modified.
   * @param {CSG[]} csg - list of CSG objects
   * @returns {CSG} new CSG object
   * @example
   * let C = A.subtract(B)
   * @example
   * +-------+            +-------+
   * |       |            |       |
   * |   A   |            |       |
   * |    +--+----+   =   |    +--+
   * +----+--+    |       +----+
   *      |   B   |
   *      |       |
   *      +-------+
   */
  subtract: function (csg) {
    let csgs
    if (csg instanceof Array) {
      csgs = csg
    } else {
      csgs = [csg]
    }
    let result = this
    for (let i = 0; i < csgs.length; i++) {
      let islast = (i === (csgs.length - 1))
      result = result.subtractSub(csgs[i], islast, islast)
    }
    return result
  },

  subtractSub: function (csg, retesselate, canonicalize) {
    let a = new Tree(this.polygons)
    let b = new Tree(csg.polygons)
    a.invert()
    a.clipTo(b)
    b.clipTo(a, true)
    a.addPolygons(b.allPolygons())
    a.invert()
    let result = fromPolygons(a.allPolygons())
    result.properties = this.properties._merge(csg.properties)
    if (retesselate) result = result.reTesselated()
    if (canonicalize) result = result.canonicalized()
    return result
  },

  /**
   * Return a new CSG solid representing space in both this solid and
   * in the given solids. Neither this solid nor the given solids are modified.
   * @param {CSG[]} csg - list of CSG objects
   * @returns {CSG} new CSG object
   * @example
   * let C = A.intersect(B)
   * @example
   * +-------+
   * |       |
   * |   A   |
   * |    +--+----+   =   +--+
   * +----+--+    |       +--+
   *      |   B   |
   *      |       |
   *      +-------+
   */
  intersect: function (csg) {
    let csgs
    if (csg instanceof Array) {
      csgs = csg
    } else {
      csgs = [csg]
    }
    let result = this
    for (let i = 0; i < csgs.length; i++) {
      let islast = (i === (csgs.length - 1))
      result = result.intersectSub(csgs[i], islast, islast)
    }
    return result
  },

  intersectSub: function (csg, retesselate, canonicalize) {
    let a = new Tree(this.polygons)
    let b = new Tree(csg.polygons)
    a.invert()
    b.clipTo(a)
    b.invert()
    a.clipTo(b)
    b.clipTo(a)
    a.addPolygons(b.allPolygons())
    a.invert()
    let result = fromPolygons(a.allPolygons())
    result.properties = this.properties._merge(csg.properties)
    if (retesselate) result = result.reTesselated()
    if (canonicalize) result = result.canonicalized()
    return result
  },

  /**
   * Return a new CSG solid with solid and empty space switched.
   * This solid is not modified.
   * @returns {CSG} new CSG object
   * @example
   * let B = A.invert()
   */
  invert: function () {
    let flippedpolygons = this.polygons.map(function (p) {
      return p.flipped()
    })
    return fromPolygons(flippedpolygons)
    // TODO: flip properties?
  },

  // Affine transformation of CSG object. Returns a new CSG object
  transform1: function (matrix4x4) {
    let newpolygons = this.polygons.map(function (p) {
      return p.transform(matrix4x4)
    })
    let result = fromPolygons(newpolygons)
    result.properties = this.properties._transform(matrix4x4)
    result.isRetesselated = this.isRetesselated
    return result
  },

  /**
   * Return a new CSG solid that is transformed using the given Matrix.
   * Several matrix transformations can be combined before transforming this solid.
   * @param {CSG.Matrix4x4} matrix4x4 - matrix to be applied
   * @returns {CSG} new CSG object
   * @example
   * var m = new CSG.Matrix4x4()
   * m = m.multiply(CSG.Matrix4x4.rotationX(40))
   * m = m.multiply(CSG.Matrix4x4.translation([-.5, 0, 0]))
   * let B = A.transform(m)
   */
  transform: function (matrix4x4) {
    let ismirror = matrix4x4.isMirroring()
    let transformedvertices = {}
    let transformedplanes = {}
    let newpolygons = this.polygons.map(function (p) {
      let newplane
      let plane = p.plane
      let planetag = plane.getTag()
      if (planetag in transformedplanes) {
        newplane = transformedplanes[planetag]
      } else {
        newplane = plane.transform(matrix4x4)
        transformedplanes[planetag] = newplane
      }
      let newvertices = p.vertices.map(function (v) {
        let newvertex
        let vertextag = v.getTag()
        if (vertextag in transformedvertices) {
          newvertex = transformedvertices[vertextag]
        } else {
          newvertex = v.transform(matrix4x4)
          transformedvertices[vertextag] = newvertex
        }
        return newvertex
      })
      if (ismirror) newvertices.reverse()
      return new Polygon(newvertices, p.shared, newplane)
    })
    let result = fromPolygons(newpolygons)
    result.properties = this.properties._transform(matrix4x4)
    result.isRetesselated = this.isRetesselated
    result.isCanonicalized = this.isCanonicalized
    return result
  },

  // ALIAS !
  expand: function (radius, resolution) {
    return expand(this, radius, resolution)
  },

  // ALIAS !
  contract: function (radius, resolution) {
    return contract(this, radius, resolution)
  },

  // ALIAS !
  expandedShell: function (radius, resolution, unionWithThis) {
    return expandedShellOfCCSG(this, radius, resolution, unionWithThis)
  },

  // cut the solid at a plane, and stretch the cross-section found along plane normal
  // note: only used in roundedCube() internally
  stretchAtPlane: function (normal, point, length) {
    let plane = Plane.fromNormalAndPoint(normal, point)
    let onb = new OrthoNormalBasis(plane)
    let crosssect = this.sectionCut(onb)
    let midpiece = crosssect.extrudeInOrthonormalBasis(onb, length)
    let piece1 = this.cutByPlane(plane)
    let piece2 = this.cutByPlane(plane.flipped())
    let result = piece1.union([midpiece, piece2.translate(plane.normal.times(length))])
    return result
  },

  // ALIAS !
  canonicalized: function () {
    return canonicalize(this)
  },

  // ALIAS !
  reTesselated: function () {
    return retesselate(this)
  },

  // ALIAS !
  fixTJunctions: function () {
    return fixTJunctions(fromPolygons, this)
  },

  // ALIAS !
  getBounds: function () {
    return bounds(this)
  },

  /** returns true if there is a possibility that the two solids overlap
   * returns false if we can be sure that they do not overlap
   * NOTE: this is critical as it is used in UNIONs
   * @param  {CSG} csg
   */
  mayOverlap: function (csg) {
    if ((this.polygons.length === 0) || (csg.polygons.length === 0)) {
      return false
    } else {
      let mybounds = bounds(this)
      let otherbounds = bounds(csg)
      if (mybounds[1].x < otherbounds[0].x) return false
      if (mybounds[0].x > otherbounds[1].x) return false
      if (mybounds[1].y < otherbounds[0].y) return false
      if (mybounds[0].y > otherbounds[1].y) return false
      if (mybounds[1].z < otherbounds[0].z) return false
      if (mybounds[0].z > otherbounds[1].z) return false
      return true
    }
  },

  // ALIAS !
  cutByPlane: function (plane) {
    return cutByPlane(this, plane)
  },

  /**
   * Connect a solid to another solid, such that two Connectors become connected
   * @param  {Connector} myConnector a Connector of this solid
   * @param  {Connector} otherConnector a Connector to which myConnector should be connected
   * @param  {Boolean} mirror false: the 'axis' vectors of the connectors should point in the same direction
   * true: the 'axis' vectors of the connectors should point in opposite direction
   * @param  {Float} normalrotation degrees of rotation between the 'normal' vectors of the two
   * connectors
   * @returns {CSG} this csg, tranformed accordingly
   */
  connectTo: function (myConnector, otherConnector, mirror, normalrotation) {
    let matrix = myConnector.getTransformationTo(otherConnector, mirror, normalrotation)
    return this.transform(matrix)
  },

  /**
   * set the .shared property of all polygons
   * @param  {Object} shared
   * @returns {CSG} Returns a new CSG solid, the original is unmodified!
   */
  setShared: function (shared) {
    let polygons = this.polygons.map(function (p) {
      return new Polygon(p.vertices, shared, p.plane)
    })
    let result = fromPolygons(polygons)
    result.properties = this.properties // keep original properties
    result.isRetesselated = this.isRetesselated
    result.isCanonicalized = this.isCanonicalized
    return result
  },

  /** sets the color of this csg: non mutating, returns a new CSG
   * @param  {Object} args
   * @returns {CSG} a copy of this CSG, with the given color
   */
  setColor: function (args) {
    let newshared = Polygon.Shared.fromColor.apply(this, arguments)
    return this.setShared(newshared)
  },

  // ALIAS !
  getTransformationAndInverseTransformationToFlatLying: function () {
    return getTransformationAndInverseTransformationToFlatLying(this)
  },

  // ALIAS !
  getTransformationToFlatLying: function () {
    return getTransformationToFlatLying(this)
  },

  // ALIAS !
  lieFlat: function () {
    return lieFlat(this)
  },

  // project the 3D CSG onto a plane
  // This returns a 2D CAG with the 'shadow' shape of the 3D solid when projected onto the
  // plane represented by the orthonormal basis
  projectToOrthoNormalBasis: function (orthobasis) {
    // FIXME:  DEPENDS ON CAG !!
    return projectToOrthoNormalBasis(this, orthobasis)
  },

  // FIXME: not finding any uses within our code ?
  sectionCut: function (orthobasis) {
    return sectionCut(this, orthobasis)
  },

  /**
   * Returns an array of values for the requested features of this solid.
   * Supported Features: 'volume', 'area'
   * @param {String[]} features - list of features to calculate
   * @returns {Float[]} values
   * @example
   * let volume = A.getFeatures('volume')
   * let values = A.getFeatures('area','volume')
   */
  getFeatures: function (features) {
    if (!(features instanceof Array)) {
      features = [features]
    }
    let result = this.toTriangles().map(function (triPoly) {
      return triPoly.getTetraFeatures(features)
    })
    .reduce(function (pv, v) {
      return v.map(function (feat, i) {
        return feat + (pv === 0 ? 0 : pv[i])
      })
    }, 0)
    return (result.length === 1) ? result[0] : result
  },
  /** @return {Polygon[]} The list of polygons. */
  toPolygons: function () {
    return this.polygons
  },

  toString: function () {
    let result = 'CSG solid:\n'
    this.polygons.map(function (p) {
      result += p.toString()
    })
    return result
  },

  /** returns a compact binary representation of this csg
   * usually used to transfer CSG objects to/from webworkes
   * NOTE: very interesting compact format, with a lot of reusable ideas
   * @returns {Object} compact binary representation of a CSG
   */
  toCompactBinary: function () {
    let csg = this.canonicalized()
    let numpolygons = csg.polygons.length
    let numpolygonvertices = 0

    let numvertices = 0
    let vertexmap = {}
    let vertices = []

    let numplanes = 0
    let planemap = {}
    let planes = []

    let shareds = []
    let sharedmap = {}
    let numshared = 0
        // for (let i = 0, iMax = csg.polygons.length; i < iMax; i++) {
        //  let p = csg.polygons[i];
        //  for (let j = 0, jMax = p.length; j < jMax; j++) {
        //      ++numpolygonvertices;
        //      let vertextag = p[j].getTag();
        //      if(!(vertextag in vertexmap)) {
        //          vertexmap[vertextag] = numvertices++;
        //          vertices.push(p[j]);
        //      }
        //  }
    csg.polygons.map(function (polygon) {
      // FIXME: why use map if we do not return anything ?
      // either for... or forEach
      polygon.vertices.map(function (vertex) {
        ++numpolygonvertices
        let vertextag = vertex.getTag()
        if (!(vertextag in vertexmap)) {
          vertexmap[vertextag] = numvertices++
          vertices.push(vertex)
        }
      })

      let planetag = polygon.plane.getTag()
      if (!(planetag in planemap)) {
        planemap[planetag] = numplanes++
        planes.push(polygon.plane)
      }
      let sharedtag = polygon.shared.getTag()
      if (!(sharedtag in sharedmap)) {
        sharedmap[sharedtag] = numshared++
        shareds.push(polygon.shared)
      }
    })

    let numVerticesPerPolygon = new Uint32Array(numpolygons)
    let polygonSharedIndexes = new Uint32Array(numpolygons)
    let polygonVertices = new Uint32Array(numpolygonvertices)
    let polygonPlaneIndexes = new Uint32Array(numpolygons)
    let vertexData = new Float64Array(numvertices * 3)
    let planeData = new Float64Array(numplanes * 4)
    let polygonVerticesIndex = 0

    // FIXME: doublecheck : why does it go through the whole polygons again?
    // can we optimise that ? (perhap due to needing size to init buffers above)
    for (let polygonindex = 0; polygonindex < numpolygons; ++polygonindex) {
      let polygon = csg.polygons[polygonindex]
      numVerticesPerPolygon[polygonindex] = polygon.vertices.length
      polygon.vertices.map(function (vertex) {
        let vertextag = vertex.getTag()
        let vertexindex = vertexmap[vertextag]
        polygonVertices[polygonVerticesIndex++] = vertexindex
      })
      let planetag = polygon.plane.getTag()
      let planeindex = planemap[planetag]
      polygonPlaneIndexes[polygonindex] = planeindex
      let sharedtag = polygon.shared.getTag()
      let sharedindex = sharedmap[sharedtag]
      polygonSharedIndexes[polygonindex] = sharedindex
    }
    let verticesArrayIndex = 0
    vertices.map(function (vertex) {
      const pos = vertex.pos
      vertexData[verticesArrayIndex++] = pos._x
      vertexData[verticesArrayIndex++] = pos._y
      vertexData[verticesArrayIndex++] = pos._z
    })
    let planesArrayIndex = 0
    planes.map(function (plane) {
      const normal = plane.normal
      planeData[planesArrayIndex++] = normal._x
      planeData[planesArrayIndex++] = normal._y
      planeData[planesArrayIndex++] = normal._z
      planeData[planesArrayIndex++] = plane.w
    })

    let result = {
      'class': 'CSG',
      numPolygons: numpolygons,
      numVerticesPerPolygon: numVerticesPerPolygon,
      polygonPlaneIndexes: polygonPlaneIndexes,
      polygonSharedIndexes: polygonSharedIndexes,
      polygonVertices: polygonVertices,
      vertexData: vertexData,
      planeData: planeData,
      shared: shareds
    }
    return result
  },

  /** returns the triangles of this csg
   * @returns {Polygons} triangulated polygons
   */
  toTriangles: function () {
    let polygons = []
    this.polygons.forEach(function (poly) {
      let firstVertex = poly.vertices[0]
      for (let i = poly.vertices.length - 3; i >= 0; i--) {
        polygons.push(new Polygon(
          [
            firstVertex,
            poly.vertices[i + 1],
            poly.vertices[i + 2]
          ],
          poly.shared,
          poly.plane))
      }
    })
    return polygons
  }
}

module.exports = CSG

},{"../api/ops-cnc":5,"../api/ops-cuts":6,"../api/ops-expandContract":7,"./CAG":13,"./CSGFactories":16,"./Properties":20,"./math/OrthoNormalBasis":26,"./math/Plane":28,"./math/Polygon3":30,"./trees":39,"./utils/canonicalize":43,"./utils/csgMeasurements":44,"./utils/csgProjections":45,"./utils/fixTJunctions":46,"./utils/retesellate":47}],16:[function(require,module,exports){
const Vector3D = require('./math/Vector3')
const Vertex = require('./math/Vertex3')
const Plane = require('./math/Plane')
const Polygon2D = require('./math/Polygon2')
const Polygon3D = require('./math/Polygon3')

/** Construct a CSG solid from a list of `Polygon` instances.
 * @param {Polygon[]} polygons - list of polygons
 * @returns {CSG} new CSG object
 */
const fromPolygons = function (polygons) {
  const CSG = require('./CSG')
  let csg = new CSG()
  csg.polygons = polygons
  csg.isCanonicalized = false
  csg.isRetesselated = false
  return csg
}

/** Construct a CSG solid from a list of pre-generated slices.
 * See Polygon.prototype.solidFromSlices() for details.
 * @param {Object} options - options passed to solidFromSlices()
 * @returns {CSG} new CSG object
 */
function fromSlices (options) {
  return Polygon2D.createFromPoints([
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0]
  ]).solidFromSlices(options)
}

/** Reconstruct a CSG solid from an object with identical property names.
 * @param {Object} obj - anonymous object, typically from JSON
 * @returns {CSG} new CSG object
 */
function fromObject (obj) {
  let polygons = obj.polygons.map(function (p) {
    return Polygon3D.fromObject(p)
  })
  let csg = fromPolygons(polygons)
  csg.isCanonicalized = obj.isCanonicalized
  csg.isRetesselated = obj.isRetesselated
  return csg
}

/** Reconstruct a CSG from the output of toCompactBinary().
 * @param {CompactBinary} bin - see toCompactBinary().
 * @returns {CSG} new CSG object
 */
function fromCompactBinary (bin) {
  if (bin['class'] !== 'CSG') throw new Error('Not a CSG')
  let planes = []
  let planeData = bin.planeData
  let numplanes = planeData.length / 4
  let arrayindex = 0
  let x, y, z, w, normal, plane
  for (let planeindex = 0; planeindex < numplanes; planeindex++) {
    x = planeData[arrayindex++]
    y = planeData[arrayindex++]
    z = planeData[arrayindex++]
    w = planeData[arrayindex++]
    normal = Vector3D.Create(x, y, z)
    plane = new Plane(normal, w)
    planes.push(plane)
  }

  let vertices = []
  const vertexData = bin.vertexData
  const numvertices = vertexData.length / 3
  let pos
  let vertex
  arrayindex = 0
  for (let vertexindex = 0; vertexindex < numvertices; vertexindex++) {
    x = vertexData[arrayindex++]
    y = vertexData[arrayindex++]
    z = vertexData[arrayindex++]
    pos = Vector3D.Create(x, y, z)
    vertex = new Vertex(pos)
    vertices.push(vertex)
  }

  let shareds = bin.shared.map(function (shared) {
    return Polygon3D.Shared.fromObject(shared)
  })

  let polygons = []
  let numpolygons = bin.numPolygons
  let numVerticesPerPolygon = bin.numVerticesPerPolygon
  let polygonVertices = bin.polygonVertices
  let polygonPlaneIndexes = bin.polygonPlaneIndexes
  let polygonSharedIndexes = bin.polygonSharedIndexes
  let numpolygonvertices
  let polygonvertices
  let shared
  let polygon // already defined plane,
  arrayindex = 0
  for (let polygonindex = 0; polygonindex < numpolygons; polygonindex++) {
    numpolygonvertices = numVerticesPerPolygon[polygonindex]
    polygonvertices = []
    for (let i = 0; i < numpolygonvertices; i++) {
      polygonvertices.push(vertices[polygonVertices[arrayindex++]])
    }
    plane = planes[polygonPlaneIndexes[polygonindex]]
    shared = shareds[polygonSharedIndexes[polygonindex]]
    polygon = new Polygon3D(polygonvertices, shared, plane)
    polygons.push(polygon)
  }
  let csg = fromPolygons(polygons)
  csg.isCanonicalized = true
  csg.isRetesselated = true
  return csg
}

module.exports = {
  fromPolygons,
  fromSlices,
  fromObject,
  fromCompactBinary
}

},{"./CSG":15,"./math/Plane":28,"./math/Polygon2":29,"./math/Polygon3":30,"./math/Vector3":33,"./math/Vertex3":35}],17:[function(require,module,exports){
// //////////////////////////////
// ## class fuzzyFactory
// This class acts as a factory for objects. We can search for an object with approximately
// the desired properties (say a rectangle with width 2 and height 1)
// The lookupOrCreate() method looks for an existing object (for example it may find an existing rectangle
// with width 2.0001 and height 0.999. If no object is found, the user supplied callback is
// called, which should generate a new object. The new object is inserted into the database
// so it can be found by future lookupOrCreate() calls.
// Constructor:
//   numdimensions: the number of parameters for each object
//     for example for a 2D rectangle this would be 2
//   tolerance: The maximum difference for each parameter allowed to be considered a match
const FuzzyFactory = function (numdimensions, tolerance) {
  this.lookuptable = {}
  this.multiplier = 1.0 / tolerance
}

FuzzyFactory.prototype = {
    // let obj = f.lookupOrCreate([el1, el2, el3], function(elements) {/* create the new object */});
    // Performs a fuzzy lookup of the object with the specified elements.
    // If found, returns the existing object
    // If not found, calls the supplied callback function which should create a new object with
    // the specified properties. This object is inserted in the lookup database.
  lookupOrCreate: function (els, creatorCallback) {
    let hash = ''
    let multiplier = this.multiplier
    els.forEach(function (el) {
      let valueQuantized = Math.round(el * multiplier)
      hash += valueQuantized + '/'
    })
    if (hash in this.lookuptable) {
      return this.lookuptable[hash]
    } else {
      let object = creatorCallback(els)
      let hashparts = els.map(function (el) {
        let q0 = Math.floor(el * multiplier)
        let q1 = q0 + 1
        return ['' + q0 + '/', '' + q1 + '/']
      })
      let numelements = els.length
      let numhashes = 1 << numelements
      for (let hashmask = 0; hashmask < numhashes; ++hashmask) {
        let hashmaskShifted = hashmask
        hash = ''
        hashparts.forEach(function (hashpart) {
          hash += hashpart[hashmaskShifted & 1]
          hashmaskShifted >>= 1
        })
        this.lookuptable[hash] = object
      }
      return object
    }
  }
}

module.exports = FuzzyFactory

},{}],18:[function(require,module,exports){
const FuzzyFactory = require('./FuzzyFactory')
const {EPS} = require('./constants')
const Side = require('./math/Side')

const FuzzyCAGFactory = function () {
  this.vertexfactory = new FuzzyFactory(2, EPS)
}

FuzzyCAGFactory.prototype = {
  getVertex: function (sourcevertex) {
    let elements = [sourcevertex.pos._x, sourcevertex.pos._y]
    let result = this.vertexfactory.lookupOrCreate(elements, function (els) {
      return sourcevertex
    })
    return result
  },

  getSide: function (sourceside) {
    let vertex0 = this.getVertex(sourceside.vertex0)
    let vertex1 = this.getVertex(sourceside.vertex1)
    return new Side(vertex0, vertex1)
  }
}

module.exports = FuzzyCAGFactory

},{"./FuzzyFactory":17,"./constants":22,"./math/Side":31}],19:[function(require,module,exports){
const {EPS} = require('./constants')
const Polygon = require('./math/Polygon3')
const FuzzyFactory = require('./FuzzyFactory')

// ////////////////////////////////////
const FuzzyCSGFactory = function () {
  this.vertexfactory = new FuzzyFactory(3, EPS)
  this.planefactory = new FuzzyFactory(4, EPS)
  this.polygonsharedfactory = {}
}

FuzzyCSGFactory.prototype = {
  getPolygonShared: function (sourceshared) {
    let hash = sourceshared.getHash()
    if (hash in this.polygonsharedfactory) {
      return this.polygonsharedfactory[hash]
    } else {
      this.polygonsharedfactory[hash] = sourceshared
      return sourceshared
    }
  },

  getVertex: function (sourcevertex) {
    let elements = [sourcevertex.pos._x, sourcevertex.pos._y, sourcevertex.pos._z]
    let result = this.vertexfactory.lookupOrCreate(elements, function (els) {
      return sourcevertex
    })
    return result
  },

  getPlane: function (sourceplane) {
    let elements = [sourceplane.normal._x, sourceplane.normal._y, sourceplane.normal._z, sourceplane.w]
    let result = this.planefactory.lookupOrCreate(elements, function (els) {
      return sourceplane
    })
    return result
  },

  getPolygon: function (sourcepolygon) {
    let newplane = this.getPlane(sourcepolygon.plane)
    let newshared = this.getPolygonShared(sourcepolygon.shared)
    let _this = this
    let newvertices = sourcepolygon.vertices.map(function (vertex) {
      return _this.getVertex(vertex)
    })
        // two vertices that were originally very close may now have become
        // truly identical (referring to the same Vertex object).
        // Remove duplicate vertices:
    let newverticesDedup = []
    if (newvertices.length > 0) {
      let prevvertextag = newvertices[newvertices.length - 1].getTag()
      newvertices.forEach(function (vertex) {
        let vertextag = vertex.getTag()
        if (vertextag !== prevvertextag) {
          newverticesDedup.push(vertex)
        }
        prevvertextag = vertextag
      })
    }
        // If it's degenerate, remove all vertices:
    if (newverticesDedup.length < 3) {
      newverticesDedup = []
    }
    return new Polygon(newverticesDedup, newshared, newplane)
  }
}

module.exports = FuzzyCSGFactory

},{"./FuzzyFactory":17,"./constants":22,"./math/Polygon3":30}],20:[function(require,module,exports){
// ////////////////////////////////////
// # Class Properties
// This class is used to store properties of a solid
// A property can for example be a Vertex, a Plane or a Line3D
// Whenever an affine transform is applied to the CSG solid, all its properties are
// transformed as well.
// The properties can be stored in a complex nested structure (using arrays and objects)
const Properties = function () {}

Properties.prototype = {
  _transform: function (matrix4x4) {
    let result = new Properties()
    Properties.transformObj(this, result, matrix4x4)
    return result
  },
  _merge: function (otherproperties) {
    let result = new Properties()
    Properties.cloneObj(this, result)
    Properties.addFrom(result, otherproperties)
    return result
  }
}

Properties.transformObj = function (source, result, matrix4x4) {
  for (let propertyname in source) {
    if (propertyname === '_transform') continue
    if (propertyname === '_merge') continue
    let propertyvalue = source[propertyname]
    let transformed = propertyvalue
    if (typeof (propertyvalue) === 'object') {
      if (('transform' in propertyvalue) && (typeof (propertyvalue.transform) === 'function')) {
        transformed = propertyvalue.transform(matrix4x4)
      } else if (propertyvalue instanceof Array) {
        transformed = []
        Properties.transformObj(propertyvalue, transformed, matrix4x4)
      } else if (propertyvalue instanceof Properties) {
        transformed = new Properties()
        Properties.transformObj(propertyvalue, transformed, matrix4x4)
      }
    }
    result[propertyname] = transformed
  }
}

Properties.cloneObj = function (source, result) {
  for (let propertyname in source) {
    if (propertyname === '_transform') continue
    if (propertyname === '_merge') continue
    let propertyvalue = source[propertyname]
    let cloned = propertyvalue
    if (typeof (propertyvalue) === 'object') {
      if (propertyvalue instanceof Array) {
        cloned = []
        for (let i = 0; i < propertyvalue.length; i++) {
          cloned.push(propertyvalue[i])
        }
      } else if (propertyvalue instanceof Properties) {
        cloned = new Properties()
        Properties.cloneObj(propertyvalue, cloned)
      }
    }
    result[propertyname] = cloned
  }
}

Properties.addFrom = function (result, otherproperties) {
  for (let propertyname in otherproperties) {
    if (propertyname === '_transform') continue
    if (propertyname === '_merge') continue
    if ((propertyname in result) &&
            (typeof (result[propertyname]) === 'object') &&
            (result[propertyname] instanceof Properties) &&
            (typeof (otherproperties[propertyname]) === 'object') &&
            (otherproperties[propertyname] instanceof Properties)) {
      Properties.addFrom(result[propertyname], otherproperties[propertyname])
    } else if (!(propertyname in result)) {
      result[propertyname] = otherproperties[propertyname]
    }
  }
}

module.exports = Properties

},{}],21:[function(require,module,exports){
const Vector3D = require('./math/Vector3')
const Line3D = require('./math/Line3')
const Matrix4x4 = require('./math/Matrix4')
const OrthoNormalBasis = require('./math/OrthoNormalBasis')
const Plane = require('./math/Plane')

// # class Connector
// A connector allows to attach two objects at predefined positions
// For example a servo motor and a servo horn:
// Both can have a Connector called 'shaft'
// The horn can be moved and rotated such that the two connectors match
// and the horn is attached to the servo motor at the proper position.
// Connectors are stored in the properties of a CSG solid so they are
// ge the same transformations applied as the solid
const Connector = function (point, axisvector, normalvector) {
  this.point = new Vector3D(point)
  this.axisvector = new Vector3D(axisvector).unit()
  this.normalvector = new Vector3D(normalvector).unit()
}

Connector.prototype = {
  normalized: function () {
    let axisvector = this.axisvector.unit()
        // make the normal vector truly normal:
    let n = this.normalvector.cross(axisvector).unit()
    let normalvector = axisvector.cross(n)
    return new Connector(this.point, axisvector, normalvector)
  },

  transform: function (matrix4x4) {
    let point = this.point.multiply4x4(matrix4x4)
    let axisvector = this.point.plus(this.axisvector).multiply4x4(matrix4x4).minus(point)
    let normalvector = this.point.plus(this.normalvector).multiply4x4(matrix4x4).minus(point)
    return new Connector(point, axisvector, normalvector)
  },

    // Get the transformation matrix to connect this Connector to another connector
    //   other: a Connector to which this connector should be connected
    //   mirror: false: the 'axis' vectors of the connectors should point in the same direction
    //           true: the 'axis' vectors of the connectors should point in opposite direction
    //   normalrotation: degrees of rotation between the 'normal' vectors of the two
    //                   connectors
  getTransformationTo: function (other, mirror, normalrotation) {
    mirror = mirror ? true : false
    normalrotation = normalrotation ? Number(normalrotation) : 0
    let us = this.normalized()
    other = other.normalized()
        // shift to the origin:
    let transformation = Matrix4x4.translation(this.point.negated())
        // construct the plane crossing through the origin and the two axes:
    let axesplane = Plane.anyPlaneFromVector3Ds(
            new Vector3D(0, 0, 0), us.axisvector, other.axisvector)
    let axesbasis = new OrthoNormalBasis(axesplane)
    let angle1 = axesbasis.to2D(us.axisvector).angle()
    let angle2 = axesbasis.to2D(other.axisvector).angle()
    let rotation = 180.0 * (angle2 - angle1) / Math.PI
    if (mirror) rotation += 180.0
    transformation = transformation.multiply(axesbasis.getProjectionMatrix())
    transformation = transformation.multiply(Matrix4x4.rotationZ(rotation))
    transformation = transformation.multiply(axesbasis.getInverseProjectionMatrix())
    let usAxesAligned = us.transform(transformation)
        // Now we have done the transformation for aligning the axes.
        // We still need to align the normals:
    let normalsplane = Plane.fromNormalAndPoint(other.axisvector, new Vector3D(0, 0, 0))
    let normalsbasis = new OrthoNormalBasis(normalsplane)
    angle1 = normalsbasis.to2D(usAxesAligned.normalvector).angle()
    angle2 = normalsbasis.to2D(other.normalvector).angle()
    rotation = 180.0 * (angle2 - angle1) / Math.PI
    rotation += normalrotation
    transformation = transformation.multiply(normalsbasis.getProjectionMatrix())
    transformation = transformation.multiply(Matrix4x4.rotationZ(rotation))
    transformation = transformation.multiply(normalsbasis.getInverseProjectionMatrix())
        // and translate to the destination point:
    transformation = transformation.multiply(Matrix4x4.translation(other.point))
        // let usAligned = us.transform(transformation);
    return transformation
  },

  axisLine: function () {
    return new Line3D(this.point, this.axisvector)
  },

    // creates a new Connector, with the connection point moved in the direction of the axisvector
  extend: function (distance) {
    let newpoint = this.point.plus(this.axisvector.unit().times(distance))
    return new Connector(newpoint, this.axisvector, this.normalvector)
  }
}

const ConnectorList = function (connectors) {
  this.connectors_ = connectors ? connectors.slice() : []
}

ConnectorList.defaultNormal = [0, 0, 1]

ConnectorList.fromPath2D = function (path2D, arg1, arg2) {
  if (arguments.length === 3) {
    return ConnectorList._fromPath2DTangents(path2D, arg1, arg2)
  } else if (arguments.length === 2) {
    return ConnectorList._fromPath2DExplicit(path2D, arg1)
  } else {
    throw new Error('call with path2D and either 2 direction vectors, or a function returning direction vectors')
  }
}

/*
 * calculate the connector axisvectors by calculating the "tangent" for path2D.
 * This is undefined for start and end points, so axis for these have to be manually
 * provided.
 */
ConnectorList._fromPath2DTangents = function (path2D, start, end) {
    // path2D
  let axis
  let pathLen = path2D.points.length
  let result = new ConnectorList([new Connector(path2D.points[0],
        start, ConnectorList.defaultNormal)])
    // middle points
  path2D.points.slice(1, pathLen - 1).forEach(function (p2, i) {
    axis = path2D.points[i + 2].minus(path2D.points[i]).toVector3D(0)
    result.appendConnector(new Connector(p2.toVector3D(0), axis,
          ConnectorList.defaultNormal))
  }, this)
  result.appendConnector(new Connector(path2D.points[pathLen - 1], end,
      ConnectorList.defaultNormal))
  result.closed = path2D.closed
  return result
}

/*
 * angleIsh: either a static angle, or a function(point) returning an angle
 */
ConnectorList._fromPath2DExplicit = function (path2D, angleIsh) {
  function getAngle (angleIsh, pt, i) {
    if (typeof angleIsh === 'function') {
      angleIsh = angleIsh(pt, i)
    }
    return angleIsh
  }
  let result = new ConnectorList(
        path2D.points.map(function (p2, i) {
          return new Connector(p2.toVector3D(0),
                Vector3D.Create(1, 0, 0).rotateZ(getAngle(angleIsh, p2, i)),
                  ConnectorList.defaultNormal)
        }, this)
    )
  result.closed = path2D.closed
  return result
}

ConnectorList.prototype = {
  setClosed: function (closed) {
    this.closed = !!closed
  },
  appendConnector: function (conn) {
    this.connectors_.push(conn)
  },
    /*
     * arguments: cagish: a cag or a function(connector) returning a cag
     *            closed: whether the 3d path defined by connectors location
     *              should be closed or stay open
     *              Note: don't duplicate connectors in the path
     * TODO: consider an option "maySelfIntersect" to close & force union all single segments
     */
  followWith: function (cagish) {
    const CSG = require('./CSG') // FIXME , circular dependency connectors => CSG => connectors

    this.verify()
    function getCag (cagish, connector) {
      if (typeof cagish === 'function') {
        cagish = cagish(connector.point, connector.axisvector, connector.normalvector)
      }
      return cagish
    }

    let polygons = []
    let currCag
    let prevConnector = this.connectors_[this.connectors_.length - 1]
    let prevCag = getCag(cagish, prevConnector)
        // add walls
    this.connectors_.forEach(function (connector, notFirst) {
      currCag = getCag(cagish, connector)
      if (notFirst || this.closed) {
        polygons.push.apply(polygons, prevCag._toWallPolygons({
          toConnector1: prevConnector, toConnector2: connector, cag: currCag}))
      } else {
                // it is the first, and shape not closed -> build start wall
        polygons.push.apply(polygons,
                    currCag._toPlanePolygons({toConnector: connector, flipped: true}))
      }
      if (notFirst === this.connectors_.length - 1 && !this.closed) {
                // build end wall
        polygons.push.apply(polygons,
                    currCag._toPlanePolygons({toConnector: connector}))
      }
      prevCag = currCag
      prevConnector = connector
    }, this)
    return CSG.fromPolygons(polygons).reTesselated().canonicalized()
  },
    /*
     * general idea behind these checks: connectors need to have smooth transition from one to another
     * TODO: add a check that 2 follow-on CAGs are not intersecting
     */
  verify: function () {
    let connI
    let connI1
    for (let i = 0; i < this.connectors_.length - 1; i++) {
      connI = this.connectors_[i]
      connI1 = this.connectors_[i + 1]
      if (connI1.point.minus(connI.point).dot(connI.axisvector) <= 0) {
        throw new Error('Invalid ConnectorList. Each connectors position needs to be within a <90deg range of previous connectors axisvector')
      }
      if (connI.axisvector.dot(connI1.axisvector) <= 0) {
        throw new Error('invalid ConnectorList. No neighboring connectors axisvectors may span a >=90deg angle')
      }
    }
  }
}

module.exports = {Connector, ConnectorList}

},{"./CSG":15,"./math/Line3":24,"./math/Matrix4":25,"./math/OrthoNormalBasis":26,"./math/Plane":28,"./math/Vector3":33}],22:[function(require,module,exports){
const _CSGDEBUG = false

/** Number of polygons per 360 degree revolution for 2D objects.
 * @default
 */
const defaultResolution2D = 32 // FIXME this seems excessive
/** Number of polygons per 360 degree revolution for 3D objects.
 * @default
 */
const defaultResolution3D = 12

/** Epsilon used during determination of near zero distances.
 * @default
 */
const EPS = 1e-5

/** Epsilon used during determination of near zero areas.
 * @default
 */
const angleEPS = 0.10

/** Epsilon used during determination of near zero areas.
 *  This is the minimal area of a minimal polygon.
 * @default
 */
const areaEPS = 0.50 * EPS * EPS * Math.sin(angleEPS)

const all = 0
const top = 1
const bottom = 2
const left = 3
const right = 4
const front = 5
const back = 6
// Tag factory: we can request a unique tag through CSG.getTag()
let staticTag = 1
const getTag = () => staticTag++

module.exports = {
  _CSGDEBUG,
  defaultResolution2D,
  defaultResolution3D,
  EPS,
  angleEPS,
  areaEPS,
  all,
  top,
  bottom,
  left,
  right,
  front,
  back,
  staticTag,
  getTag
}

},{}],23:[function(require,module,exports){
const Vector2D = require('./Vector2')
const {solve2Linear} = require('../utils')

/**  class Line2D
 * Represents a directional line in 2D space
 * A line is parametrized by its normal vector (perpendicular to the line, rotated 90 degrees counter clockwise)
 * and w. The line passes through the point <normal>.times(w).
 * Equation: p is on line if normal.dot(p)==w
 * @param {Vector2D} normal normal must be a unit vector!
 * @returns {Line2D}
*/
const Line2D = function (normal, w) {
  normal = new Vector2D(normal)
  w = parseFloat(w)
  let l = normal.length()
    // normalize:
  w *= l
  normal = normal.times(1.0 / l)
  this.normal = normal
  this.w = w
}

Line2D.fromPoints = function (p1, p2) {
  p1 = new Vector2D(p1)
  p2 = new Vector2D(p2)
  let direction = p2.minus(p1)
  let normal = direction.normal().negated().unit()
  let w = p1.dot(normal)
  return new Line2D(normal, w)
}

Line2D.prototype = {
    // same line but opposite direction:
  reverse: function () {
    return new Line2D(this.normal.negated(), -this.w)
  },

  equals: function (l) {
    return (l.normal.equals(this.normal) && (l.w === this.w))
  },

  origin: function () {
    return this.normal.times(this.w)
  },

  direction: function () {
    return this.normal.normal()
  },

  xAtY: function (y) {
        // (py == y) && (normal * p == w)
        // -> px = (w - normal._y * y) / normal.x
    let x = (this.w - this.normal._y * y) / this.normal.x
    return x
  },

  absDistanceToPoint: function (point) {
    point = new Vector2D(point)
    let pointProjected = point.dot(this.normal)
    let distance = Math.abs(pointProjected - this.w)
    return distance
  },
    /* FIXME: has error - origin is not defined, the method is never used
     closestPoint: function(point) {
         point = new Vector2D(point);
         let vector = point.dot(this.direction());
         return origin.plus(vector);
     },
     */

    // intersection between two lines, returns point as Vector2D
  intersectWithLine: function (line2d) {
    let point = solve2Linear(this.normal.x, this.normal.y, line2d.normal.x, line2d.normal.y, this.w, line2d.w)
    point = new Vector2D(point) // make  vector2d
    return point
  },

  transform: function (matrix4x4) {
    let origin = new Vector2D(0, 0)
    let pointOnPlane = this.normal.times(this.w)
    let neworigin = origin.multiply4x4(matrix4x4)
    let neworiginPlusNormal = this.normal.multiply4x4(matrix4x4)
    let newnormal = neworiginPlusNormal.minus(neworigin)
    let newpointOnPlane = pointOnPlane.multiply4x4(matrix4x4)
    let neww = newnormal.dot(newpointOnPlane)
    return new Line2D(newnormal, neww)
  }
}

module.exports = Line2D

},{"../utils":40,"./Vector2":32}],24:[function(require,module,exports){
const Vector3D = require('./Vector3')
const {EPS} = require('../constants')
const {solve2Linear} = require('../utils')

// # class Line3D
// Represents a line in 3D space
// direction must be a unit vector
// point is a random point on the line
const Line3D = function (point, direction) {
  point = new Vector3D(point)
  direction = new Vector3D(direction)
  this.point = point
  this.direction = direction.unit()
}

Line3D.fromPoints = function (p1, p2) {
  p1 = new Vector3D(p1)
  p2 = new Vector3D(p2)
  let direction = p2.minus(p1)
  return new Line3D(p1, direction)
}

Line3D.fromPlanes = function (p1, p2) {
  let direction = p1.normal.cross(p2.normal)
  let l = direction.length()
  if (l < EPS) {
    throw new Error('Parallel planes')
  }
  direction = direction.times(1.0 / l)

  let mabsx = Math.abs(direction.x)
  let mabsy = Math.abs(direction.y)
  let mabsz = Math.abs(direction.z)
  let origin
  if ((mabsx >= mabsy) && (mabsx >= mabsz)) {
        // direction vector is mostly pointing towards x
        // find a point p for which x is zero:
    let r = solve2Linear(p1.normal.y, p1.normal.z, p2.normal.y, p2.normal.z, p1.w, p2.w)
    origin = new Vector3D(0, r[0], r[1])
  } else if ((mabsy >= mabsx) && (mabsy >= mabsz)) {
        // find a point p for which y is zero:
    let r = solve2Linear(p1.normal.x, p1.normal.z, p2.normal.x, p2.normal.z, p1.w, p2.w)
    origin = new Vector3D(r[0], 0, r[1])
  } else {
        // find a point p for which z is zero:
    let r = solve2Linear(p1.normal.x, p1.normal.y, p2.normal.x, p2.normal.y, p1.w, p2.w)
    origin = new Vector3D(r[0], r[1], 0)
  }
  return new Line3D(origin, direction)
}

Line3D.prototype = {
  intersectWithPlane: function (plane) {
        // plane: plane.normal * p = plane.w
        // line: p=line.point + labda * line.direction
    let labda = (plane.w - plane.normal.dot(this.point)) / plane.normal.dot(this.direction)
    let point = this.point.plus(this.direction.times(labda))
    return point
  },

  clone: function (line) {
    return new Line3D(this.point.clone(), this.direction.clone())
  },

  reverse: function () {
    return new Line3D(this.point.clone(), this.direction.negated())
  },

  transform: function (matrix4x4) {
    let newpoint = this.point.multiply4x4(matrix4x4)
    let pointPlusDirection = this.point.plus(this.direction)
    let newPointPlusDirection = pointPlusDirection.multiply4x4(matrix4x4)
    let newdirection = newPointPlusDirection.minus(newpoint)
    return new Line3D(newpoint, newdirection)
  },

  closestPointOnLine: function (point) {
    point = new Vector3D(point)
    let t = point.minus(this.point).dot(this.direction) / this.direction.dot(this.direction)
    let closestpoint = this.point.plus(this.direction.times(t))
    return closestpoint
  },

  distanceToPoint: function (point) {
    point = new Vector3D(point)
    let closestpoint = this.closestPointOnLine(point)
    let distancevector = point.minus(closestpoint)
    let distance = distancevector.length()
    return distance
  },

  equals: function (line3d) {
    if (!this.direction.equals(line3d.direction)) return false
    let distance = this.distanceToPoint(line3d.point)
    if (distance > EPS) return false
    return true
  }
}

module.exports = Line3D

},{"../constants":22,"../utils":40,"./Vector3":33}],25:[function(require,module,exports){
const Vector3D = require('./Vector3')
const Vector2D = require('./Vector2')
const OrthoNormalBasis = require('./OrthoNormalBasis')
const Plane = require('./Plane')

// # class Matrix4x4:
// Represents a 4x4 matrix. Elements are specified in row order
const Matrix4x4 = function (elements) {
  if (arguments.length >= 1) {
    this.elements = elements
  } else {
        // if no arguments passed: create unity matrix
    this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  }
}

Matrix4x4.prototype = {
  plus: function (m) {
    var r = []
    for (var i = 0; i < 16; i++) {
      r[i] = this.elements[i] + m.elements[i]
    }
    return new Matrix4x4(r)
  },

  minus: function (m) {
    var r = []
    for (var i = 0; i < 16; i++) {
      r[i] = this.elements[i] - m.elements[i]
    }
    return new Matrix4x4(r)
  },

    // right multiply by another 4x4 matrix:
  multiply: function (m) {
        // cache elements in local variables, for speedup:
    var this0 = this.elements[0]
    var this1 = this.elements[1]
    var this2 = this.elements[2]
    var this3 = this.elements[3]
    var this4 = this.elements[4]
    var this5 = this.elements[5]
    var this6 = this.elements[6]
    var this7 = this.elements[7]
    var this8 = this.elements[8]
    var this9 = this.elements[9]
    var this10 = this.elements[10]
    var this11 = this.elements[11]
    var this12 = this.elements[12]
    var this13 = this.elements[13]
    var this14 = this.elements[14]
    var this15 = this.elements[15]
    var m0 = m.elements[0]
    var m1 = m.elements[1]
    var m2 = m.elements[2]
    var m3 = m.elements[3]
    var m4 = m.elements[4]
    var m5 = m.elements[5]
    var m6 = m.elements[6]
    var m7 = m.elements[7]
    var m8 = m.elements[8]
    var m9 = m.elements[9]
    var m10 = m.elements[10]
    var m11 = m.elements[11]
    var m12 = m.elements[12]
    var m13 = m.elements[13]
    var m14 = m.elements[14]
    var m15 = m.elements[15]

    var result = []
    result[0] = this0 * m0 + this1 * m4 + this2 * m8 + this3 * m12
    result[1] = this0 * m1 + this1 * m5 + this2 * m9 + this3 * m13
    result[2] = this0 * m2 + this1 * m6 + this2 * m10 + this3 * m14
    result[3] = this0 * m3 + this1 * m7 + this2 * m11 + this3 * m15
    result[4] = this4 * m0 + this5 * m4 + this6 * m8 + this7 * m12
    result[5] = this4 * m1 + this5 * m5 + this6 * m9 + this7 * m13
    result[6] = this4 * m2 + this5 * m6 + this6 * m10 + this7 * m14
    result[7] = this4 * m3 + this5 * m7 + this6 * m11 + this7 * m15
    result[8] = this8 * m0 + this9 * m4 + this10 * m8 + this11 * m12
    result[9] = this8 * m1 + this9 * m5 + this10 * m9 + this11 * m13
    result[10] = this8 * m2 + this9 * m6 + this10 * m10 + this11 * m14
    result[11] = this8 * m3 + this9 * m7 + this10 * m11 + this11 * m15
    result[12] = this12 * m0 + this13 * m4 + this14 * m8 + this15 * m12
    result[13] = this12 * m1 + this13 * m5 + this14 * m9 + this15 * m13
    result[14] = this12 * m2 + this13 * m6 + this14 * m10 + this15 * m14
    result[15] = this12 * m3 + this13 * m7 + this14 * m11 + this15 * m15
    return new Matrix4x4(result)
  },

  clone: function () {
    var elements = this.elements.map(function (p) {
      return p
    })
    return new Matrix4x4(elements)
  },

    // Right multiply the matrix by a Vector3D (interpreted as 3 row, 1 column)
    // (result = M*v)
    // Fourth element is taken as 1
  rightMultiply1x3Vector: function (v) {
    var v0 = v._x
    var v1 = v._y
    var v2 = v._z
    var v3 = 1
    var x = v0 * this.elements[0] + v1 * this.elements[1] + v2 * this.elements[2] + v3 * this.elements[3]
    var y = v0 * this.elements[4] + v1 * this.elements[5] + v2 * this.elements[6] + v3 * this.elements[7]
    var z = v0 * this.elements[8] + v1 * this.elements[9] + v2 * this.elements[10] + v3 * this.elements[11]
    var w = v0 * this.elements[12] + v1 * this.elements[13] + v2 * this.elements[14] + v3 * this.elements[15]
        // scale such that fourth element becomes 1:
    if (w !== 1) {
      var invw = 1.0 / w
      x *= invw
      y *= invw
      z *= invw
    }
    return new Vector3D(x, y, z)
  },

    // Multiply a Vector3D (interpreted as 3 column, 1 row) by this matrix
    // (result = v*M)
    // Fourth element is taken as 1
  leftMultiply1x3Vector: function (v) {
    var v0 = v._x
    var v1 = v._y
    var v2 = v._z
    var v3 = 1
    var x = v0 * this.elements[0] + v1 * this.elements[4] + v2 * this.elements[8] + v3 * this.elements[12]
    var y = v0 * this.elements[1] + v1 * this.elements[5] + v2 * this.elements[9] + v3 * this.elements[13]
    var z = v0 * this.elements[2] + v1 * this.elements[6] + v2 * this.elements[10] + v3 * this.elements[14]
    var w = v0 * this.elements[3] + v1 * this.elements[7] + v2 * this.elements[11] + v3 * this.elements[15]
        // scale such that fourth element becomes 1:
    if (w !== 1) {
      var invw = 1.0 / w
      x *= invw
      y *= invw
      z *= invw
    }
    return new Vector3D(x, y, z)
  },

    // Right multiply the matrix by a Vector2D (interpreted as 2 row, 1 column)
    // (result = M*v)
    // Fourth element is taken as 1
  rightMultiply1x2Vector: function (v) {
    var v0 = v.x
    var v1 = v.y
    var v2 = 0
    var v3 = 1
    var x = v0 * this.elements[0] + v1 * this.elements[1] + v2 * this.elements[2] + v3 * this.elements[3]
    var y = v0 * this.elements[4] + v1 * this.elements[5] + v2 * this.elements[6] + v3 * this.elements[7]
    var z = v0 * this.elements[8] + v1 * this.elements[9] + v2 * this.elements[10] + v3 * this.elements[11]
    var w = v0 * this.elements[12] + v1 * this.elements[13] + v2 * this.elements[14] + v3 * this.elements[15]
        // scale such that fourth element becomes 1:
    if (w !== 1) {
      var invw = 1.0 / w
      x *= invw
      y *= invw
      z *= invw
    }
    return new Vector2D(x, y)
  },

    // Multiply a Vector2D (interpreted as 2 column, 1 row) by this matrix
    // (result = v*M)
    // Fourth element is taken as 1
  leftMultiply1x2Vector: function (v) {
    var v0 = v.x
    var v1 = v.y
    var v2 = 0
    var v3 = 1
    var x = v0 * this.elements[0] + v1 * this.elements[4] + v2 * this.elements[8] + v3 * this.elements[12]
    var y = v0 * this.elements[1] + v1 * this.elements[5] + v2 * this.elements[9] + v3 * this.elements[13]
    var z = v0 * this.elements[2] + v1 * this.elements[6] + v2 * this.elements[10] + v3 * this.elements[14]
    var w = v0 * this.elements[3] + v1 * this.elements[7] + v2 * this.elements[11] + v3 * this.elements[15]
        // scale such that fourth element becomes 1:
    if (w !== 1) {
      var invw = 1.0 / w
      x *= invw
      y *= invw
      z *= invw
    }
    return new Vector2D(x, y)
  },

    // determine whether this matrix is a mirroring transformation
  isMirroring: function () {
    var u = new Vector3D(this.elements[0], this.elements[4], this.elements[8])
    var v = new Vector3D(this.elements[1], this.elements[5], this.elements[9])
    var w = new Vector3D(this.elements[2], this.elements[6], this.elements[10])

        // for a true orthogonal, non-mirrored base, u.cross(v) == w
        // If they have an opposite direction then we are mirroring
    var mirrorvalue = u.cross(v).dot(w)
    var ismirror = (mirrorvalue < 0)
    return ismirror
  }
}

// return the unity matrix
Matrix4x4.unity = function () {
  return new Matrix4x4()
}

// Create a rotation matrix for rotating around the x axis
Matrix4x4.rotationX = function (degrees) {
  var radians = degrees * Math.PI * (1.0 / 180.0)
  var cos = Math.cos(radians)
  var sin = Math.sin(radians)
  var els = [
    1, 0, 0, 0, 0, cos, sin, 0, 0, -sin, cos, 0, 0, 0, 0, 1
  ]
  return new Matrix4x4(els)
}

// Create a rotation matrix for rotating around the y axis
Matrix4x4.rotationY = function (degrees) {
  var radians = degrees * Math.PI * (1.0 / 180.0)
  var cos = Math.cos(radians)
  var sin = Math.sin(radians)
  var els = [
    cos, 0, -sin, 0, 0, 1, 0, 0, sin, 0, cos, 0, 0, 0, 0, 1
  ]
  return new Matrix4x4(els)
}

// Create a rotation matrix for rotating around the z axis
Matrix4x4.rotationZ = function (degrees) {
  var radians = degrees * Math.PI * (1.0 / 180.0)
  var cos = Math.cos(radians)
  var sin = Math.sin(radians)
  var els = [
    cos, sin, 0, 0, -sin, cos, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1
  ]
  return new Matrix4x4(els)
}

// Matrix for rotation about arbitrary point and axis
Matrix4x4.rotation = function (rotationCenter, rotationAxis, degrees) {
  rotationCenter = new Vector3D(rotationCenter)
  rotationAxis = new Vector3D(rotationAxis)
  var rotationPlane = Plane.fromNormalAndPoint(rotationAxis, rotationCenter)
  var orthobasis = new OrthoNormalBasis(rotationPlane)
  var transformation = Matrix4x4.translation(rotationCenter.negated())
  transformation = transformation.multiply(orthobasis.getProjectionMatrix())
  transformation = transformation.multiply(Matrix4x4.rotationZ(degrees))
  transformation = transformation.multiply(orthobasis.getInverseProjectionMatrix())
  transformation = transformation.multiply(Matrix4x4.translation(rotationCenter))
  return transformation
}

// Create an affine matrix for translation:
Matrix4x4.translation = function (v) {
    // parse as Vector3D, so we can pass an array or a Vector3D
  var vec = new Vector3D(v)
  var els = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec.x, vec.y, vec.z, 1]
  return new Matrix4x4(els)
}

// Create an affine matrix for mirroring into an arbitrary plane:
Matrix4x4.mirroring = function (plane) {
  var nx = plane.normal.x
  var ny = plane.normal.y
  var nz = plane.normal.z
  var w = plane.w
  var els = [
        (1.0 - 2.0 * nx * nx), (-2.0 * ny * nx), (-2.0 * nz * nx), 0,
        (-2.0 * nx * ny), (1.0 - 2.0 * ny * ny), (-2.0 * nz * ny), 0,
        (-2.0 * nx * nz), (-2.0 * ny * nz), (1.0 - 2.0 * nz * nz), 0,
        (2.0 * nx * w), (2.0 * ny * w), (2.0 * nz * w), 1
  ]
  return new Matrix4x4(els)
}

// Create an affine matrix for scaling:
Matrix4x4.scaling = function (v) {
    // parse as Vector3D, so we can pass an array or a Vector3D
  var vec = new Vector3D(v)
  var els = [
    vec.x, 0, 0, 0, 0, vec.y, 0, 0, 0, 0, vec.z, 0, 0, 0, 0, 1
  ]
  return new Matrix4x4(els)
}

module.exports = Matrix4x4

},{"./OrthoNormalBasis":26,"./Plane":28,"./Vector2":32,"./Vector3":33}],26:[function(require,module,exports){
const Vector2D = require('./Vector2')
const Vector3D = require('./Vector3')
const Line2D = require('./Line2')
const Line3D = require('./Line3')
const Plane = require('./Plane')

/** class OrthoNormalBasis
 * Reprojects points on a 3D plane onto a 2D plane
 * or from a 2D plane back onto the 3D plane
 * @param  {Plane} plane
 * @param  {Vector3D|Vector2D} rightvector
 */
const OrthoNormalBasis = function (plane, rightvector) {
  if (arguments.length < 2) {
    // choose an arbitrary right hand vector, making sure it is somewhat orthogonal to the plane normal:
    rightvector = plane.normal.randomNonParallelVector()
  } else {
    rightvector = new Vector3D(rightvector)
  }
  this.v = plane.normal.cross(rightvector).unit()
  this.u = this.v.cross(plane.normal)
  this.plane = plane
  this.planeorigin = plane.normal.times(plane.w)
}

// Get an orthonormal basis for the standard XYZ planes.
// Parameters: the names of two 3D axes. The 2d x axis will map to the first given 3D axis, the 2d y
// axis will map to the second.
// Prepend the axis with a "-" to invert the direction of this axis.
// For example: OrthoNormalBasis.GetCartesian("-Y","Z")
//   will return an orthonormal basis where the 2d X axis maps to the 3D inverted Y axis, and
//   the 2d Y axis maps to the 3D Z axis.
OrthoNormalBasis.GetCartesian = function (xaxisid, yaxisid) {
  let axisid = xaxisid + '/' + yaxisid
  let planenormal, rightvector
  if (axisid === 'X/Y') {
    planenormal = [0, 0, 1]
    rightvector = [1, 0, 0]
  } else if (axisid === 'Y/-X') {
    planenormal = [0, 0, 1]
    rightvector = [0, 1, 0]
  } else if (axisid === '-X/-Y') {
    planenormal = [0, 0, 1]
    rightvector = [-1, 0, 0]
  } else if (axisid === '-Y/X') {
    planenormal = [0, 0, 1]
    rightvector = [0, -1, 0]
  } else if (axisid === '-X/Y') {
    planenormal = [0, 0, -1]
    rightvector = [-1, 0, 0]
  } else if (axisid === '-Y/-X') {
    planenormal = [0, 0, -1]
    rightvector = [0, -1, 0]
  } else if (axisid === 'X/-Y') {
    planenormal = [0, 0, -1]
    rightvector = [1, 0, 0]
  } else if (axisid === 'Y/X') {
    planenormal = [0, 0, -1]
    rightvector = [0, 1, 0]
  } else if (axisid === 'X/Z') {
    planenormal = [0, -1, 0]
    rightvector = [1, 0, 0]
  } else if (axisid === 'Z/-X') {
    planenormal = [0, -1, 0]
    rightvector = [0, 0, 1]
  } else if (axisid === '-X/-Z') {
    planenormal = [0, -1, 0]
    rightvector = [-1, 0, 0]
  } else if (axisid === '-Z/X') {
    planenormal = [0, -1, 0]
    rightvector = [0, 0, -1]
  } else if (axisid === '-X/Z') {
    planenormal = [0, 1, 0]
    rightvector = [-1, 0, 0]
  } else if (axisid === '-Z/-X') {
    planenormal = [0, 1, 0]
    rightvector = [0, 0, -1]
  } else if (axisid === 'X/-Z') {
    planenormal = [0, 1, 0]
    rightvector = [1, 0, 0]
  } else if (axisid === 'Z/X') {
    planenormal = [0, 1, 0]
    rightvector = [0, 0, 1]
  } else if (axisid === 'Y/Z') {
    planenormal = [1, 0, 0]
    rightvector = [0, 1, 0]
  } else if (axisid === 'Z/-Y') {
    planenormal = [1, 0, 0]
    rightvector = [0, 0, 1]
  } else if (axisid === '-Y/-Z') {
    planenormal = [1, 0, 0]
    rightvector = [0, -1, 0]
  } else if (axisid === '-Z/Y') {
    planenormal = [1, 0, 0]
    rightvector = [0, 0, -1]
  } else if (axisid === '-Y/Z') {
    planenormal = [-1, 0, 0]
    rightvector = [0, -1, 0]
  } else if (axisid === '-Z/-Y') {
    planenormal = [-1, 0, 0]
    rightvector = [0, 0, -1]
  } else if (axisid === 'Y/-Z') {
    planenormal = [-1, 0, 0]
    rightvector = [0, 1, 0]
  } else if (axisid === 'Z/Y') {
    planenormal = [-1, 0, 0]
    rightvector = [0, 0, 1]
  } else {
    throw new Error('OrthoNormalBasis.GetCartesian: invalid combination of axis identifiers. Should pass two string arguments from [X,Y,Z,-X,-Y,-Z], being two different axes.')
  }
  return new OrthoNormalBasis(new Plane(new Vector3D(planenormal), 0), new Vector3D(rightvector))
}

/*
// test code for OrthoNormalBasis.GetCartesian()
OrthoNormalBasis.GetCartesian_Test=function() {
  let axisnames=["X","Y","Z","-X","-Y","-Z"];
  let axisvectors=[[1,0,0], [0,1,0], [0,0,1], [-1,0,0], [0,-1,0], [0,0,-1]];
  for(let axis1=0; axis1 < 3; axis1++) {
    for(let axis1inverted=0; axis1inverted < 2; axis1inverted++) {
      let axis1name=axisnames[axis1+3*axis1inverted];
      let axis1vector=axisvectors[axis1+3*axis1inverted];
      for(let axis2=0; axis2 < 3; axis2++) {
        if(axis2 != axis1) {
          for(let axis2inverted=0; axis2inverted < 2; axis2inverted++) {
            let axis2name=axisnames[axis2+3*axis2inverted];
            let axis2vector=axisvectors[axis2+3*axis2inverted];
            let orthobasis=OrthoNormalBasis.GetCartesian(axis1name, axis2name);
            let test1=orthobasis.to3D(new Vector2D([1,0]));
            let test2=orthobasis.to3D(new Vector2D([0,1]));
            let expected1=new Vector3D(axis1vector);
            let expected2=new Vector3D(axis2vector);
            let d1=test1.distanceTo(expected1);
            let d2=test2.distanceTo(expected2);
            if( (d1 > 0.01) || (d2 > 0.01) ) {
              throw new Error("Wrong!");
  }}}}}}
  throw new Error("OK");
};
*/

// The z=0 plane, with the 3D x and y vectors mapped to the 2D x and y vector
OrthoNormalBasis.Z0Plane = function () {
  let plane = new Plane(new Vector3D([0, 0, 1]), 0)
  return new OrthoNormalBasis(plane, new Vector3D([1, 0, 0]))
}

OrthoNormalBasis.prototype = {
  getProjectionMatrix: function () {
    const Matrix4x4 = require('./Matrix4') // FIXME: circular dependencies Matrix=>OrthoNormalBasis => Matrix
    return new Matrix4x4([
      this.u.x, this.v.x, this.plane.normal.x, 0,
      this.u.y, this.v.y, this.plane.normal.y, 0,
      this.u.z, this.v.z, this.plane.normal.z, 0,
      0, 0, -this.plane.w, 1
    ])
  },

  getInverseProjectionMatrix: function () {
    const Matrix4x4 = require('./Matrix4') // FIXME: circular dependencies Matrix=>OrthoNormalBasis => Matrix
    let p = this.plane.normal.times(this.plane.w)
    return new Matrix4x4([
      this.u.x, this.u.y, this.u.z, 0,
      this.v.x, this.v.y, this.v.z, 0,
      this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, 0,
      p.x, p.y, p.z, 1
    ])
  },

  to2D: function (vec3) {
    return new Vector2D(vec3.dot(this.u), vec3.dot(this.v))
  },

  to3D: function (vec2) {
    return this.planeorigin.plus(this.u.times(vec2.x)).plus(this.v.times(vec2.y))
  },

  line3Dto2D: function (line3d) {
    let a = line3d.point
    let b = line3d.direction.plus(a)
    let a2d = this.to2D(a)
    let b2d = this.to2D(b)
    return Line2D.fromPoints(a2d, b2d)
  },

  line2Dto3D: function (line2d) {
    let a = line2d.origin()
    let b = line2d.direction().plus(a)
    let a3d = this.to3D(a)
    let b3d = this.to3D(b)
    return Line3D.fromPoints(a3d, b3d)
  },

  transform: function (matrix4x4) {
    // todo: this may not work properly in case of mirroring
    let newplane = this.plane.transform(matrix4x4)
    let rightpointTransformed = this.u.transform(matrix4x4)
    let originTransformed = new Vector3D(0, 0, 0).transform(matrix4x4)
    let newrighthandvector = rightpointTransformed.minus(originTransformed)
    let newbasis = new OrthoNormalBasis(newplane, newrighthandvector)
    return newbasis
  }
}

module.exports = OrthoNormalBasis

},{"./Line2":23,"./Line3":24,"./Matrix4":25,"./Plane":28,"./Vector2":32,"./Vector3":33}],27:[function(require,module,exports){
const Vector2D = require('./Vector2')
const {EPS, angleEPS} = require('../constants')
const {parseOptionAs2DVector, parseOptionAsFloat, parseOptionAsInt, parseOptionAsBool} = require('../../api/optionParsers')
const {defaultResolution2D} = require('../constants')
const Vertex = require('./Vertex2')
const Side = require('./Side')

/** Class Path2D
 * Represents a series of points, connected by infinitely thin lines.
 * A path can be open or closed, i.e. additional line between first and last points.
 * The difference between Path2D and CAG is that a path is a 'thin' line, whereas a CAG is an enclosed area.
 * @constructor
 * @param {Vector2D[]} [points=[]] - list of points
 * @param {boolean} [closed=false] - closer of path
 *
 * @example
 * new CSG.Path2D()
 * new CSG.Path2D([[10,10], [-10,10], [-10,-10], [10,-10]], true) // closed
 */
const Path2D = function (points, closed) {
  closed = !!closed
  points = points || []
    // re-parse the points into Vector2D
    // and remove any duplicate points
  let prevpoint = null
  if (closed && (points.length > 0)) {
    prevpoint = new Vector2D(points[points.length - 1])
  }
  let newpoints = []
  points.map(function (point) {
    point = new Vector2D(point)
    let skip = false
    if (prevpoint !== null) {
      let distance = point.distanceTo(prevpoint)
      skip = distance < EPS
    }
    if (!skip) newpoints.push(point)
    prevpoint = point
  })
  this.points = newpoints
  this.closed = closed
}

/** Construct an arc.
 * @param {Object} [options] - options for construction
 * @param {Vector2D} [options.center=[0,0]] - center of circle
 * @param {Number} [options.radius=1] - radius of circle
 * @param {Number} [options.startangle=0] - starting angle of the arc, in degrees
 * @param {Number} [options.endangle=360] - ending angle of the arc, in degrees
 * @param {Number} [options.resolution=defaultResolution2D] - number of sides per 360 rotation
 * @param {Boolean} [options.maketangent=false] - adds line segments at both ends of the arc to ensure that the gradients at the edges are tangent
 * @returns {Path2D} new Path2D object (not closed)
 *
 * @example
 * let path = CSG.Path2D.arc({
 *   center: [5, 5],
 *   radius: 10,
 *   startangle: 90,
 *   endangle: 180,
 *   resolution: 36,
 *   maketangent: true
 * });
 */
Path2D.arc = function (options) {
  let center = parseOptionAs2DVector(options, 'center', 0)
  let radius = parseOptionAsFloat(options, 'radius', 1)
  let startangle = parseOptionAsFloat(options, 'startangle', 0)
  let endangle = parseOptionAsFloat(options, 'endangle', 360)
  let resolution = parseOptionAsInt(options, 'resolution', defaultResolution2D)
  let maketangent = parseOptionAsBool(options, 'maketangent', false)
    // no need to make multiple turns:
  while (endangle - startangle >= 720) {
    endangle -= 360
  }
  while (endangle - startangle <= -720) {
    endangle += 360
  }
  let points = []
  let point
  let absangledif = Math.abs(endangle - startangle)
  if (absangledif < angleEPS) {
    point = Vector2D.fromAngle(startangle / 180.0 * Math.PI).times(radius)
    points.push(point.plus(center))
  } else {
    let numsteps = Math.floor(resolution * absangledif / 360) + 1
    let edgestepsize = numsteps * 0.5 / absangledif // step size for half a degree
    if (edgestepsize > 0.25) edgestepsize = 0.25
    let numstepsMod = maketangent ? (numsteps + 2) : numsteps
    for (let i = 0; i <= numstepsMod; i++) {
      let step = i
      if (maketangent) {
        step = (i - 1) * (numsteps - 2 * edgestepsize) / numsteps + edgestepsize
        if (step < 0) step = 0
        if (step > numsteps) step = numsteps
      }
      let angle = startangle + step * (endangle - startangle) / numsteps
      point = Vector2D.fromAngle(angle / 180.0 * Math.PI).times(radius)
      points.push(point.plus(center))
    }
  }
  return new Path2D(points, false)
}

Path2D.prototype = {
  concat: function (otherpath) {
    if (this.closed || otherpath.closed) {
      throw new Error('Paths must not be closed')
    }
    let newpoints = this.points.concat(otherpath.points)
    return new Path2D(newpoints)
  },

  /**
   * Get the points that make up the path.
   * note that this is current internal list of points, not an immutable copy.
   * @returns {Vector2[]} array of points the make up the path
   */
  getPoints: function () {
    return this.points
  },

  /**
   * Append an point to the end of the path.
   * @param {Vector2D} point - point to append
   * @returns {Path2D} new Path2D object (not closed)
   */
  appendPoint: function (point) {
    if (this.closed) {
      throw new Error('Path must not be closed')
    }
    point = new Vector2D(point) // cast to Vector2D
    let newpoints = this.points.concat([point])
    return new Path2D(newpoints)
  },

  /**
   * Append a list of points to the end of the path.
   * @param {Vector2D[]} points - points to append
   * @returns {Path2D} new Path2D object (not closed)
   */
  appendPoints: function (points) {
    if (this.closed) {
      throw new Error('Path must not be closed')
    }
    let newpoints = this.points
    points.forEach(function (point) {
      newpoints.push(new Vector2D(point)) // cast to Vector2D
    })
    return new Path2D(newpoints)
  },

  close: function () {
    return new Path2D(this.points, true)
  },

  /**
   * Determine if the path is a closed or not.
   * @returns {Boolean} true when the path is closed, otherwise false
   */
  isClosed: function () {
    return this.closed
  },

    // Extrude the path by following it with a rectangle (upright, perpendicular to the path direction)
    // Returns a CSG solid
    //   width: width of the extrusion, in the z=0 plane
    //   height: height of the extrusion in the z direction
    //   resolution: number of segments per 360 degrees for the curve in a corner
  rectangularExtrude: function (width, height, resolution) {
    let cag = this.expandToCAG(width / 2, resolution)
    let result = cag.extrude({
      offset: [0, 0, height]
    })
    return result
  },

    // Expand the path to a CAG
    // This traces the path with a circle with radius pathradius
  expandToCAG: function (pathradius, resolution) {
    const CAG = require('../CAG') // FIXME: cyclic dependencies CAG => PATH2 => CAG
    let sides = []
    let numpoints = this.points.length
    let startindex = 0
    if (this.closed && (numpoints > 2)) startindex = -1
    let prevvertex
    for (let i = startindex; i < numpoints; i++) {
      let pointindex = i
      if (pointindex < 0) pointindex = numpoints - 1
      let point = this.points[pointindex]
      let vertex = new Vertex(point)
      if (i > startindex) {
        let side = new Side(prevvertex, vertex)
        sides.push(side)
      }
      prevvertex = vertex
    }
    let shellcag = CAG.fromSides(sides)
    let expanded = shellcag.expandedShell(pathradius, resolution)
    return expanded
  },

  innerToCAG: function () {
    const CAG = require('../CAG') // FIXME: cyclic dependencies CAG => PATH2 => CAG
    if (!this.closed) throw new Error('The path should be closed!')
    return CAG.fromPoints(this.points)
  },

  transform: function (matrix4x4) {
    let newpoints = this.points.map(function (point) {
      return point.multiply4x4(matrix4x4)
    })
    return new Path2D(newpoints, this.closed)
  },

  /**
   * Append a Bezier curve to the end of the path, using the control points to transition the curve through start and end points.
   * <br>
   * The Bézier curve starts at the last point in the path,
   * and ends at the last given control point. Other control points are intermediate control points.
   * <br>
   * The first control point may be null to ensure a smooth transition occurs. In this case,
   * the second to last control point of the path is mirrored into the control points of the Bezier curve.
   * In other words, the trailing gradient of the path matches the new gradient of the curve.
   * @param {Vector2D[]} controlpoints - list of control points
   * @param {Object} [options] - options for construction
   * @param {Number} [options.resolution=defaultResolution2D] - number of sides per 360 rotation
   * @returns {Path2D} new Path2D object (not closed)
   *
   * @example
   * let p5 = new CSG.Path2D([[10,-20]],false);
   * p5 = p5.appendBezier([[10,-10],[25,-10],[25,-20]]);
   * p5 = p5.appendBezier([[25,-30],[40,-30],[40,-20]]);
   */
  appendBezier: function (controlpoints, options) {
    if (arguments.length < 2) {
      options = {}
    }
    if (this.closed) {
      throw new Error('Path must not be closed')
    }
    if (!(controlpoints instanceof Array)) {
      throw new Error('appendBezier: should pass an array of control points')
    }
    if (controlpoints.length < 1) {
      throw new Error('appendBezier: need at least 1 control point')
    }
    if (this.points.length < 1) {
      throw new Error('appendBezier: path must already contain a point (the endpoint of the path is used as the starting point for the bezier curve)')
    }
    let resolution = parseOptionAsInt(options, 'resolution', defaultResolution2D)
    if (resolution < 4) resolution = 4
    let factorials = []
    let controlpointsParsed = []
    controlpointsParsed.push(this.points[this.points.length - 1]) // start at the previous end point
    for (let i = 0; i < controlpoints.length; ++i) {
      let p = controlpoints[i]
      if (p === null) {
                // we can pass null as the first control point. In that case a smooth gradient is ensured:
        if (i !== 0) {
          throw new Error('appendBezier: null can only be passed as the first control point')
        }
        if (controlpoints.length < 2) {
          throw new Error('appendBezier: null can only be passed if there is at least one more control point')
        }
        let lastBezierControlPoint
        if ('lastBezierControlPoint' in this) {
          lastBezierControlPoint = this.lastBezierControlPoint
        } else {
          if (this.points.length < 2) {
            throw new Error('appendBezier: null is passed as a control point but this requires a previous bezier curve or at least two points in the existing path')
          }
          lastBezierControlPoint = this.points[this.points.length - 2]
        }
                // mirror the last bezier control point:
        p = this.points[this.points.length - 1].times(2).minus(lastBezierControlPoint)
      } else {
        p = new Vector2D(p) // cast to Vector2D
      }
      controlpointsParsed.push(p)
    }
    let bezierOrder = controlpointsParsed.length - 1
    let fact = 1
    for (let i = 0; i <= bezierOrder; ++i) {
      if (i > 0) fact *= i
      factorials.push(fact)
    }
    let binomials = []
    for (let i = 0; i <= bezierOrder; ++i) {
      let binomial = factorials[bezierOrder] / (factorials[i] * factorials[bezierOrder - i])
      binomials.push(binomial)
    }
    let getPointForT = function (t) {
      let t_k = 1 // = pow(t,k)
      let one_minus_t_n_minus_k = Math.pow(1 - t, bezierOrder) // = pow( 1-t, bezierOrder - k)
      let inv_1_minus_t = (t !== 1) ? (1 / (1 - t)) : 1
      let point = new Vector2D(0, 0)
      for (let k = 0; k <= bezierOrder; ++k) {
        if (k === bezierOrder) one_minus_t_n_minus_k = 1
        let bernstein_coefficient = binomials[k] * t_k * one_minus_t_n_minus_k
        point = point.plus(controlpointsParsed[k].times(bernstein_coefficient))
        t_k *= t
        one_minus_t_n_minus_k *= inv_1_minus_t
      }
      return point
    }
    let newpoints = []
    let newpoints_t = []
    let numsteps = bezierOrder + 1
    for (let i = 0; i < numsteps; ++i) {
      let t = i / (numsteps - 1)
      let point = getPointForT(t)
      newpoints.push(point)
      newpoints_t.push(t)
    }
    // subdivide each segment until the angle at each vertex becomes small enough:
    let subdivideBase = 1
    let maxangle = Math.PI * 2 / resolution // segments may have differ no more in angle than this
    let maxsinangle = Math.sin(maxangle)
    while (subdivideBase < newpoints.length - 1) {
      let dir1 = newpoints[subdivideBase].minus(newpoints[subdivideBase - 1]).unit()
      let dir2 = newpoints[subdivideBase + 1].minus(newpoints[subdivideBase]).unit()
      let sinangle = dir1.cross(dir2) // this is the sine of the angle
      if (Math.abs(sinangle) > maxsinangle) {
                // angle is too big, we need to subdivide
        let t0 = newpoints_t[subdivideBase - 1]
        let t1 = newpoints_t[subdivideBase + 1]
        let t0_new = t0 + (t1 - t0) * 1 / 3
        let t1_new = t0 + (t1 - t0) * 2 / 3
        let point0_new = getPointForT(t0_new)
        let point1_new = getPointForT(t1_new)
                // remove the point at subdivideBase and replace with 2 new points:
        newpoints.splice(subdivideBase, 1, point0_new, point1_new)
        newpoints_t.splice(subdivideBase, 1, t0_new, t1_new)
                // re - evaluate the angles, starting at the previous junction since it has changed:
        subdivideBase--
        if (subdivideBase < 1) subdivideBase = 1
      } else {
        ++subdivideBase
      }
    }
        // append to the previous points, but skip the first new point because it is identical to the last point:
    newpoints = this.points.concat(newpoints.slice(1))
    let result = new Path2D(newpoints)
    result.lastBezierControlPoint = controlpointsParsed[controlpointsParsed.length - 2]
    return result
  },

  /**
   * Append an arc to the end of the path.
   * This implementation follows the SVG arc specs. For the details see
   * http://www.w3.org/TR/SVG/paths.html#PathDataEllipticalArcCommands
   * @param {Vector2D} endpoint - end point of arc
   * @param {Object} [options] - options for construction
   * @param {Number} [options.radius=0] - radius of arc (X and Y), see also xradius and yradius
   * @param {Number} [options.xradius=0] - X radius of arc, see also radius
   * @param {Number} [options.yradius=0] - Y radius of arc, see also radius
   * @param {Number} [options.xaxisrotation=0] -  rotation (in degrees) of the X axis of the arc with respect to the X axis of the coordinate system
   * @param {Number} [options.resolution=defaultResolution2D] - number of sides per 360 rotation
   * @param {Boolean} [options.clockwise=false] - draw an arc clockwise with respect to the center point
   * @param {Boolean} [options.large=false] - draw an arc longer than 180 degrees
   * @returns {Path2D} new Path2D object (not closed)
   *
   * @example
   * let p1 = new CSG.Path2D([[27.5,-22.96875]],false);
   * p1 = p1.appendPoint([27.5,-3.28125]);
   * p1 = p1.appendArc([12.5,-22.96875],{xradius: 15,yradius: -19.6875,xaxisrotation: 0,clockwise: false,large: false});
   * p1 = p1.close();
   */
  appendArc: function (endpoint, options) {
    let decimals = 100000
    if (arguments.length < 2) {
      options = {}
    }
    if (this.closed) {
      throw new Error('Path must not be closed')
    }
    if (this.points.length < 1) {
      throw new Error('appendArc: path must already contain a point (the endpoint of the path is used as the starting point for the arc)')
    }
    let resolution = parseOptionAsInt(options, 'resolution', defaultResolution2D)
    if (resolution < 4) resolution = 4
    let xradius, yradius
    if (('xradius' in options) || ('yradius' in options)) {
      if ('radius' in options) {
        throw new Error('Should either give an xradius and yradius parameter, or a radius parameter')
      }
      xradius = parseOptionAsFloat(options, 'xradius', 0)
      yradius = parseOptionAsFloat(options, 'yradius', 0)
    } else {
      xradius = parseOptionAsFloat(options, 'radius', 0)
      yradius = xradius
    }
    let xaxisrotation = parseOptionAsFloat(options, 'xaxisrotation', 0)
    let clockwise = parseOptionAsBool(options, 'clockwise', false)
    let largearc = parseOptionAsBool(options, 'large', false)
    let startpoint = this.points[this.points.length - 1]
    endpoint = new Vector2D(endpoint)
        // round to precision in order to have determinate calculations
    xradius = Math.round(xradius * decimals) / decimals
    yradius = Math.round(yradius * decimals) / decimals
    endpoint = new Vector2D(Math.round(endpoint.x * decimals) / decimals, Math.round(endpoint.y * decimals) / decimals)

    let sweepFlag = !clockwise
    let newpoints = []
    if ((xradius === 0) || (yradius === 0)) {
            // http://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes:
            // If rx = 0 or ry = 0, then treat this as a straight line from (x1, y1) to (x2, y2) and stop
      newpoints.push(endpoint)
    } else {
      xradius = Math.abs(xradius)
      yradius = Math.abs(yradius)

            // see http://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes :
      let phi = xaxisrotation * Math.PI / 180.0
      let cosphi = Math.cos(phi)
      let sinphi = Math.sin(phi)
      let minushalfdistance = startpoint.minus(endpoint).times(0.5)
            // F.6.5.1:
            // round to precision in order to have determinate calculations
      let x = Math.round((cosphi * minushalfdistance.x + sinphi * minushalfdistance.y) * decimals) / decimals
      let y = Math.round((-sinphi * minushalfdistance.x + cosphi * minushalfdistance.y) * decimals) / decimals
      let startTranslated = new Vector2D(x, y)
            // F.6.6.2:
      let biglambda = (startTranslated.x * startTranslated.x) / (xradius * xradius) + (startTranslated.y * startTranslated.y) / (yradius * yradius)
      if (biglambda > 1.0) {
                // F.6.6.3:
        let sqrtbiglambda = Math.sqrt(biglambda)
        xradius *= sqrtbiglambda
        yradius *= sqrtbiglambda
                // round to precision in order to have determinate calculations
        xradius = Math.round(xradius * decimals) / decimals
        yradius = Math.round(yradius * decimals) / decimals
      }
            // F.6.5.2:
      let multiplier1 = Math.sqrt((xradius * xradius * yradius * yradius - xradius * xradius * startTranslated.y * startTranslated.y - yradius * yradius * startTranslated.x * startTranslated.x) / (xradius * xradius * startTranslated.y * startTranslated.y + yradius * yradius * startTranslated.x * startTranslated.x))
      if (sweepFlag === largearc) multiplier1 = -multiplier1
      let centerTranslated = new Vector2D(xradius * startTranslated.y / yradius, -yradius * startTranslated.x / xradius).times(multiplier1)
            // F.6.5.3:
      let center = new Vector2D(cosphi * centerTranslated.x - sinphi * centerTranslated.y, sinphi * centerTranslated.x + cosphi * centerTranslated.y).plus((startpoint.plus(endpoint)).times(0.5))
            // F.6.5.5:
      let vec1 = new Vector2D((startTranslated.x - centerTranslated.x) / xradius, (startTranslated.y - centerTranslated.y) / yradius)
      let vec2 = new Vector2D((-startTranslated.x - centerTranslated.x) / xradius, (-startTranslated.y - centerTranslated.y) / yradius)
      let theta1 = vec1.angleRadians()
      let theta2 = vec2.angleRadians()
      let deltatheta = theta2 - theta1
      deltatheta = deltatheta % (2 * Math.PI)
      if ((!sweepFlag) && (deltatheta > 0)) {
        deltatheta -= 2 * Math.PI
      } else if ((sweepFlag) && (deltatheta < 0)) {
        deltatheta += 2 * Math.PI
      }

            // Ok, we have the center point and angle range (from theta1, deltatheta radians) so we can create the ellipse
      let numsteps = Math.ceil(Math.abs(deltatheta) / (2 * Math.PI) * resolution) + 1
      if (numsteps < 1) numsteps = 1
      for (let step = 1; step <= numsteps; step++) {
        let theta = theta1 + step / numsteps * deltatheta
        let costheta = Math.cos(theta)
        let sintheta = Math.sin(theta)
                // F.6.3.1:
        let point = new Vector2D(cosphi * xradius * costheta - sinphi * yradius * sintheta, sinphi * xradius * costheta + cosphi * yradius * sintheta).plus(center)
        newpoints.push(point)
      }
    }
    newpoints = this.points.concat(newpoints)
    let result = new Path2D(newpoints)
    return result
  }
}

module.exports = Path2D

},{"../../api/optionParsers":9,"../CAG":13,"../constants":22,"./Side":31,"./Vector2":32,"./Vertex2":34}],28:[function(require,module,exports){
const Vector3D = require('./Vector3')
const Line3D = require('./Line3')
const {EPS, getTag} = require('../constants')

// # class Plane
// Represents a plane in 3D space.
const Plane = function (normal, w) {
  this.normal = normal
  this.w = w
}

// create from an untyped object with identical property names:
Plane.fromObject = function (obj) {
  let normal = new Vector3D(obj.normal)
  let w = parseFloat(obj.w)
  return new Plane(normal, w)
}

Plane.fromVector3Ds = function (a, b, c) {
  let n = b.minus(a).cross(c.minus(a)).unit()
  return new Plane(n, n.dot(a))
}

// like fromVector3Ds, but allow the vectors to be on one point or one line
// in such a case a random plane through the given points is constructed
Plane.anyPlaneFromVector3Ds = function (a, b, c) {
  let v1 = b.minus(a)
  let v2 = c.minus(a)
  if (v1.length() < EPS) {
    v1 = v2.randomNonParallelVector()
  }
  if (v2.length() < EPS) {
    v2 = v1.randomNonParallelVector()
  }
  let normal = v1.cross(v2)
  if (normal.length() < EPS) {
        // this would mean that v1 == v2.negated()
    v2 = v1.randomNonParallelVector()
    normal = v1.cross(v2)
  }
  normal = normal.unit()
  return new Plane(normal, normal.dot(a))
}

Plane.fromPoints = function (a, b, c) {
  a = new Vector3D(a)
  b = new Vector3D(b)
  c = new Vector3D(c)
  return Plane.fromVector3Ds(a, b, c)
}

Plane.fromNormalAndPoint = function (normal, point) {
  normal = new Vector3D(normal)
  point = new Vector3D(point)
  normal = normal.unit()
  let w = point.dot(normal)
  return new Plane(normal, w)
}

Plane.prototype = {
  flipped: function () {
    return new Plane(this.normal.negated(), -this.w)
  },

  getTag: function () {
    let result = this.tag
    if (!result) {
      result = getTag()
      this.tag = result
    }
    return result
  },

  equals: function (n) {
    return this.normal.equals(n.normal) && this.w === n.w
  },

  transform: function (matrix4x4) {
    let ismirror = matrix4x4.isMirroring()
        // get two vectors in the plane:
    let r = this.normal.randomNonParallelVector()
    let u = this.normal.cross(r)
    let v = this.normal.cross(u)
        // get 3 points in the plane:
    let point1 = this.normal.times(this.w)
    let point2 = point1.plus(u)
    let point3 = point1.plus(v)
        // transform the points:
    point1 = point1.multiply4x4(matrix4x4)
    point2 = point2.multiply4x4(matrix4x4)
    point3 = point3.multiply4x4(matrix4x4)
        // and create a new plane from the transformed points:
    let newplane = Plane.fromVector3Ds(point1, point2, point3)
    if (ismirror) {
            // the transform is mirroring
            // We should mirror the plane:
      newplane = newplane.flipped()
    }
    return newplane
  },

    // robust splitting of a line by a plane
    // will work even if the line is parallel to the plane
  splitLineBetweenPoints: function (p1, p2) {
    let direction = p2.minus(p1)
    let labda = (this.w - this.normal.dot(p1)) / this.normal.dot(direction)
    if (isNaN(labda)) labda = 0
    if (labda > 1) labda = 1
    if (labda < 0) labda = 0
    let result = p1.plus(direction.times(labda))
    return result
  },

    // returns Vector3D
  intersectWithLine: function (line3d) {
    return line3d.intersectWithPlane(this)
  },

    // intersection of two planes
  intersectWithPlane: function (plane) {
    return Line3D.fromPlanes(this, plane)
  },

  signedDistanceToPoint: function (point) {
    let t = this.normal.dot(point) - this.w
    return t
  },

  toString: function () {
    return '[normal: ' + this.normal.toString() + ', w: ' + this.w + ']'
  },

  mirrorPoint: function (point3d) {
    let distance = this.signedDistanceToPoint(point3d)
    let mirrored = point3d.minus(this.normal.times(distance * 2.0))
    return mirrored
  }
}

module.exports = Plane

},{"../constants":22,"./Line3":24,"./Vector3":33}],29:[function(require,module,exports){
const CAG = require('../CAG')
const {fromPoints} = require('../CAGFactories')

/*
2D polygons are now supported through the CAG class.
With many improvements (see documentation):
  - shapes do no longer have to be convex
  - union/intersect/subtract is supported
  - expand / contract are supported

But we'll keep CSG.Polygon2D as a stub for backwards compatibility
*/
function Polygon2D (points) {
  const cag = fromPoints(points)
  this.sides = cag.sides
}

Polygon2D.prototype = CAG.prototype

module.exports = Polygon2D

},{"../CAG":13,"../CAGFactories":14}],30:[function(require,module,exports){
const Vector3D = require('./Vector3')
const Vertex = require('./Vertex3')
const Matrix4x4 = require('./Matrix4')
const {_CSGDEBUG, EPS, getTag, areaEPS} = require('../constants')

/** Class Polygon
 * Represents a convex polygon. The vertices used to initialize a polygon must
 *   be coplanar and form a convex loop. They do not have to be `Vertex`
 *   instances but they must behave similarly (duck typing can be used for
 *   customization).
 * <br>
 * Each convex polygon has a `shared` property, which is shared between all
 *   polygons that are clones of each other or were split from the same polygon.
 *   This can be used to define per-polygon properties (such as surface color).
 * <br>
 * The plane of the polygon is calculated from the vertex coordinates if not provided.
 *   The plane can alternatively be passed as the third argument to avoid calculations.
 *
 * @constructor
 * @param {Vertex[]} vertices - list of vertices
 * @param {Polygon.Shared} [shared=defaultShared] - shared property to apply
 * @param {Plane} [plane] - plane of the polygon
 *
 * @example
 * const vertices = [
 *   new CSG.Vertex(new CSG.Vector3D([0, 0, 0])),
 *   new CSG.Vertex(new CSG.Vector3D([0, 10, 0])),
 *   new CSG.Vertex(new CSG.Vector3D([0, 10, 10]))
 * ]
 * let observed = new Polygon(vertices)
 */
let Polygon = function (vertices, shared, plane) {
  this.vertices = vertices
  if (!shared) shared = Polygon.defaultShared
  this.shared = shared
    // let numvertices = vertices.length;

  if (arguments.length >= 3) {
    this.plane = plane
  } else {
    const Plane = require('./Plane') // FIXME: circular dependencies
    this.plane = Plane.fromVector3Ds(vertices[0].pos, vertices[1].pos, vertices[2].pos)
  }

  if (_CSGDEBUG) {
    if (!this.checkIfConvex()) {
      throw new Error('Not convex!')
    }
  }
}

Polygon.prototype = {
  /** Check whether the polygon is convex. (it should be, otherwise we will get unexpected results)
   * @returns {boolean}
   */
  checkIfConvex: function () {
    return Polygon.verticesConvex(this.vertices, this.plane.normal)
  },

  // FIXME what? why does this return this, and not a new polygon?
  // FIXME is this used?
  setColor: function (args) {
    let newshared = Polygon.Shared.fromColor.apply(this, arguments)
    this.shared = newshared
    return this
  },

  getSignedVolume: function () {
    let signedVolume = 0
    for (let i = 0; i < this.vertices.length - 2; i++) {
      signedVolume += this.vertices[0].pos.dot(this.vertices[i + 1].pos
                .cross(this.vertices[i + 2].pos))
    }
    signedVolume /= 6
    return signedVolume
  },

    // Note: could calculate vectors only once to speed up
  getArea: function () {
    let polygonArea = 0
    for (let i = 0; i < this.vertices.length - 2; i++) {
      polygonArea += this.vertices[i + 1].pos.minus(this.vertices[0].pos)
                .cross(this.vertices[i + 2].pos.minus(this.vertices[i + 1].pos)).length()
    }
    polygonArea /= 2
    return polygonArea
  },

    // accepts array of features to calculate
    // returns array of results
  getTetraFeatures: function (features) {
    let result = []
    features.forEach(function (feature) {
      if (feature === 'volume') {
        result.push(this.getSignedVolume())
      } else if (feature === 'area') {
        result.push(this.getArea())
      }
    }, this)
    return result
  },

    // Extrude a polygon into the direction offsetvector
    // Returns a CSG object
  extrude: function (offsetvector) {
    const {fromPolygons} = require('../CSGFactories') // because of circular dependencies

    let newpolygons = []

    let polygon1 = this
    let direction = polygon1.plane.normal.dot(offsetvector)
    if (direction > 0) {
      polygon1 = polygon1.flipped()
    }
    newpolygons.push(polygon1)
    let polygon2 = polygon1.translate(offsetvector)
    let numvertices = this.vertices.length
    for (let i = 0; i < numvertices; i++) {
      let sidefacepoints = []
      let nexti = (i < (numvertices - 1)) ? i + 1 : 0
      sidefacepoints.push(polygon1.vertices[i].pos)
      sidefacepoints.push(polygon2.vertices[i].pos)
      sidefacepoints.push(polygon2.vertices[nexti].pos)
      sidefacepoints.push(polygon1.vertices[nexti].pos)
      let sidefacepolygon = Polygon.createFromPoints(sidefacepoints, this.shared)
      newpolygons.push(sidefacepolygon)
    }
    polygon2 = polygon2.flipped()
    newpolygons.push(polygon2)
    return fromPolygons(newpolygons)
  },

  translate: function (offset) {
    return this.transform(Matrix4x4.translation(offset))
  },

    // returns an array with a Vector3D (center point) and a radius
  boundingSphere: function () {
    if (!this.cachedBoundingSphere) {
      let box = this.boundingBox()
      let middle = box[0].plus(box[1]).times(0.5)
      let radius3 = box[1].minus(middle)
      let radius = radius3.length()
      this.cachedBoundingSphere = [middle, radius]
    }
    return this.cachedBoundingSphere
  },

    // returns an array of two Vector3Ds (minimum coordinates and maximum coordinates)
  boundingBox: function () {
    if (!this.cachedBoundingBox) {
      let minpoint, maxpoint
      let vertices = this.vertices
      let numvertices = vertices.length
      if (numvertices === 0) {
        minpoint = new Vector3D(0, 0, 0)
      } else {
        minpoint = vertices[0].pos
      }
      maxpoint = minpoint
      for (let i = 1; i < numvertices; i++) {
        let point = vertices[i].pos
        minpoint = minpoint.min(point)
        maxpoint = maxpoint.max(point)
      }
      this.cachedBoundingBox = [minpoint, maxpoint]
    }
    return this.cachedBoundingBox
  },

  flipped: function () {
    let newvertices = this.vertices.map(function (v) {
      return v.flipped()
    })
    newvertices.reverse()
    let newplane = this.plane.flipped()
    return new Polygon(newvertices, this.shared, newplane)
  },

    // Affine transformation of polygon. Returns a new Polygon
  transform: function (matrix4x4) {
    let newvertices = this.vertices.map(function (v) {
      return v.transform(matrix4x4)
    })
    let newplane = this.plane.transform(matrix4x4)
    if (matrix4x4.isMirroring()) {
            // need to reverse the vertex order
            // in order to preserve the inside/outside orientation:
      newvertices.reverse()
    }
    return new Polygon(newvertices, this.shared, newplane)
  },

  toString: function () {
    let result = 'Polygon plane: ' + this.plane.toString() + '\n'
    this.vertices.map(function (vertex) {
      result += '  ' + vertex.toString() + '\n'
    })
    return result
  },

    // project the 3D polygon onto a plane
  projectToOrthoNormalBasis: function (orthobasis) {
    const CAG = require('../CAG')
    const {fromPointsNoCheck} = require('../CAGFactories') // circular dependencies
    let points2d = this.vertices.map(function (vertex) {
      return orthobasis.to2D(vertex.pos)
    })

    let result = fromPointsNoCheck(points2d)
    let area = result.area()
    if (Math.abs(area) < areaEPS) {
      // the polygon was perpendicular to the orthnormal plane. The resulting 2D polygon would be degenerate
      // return an empty area instead:
      result = new CAG()
    } else if (area < 0) {
      result = result.flipped()
    }
    return result
  },

  // ALIAS ONLY!!
  solidFromSlices: function (options) {
    const solidFromSlices = require('../../api/solidFromSlices')
    return solidFromSlices(this, options)
  }

}

// create from an untyped object with identical property names:
Polygon.fromObject = function (obj) {
  const Plane = require('./Plane') // FIXME: circular dependencies
  let vertices = obj.vertices.map(function (v) {
    return Vertex.fromObject(v)
  })
  let shared = Polygon.Shared.fromObject(obj.shared)
  let plane = Plane.fromObject(obj.plane)
  return new Polygon(vertices, shared, plane)
}

/** Create a polygon from the given points.
 *
 * @param {Array[]} points - list of points
 * @param {Polygon.Shared} [shared=defaultShared] - shared property to apply
 * @param {Plane} [plane] - plane of the polygon
 *
 * @example
 * const points = [
 *   [0,  0, 0],
 *   [0, 10, 0],
 *   [0, 10, 10]
 * ]
 * let observed = CSG.Polygon.createFromPoints(points)
 */
Polygon.createFromPoints = function (points, shared, plane) {
  // FIXME : this circular dependency does not work !
  // const {fromPoints} = require('./polygon3Factories')
  // return fromPoints(points, shared, plane)
  let vertices = []
  points.map(function (p) {
    let vec = new Vector3D(p)
    let vertex = new Vertex(vec)
    vertices.push(vertex)
  })
  let polygon
  if (arguments.length < 3) {
    polygon = new Polygon(vertices, shared)
  } else {
    polygon = new Polygon(vertices, shared, plane)
  }
  return polygon
}

Polygon.verticesConvex = function (vertices, planenormal) {
  let numvertices = vertices.length
  if (numvertices > 2) {
    let prevprevpos = vertices[numvertices - 2].pos
    let prevpos = vertices[numvertices - 1].pos
    for (let i = 0; i < numvertices; i++) {
      let pos = vertices[i].pos
      if (!Polygon.isConvexPoint(prevprevpos, prevpos, pos, planenormal)) {
        return false
      }
      prevprevpos = prevpos
      prevpos = pos
    }
  }
  return true
}

// calculate whether three points form a convex corner
//  prevpoint, point, nextpoint: the 3 coordinates (Vector3D instances)
//  normal: the normal vector of the plane
Polygon.isConvexPoint = function (prevpoint, point, nextpoint, normal) {
  let crossproduct = point.minus(prevpoint).cross(nextpoint.minus(point))
  let crossdotnormal = crossproduct.dot(normal)
  return (crossdotnormal >= 0)
}

Polygon.isStrictlyConvexPoint = function (prevpoint, point, nextpoint, normal) {
  let crossproduct = point.minus(prevpoint).cross(nextpoint.minus(point))
  let crossdotnormal = crossproduct.dot(normal)
  return (crossdotnormal >= EPS)
}

/** Class Polygon.Shared
 * Holds the shared properties for each polygon (Currently only color).
 * @constructor
 * @param {Array[]} color - array containing RGBA values, or null
 *
 * @example
 *   let shared = new CSG.Polygon.Shared([0, 0, 0, 1])
 */
Polygon.Shared = function (color) {
  if (color !== null && color !== undefined) {
    if (color.length !== 4) {
      throw new Error('Expecting 4 element array')
    }
  }
  this.color = color
}

Polygon.Shared.fromObject = function (obj) {
  return new Polygon.Shared(obj.color)
}

/** Create Polygon.Shared from color values.
 * @param {number} r - value of RED component
 * @param {number} g - value of GREEN component
 * @param {number} b - value of BLUE component
 * @param {number} [a] - value of ALPHA component
 * @param {Array[]} [color] - OR array containing RGB values (optional Alpha)
 *
 * @example
 * let s1 = Polygon.Shared.fromColor(0,0,0)
 * let s2 = Polygon.Shared.fromColor([0,0,0,1])
 */
Polygon.Shared.fromColor = function (args) {
  let color
  if (arguments.length === 1) {
    color = arguments[0].slice() // make deep copy
  } else {
    color = []
    for (let i = 0; i < arguments.length; i++) {
      color.push(arguments[i])
    }
  }
  if (color.length === 3) {
    color.push(1)
  } else if (color.length !== 4) {
    throw new Error('setColor expects either an array with 3 or 4 elements, or 3 or 4 parameters.')
  }
  return new Polygon.Shared(color)
}

Polygon.Shared.prototype = {
  getTag: function () {
    let result = this.tag
    if (!result) {
      result = getTag()
      this.tag = result
    }
    return result
  },
    // get a string uniquely identifying this object
  getHash: function () {
    if (!this.color) return 'null'
    return this.color.join('/')
  }
}

Polygon.defaultShared = new Polygon.Shared(null)

module.exports = Polygon

},{"../../api/solidFromSlices":12,"../CAG":13,"../CAGFactories":14,"../CSGFactories":16,"../constants":22,"./Matrix4":25,"./Plane":28,"./Vector3":33,"./Vertex3":35}],31:[function(require,module,exports){
const Vector2D = require('./Vector2')
const Vertex = require('./Vertex2')
const Vertex3 = require('./Vertex3')
const Polygon = require('./Polygon3')
const {getTag} = require('../constants')

const Side = function (vertex0, vertex1) {
  if (!(vertex0 instanceof Vertex)) throw new Error('Assertion failed')
  if (!(vertex1 instanceof Vertex)) throw new Error('Assertion failed')
  this.vertex0 = vertex0
  this.vertex1 = vertex1
}

Side.fromObject = function (obj) {
  var vertex0 = Vertex.fromObject(obj.vertex0)
  var vertex1 = Vertex.fromObject(obj.vertex1)
  return new Side(vertex0, vertex1)
}

Side._fromFakePolygon = function (polygon) {
    // this can happen based on union, seems to be residuals -
    // return null and handle in caller
  if (polygon.vertices.length < 4) {
    return null
  }
  var vert1Indices = []
  var pts2d = polygon.vertices.filter(function (v, i) {
    if (v.pos.z > 0) {
      vert1Indices.push(i)
      return true
    }
    return false
  })
    .map(function (v) {
      return new Vector2D(v.pos.x, v.pos.y)
    })
  if (pts2d.length !== 2) {
    throw new Error('Assertion failed: _fromFakePolygon: not enough points found')
  }
  var d = vert1Indices[1] - vert1Indices[0]
  if (d === 1 || d === 3) {
    if (d === 1) {
      pts2d.reverse()
    }
  } else {
    throw new Error('Assertion failed: _fromFakePolygon: unknown index ordering')
  }
  var result = new Side(new Vertex(pts2d[0]), new Vertex(pts2d[1]))
  return result
}

Side.prototype = {
  toString: function () {
    return this.vertex0 + ' -> ' + this.vertex1
  },

  toPolygon3D: function (z0, z1) {
    // console.log(this.vertex0.pos)
    const vertices = [
      new Vertex3(this.vertex0.pos.toVector3D(z0)),
      new Vertex3(this.vertex1.pos.toVector3D(z0)),
      new Vertex3(this.vertex1.pos.toVector3D(z1)),
      new Vertex3(this.vertex0.pos.toVector3D(z1))
    ]
    return new Polygon(vertices)
  },

  transform: function (matrix4x4) {
    var newp1 = this.vertex0.pos.transform(matrix4x4)
    var newp2 = this.vertex1.pos.transform(matrix4x4)
    return new Side(new Vertex(newp1), new Vertex(newp2))
  },

  flipped: function () {
    return new Side(this.vertex1, this.vertex0)
  },

  direction: function () {
    return this.vertex1.pos.minus(this.vertex0.pos)
  },

  getTag: function () {
    var result = this.tag
    if (!result) {
      result = getTag()
      this.tag = result
    }
    return result
  },

  lengthSquared: function () {
    let x = this.vertex1.pos.x - this.vertex0.pos.x
    let y = this.vertex1.pos.y - this.vertex0.pos.y
    return x * x + y * y
  },

  length: function () {
    return Math.sqrt(this.lengthSquared())
  }
}

module.exports = Side

},{"../constants":22,"./Polygon3":30,"./Vector2":32,"./Vertex2":34,"./Vertex3":35}],32:[function(require,module,exports){
const {IsFloat} = require('../utils')

/** Class Vector2D
 * Represents a 2D vector with X, Y coordinates
 * @constructor
 *
 * @example
 * new CSG.Vector2D(1, 2);
 * new CSG.Vector2D([1, 2]);
 * new CSG.Vector2D({ x: 1, y: 2});
 */
const Vector2D = function (x, y) {
  if (arguments.length === 2) {
    this._x = parseFloat(x)
    this._y = parseFloat(y)
  } else {
    var ok = true
    if (arguments.length === 1) {
      if (typeof (x) === 'object') {
        if (x instanceof Vector2D) {
          this._x = x._x
          this._y = x._y
        } else if (x instanceof Array) {
          this._x = parseFloat(x[0])
          this._y = parseFloat(x[1])
        } else if (('x' in x) && ('y' in x)) {
          this._x = parseFloat(x.x)
          this._y = parseFloat(x.y)
        } else ok = false
      } else {
        var v = parseFloat(x)
        this._x = v
        this._y = v
      }
    } else ok = false
    if (ok) {
      if ((!IsFloat(this._x)) || (!IsFloat(this._y))) ok = false
    }
    if (!ok) {
      throw new Error('wrong arguments')
    }
  }
}

Vector2D.fromAngle = function (radians) {
  return Vector2D.fromAngleRadians(radians)
}

Vector2D.fromAngleDegrees = function (degrees) {
  var radians = Math.PI * degrees / 180
  return Vector2D.fromAngleRadians(radians)
}

Vector2D.fromAngleRadians = function (radians) {
  return Vector2D.Create(Math.cos(radians), Math.sin(radians))
}

// This does the same as new Vector2D(x,y) but it doesn't go through the constructor
// and the parameters are not validated. Is much faster.
Vector2D.Create = function (x, y) {
  var result = Object.create(Vector2D.prototype)
  result._x = x
  result._y = y
  return result
}

Vector2D.prototype = {
  get x () {
    return this._x
  },
  get y () {
    return this._y
  },

  set x (v) {
    throw new Error('Vector2D is immutable')
  },
  set y (v) {
    throw new Error('Vector2D is immutable')
  },

  // extend to a 3D vector by adding a z coordinate:
  toVector3D: function (z) {
    const Vector3D = require('./Vector3') // FIXME: circular dependencies Vector2 => Vector3 => Vector2
    return new Vector3D(this._x, this._y, z)
  },

  equals: function (a) {
    return (this._x === a._x) && (this._y === a._y)
  },

  clone: function () {
    return Vector2D.Create(this._x, this._y)
  },

  negated: function () {
    return Vector2D.Create(-this._x, -this._y)
  },

  plus: function (a) {
    return Vector2D.Create(this._x + a._x, this._y + a._y)
  },

  minus: function (a) {
    return Vector2D.Create(this._x - a._x, this._y - a._y)
  },

  times: function (a) {
    return Vector2D.Create(this._x * a, this._y * a)
  },

  dividedBy: function (a) {
    return Vector2D.Create(this._x / a, this._y / a)
  },

  dot: function (a) {
    return this._x * a._x + this._y * a._y
  },

  lerp: function (a, t) {
    return this.plus(a.minus(this).times(t))
  },

  length: function () {
    return Math.sqrt(this.dot(this))
  },

  distanceTo: function (a) {
    return this.minus(a).length()
  },

  distanceToSquared: function (a) {
    return this.minus(a).lengthSquared()
  },

  lengthSquared: function () {
    return this.dot(this)
  },

  unit: function () {
    return this.dividedBy(this.length())
  },

  cross: function (a) {
    return this._x * a._y - this._y * a._x
  },

    // returns the vector rotated by 90 degrees clockwise
  normal: function () {
    return Vector2D.Create(this._y, -this._x)
  },

    // Right multiply by a 4x4 matrix (the vector is interpreted as a row vector)
    // Returns a new Vector2D
  multiply4x4: function (matrix4x4) {
    return matrix4x4.leftMultiply1x2Vector(this)
  },

  transform: function (matrix4x4) {
    return matrix4x4.leftMultiply1x2Vector(this)
  },

  angle: function () {
    return this.angleRadians()
  },

  angleDegrees: function () {
    var radians = this.angleRadians()
    return 180 * radians / Math.PI
  },

  angleRadians: function () {
        // y=sin, x=cos
    return Math.atan2(this._y, this._x)
  },

  min: function (p) {
    return Vector2D.Create(
            Math.min(this._x, p._x), Math.min(this._y, p._y))
  },

  max: function (p) {
    return Vector2D.Create(
            Math.max(this._x, p._x), Math.max(this._y, p._y))
  },

  toString: function () {
    return '(' + this._x.toFixed(5) + ', ' + this._y.toFixed(5) + ')'
  },

  abs: function () {
    return Vector2D.Create(Math.abs(this._x), Math.abs(this._y))
  }
}

module.exports = Vector2D

},{"../utils":40,"./Vector3":33}],33:[function(require,module,exports){
const {IsFloat} = require('../utils')
const Vector2D = require('./Vector2')

/** Class Vector3D
 * Represents a 3D vector with X, Y, Z coordinates.
 * @constructor
 *
 * @example
 * new CSG.Vector3D(1, 2, 3);
 * new CSG.Vector3D([1, 2, 3]);
 * new CSG.Vector3D({ x: 1, y: 2, z: 3 });
 * new CSG.Vector3D(1, 2); // assumes z=0
 * new CSG.Vector3D([1, 2]); // assumes z=0
 */
const Vector3D = function (x, y, z) {
  if (arguments.length === 3) {
    this._x = parseFloat(x)
    this._y = parseFloat(y)
    this._z = parseFloat(z)
  } else if (arguments.length === 2) {
    this._x = parseFloat(x)
    this._y = parseFloat(y)
    this._z = 0
  } else {
    var ok = true
    if (arguments.length === 1) {
      if (typeof (x) === 'object') {
        if (x instanceof Vector3D) {
          this._x = x._x
          this._y = x._y
          this._z = x._z
        } else if (x instanceof Vector2D) {
          this._x = x._x
          this._y = x._y
          this._z = 0
        } else if (x instanceof Array) {
          if ((x.length < 2) || (x.length > 3)) {
            ok = false
          } else {
            this._x = parseFloat(x[0])
            this._y = parseFloat(x[1])
            if (x.length === 3) {
              this._z = parseFloat(x[2])
            } else {
              this._z = 0
            }
          }
        } else if (('x' in x) && ('y' in x)) {
          this._x = parseFloat(x.x)
          this._y = parseFloat(x.y)
          if ('z' in x) {
            this._z = parseFloat(x.z)
          } else {
            this._z = 0
          }
        } else if (('_x' in x) && ('_y' in x)) {
          this._x = parseFloat(x._x)
          this._y = parseFloat(x._y)
          if ('_z' in x) {
            this._z = parseFloat(x._z)
          } else {
            this._z = 0
          }
        } else ok = false
      } else {
        var v = parseFloat(x)
        this._x = v
        this._y = v
        this._z = v
      }
    } else ok = false
    if (ok) {
      if ((!IsFloat(this._x)) || (!IsFloat(this._y)) || (!IsFloat(this._z))) ok = false
    } else {
      throw new Error('wrong arguments')
    }
  }
}

// This does the same as new Vector3D(x,y,z) but it doesn't go through the constructor
// and the parameters are not validated. Is much faster.
Vector3D.Create = function (x, y, z) {
  var result = Object.create(Vector3D.prototype)
  result._x = x
  result._y = y
  result._z = z
  return result
}

Vector3D.prototype = {
  get x () {
    return this._x
  },
  get y () {
    return this._y
  },
  get z () {
    return this._z
  },

  set x (v) {
    throw new Error('Vector3D is immutable')
  },
  set y (v) {
    throw new Error('Vector3D is immutable')
  },
  set z (v) {
    throw new Error('Vector3D is immutable')
  },

  clone: function () {
    return Vector3D.Create(this._x, this._y, this._z)
  },

  negated: function () {
    return Vector3D.Create(-this._x, -this._y, -this._z)
  },

  abs: function () {
    return Vector3D.Create(Math.abs(this._x), Math.abs(this._y), Math.abs(this._z))
  },

  plus: function (a) {
    return Vector3D.Create(this._x + a._x, this._y + a._y, this._z + a._z)
  },

  minus: function (a) {
    return Vector3D.Create(this._x - a._x, this._y - a._y, this._z - a._z)
  },

  times: function (a) {
    return Vector3D.Create(this._x * a, this._y * a, this._z * a)
  },

  dividedBy: function (a) {
    return Vector3D.Create(this._x / a, this._y / a, this._z / a)
  },

  dot: function (a) {
    return this._x * a._x + this._y * a._y + this._z * a._z
  },

  lerp: function (a, t) {
    return this.plus(a.minus(this).times(t))
  },

  lengthSquared: function () {
    return this.dot(this)
  },

  length: function () {
    return Math.sqrt(this.lengthSquared())
  },

  unit: function () {
    return this.dividedBy(this.length())
  },

  cross: function (a) {
    return Vector3D.Create(
            this._y * a._z - this._z * a._y, this._z * a._x - this._x * a._z, this._x * a._y - this._y * a._x)
  },

  distanceTo: function (a) {
    return this.minus(a).length()
  },

  distanceToSquared: function (a) {
    return this.minus(a).lengthSquared()
  },

  equals: function (a) {
    return (this._x === a._x) && (this._y === a._y) && (this._z === a._z)
  },

    // Right multiply by a 4x4 matrix (the vector is interpreted as a row vector)
    // Returns a new Vector3D
  multiply4x4: function (matrix4x4) {
    return matrix4x4.leftMultiply1x3Vector(this)
  },

  transform: function (matrix4x4) {
    return matrix4x4.leftMultiply1x3Vector(this)
  },

  toString: function () {
    return '(' + this._x.toFixed(5) + ', ' + this._y.toFixed(5) + ', ' + this._z.toFixed(5) + ')'
  },

    // find a vector that is somewhat perpendicular to this one
  randomNonParallelVector: function () {
    var abs = this.abs()
    if ((abs._x <= abs._y) && (abs._x <= abs._z)) {
      return Vector3D.Create(1, 0, 0)
    } else if ((abs._y <= abs._x) && (abs._y <= abs._z)) {
      return Vector3D.Create(0, 1, 0)
    } else {
      return Vector3D.Create(0, 0, 1)
    }
  },

  min: function (p) {
    return Vector3D.Create(
            Math.min(this._x, p._x), Math.min(this._y, p._y), Math.min(this._z, p._z))
  },

  max: function (p) {
    return Vector3D.Create(
            Math.max(this._x, p._x), Math.max(this._y, p._y), Math.max(this._z, p._z))
  }
}

module.exports = Vector3D

},{"../utils":40,"./Vector2":32}],34:[function(require,module,exports){
const Vector2D = require('./Vector2')
const {getTag} = require('../constants')

const Vertex = function (pos) {
  this.pos = pos
}

Vertex.fromObject = function (obj) {
  return new Vertex(new Vector2D(obj.pos._x, obj.pos._y))
}

Vertex.prototype = {
  toString: function () {
    return '(' + this.pos.x.toFixed(5) + ',' + this.pos.y.toFixed(5) + ')'
  },
  getTag: function () {
    var result = this.tag
    if (!result) {
      result = getTag()
      this.tag = result
    }
    return result
  }
}

module.exports = Vertex

},{"../constants":22,"./Vector2":32}],35:[function(require,module,exports){
const Vector3D = require('./Vector3')
const {getTag} = require('../constants')

// # class Vertex
// Represents a vertex of a polygon. Use your own vertex class instead of this
// one to provide additional features like texture coordinates and vertex
// colors. Custom vertex classes need to provide a `pos` property
// `flipped()`, and `interpolate()` methods that behave analogous to the ones
// FIXME: And a lot MORE (see plane.fromVector3Ds for ex) ! This is fragile code
// defined by `Vertex`.
const Vertex = function (pos) {
  this.pos = pos
}

// create from an untyped object with identical property names:
Vertex.fromObject = function (obj) {
  var pos = new Vector3D(obj.pos)
  return new Vertex(pos)
}

Vertex.prototype = {
    // Return a vertex with all orientation-specific data (e.g. vertex normal) flipped. Called when the
    // orientation of a polygon is flipped.
  flipped: function () {
    return this
  },

  getTag: function () {
    var result = this.tag
    if (!result) {
      result = getTag()
      this.tag = result
    }
    return result
  },

    // Create a new vertex between this vertex and `other` by linearly
    // interpolating all properties using a parameter of `t`. Subclasses should
    // override this to interpolate additional properties.
  interpolate: function (other, t) {
    var newpos = this.pos.lerp(other.pos, t)
    return new Vertex(newpos)
  },

    // Affine transformation of vertex. Returns a new Vertex
  transform: function (matrix4x4) {
    var newpos = this.pos.multiply4x4(matrix4x4)
    return new Vertex(newpos)
  },

  toString: function () {
    return this.pos.toString()
  }
}

module.exports = Vertex

},{"../constants":22,"./Vector3":33}],36:[function(require,module,exports){
const {EPS} = require('../constants')
const {solve2Linear} = require('../utils')

// see if the line between p0start and p0end intersects with the line between p1start and p1end
// returns true if the lines strictly intersect, the end points are not counted!
const linesIntersect = function (p0start, p0end, p1start, p1end) {
  if (p0end.equals(p1start) || p1end.equals(p0start)) {
    let d = p1end.minus(p1start).unit().plus(p0end.minus(p0start).unit()).length()
    if (d < EPS) {
      return true
    }
  } else {
    let d0 = p0end.minus(p0start)
    let d1 = p1end.minus(p1start)
    // FIXME These epsilons need review and testing
    if (Math.abs(d0.cross(d1)) < 1e-9) return false // lines are parallel
    let alphas = solve2Linear(-d0.x, d1.x, -d0.y, d1.y, p0start.x - p1start.x, p0start.y - p1start.y)
    if ((alphas[0] > 1e-6) && (alphas[0] < 0.999999) && (alphas[1] > 1e-5) && (alphas[1] < 0.999999)) return true
    // if( (alphas[0] >= 0) && (alphas[0] <= 1) && (alphas[1] >= 0) && (alphas[1] <= 1) ) return true;
  }
  return false
}

module.exports = {linesIntersect}

},{"../constants":22,"../utils":40}],37:[function(require,module,exports){
const {EPS} = require('../constants')
const OrthoNormalBasis = require('./OrthoNormalBasis')
const {interpolateBetween2DPointsForY, insertSorted, fnNumberSort} = require('../utils')
const Vertex = require('./Vertex3')
const Vector2D = require('./Vector2')
const Line2D = require('./Line2')
const Polygon = require('./Polygon3')

// Retesselation function for a set of coplanar polygons. See the introduction at the top of
// this file.
const reTesselateCoplanarPolygons = function (sourcepolygons, destpolygons) {
  let numpolygons = sourcepolygons.length
  if (numpolygons > 0) {
    let plane = sourcepolygons[0].plane
    let shared = sourcepolygons[0].shared
    let orthobasis = new OrthoNormalBasis(plane)
    let polygonvertices2d = [] // array of array of Vector2D
    let polygontopvertexindexes = [] // array of indexes of topmost vertex per polygon
    let topy2polygonindexes = {}
    let ycoordinatetopolygonindexes = {}

    let xcoordinatebins = {}
    let ycoordinatebins = {}

        // convert all polygon vertices to 2D
        // Make a list of all encountered y coordinates
        // And build a map of all polygons that have a vertex at a certain y coordinate:
    let ycoordinateBinningFactor = 1.0 / EPS * 10
    for (let polygonindex = 0; polygonindex < numpolygons; polygonindex++) {
      let poly3d = sourcepolygons[polygonindex]
      let vertices2d = []
      let numvertices = poly3d.vertices.length
      let minindex = -1
      if (numvertices > 0) {
        let miny, maxy, maxindex
        for (let i = 0; i < numvertices; i++) {
          let pos2d = orthobasis.to2D(poly3d.vertices[i].pos)
                    // perform binning of y coordinates: If we have multiple vertices very
                    // close to each other, give them the same y coordinate:
          let ycoordinatebin = Math.floor(pos2d.y * ycoordinateBinningFactor)
          let newy
          if (ycoordinatebin in ycoordinatebins) {
            newy = ycoordinatebins[ycoordinatebin]
          } else if (ycoordinatebin + 1 in ycoordinatebins) {
            newy = ycoordinatebins[ycoordinatebin + 1]
          } else if (ycoordinatebin - 1 in ycoordinatebins) {
            newy = ycoordinatebins[ycoordinatebin - 1]
          } else {
            newy = pos2d.y
            ycoordinatebins[ycoordinatebin] = pos2d.y
          }
          pos2d = Vector2D.Create(pos2d.x, newy)
          vertices2d.push(pos2d)
          let y = pos2d.y
          if ((i === 0) || (y < miny)) {
            miny = y
            minindex = i
          }
          if ((i === 0) || (y > maxy)) {
            maxy = y
            maxindex = i
          }
          if (!(y in ycoordinatetopolygonindexes)) {
            ycoordinatetopolygonindexes[y] = {}
          }
          ycoordinatetopolygonindexes[y][polygonindex] = true
        }
        if (miny >= maxy) {
                    // degenerate polygon, all vertices have same y coordinate. Just ignore it from now:
          vertices2d = []
          numvertices = 0
          minindex = -1
        } else {
          if (!(miny in topy2polygonindexes)) {
            topy2polygonindexes[miny] = []
          }
          topy2polygonindexes[miny].push(polygonindex)
        }
      } // if(numvertices > 0)
            // reverse the vertex order:
      vertices2d.reverse()
      minindex = numvertices - minindex - 1
      polygonvertices2d.push(vertices2d)
      polygontopvertexindexes.push(minindex)
    }
    let ycoordinates = []
    for (let ycoordinate in ycoordinatetopolygonindexes) ycoordinates.push(ycoordinate)
    ycoordinates.sort(fnNumberSort)

        // Now we will iterate over all y coordinates, from lowest to highest y coordinate
        // activepolygons: source polygons that are 'active', i.e. intersect with our y coordinate
        //   Is sorted so the polygons are in left to right order
        // Each element in activepolygons has these properties:
        //        polygonindex: the index of the source polygon (i.e. an index into the sourcepolygons
        //                      and polygonvertices2d arrays)
        //        leftvertexindex: the index of the vertex at the left side of the polygon (lowest x)
        //                         that is at or just above the current y coordinate
        //        rightvertexindex: dito at right hand side of polygon
        //        topleft, bottomleft: coordinates of the left side of the polygon crossing the current y coordinate
        //        topright, bottomright: coordinates of the right hand side of the polygon crossing the current y coordinate
    let activepolygons = []
    let prevoutpolygonrow = []
    for (let yindex = 0; yindex < ycoordinates.length; yindex++) {
      let newoutpolygonrow = []
      let ycoordinate_as_string = ycoordinates[yindex]
      let ycoordinate = Number(ycoordinate_as_string)

            // update activepolygons for this y coordinate:
            // - Remove any polygons that end at this y coordinate
            // - update leftvertexindex and rightvertexindex (which point to the current vertex index
            //   at the the left and right side of the polygon
            // Iterate over all polygons that have a corner at this y coordinate:
      let polygonindexeswithcorner = ycoordinatetopolygonindexes[ycoordinate_as_string]
      for (let activepolygonindex = 0; activepolygonindex < activepolygons.length; ++activepolygonindex) {
        let activepolygon = activepolygons[activepolygonindex]
        let polygonindex = activepolygon.polygonindex
        if (polygonindexeswithcorner[polygonindex]) {
                    // this active polygon has a corner at this y coordinate:
          let vertices2d = polygonvertices2d[polygonindex]
          let numvertices = vertices2d.length
          let newleftvertexindex = activepolygon.leftvertexindex
          let newrightvertexindex = activepolygon.rightvertexindex
                    // See if we need to increase leftvertexindex or decrease rightvertexindex:
          while (true) {
            let nextleftvertexindex = newleftvertexindex + 1
            if (nextleftvertexindex >= numvertices) nextleftvertexindex = 0
            if (vertices2d[nextleftvertexindex].y !== ycoordinate) break
            newleftvertexindex = nextleftvertexindex
          }
          let nextrightvertexindex = newrightvertexindex - 1
          if (nextrightvertexindex < 0) nextrightvertexindex = numvertices - 1
          if (vertices2d[nextrightvertexindex].y === ycoordinate) {
            newrightvertexindex = nextrightvertexindex
          }
          if ((newleftvertexindex !== activepolygon.leftvertexindex) && (newleftvertexindex === newrightvertexindex)) {
                        // We have increased leftvertexindex or decreased rightvertexindex, and now they point to the same vertex
                        // This means that this is the bottom point of the polygon. We'll remove it:
            activepolygons.splice(activepolygonindex, 1)
            --activepolygonindex
          } else {
            activepolygon.leftvertexindex = newleftvertexindex
            activepolygon.rightvertexindex = newrightvertexindex
            activepolygon.topleft = vertices2d[newleftvertexindex]
            activepolygon.topright = vertices2d[newrightvertexindex]
            let nextleftvertexindex = newleftvertexindex + 1
            if (nextleftvertexindex >= numvertices) nextleftvertexindex = 0
            activepolygon.bottomleft = vertices2d[nextleftvertexindex]
            let nextrightvertexindex = newrightvertexindex - 1
            if (nextrightvertexindex < 0) nextrightvertexindex = numvertices - 1
            activepolygon.bottomright = vertices2d[nextrightvertexindex]
          }
        } // if polygon has corner here
      } // for activepolygonindex
      let nextycoordinate
      if (yindex >= ycoordinates.length - 1) {
                // last row, all polygons must be finished here:
        activepolygons = []
        nextycoordinate = null
      } else // yindex < ycoordinates.length-1
            {
        nextycoordinate = Number(ycoordinates[yindex + 1])
        let middleycoordinate = 0.5 * (ycoordinate + nextycoordinate)
                // update activepolygons by adding any polygons that start here:
        let startingpolygonindexes = topy2polygonindexes[ycoordinate_as_string]
        for (let polygonindex_key in startingpolygonindexes) {
          let polygonindex = startingpolygonindexes[polygonindex_key]
          let vertices2d = polygonvertices2d[polygonindex]
          let numvertices = vertices2d.length
          let topvertexindex = polygontopvertexindexes[polygonindex]
                    // the top of the polygon may be a horizontal line. In that case topvertexindex can point to any point on this line.
                    // Find the left and right topmost vertices which have the current y coordinate:
          let topleftvertexindex = topvertexindex
          while (true) {
            let i = topleftvertexindex + 1
            if (i >= numvertices) i = 0
            if (vertices2d[i].y !== ycoordinate) break
            if (i === topvertexindex) break // should not happen, but just to prevent endless loops
            topleftvertexindex = i
          }
          let toprightvertexindex = topvertexindex
          while (true) {
            let i = toprightvertexindex - 1
            if (i < 0) i = numvertices - 1
            if (vertices2d[i].y !== ycoordinate) break
            if (i === topleftvertexindex) break // should not happen, but just to prevent endless loops
            toprightvertexindex = i
          }
          let nextleftvertexindex = topleftvertexindex + 1
          if (nextleftvertexindex >= numvertices) nextleftvertexindex = 0
          let nextrightvertexindex = toprightvertexindex - 1
          if (nextrightvertexindex < 0) nextrightvertexindex = numvertices - 1
          let newactivepolygon = {
            polygonindex: polygonindex,
            leftvertexindex: topleftvertexindex,
            rightvertexindex: toprightvertexindex,
            topleft: vertices2d[topleftvertexindex],
            topright: vertices2d[toprightvertexindex],
            bottomleft: vertices2d[nextleftvertexindex],
            bottomright: vertices2d[nextrightvertexindex]
          }
          insertSorted(activepolygons, newactivepolygon, function (el1, el2) {
            let x1 = interpolateBetween2DPointsForY(
                            el1.topleft, el1.bottomleft, middleycoordinate)
            let x2 = interpolateBetween2DPointsForY(
                            el2.topleft, el2.bottomleft, middleycoordinate)
            if (x1 > x2) return 1
            if (x1 < x2) return -1
            return 0
          })
        } // for(let polygonindex in startingpolygonindexes)
      } //  yindex < ycoordinates.length-1
            // if( (yindex === ycoordinates.length-1) || (nextycoordinate - ycoordinate > EPS) )
      if (true) {
        // Now activepolygons is up to date
        // Build the output polygons for the next row in newoutpolygonrow:
        for (let activepolygonKey in activepolygons) {
          let activepolygon = activepolygons[activepolygonKey]
          let polygonindex = activepolygon.polygonindex
          let vertices2d = polygonvertices2d[polygonindex]
          let numvertices = vertices2d.length

          let x = interpolateBetween2DPointsForY(activepolygon.topleft, activepolygon.bottomleft, ycoordinate)
          let topleft = Vector2D.Create(x, ycoordinate)
          x = interpolateBetween2DPointsForY(activepolygon.topright, activepolygon.bottomright, ycoordinate)
          let topright = Vector2D.Create(x, ycoordinate)
          x = interpolateBetween2DPointsForY(activepolygon.topleft, activepolygon.bottomleft, nextycoordinate)
          let bottomleft = Vector2D.Create(x, nextycoordinate)
          x = interpolateBetween2DPointsForY(activepolygon.topright, activepolygon.bottomright, nextycoordinate)
          let bottomright = Vector2D.Create(x, nextycoordinate)
          let outpolygon = {
            topleft: topleft,
            topright: topright,
            bottomleft: bottomleft,
            bottomright: bottomright,
            leftline: Line2D.fromPoints(topleft, bottomleft),
            rightline: Line2D.fromPoints(bottomright, topright)
          }
          if (newoutpolygonrow.length > 0) {
            let prevoutpolygon = newoutpolygonrow[newoutpolygonrow.length - 1]
            let d1 = outpolygon.topleft.distanceTo(prevoutpolygon.topright)
            let d2 = outpolygon.bottomleft.distanceTo(prevoutpolygon.bottomright)
            if ((d1 < EPS) && (d2 < EPS)) {
                            // we can join this polygon with the one to the left:
              outpolygon.topleft = prevoutpolygon.topleft
              outpolygon.leftline = prevoutpolygon.leftline
              outpolygon.bottomleft = prevoutpolygon.bottomleft
              newoutpolygonrow.splice(newoutpolygonrow.length - 1, 1)
            }
          }
          newoutpolygonrow.push(outpolygon)
        } // for(activepolygon in activepolygons)
        if (yindex > 0) {
                    // try to match the new polygons against the previous row:
          let prevcontinuedindexes = {}
          let matchedindexes = {}
          for (let i = 0; i < newoutpolygonrow.length; i++) {
            let thispolygon = newoutpolygonrow[i]
            for (let ii = 0; ii < prevoutpolygonrow.length; ii++) {
              if (!matchedindexes[ii]) // not already processed?
                            {
                                // We have a match if the sidelines are equal or if the top coordinates
                                // are on the sidelines of the previous polygon
                let prevpolygon = prevoutpolygonrow[ii]
                if (prevpolygon.bottomleft.distanceTo(thispolygon.topleft) < EPS) {
                  if (prevpolygon.bottomright.distanceTo(thispolygon.topright) < EPS) {
                                        // Yes, the top of this polygon matches the bottom of the previous:
                    matchedindexes[ii] = true
                                        // Now check if the joined polygon would remain convex:
                    let d1 = thispolygon.leftline.direction().x - prevpolygon.leftline.direction().x
                    let d2 = thispolygon.rightline.direction().x - prevpolygon.rightline.direction().x
                    let leftlinecontinues = Math.abs(d1) < EPS
                    let rightlinecontinues = Math.abs(d2) < EPS
                    let leftlineisconvex = leftlinecontinues || (d1 >= 0)
                    let rightlineisconvex = rightlinecontinues || (d2 >= 0)
                    if (leftlineisconvex && rightlineisconvex) {
                                            // yes, both sides have convex corners:
                                            // This polygon will continue the previous polygon
                      thispolygon.outpolygon = prevpolygon.outpolygon
                      thispolygon.leftlinecontinues = leftlinecontinues
                      thispolygon.rightlinecontinues = rightlinecontinues
                      prevcontinuedindexes[ii] = true
                    }
                    break
                  }
                }
              } // if(!prevcontinuedindexes[ii])
            } // for ii
          } // for i
          for (let ii = 0; ii < prevoutpolygonrow.length; ii++) {
            if (!prevcontinuedindexes[ii]) {
                            // polygon ends here
                            // Finish the polygon with the last point(s):
              let prevpolygon = prevoutpolygonrow[ii]
              prevpolygon.outpolygon.rightpoints.push(prevpolygon.bottomright)
              if (prevpolygon.bottomright.distanceTo(prevpolygon.bottomleft) > EPS) {
                                // polygon ends with a horizontal line:
                prevpolygon.outpolygon.leftpoints.push(prevpolygon.bottomleft)
              }
                            // reverse the left half so we get a counterclockwise circle:
              prevpolygon.outpolygon.leftpoints.reverse()
              let points2d = prevpolygon.outpolygon.rightpoints.concat(prevpolygon.outpolygon.leftpoints)
              let vertices3d = []
              points2d.map(function (point2d) {
                let point3d = orthobasis.to3D(point2d)
                let vertex3d = new Vertex(point3d)
                vertices3d.push(vertex3d)
              })
              let polygon = new Polygon(vertices3d, shared, plane)
              destpolygons.push(polygon)
            }
          }
        } // if(yindex > 0)
        for (let i = 0; i < newoutpolygonrow.length; i++) {
          let thispolygon = newoutpolygonrow[i]
          if (!thispolygon.outpolygon) {
                        // polygon starts here:
            thispolygon.outpolygon = {
              leftpoints: [],
              rightpoints: []
            }
            thispolygon.outpolygon.leftpoints.push(thispolygon.topleft)
            if (thispolygon.topleft.distanceTo(thispolygon.topright) > EPS) {
                            // we have a horizontal line at the top:
              thispolygon.outpolygon.rightpoints.push(thispolygon.topright)
            }
          } else {
                        // continuation of a previous row
            if (!thispolygon.leftlinecontinues) {
              thispolygon.outpolygon.leftpoints.push(thispolygon.topleft)
            }
            if (!thispolygon.rightlinecontinues) {
              thispolygon.outpolygon.rightpoints.push(thispolygon.topright)
            }
          }
        }
        prevoutpolygonrow = newoutpolygonrow
      }
    } // for yindex
  } // if(numpolygons > 0)
}

module.exports = reTesselateCoplanarPolygons

},{"../constants":22,"../utils":40,"./Line2":23,"./OrthoNormalBasis":26,"./Polygon3":30,"./Vector2":32,"./Vertex3":35}],38:[function(require,module,exports){
const Matrix4x4 = require('./math/Matrix4')
const Vector3D = require('./math/Vector3')
const Plane = require('./math/Plane')

// Add several convenience methods to the classes that support a transform() method:
const addTransformationMethodsToPrototype = function (prot) {
  prot.mirrored = function (plane) {
    return this.transform(Matrix4x4.mirroring(plane))
  }

  prot.mirroredX = function () {
    let plane = new Plane(Vector3D.Create(1, 0, 0), 0)
    return this.mirrored(plane)
  }

  prot.mirroredY = function () {
    let plane = new Plane(Vector3D.Create(0, 1, 0), 0)
    return this.mirrored(plane)
  }

  prot.mirroredZ = function () {
    let plane = new Plane(Vector3D.Create(0, 0, 1), 0)
    return this.mirrored(plane)
  }

  prot.translate = function (v) {
    return this.transform(Matrix4x4.translation(v))
  }

  prot.scale = function (f) {
    return this.transform(Matrix4x4.scaling(f))
  }

  prot.rotateX = function (deg) {
    return this.transform(Matrix4x4.rotationX(deg))
  }

  prot.rotateY = function (deg) {
    return this.transform(Matrix4x4.rotationY(deg))
  }

  prot.rotateZ = function (deg) {
    return this.transform(Matrix4x4.rotationZ(deg))
  }

  prot.rotate = function (rotationCenter, rotationAxis, degrees) {
    return this.transform(Matrix4x4.rotation(rotationCenter, rotationAxis, degrees))
  }

  prot.rotateEulerAngles = function (alpha, beta, gamma, position) {
    position = position || [0, 0, 0]

    let Rz1 = Matrix4x4.rotationZ(alpha)
    let Rx = Matrix4x4.rotationX(beta)
    let Rz2 = Matrix4x4.rotationZ(gamma)
    let T = Matrix4x4.translation(new Vector3D(position))

    return this.transform(Rz2.multiply(Rx).multiply(Rz1).multiply(T))
  }
}

// TODO: consider generalization and adding to addTransformationMethodsToPrototype
const addCenteringToPrototype = function (prot, axes) {
  prot.center = function (cAxes) {
    cAxes = Array.prototype.map.call(arguments, function (a) {
      return a // .toLowerCase();
    })
        // no args: center on all axes
    if (!cAxes.length) {
      cAxes = axes.slice()
    }
    let b = this.getBounds()
    return this.translate(axes.map(function (a) {
      return cAxes.indexOf(a) > -1 ? -(b[0][a] + b[1][a]) / 2 : 0
    }))
  }
}
module.exports = {
  addTransformationMethodsToPrototype,
  addCenteringToPrototype
}

},{"./math/Matrix4":25,"./math/Plane":28,"./math/Vector3":33}],39:[function(require,module,exports){
const {_CSGDEBUG, EPS} = require('./constants')
const Vertex = require('./math/Vertex3')
const Polygon = require('./math/Polygon3')

// Returns object:
// .type:
//   0: coplanar-front
//   1: coplanar-back
//   2: front
//   3: back
//   4: spanning
// In case the polygon is spanning, returns:
// .front: a Polygon of the front part
// .back: a Polygon of the back part
function splitPolygonByPlane (plane, polygon) {
  let result = {
    type: null,
    front: null,
    back: null
  }
      // cache in local lets (speedup):
  let planenormal = plane.normal
  let vertices = polygon.vertices
  let numvertices = vertices.length
  if (polygon.plane.equals(plane)) {
    result.type = 0
  } else {
    let thisw = plane.w
    let hasfront = false
    let hasback = false
    let vertexIsBack = []
    let MINEPS = -EPS
    for (let i = 0; i < numvertices; i++) {
      let t = planenormal.dot(vertices[i].pos) - thisw
      let isback = (t < 0)
      vertexIsBack.push(isback)
      if (t > EPS) hasfront = true
      if (t < MINEPS) hasback = true
    }
    if ((!hasfront) && (!hasback)) {
              // all points coplanar
      let t = planenormal.dot(polygon.plane.normal)
      result.type = (t >= 0) ? 0 : 1
    } else if (!hasback) {
      result.type = 2
    } else if (!hasfront) {
      result.type = 3
    } else {
              // spanning
      result.type = 4
      let frontvertices = []
      let backvertices = []
      let isback = vertexIsBack[0]
      for (let vertexindex = 0; vertexindex < numvertices; vertexindex++) {
        let vertex = vertices[vertexindex]
        let nextvertexindex = vertexindex + 1
        if (nextvertexindex >= numvertices) nextvertexindex = 0
        let nextisback = vertexIsBack[nextvertexindex]
        if (isback === nextisback) {
                      // line segment is on one side of the plane:
          if (isback) {
            backvertices.push(vertex)
          } else {
            frontvertices.push(vertex)
          }
        } else {
                      // line segment intersects plane:
          let point = vertex.pos
          let nextpoint = vertices[nextvertexindex].pos
          let intersectionpoint = plane.splitLineBetweenPoints(point, nextpoint)
          let intersectionvertex = new Vertex(intersectionpoint)
          if (isback) {
            backvertices.push(vertex)
            backvertices.push(intersectionvertex)
            frontvertices.push(intersectionvertex)
          } else {
            frontvertices.push(vertex)
            frontvertices.push(intersectionvertex)
            backvertices.push(intersectionvertex)
          }
        }
        isback = nextisback
      } // for vertexindex
              // remove duplicate vertices:
      let EPS_SQUARED = EPS * EPS
      if (backvertices.length >= 3) {
        let prevvertex = backvertices[backvertices.length - 1]
        for (let vertexindex = 0; vertexindex < backvertices.length; vertexindex++) {
          let vertex = backvertices[vertexindex]
          if (vertex.pos.distanceToSquared(prevvertex.pos) < EPS_SQUARED) {
            backvertices.splice(vertexindex, 1)
            vertexindex--
          }
          prevvertex = vertex
        }
      }
      if (frontvertices.length >= 3) {
        let prevvertex = frontvertices[frontvertices.length - 1]
        for (let vertexindex = 0; vertexindex < frontvertices.length; vertexindex++) {
          let vertex = frontvertices[vertexindex]
          if (vertex.pos.distanceToSquared(prevvertex.pos) < EPS_SQUARED) {
            frontvertices.splice(vertexindex, 1)
            vertexindex--
          }
          prevvertex = vertex
        }
      }
      if (frontvertices.length >= 3) {
        result.front = new Polygon(frontvertices, polygon.shared, polygon.plane)
      }
      if (backvertices.length >= 3) {
        result.back = new Polygon(backvertices, polygon.shared, polygon.plane)
      }
    }
  }
  return result
}

// # class PolygonTreeNode
// This class manages hierarchical splits of polygons
// At the top is a root node which doesn hold a polygon, only child PolygonTreeNodes
// Below that are zero or more 'top' nodes; each holds a polygon. The polygons can be in different planes
// splitByPlane() splits a node by a plane. If the plane intersects the polygon, two new child nodes
// are created holding the splitted polygon.
// getPolygons() retrieves the polygon from the tree. If for PolygonTreeNode the polygon is split but
// the two split parts (child nodes) are still intact, then the unsplit polygon is returned.
// This ensures that we can safely split a polygon into many fragments. If the fragments are untouched,
//  getPolygons() will return the original unsplit polygon instead of the fragments.
// remove() removes a polygon from the tree. Once a polygon is removed, the parent polygons are invalidated
// since they are no longer intact.
// constructor creates the root node:
const PolygonTreeNode = function () {
  this.parent = null
  this.children = []
  this.polygon = null
  this.removed = false
}

PolygonTreeNode.prototype = {
    // fill the tree with polygons. Should be called on the root node only; child nodes must
    // always be a derivate (split) of the parent node.
  addPolygons: function (polygons) {
    // new polygons can only be added to root node; children can only be splitted polygons
    if (!this.isRootNode()) {
      throw new Error('Assertion failed')
    }
    let _this = this
    polygons.map(function (polygon) {
      _this.addChild(polygon)
    })
  },

    // remove a node
    // - the siblings become toplevel nodes
    // - the parent is removed recursively
  remove: function () {
    if (!this.removed) {
      this.removed = true

      if (_CSGDEBUG) {
        if (this.isRootNode()) throw new Error('Assertion failed') // can't remove root node
        if (this.children.length) throw new Error('Assertion failed') // we shouldn't remove nodes with children
      }

            // remove ourselves from the parent's children list:
      let parentschildren = this.parent.children
      let i = parentschildren.indexOf(this)
      if (i < 0) throw new Error('Assertion failed')
      parentschildren.splice(i, 1)

            // invalidate the parent's polygon, and of all parents above it:
      this.parent.recursivelyInvalidatePolygon()
    }
  },

  isRemoved: function () {
    return this.removed
  },

  isRootNode: function () {
    return !this.parent
  },

    // invert all polygons in the tree. Call on the root node
  invert: function () {
    if (!this.isRootNode()) throw new Error('Assertion failed') // can only call this on the root node
    this.invertSub()
  },

  getPolygon: function () {
    if (!this.polygon) throw new Error('Assertion failed') // doesn't have a polygon, which means that it has been broken down
    return this.polygon
  },

  getPolygons: function (result) {
    let children = [this]
    let queue = [children]
    let i, j, l, node
    for (i = 0; i < queue.length; ++i) { // queue size can change in loop, don't cache length
      children = queue[i]
      for (j = 0, l = children.length; j < l; j++) { // ok to cache length
        node = children[j]
        if (node.polygon) {
                    // the polygon hasn't been broken yet. We can ignore the children and return our polygon:
          result.push(node.polygon)
        } else {
                    // our polygon has been split up and broken, so gather all subpolygons from the children
          queue.push(node.children)
        }
      }
    }
  },

    // split the node by a plane; add the resulting nodes to the frontnodes and backnodes array
    // If the plane doesn't intersect the polygon, the 'this' object is added to one of the arrays
    // If the plane does intersect the polygon, two new child nodes are created for the front and back fragments,
    //  and added to both arrays.
  splitByPlane: function (plane, coplanarfrontnodes, coplanarbacknodes, frontnodes, backnodes) {
    if (this.children.length) {
      let queue = [this.children]
      let i
      let j
      let l
      let node
      let nodes
      for (i = 0; i < queue.length; i++) { // queue.length can increase, do not cache
        nodes = queue[i]
        for (j = 0, l = nodes.length; j < l; j++) { // ok to cache length
          node = nodes[j]
          if (node.children.length) {
            queue.push(node.children)
          } else {
                        // no children. Split the polygon:
            node._splitByPlane(plane, coplanarfrontnodes, coplanarbacknodes, frontnodes, backnodes)
          }
        }
      }
    } else {
      this._splitByPlane(plane, coplanarfrontnodes, coplanarbacknodes, frontnodes, backnodes)
    }
  },

    // only to be called for nodes with no children
  _splitByPlane: function (plane, coplanarfrontnodes, coplanarbacknodes, frontnodes, backnodes) {
    let polygon = this.polygon
    if (polygon) {
      let bound = polygon.boundingSphere()
      let sphereradius = bound[1] + EPS // FIXME Why add imprecision?
      let planenormal = plane.normal
      let spherecenter = bound[0]
      let d = planenormal.dot(spherecenter) - plane.w
      if (d > sphereradius) {
        frontnodes.push(this)
      } else if (d < -sphereradius) {
        backnodes.push(this)
      } else {
        let splitresult = splitPolygonByPlane(plane, polygon)
        switch (splitresult.type) {
          case 0:
                        // coplanar front:
            coplanarfrontnodes.push(this)
            break

          case 1:
                        // coplanar back:
            coplanarbacknodes.push(this)
            break

          case 2:
                        // front:
            frontnodes.push(this)
            break

          case 3:
                        // back:
            backnodes.push(this)
            break

          case 4:
                        // spanning:
            if (splitresult.front) {
              let frontnode = this.addChild(splitresult.front)
              frontnodes.push(frontnode)
            }
            if (splitresult.back) {
              let backnode = this.addChild(splitresult.back)
              backnodes.push(backnode)
            }
            break
        }
      }
    }
  },

    // PRIVATE methods from here:
    // add child to a node
    // this should be called whenever the polygon is split
    // a child should be created for every fragment of the split polygon
    // returns the newly created child
  addChild: function (polygon) {
    let newchild = new PolygonTreeNode()
    newchild.parent = this
    newchild.polygon = polygon
    this.children.push(newchild)
    return newchild
  },

  invertSub: function () {
    let children = [this]
    let queue = [children]
    let i, j, l, node
    for (i = 0; i < queue.length; i++) {
      children = queue[i]
      for (j = 0, l = children.length; j < l; j++) {
        node = children[j]
        if (node.polygon) {
          node.polygon = node.polygon.flipped()
        }
        queue.push(node.children)
      }
    }
  },

  recursivelyInvalidatePolygon: function () {
    let node = this
    while (node.polygon) {
      node.polygon = null
      if (node.parent) {
        node = node.parent
      }
    }
  }
}

// # class Tree
// This is the root of a BSP tree
// We are using this separate class for the root of the tree, to hold the PolygonTreeNode root
// The actual tree is kept in this.rootnode
const Tree = function (polygons) {
  this.polygonTree = new PolygonTreeNode()
  this.rootnode = new Node(null)
  if (polygons) this.addPolygons(polygons)
}

Tree.prototype = {
  invert: function () {
    this.polygonTree.invert()
    this.rootnode.invert()
  },

    // Remove all polygons in this BSP tree that are inside the other BSP tree
    // `tree`.
  clipTo: function (tree, alsoRemovecoplanarFront) {
    alsoRemovecoplanarFront = !!alsoRemovecoplanarFront
    this.rootnode.clipTo(tree, alsoRemovecoplanarFront)
  },

  allPolygons: function () {
    let result = []
    this.polygonTree.getPolygons(result)
    return result
  },

  addPolygons: function (polygons) {
    let _this = this
    let polygontreenodes = polygons.map(function (p) {
      return _this.polygonTree.addChild(p)
    })
    this.rootnode.addPolygonTreeNodes(polygontreenodes)
  }
}

// # class Node
// Holds a node in a BSP tree. A BSP tree is built from a collection of polygons
// by picking a polygon to split along.
// Polygons are not stored directly in the tree, but in PolygonTreeNodes, stored in
// this.polygontreenodes. Those PolygonTreeNodes are children of the owning
// Tree.polygonTree
// This is not a leafy BSP tree since there is
// no distinction between internal and leaf nodes.
const Node = function (parent) {
  this.plane = null
  this.front = null
  this.back = null
  this.polygontreenodes = []
  this.parent = parent
}

Node.prototype = {
    // Convert solid space to empty space and empty space to solid space.
  invert: function () {
    let queue = [this]
    let node
    for (let i = 0; i < queue.length; i++) {
      node = queue[i]
      if (node.plane) node.plane = node.plane.flipped()
      if (node.front) queue.push(node.front)
      if (node.back) queue.push(node.back)
      let temp = node.front
      node.front = node.back
      node.back = temp
    }
  },

    // clip polygontreenodes to our plane
    // calls remove() for all clipped PolygonTreeNodes
  clipPolygons: function (polygontreenodes, alsoRemovecoplanarFront) {
    let args = {'node': this, 'polygontreenodes': polygontreenodes}
    let node
    let stack = []

    do {
      node = args.node
      polygontreenodes = args.polygontreenodes

            // begin "function"
      if (node.plane) {
        let backnodes = []
        let frontnodes = []
        let coplanarfrontnodes = alsoRemovecoplanarFront ? backnodes : frontnodes
        let plane = node.plane
        let numpolygontreenodes = polygontreenodes.length
        for (let i = 0; i < numpolygontreenodes; i++) {
          let node1 = polygontreenodes[i]
          if (!node1.isRemoved()) {
            node1.splitByPlane(plane, coplanarfrontnodes, backnodes, frontnodes, backnodes)
          }
        }

        if (node.front && (frontnodes.length > 0)) {
          stack.push({'node': node.front, 'polygontreenodes': frontnodes})
        }
        let numbacknodes = backnodes.length
        if (node.back && (numbacknodes > 0)) {
          stack.push({'node': node.back, 'polygontreenodes': backnodes})
        } else {
                    // there's nothing behind this plane. Delete the nodes behind this plane:
          for (let i = 0; i < numbacknodes; i++) {
            backnodes[i].remove()
          }
        }
      }
      args = stack.pop()
    } while (typeof (args) !== 'undefined')
  },

    // Remove all polygons in this BSP tree that are inside the other BSP tree
    // `tree`.
  clipTo: function (tree, alsoRemovecoplanarFront) {
    let node = this
    let stack = []
    do {
      if (node.polygontreenodes.length > 0) {
        tree.rootnode.clipPolygons(node.polygontreenodes, alsoRemovecoplanarFront)
      }
      if (node.front) stack.push(node.front)
      if (node.back) stack.push(node.back)
      node = stack.pop()
    } while (typeof (node) !== 'undefined')
  },

  addPolygonTreeNodes: function (polygontreenodes) {
    let args = {'node': this, 'polygontreenodes': polygontreenodes}
    let node
    let stack = []
    do {
      node = args.node
      polygontreenodes = args.polygontreenodes

      if (polygontreenodes.length === 0) {
        args = stack.pop()
        continue
      }
      let _this = node
      if (!node.plane) {
        let bestplane = polygontreenodes[0].getPolygon().plane
        node.plane = bestplane
      }
      let frontnodes = []
      let backnodes = []

      for (let i = 0, n = polygontreenodes.length; i < n; ++i) {
        polygontreenodes[i].splitByPlane(_this.plane, _this.polygontreenodes, backnodes, frontnodes, backnodes)
      }

      if (frontnodes.length > 0) {
        if (!node.front) node.front = new Node(node)
        stack.push({'node': node.front, 'polygontreenodes': frontnodes})
      }
      if (backnodes.length > 0) {
        if (!node.back) node.back = new Node(node)
        stack.push({'node': node.back, 'polygontreenodes': backnodes})
      }

      args = stack.pop()
    } while (typeof (args) !== 'undefined')
  },

  getParentPlaneNormals: function (normals, maxdepth) {
    if (maxdepth > 0) {
      if (this.parent) {
        normals.push(this.parent.plane.normal)
        this.parent.getParentPlaneNormals(normals, maxdepth - 1)
      }
    }
  }
}

module.exports = Tree

},{"./constants":22,"./math/Polygon3":30,"./math/Vertex3":35}],40:[function(require,module,exports){
function fnNumberSort (a, b) {
  return a - b
}

function fnSortByIndex (a, b) {
  return a.index - b.index
}

const IsFloat = function (n) {
  return (!isNaN(n)) || (n === Infinity) || (n === -Infinity)
}

const solve2Linear = function (a, b, c, d, u, v) {
  let det = a * d - b * c
  let invdet = 1.0 / det
  let x = u * d - b * v
  let y = -u * c + a * v
  x *= invdet
  y *= invdet
  return [x, y]
}

function insertSorted (array, element, comparefunc) {
  let leftbound = 0
  let rightbound = array.length
  while (rightbound > leftbound) {
    let testindex = Math.floor((leftbound + rightbound) / 2)
    let testelement = array[testindex]
    let compareresult = comparefunc(element, testelement)
    if (compareresult > 0) // element > testelement
    {
      leftbound = testindex + 1
    } else {
      rightbound = testindex
    }
  }
  array.splice(leftbound, 0, element)
}

// Get the x coordinate of a point with a certain y coordinate, interpolated between two
// points (CSG.Vector2D).
// Interpolation is robust even if the points have the same y coordinate
const interpolateBetween2DPointsForY = function (point1, point2, y) {
  let f1 = y - point1.y
  let f2 = point2.y - point1.y
  if (f2 < 0) {
    f1 = -f1
    f2 = -f2
  }
  let t
  if (f1 <= 0) {
    t = 0.0
  } else if (f1 >= f2) {
    t = 1.0
  } else if (f2 < 1e-10) { // FIXME Should this be CSG.EPS?
    t = 0.5
  } else {
    t = f1 / f2
  }
  let result = point1.x + t * (point2.x - point1.x)
  return result
}

function isCAG (object) {
  // objects[i] instanceof CAG => NOT RELIABLE
  // 'instanceof' causes huge issues when using objects from
  // two different versions of CSG.js as they are not reckonized as one and the same
  // so DO NOT use instanceof to detect matching types for CSG/CAG
  if (!('sides' in object)) {
    return false
  }
  if (!('length' in object.sides)) {
    return false
  }

  return true
}

function isCSG (object) {
  // objects[i] instanceof CSG => NOT RELIABLE
  // 'instanceof' causes huge issues when using objects from
  // two different versions of CSG.js as they are not reckonized as one and the same
  // so DO NOT use instanceof to detect matching types for CSG/CAG
  if (!('polygons' in object)) {
    return false
  }
  if (!('length' in object.polygons)) {
    return false
  }
  return true
}

module.exports = {
  fnNumberSort,
  fnSortByIndex,
  IsFloat,
  solve2Linear,
  insertSorted,
  interpolateBetween2DPointsForY,
  isCAG,
  isCSG
}

},{}],41:[function(require,module,exports){
const Vector2D = require('../math/Vector2')

// see http://local.wasp.uwa.edu.au/~pbourke/geometry/polyarea/ :
// Area of the polygon. For a counter clockwise rotating polygon the area is positive, otherwise negative
// Note(bebbi): this looks wrong. See polygon getArea()
const area = function (cag) {
  let polygonArea = 0
  cag.sides.map(function (side) {
    polygonArea += side.vertex0.pos.cross(side.vertex1.pos)
  })
  polygonArea *= 0.5
  return polygonArea
}

const getBounds = function (cag) {
  let minpoint
  if (cag.sides.length === 0) {
    minpoint = new Vector2D(0, 0)
  } else {
    minpoint = cag.sides[0].vertex0.pos
  }
  let maxpoint = minpoint
  cag.sides.map(function (side) {
    minpoint = minpoint.min(side.vertex0.pos)
    minpoint = minpoint.min(side.vertex1.pos)
    maxpoint = maxpoint.max(side.vertex0.pos)
    maxpoint = maxpoint.max(side.vertex1.pos)
  })
  return [minpoint, maxpoint]
}

module.exports = {area, getBounds}

},{"../math/Vector2":32}],42:[function(require,module,exports){
const {areaEPS} = require('../constants')
const {linesIntersect} = require('../math/lineUtils')

// check if we are a valid CAG (for debugging)
// NOTE(bebbi) uneven side count doesn't work because rounding with EPS isn't taken into account
const isCAGValid = function (CAG) {
  let errors = []
  if (CAG.isSelfIntersecting(true)) {
    errors.push('Self intersects')
  }
  let pointcount = {}
  CAG.sides.map(function (side) {
    function mappoint (p) {
      let tag = p.x + ' ' + p.y
      if (!(tag in pointcount)) pointcount[tag] = 0
      pointcount[tag] ++
    }
    mappoint(side.vertex0.pos)
    mappoint(side.vertex1.pos)
  })
  for (let tag in pointcount) {
    let count = pointcount[tag]
    if (count & 1) {
      errors.push('Uneven number of sides (' + count + ') for point ' + tag)
    }
  }
  let area = CAG.area()
  if (area < areaEPS) {
    errors.push('Area is ' + area)
  }
  if (errors.length > 0) {
    let ertxt = ''
    errors.map(function (err) {
      ertxt += err + '\n'
    })
    throw new Error(ertxt)
  }
}

const isSelfIntersecting = function (cag, debug) {
  let numsides = cag.sides.length
  for (let i = 0; i < numsides; i++) {
    let side0 = cag.sides[i]
    for (let ii = i + 1; ii < numsides; ii++) {
      let side1 = cag.sides[ii]
      if (linesIntersect(side0.vertex0.pos, side0.vertex1.pos, side1.vertex0.pos, side1.vertex1.pos)) {
        if (debug) { console.log('side ' + i + ': ' + side0); console.log('side ' + ii + ': ' + side1) }
        return true
      }
    }
  }
  return false
}

module.exports = {isCAGValid, isSelfIntersecting}

},{"../constants":22,"../math/lineUtils":36}],43:[function(require,module,exports){
const {EPS} = require('../constants')
const FuzzyCSGFactory = require('../FuzzyFactory3d')
const FuzzyCAGFactory = require('../FuzzyFactory2d')
const {fromPolygons} = require('../CSGFactories')
const {fromSides} = require('../CAGFactories')

/**
   * Returns a cannoicalized version of the input csg/cag : ie every very close
   * points get deduplicated
   * @returns {CSG|CAG}
   * @example
   * let rawInput = someCSGORCAGMakingFunction()
   * let canonicalized= canonicalize(rawInput)
   */
const canonicalize = function (csgOrCAG, options) {
  if (csgOrCAG.isCanonicalized) {
    return csgOrCAG
  } else {
    if ('sides' in csgOrCAG) {
      return canonicalizeCAG(csgOrCAG, options)
    } else {
      return canonicalizeCSG(csgOrCAG, options)
    }
  }
}

/**
   * Returns a cannoicalized version of the input csg : ie every very close
   * points get deduplicated
   * @returns {CSG}
   * @example
   * let rawCSG = someCSGMakingFunction()
   * let canonicalizedCSG = canonicalize(rawCSG)
   */
const canonicalizeCSG = function (csg, options) {
  if (csg.isCanonicalized) {
    return csg
  } else {
    const factory = new FuzzyCSGFactory()
    let result = CSGFromCSGFuzzyFactory(factory, csg)
    result.isCanonicalized = true
    result.isRetesselated = csg.isRetesselated
    result.properties = csg.properties // keep original properties
    return result
  }
}

const canonicalizeCAG = function (cag, options) {
  if (cag.isCanonicalized) {
    return cag
  } else {
    let factory = new FuzzyCAGFactory()
    let result = CAGFromCAGFuzzyFactory(factory, cag)
    result.isCanonicalized = true
    return result
  }
}

const CSGFromCSGFuzzyFactory = function (factory, sourcecsg) {
  let _this = factory
  let newpolygons = []
  sourcecsg.polygons.forEach(function (polygon) {
    let newpolygon = _this.getPolygon(polygon)
          // see getPolygon above: we may get a polygon with no vertices, discard it:
    if (newpolygon.vertices.length >= 3) {
      newpolygons.push(newpolygon)
    }
  })
  return fromPolygons(newpolygons)
}

const CAGFromCAGFuzzyFactory = function (factory, sourcecag) {
  let _this = factory
  let newsides = sourcecag.sides.map(function (side) {
    return _this.getSide(side)
  })
  // remove bad sides (mostly a user input issue)
  .filter(function (side) {
    return side.length() > EPS
  })
  return fromSides(newsides)
}

module.exports = canonicalize

},{"../CAGFactories":14,"../CSGFactories":16,"../FuzzyFactory2d":18,"../FuzzyFactory3d":19,"../constants":22}],44:[function(require,module,exports){
const Vector3D = require('../math/Vector3')

/**
   * Returns an array of Vector3D, providing minimum coordinates and maximum coordinates
   * of this solid.
   * @returns {Vector3D[]}
   * @example
   * let bounds = A.getBounds()
   * let minX = bounds[0].x
   */
const bounds = function (csg) {
  if (!csg.cachedBoundingBox) {
    let minpoint = new Vector3D(0, 0, 0)
    let maxpoint = new Vector3D(0, 0, 0)
    let polygons = csg.polygons
    let numpolygons = polygons.length
    for (let i = 0; i < numpolygons; i++) {
      let polygon = polygons[i]
      let bounds = polygon.boundingBox()
      if (i === 0) {
        minpoint = bounds[0]
        maxpoint = bounds[1]
      } else {
        minpoint = minpoint.min(bounds[0])
        maxpoint = maxpoint.max(bounds[1])
      }
    }
      // FIXME: not ideal, we are mutating the input, we need to move some of it out
    csg.cachedBoundingBox = [minpoint, maxpoint]
  }
  return csg.cachedBoundingBox
}

const volume = function (csg) {
  let result = csg.toTriangles().map(function (triPoly) {
    return triPoly.getTetraFeatures(['volume'])
  })
  console.log('volume', result)
}

const area = function (csg) {
  let result = csg.toTriangles().map(function (triPoly) {
    return triPoly.getTetraFeatures(['area'])
  })
  console.log('area', result)
}

module.exports = {bounds, volume, area}

},{"../math/Vector3":33}],45:[function(require,module,exports){
const CAG = require('../CAG') // FIXME: circular dependency !
const {EPS} = require('../constants')

// project the 3D CSG onto a plane
// This returns a 2D CAG with the 'shadow' shape of the 3D solid when projected onto the
 // plane represented by the orthonormal basis
const projectToOrthoNormalBasis = function (csg, orthobasis) {
  let cags = []
  csg.polygons.filter(function (p) {
    // only return polys in plane, others may disturb result
    return p.plane.normal.minus(orthobasis.plane.normal).lengthSquared() < (EPS * EPS)
  })
  .map(function (polygon) {
    let cag = polygon.projectToOrthoNormalBasis(orthobasis)
    if (cag.sides.length > 0) {
      cags.push(cag)
    }
  })
  let result = new CAG().union(cags)
  return result
}

module.exports = {projectToOrthoNormalBasis}

},{"../CAG":13,"../constants":22}],46:[function(require,module,exports){
const {EPS} = require('../constants')
const Polygon = require('../math/Polygon3')
const Plane = require('../math/Plane')

function addSide (sidemap, vertextag2sidestart, vertextag2sideend, vertex0, vertex1, polygonindex) {
  let starttag = vertex0.getTag()
  let endtag = vertex1.getTag()
  if (starttag === endtag) throw new Error('Assertion failed')
  let newsidetag = starttag + '/' + endtag
  let reversesidetag = endtag + '/' + starttag
  if (reversesidetag in sidemap) {
    // we have a matching reverse oriented side.
    // Instead of adding the new side, cancel out the reverse side:
    // console.log("addSide("+newsidetag+") has reverse side:");
    deleteSide(sidemap, vertextag2sidestart, vertextag2sideend, vertex1, vertex0, null)
    return null
  }
  //  console.log("addSide("+newsidetag+")");
  let newsideobj = {
    vertex0: vertex0,
    vertex1: vertex1,
    polygonindex: polygonindex
  }
  if (!(newsidetag in sidemap)) {
    sidemap[newsidetag] = [newsideobj]
  } else {
    sidemap[newsidetag].push(newsideobj)
  }
  if (starttag in vertextag2sidestart) {
    vertextag2sidestart[starttag].push(newsidetag)
  } else {
    vertextag2sidestart[starttag] = [newsidetag]
  }
  if (endtag in vertextag2sideend) {
    vertextag2sideend[endtag].push(newsidetag)
  } else {
    vertextag2sideend[endtag] = [newsidetag]
  }
  return newsidetag
}

function deleteSide (sidemap, vertextag2sidestart, vertextag2sideend, vertex0, vertex1, polygonindex) {
  let starttag = vertex0.getTag()
  let endtag = vertex1.getTag()
  let sidetag = starttag + '/' + endtag
  // console.log("deleteSide("+sidetag+")");
  if (!(sidetag in sidemap)) throw new Error('Assertion failed')
  let idx = -1
  let sideobjs = sidemap[sidetag]
  for (let i = 0; i < sideobjs.length; i++) {
    let sideobj = sideobjs[i]
    if (sideobj.vertex0 !== vertex0) continue
    if (sideobj.vertex1 !== vertex1) continue
    if (polygonindex !== null) {
      if (sideobj.polygonindex !== polygonindex) continue
    }
    idx = i
    break
  }
  if (idx < 0) throw new Error('Assertion failed')
  sideobjs.splice(idx, 1)
  if (sideobjs.length === 0) {
    delete sidemap[sidetag]
  }
  idx = vertextag2sidestart[starttag].indexOf(sidetag)
  if (idx < 0) throw new Error('Assertion failed')
  vertextag2sidestart[starttag].splice(idx, 1)
  if (vertextag2sidestart[starttag].length === 0) {
    delete vertextag2sidestart[starttag]
  }

  idx = vertextag2sideend[endtag].indexOf(sidetag)
  if (idx < 0) throw new Error('Assertion failed')
  vertextag2sideend[endtag].splice(idx, 1)
  if (vertextag2sideend[endtag].length === 0) {
    delete vertextag2sideend[endtag]
  }
}

/*
     fixTJunctions:

     Suppose we have two polygons ACDB and EDGF:

      A-----B
      |     |
      |     E--F
      |     |  |
      C-----D--G

     Note that vertex E forms a T-junction on the side BD. In this case some STL slicers will complain
     that the solid is not watertight. This is because the watertightness check is done by checking if
     each side DE is matched by another side ED.

     This function will return a new solid with ACDB replaced by ACDEB

     Note that this can create polygons that are slightly non-convex (due to rounding errors). Therefore the result should
     not be used for further CSG operations!
*/
const fixTJunctions = function (fromPolygons, csg) {
  csg = csg.canonicalized()
  let sidemap = {}

  // STEP 1
  for (let polygonindex = 0; polygonindex < csg.polygons.length; polygonindex++) {
    let polygon = csg.polygons[polygonindex]
    let numvertices = polygon.vertices.length
    // should be true
    if (numvertices >= 3) {
      let vertex = polygon.vertices[0]
      let vertextag = vertex.getTag()
      for (let vertexindex = 0; vertexindex < numvertices; vertexindex++) {
        let nextvertexindex = vertexindex + 1
        if (nextvertexindex === numvertices) nextvertexindex = 0
        let nextvertex = polygon.vertices[nextvertexindex]
        let nextvertextag = nextvertex.getTag()
        let sidetag = vertextag + '/' + nextvertextag
        let reversesidetag = nextvertextag + '/' + vertextag
        if (reversesidetag in sidemap) {
          // this side matches the same side in another polygon. Remove from sidemap:
          let ar = sidemap[reversesidetag]
          ar.splice(-1, 1)
          if (ar.length === 0) {
            delete sidemap[reversesidetag]
          }
        } else {
          let sideobj = {
            vertex0: vertex,
            vertex1: nextvertex,
            polygonindex: polygonindex
          }
          if (!(sidetag in sidemap)) {
            sidemap[sidetag] = [sideobj]
          } else {
            sidemap[sidetag].push(sideobj)
          }
        }
        vertex = nextvertex
        vertextag = nextvertextag
      }
    }
  }
  // STEP 2
  // now sidemap contains 'unmatched' sides
  // i.e. side AB in one polygon does not have a matching side BA in another polygon
  let vertextag2sidestart = {}
  let vertextag2sideend = {}
  let sidestocheck = {}
  let sidemapisempty = true
  for (let sidetag in sidemap) {
    sidemapisempty = false
    sidestocheck[sidetag] = true
    sidemap[sidetag].map(function (sideobj) {
      let starttag = sideobj.vertex0.getTag()
      let endtag = sideobj.vertex1.getTag()
      if (starttag in vertextag2sidestart) {
        vertextag2sidestart[starttag].push(sidetag)
      } else {
        vertextag2sidestart[starttag] = [sidetag]
      }
      if (endtag in vertextag2sideend) {
        vertextag2sideend[endtag].push(sidetag)
      } else {
        vertextag2sideend[endtag] = [sidetag]
      }
    })
  }

  // STEP 3 : if sidemap is not empty
  if (!sidemapisempty) {
    // make a copy of the polygons array, since we are going to modify it:
    let polygons = csg.polygons.slice(0)
    while (true) {
      let sidemapisempty = true
      for (let sidetag in sidemap) {
        sidemapisempty = false
        sidestocheck[sidetag] = true
      }
      if (sidemapisempty) break
      let donesomething = false
      while (true) {
        let sidetagtocheck = null
        for (let sidetag in sidestocheck) {
          sidetagtocheck = sidetag
          break // FIXME  : say what now ?
        }
        if (sidetagtocheck === null) break // sidestocheck is empty, we're done!
        let donewithside = true
        if (sidetagtocheck in sidemap) {
          let sideobjs = sidemap[sidetagtocheck]
          if (sideobjs.length === 0) throw new Error('Assertion failed')
          let sideobj = sideobjs[0]
          for (let directionindex = 0; directionindex < 2; directionindex++) {
            let startvertex = (directionindex === 0) ? sideobj.vertex0 : sideobj.vertex1
            let endvertex = (directionindex === 0) ? sideobj.vertex1 : sideobj.vertex0
            let startvertextag = startvertex.getTag()
            let endvertextag = endvertex.getTag()
            let matchingsides = []
            if (directionindex === 0) {
              if (startvertextag in vertextag2sideend) {
                matchingsides = vertextag2sideend[startvertextag]
              }
            } else {
              if (startvertextag in vertextag2sidestart) {
                matchingsides = vertextag2sidestart[startvertextag]
              }
            }
            for (let matchingsideindex = 0; matchingsideindex < matchingsides.length; matchingsideindex++) {
              let matchingsidetag = matchingsides[matchingsideindex]
              let matchingside = sidemap[matchingsidetag][0]
              let matchingsidestartvertex = (directionindex === 0) ? matchingside.vertex0 : matchingside.vertex1
              let matchingsideendvertex = (directionindex === 0) ? matchingside.vertex1 : matchingside.vertex0
              let matchingsidestartvertextag = matchingsidestartvertex.getTag()
              let matchingsideendvertextag = matchingsideendvertex.getTag()
              if (matchingsideendvertextag !== startvertextag) throw new Error('Assertion failed')
              if (matchingsidestartvertextag === endvertextag) {
                // matchingside cancels sidetagtocheck
                deleteSide(sidemap, vertextag2sidestart, vertextag2sideend, startvertex, endvertex, null)
                deleteSide(sidemap, vertextag2sidestart, vertextag2sideend, endvertex, startvertex, null)
                donewithside = false
                directionindex = 2 // skip reverse direction check
                donesomething = true
                break
              } else {
                let startpos = startvertex.pos
                let endpos = endvertex.pos
                let checkpos = matchingsidestartvertex.pos
                let direction = checkpos.minus(startpos)
                // Now we need to check if endpos is on the line startpos-checkpos:
                let t = endpos.minus(startpos).dot(direction) / direction.dot(direction)
                if ((t > 0) && (t < 1)) {
                  let closestpoint = startpos.plus(direction.times(t))
                  let distancesquared = closestpoint.distanceToSquared(endpos)
                  if (distancesquared < (EPS * EPS)) {
                    // Yes it's a t-junction! We need to split matchingside in two:
                    let polygonindex = matchingside.polygonindex
                    let polygon = polygons[polygonindex]
                    // find the index of startvertextag in polygon:
                    let insertionvertextag = matchingside.vertex1.getTag()
                    let insertionvertextagindex = -1
                    for (let i = 0; i < polygon.vertices.length; i++) {
                      if (polygon.vertices[i].getTag() === insertionvertextag) {
                        insertionvertextagindex = i
                        break
                      }
                    }
                    if (insertionvertextagindex < 0) throw new Error('Assertion failed')
                    // split the side by inserting the vertex:
                    let newvertices = polygon.vertices.slice(0)
                    newvertices.splice(insertionvertextagindex, 0, endvertex)
                    let newpolygon = new Polygon(newvertices, polygon.shared /* polygon.plane */)

                    // calculate plane with differents point
                    if (isNaN(newpolygon.plane.w)) {
                      let found = false
                      let loop = function (callback) {
                        newpolygon.vertices.forEach(function (item) {
                          if (found) return
                          callback(item)
                        })
                      }

                      loop(function (a) {
                        loop(function (b) {
                          loop(function (c) {
                            newpolygon.plane = Plane.fromPoints(a.pos, b.pos, c.pos)
                            if (!isNaN(newpolygon.plane.w)) {
                              found = true
                            }
                          })
                        })
                      })
                    }
                    polygons[polygonindex] = newpolygon
                    // remove the original sides from our maps
                    // deleteSide(sideobj.vertex0, sideobj.vertex1, null)
                    deleteSide(sidemap, vertextag2sidestart, vertextag2sideend, matchingside.vertex0, matchingside.vertex1, polygonindex)
                    let newsidetag1 = addSide(sidemap, vertextag2sidestart, vertextag2sideend, matchingside.vertex0, endvertex, polygonindex)
                    let newsidetag2 = addSide(sidemap, vertextag2sidestart, vertextag2sideend, endvertex, matchingside.vertex1, polygonindex)
                    if (newsidetag1 !== null) sidestocheck[newsidetag1] = true
                    if (newsidetag2 !== null) sidestocheck[newsidetag2] = true
                    donewithside = false
                    directionindex = 2 // skip reverse direction check
                    donesomething = true
                    break
                  } // if(distancesquared < 1e-10)
                } // if( (t > 0) && (t < 1) )
              } // if(endingstidestartvertextag === endvertextag)
            } // for matchingsideindex
          } // for directionindex
        } // if(sidetagtocheck in sidemap)
        if (donewithside) {
          delete sidestocheck[sidetagtocheck]
        }
      }
      if (!donesomething) break
    }
    let newcsg = fromPolygons(polygons)
    newcsg.properties = csg.properties
    newcsg.isCanonicalized = true
    newcsg.isRetesselated = true
    csg = newcsg
  }

  // FIXME : what is even the point of this ???
  /* sidemapisempty = true
  for (let sidetag in sidemap) {
    sidemapisempty = false
    break
  }
  */

  return csg
}

module.exports = fixTJunctions

},{"../constants":22,"../math/Plane":28,"../math/Polygon3":30}],47:[function(require,module,exports){
const FuzzyCSGFactory = require('../FuzzyFactory3d')
const reTesselateCoplanarPolygons = require('../math/reTesselateCoplanarPolygons')
const {fromPolygons} = require('../CSGFactories')

const reTesselate = function (csg) {
  if (csg.isRetesselated) {
    return csg
  } else {
    let polygonsPerPlane = {}
    let isCanonicalized = csg.isCanonicalized
    let fuzzyfactory = new FuzzyCSGFactory()
    csg.polygons.map(function (polygon) {
      let plane = polygon.plane
      let shared = polygon.shared
      if (!isCanonicalized) {
        // in order to identify polygons having the same plane, we need to canonicalize the planes
        // We don't have to do a full canonizalization (including vertices), to save time only do the planes and the shared data:
        plane = fuzzyfactory.getPlane(plane)
        shared = fuzzyfactory.getPolygonShared(shared)
      }
      let tag = plane.getTag() + '/' + shared.getTag()
      if (!(tag in polygonsPerPlane)) {
        polygonsPerPlane[tag] = [polygon]
      } else {
        polygonsPerPlane[tag].push(polygon)
      }
    })
    let destpolygons = []
    for (let planetag in polygonsPerPlane) {
      let sourcepolygons = polygonsPerPlane[planetag]
      if (sourcepolygons.length < 2) {
        destpolygons = destpolygons.concat(sourcepolygons)
      } else {
        let retesselayedpolygons = []
        reTesselateCoplanarPolygons(sourcepolygons, retesselayedpolygons)
        destpolygons = destpolygons.concat(retesselayedpolygons)
      }
    }
    let result = fromPolygons(destpolygons)
    result.isRetesselated = true
    // result = result.canonicalized();
    result.properties = csg.properties // keep original properties
    return result
  }
}

module.exports = reTesselate

},{"../CSGFactories":16,"../FuzzyFactory3d":19,"../math/reTesselateCoplanarPolygons":37}]},{},[1])(1)
});