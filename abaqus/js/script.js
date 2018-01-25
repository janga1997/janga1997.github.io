pythonFile = `from part import *
from material import *
from section import *
from assembly import *
from step import *
from interaction import *
from load import *
from mesh import *
from job import *
from sketch import *
from visualization import *
from connectorBehavior import *

import os, json

def corners(x, y, radius, breadth, length):
    if x < radius:
        return True

    elif x > breadth - radius:
        return True

    if y < radius:
        return True

    elif y > length - radius:
        return True

    return False

def automateMicro(data):

    masterOBJ = data
    breadth = float(masterOBJ['breadthMatrix'])
    length = float(masterOBJ['lengthMatrix'])
    height = float(masterOBJ['depthMatrix'])

    sheetSize = max(breadth, length) + 10

    mdb.models['Model-1'].ConstrainedSketch(name='__profile__', sheetSize=sheetSize)
    mdb.models['Model-1'].sketches['__profile__'].rectangle(point1=(0, 0), point2=(breadth, length))

    print('Extrude started')
    mdb.models['Model-1'].Part(dimensionality=THREE_D, name='Matrix', type=DEFORMABLE_BODY)

    mdb.models['Model-1'].parts['Matrix'].BaseSolidExtrude(depth=height, sketch=
        mdb.models['Model-1'].sketches['__profile__'])
    print('Extrude stopped')
    del mdb.models['Model-1'].sketches['__profile__']

    mdb.models['Model-1'].ConstrainedSketch(gridSpacing=1, name='__profile__', 
        sheetSize=sheetSize, transform=
        mdb.models['Model-1'].parts['Matrix'].MakeSketchTransform(
        sketchPlane=mdb.models['Model-1'].parts['Matrix'].faces[4], 
        sketchPlaneSide=SIDE1, 
        sketchUpEdge=mdb.models['Model-1'].parts['Matrix'].edges[0], 
        sketchOrientation=RIGHT, origin=(0, 0, 0)))

    mdb.models['Model-1'].parts['Matrix'].projectReferencesOntoSketch(filter=
        COPLANAR_EDGES, sketch=mdb.models['Model-1'].sketches['__profile__'])

    for ii, var in enumerate(masterOBJ['generatedCenters']):

        center = var[:2]
        x, y = center
        radius = var[2]
        mdb.models['Model-1'].sketches['__profile__'].CircleByCenterPerimeter(center=center, point1=(x + radius, y))

        fibre_name = 'Fibre_' + str(ii)

        print(fibre_name, 'Completed')

        mdb.models['Model-1'].ConstrainedSketch(name='__fibre__', sheetSize=sheetSize)
        mdb.models['Model-1'].sketches['__fibre__'].CircleByCenterPerimeter(center=center, point1=(x + radius, y))
        mdb.models['Model-1'].Part(dimensionality=THREE_D, name=fibre_name, type=DEFORMABLE_BODY)
        mdb.models['Model-1'].parts[fibre_name].BaseSolidExtrude(depth=height, sketch=
            mdb.models['Model-1'].sketches['__fibre__'])
        del mdb.models['Model-1'].sketches['__fibre__']

        if corners(x, y, radius, breadth, length):
            mdb.models['Model-1'].ConstrainedSketch(gridSpacing=1, name='__fibre__', 
                sheetSize=sheetSize, transform=
                mdb.models['Model-1'].parts[fibre_name].MakeSketchTransform(
                sketchPlane=mdb.models['Model-1'].parts[fibre_name].faces[1], 
                sketchPlaneSide=SIDE1, 
                sketchUpEdge=mdb.models['Model-1'].parts[fibre_name].edges[0], 
                sketchOrientation=RIGHT, origin=(0, 0, 0)))

            mdb.models['Model-1'].parts[fibre_name].projectReferencesOntoSketch(filter=
                COPLANAR_EDGES, sketch=mdb.models['Model-1'].sketches['__fibre__'])

            mdb.models['Model-1'].sketches['__fibre__'].rectangle(point1=(0, 0), point2=(breadth, length))
            mdb.models['Model-1'].sketches['__fibre__'].rectangle(point1=(-breadth, -length), point2=(breadth*2, length*2))

            mdb.models['Model-1'].parts[fibre_name].CutExtrude(flipExtrudeDirection=OFF, 
                sketch=mdb.models['Model-1'].sketches['__fibre__'], sketchOrientation=
                RIGHT, sketchPlane=mdb.models['Model-1'].parts[fibre_name].faces[1], 
                sketchPlaneSide=SIDE1, sketchUpEdge=
                mdb.models['Model-1'].parts[fibre_name].edges[0])

            del mdb.models['Model-1'].sketches['__fibre__']


    mdb.models['Model-1'].parts['Matrix'].CutExtrude(flipExtrudeDirection=OFF, 
        sketch=mdb.models['Model-1'].sketches['__profile__'], sketchOrientation=
        RIGHT, sketchPlane=mdb.models['Model-1'].parts['Matrix'].faces[4], 
        sketchPlaneSide=SIDE1, sketchUpEdge=
        mdb.models['Model-1'].parts['Matrix'].edges[0])
    del mdb.models['Model-1'].sketches['__profile__']

    ### Materials
    mdb.models['Model-1'].Material(name='Fibre')
    mdb.models['Model-1'].materials['Fibre'].Elastic(table=((masterOBJ["fibreYM"], masterOBJ["fibrePR"]), ))
    mdb.models['Model-1'].Material(name='Matrix')
    mdb.models['Model-1'].materials['Matrix'].Elastic(table=((masterOBJ["matrixYM"], masterOBJ["matrixPR"]), ))
    mdb.models['Model-1'].HomogeneousSolidSection(material='Fibre', name='fibre', 
        thickness=None)
    mdb.models['Model-1'].HomogeneousSolidSection(material='Matrix', name='matrix', 
        thickness=None)

    # Set Materials
    mdb.models['Model-1'].parts['Matrix'].Set(cells=
        mdb.models['Model-1'].parts['Matrix'].cells.getSequenceFromMask(('[#1 ]', 
        ), ), name='Set-1')
    mdb.models['Model-1'].parts['Matrix'].SectionAssignment(offset=0.0, 
        offsetField='', offsetType=MIDDLE_SURFACE, region=
        mdb.models['Model-1'].parts['Matrix'].sets['Set-1'], sectionName='matrix', 
        thicknessAssignment=FROM_SECTION)

    for ii in range(len(masterOBJ['generatedCenters'])):

        fibre_name = 'Fibre_'+str(ii)
               
        mdb.models['Model-1'].parts[fibre_name].Set(cells=
            mdb.models['Model-1'].parts[fibre_name].cells.getSequenceFromMask(('[#1 ]', ), 
            ), name='Set-1')
        mdb.models['Model-1'].parts[fibre_name].SectionAssignment(offset=0.0, offsetField=
            '', offsetType=MIDDLE_SURFACE, region=
            mdb.models['Model-1'].parts[fibre_name].sets['Set-1'], sectionName='fibre', 
            thicknessAssignment=FROM_SECTION)


    mdb.models['Model-1'].rootAssembly.DatumCsysByDefault(CARTESIAN)

    # Assembly
    mdb.models['Model-1'].rootAssembly.Instance(dependent=ON, name='Matrix_instance',
        part=mdb.models['Model-1'].parts['Matrix'])

    for ii in range(len(masterOBJ['generatedCenters'])):

        fibre_name = 'Fibre_'+str(ii)
        fibre_instance = fibre_name + '_instance'
        mdb.models['Model-1'].rootAssembly.Instance(dependent=ON, name=fibre_instance, part=
            mdb.models['Model-1'].parts[fibre_name])

    mdb.models['Model-1'].StaticStep(name='Step-1', previous='Initial')

    for ii, var in enumerate(masterOBJ['generatedCenters']):

        x, y = var[:2]
        radius = var[2]

        fibre_name = 'Fibre_'+str(ii)
        fibre_instance = fibre_name + '_instance'

        matrix_surface = 'Matrix_' + str(ii)
        fibre_surface = 'FibS_' + str(ii)

        #Matrix Surfaces
        surface_point = (x + radius, y, height/2)

        if x + radius > breadth:
            surface_point = (x - radius, y, height/2)

        mdb.models['Model-1'].rootAssembly.Surface(name=matrix_surface, side1Faces=
            mdb.models['Model-1'].rootAssembly.instances['Matrix_instance'].faces.findAt((surface_point,),))

        #Fibre Surfaces
        mdb.models['Model-1'].rootAssembly.Surface(name=fibre_surface, side1Faces=
            mdb.models['Model-1'].rootAssembly.instances[fibre_instance].faces.findAt((surface_point,),))

    for ii in range(len(masterOBJ['generatedCenters'])):

        matrix_surface = 'Matrix_' + str(ii)
        fibre_surface = 'FibS_' + str(ii)
        constraint_name = 'Constraint_' + str(ii)

        mdb.models['Model-1'].Tie(adjust=ON, master=
            mdb.models['Model-1'].rootAssembly.surfaces[fibre_surface], name=
            constraint_name, positionToleranceMethod=COMPUTED, slave=
            mdb.models['Model-1'].rootAssembly.surfaces[matrix_surface], thickness=ON, 
            tieRotations=ON)

    # Load Application

    point = tuple(masterOBJ['loadSurfaces'][0])
    loadRegion = mdb.models['Model-1'].rootAssembly.instances[str(point[0] + '_instance')].faces.findAt((point[1:],),)
    for point in masterOBJ['loadSurfaces'][1:]:
        point = tuple(point)
        loadRegion += mdb.models['Model-1'].rootAssembly.instances[str(point[0] + '_instance')].faces.findAt((point[1:],),)

    mdb.models['Model-1'].Pressure(amplitude=UNSET, createStepName='Step-1', 
        distributionType=UNIFORM, field='', magnitude=masterOBJ['loadMagnitude'], name='Load-1', region=Region(side1Faces=loadRegion))

    # mdb.models['Model-1'].rootAssembly.Surface(name='Surf-3', side1Faces=
    #     mdb.models['Model-1'].rootAssembly.instances['Matrix_instance'].faces.findAt(((0, length/2, height/2),),))
    # mdb.models['Model-1'].rootAssembly.Surface(name='Surf-4', side1Faces=
    #     mdb.models['Model-1'].rootAssembly.instances['Matrix_instance'].faces.findAt(((breadth, length/2, height/2),),))
    # mdb.models['Model-1'].Pressure(amplitude=UNSET, createStepName='Step-1', 
    #     distributionType=UNIFORM, field='', magnitude=-1.0, name='Load-2', region=
    #     mdb.models['Model-1'].rootAssembly.surfaces['Surf-4'])

    instances = []
    for ii in range(len(masterOBJ['generatedCenters'])):

        fibre_name = 'Fibre_'+str(ii)
        fibre_instance = fibre_name + '_instance'
        instances.append( mdb.models['Model-1'].rootAssembly.instances[fibre_instance])

    instances.append(mdb.models['Model-1'].rootAssembly.instances['Matrix_instance'])

    mdb.models['Model-1'].rootAssembly.makeIndependent(instances=instances)

    meshSize = masterOBJ['meshSeed']
    meshSize = float(meshSize)
    mdb.models['Model-1'].rootAssembly.seedPartInstance(deviationFactor=0.01, 
        minSizeFactor=0.5, regions=instances, size=meshSize)

    mdb.models['Model-1'].rootAssembly.generateMesh(regions=instances)


`
