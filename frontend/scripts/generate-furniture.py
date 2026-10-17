"""Original Japandi furniture. Run with Blender --background --python ... -- bed.

Dimensions are authored in metres (Blender Z up, front -Y), exported as glTF Y up,
front +Z. Textures are original deterministic 1k PBR patterns embedded in each GLB.
No downloaded geometry, add-ons, lights, cameras or animation are exported.
"""
import argparse
import json
import math
import sys
import tempfile
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'static/models'
TEXTURES = Path(tempfile.mkdtemp(prefix='codex-furniture-textures-'))
MATERIALS = {}


def image(name, pixels, color=True):
    h, w = pixels.shape[:2]
    img = bpy.data.images.new(name, width=w, height=h, alpha=False)
    img.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    rgba = np.ones((h, w, 4), dtype=np.float32)
    # Keep 1k resolution while avoiding PNG entropy from imperceptible channel noise.
    rgba[:, :, :3] = np.round(pixels * 127) / 127 if not color and 'grain' in name else pixels
    img.pixels.foreach_set(rgba.ravel())
    jpeg = color and 'grain' in name
    img.filepath_raw = str(TEXTURES / (name + ('.jpg' if jpeg else '.png')))
    img.file_format = 'JPEG' if jpeg else 'PNG'
    img.save()
    img.pack()
    return img


def material(name, color, rough=0.5, metal=0, pattern=None, transmission=0):
    if name in MATERIALS:
        return MATERIALS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Transmission Weight'].default_value = transmission
    if transmission:
        bs.inputs['IOR'].default_value = 1.45
    if pattern:
        y, x = np.mgrid[0:1024, 0:1024].astype(np.float32) / 1024
        if pattern == 'wood':
            grain = np.sin(2 * math.pi * (x * 55 + .65 * np.sin(2 * math.pi * y) + .2 * np.sin(6 * math.pi * y)))
            detail = np.sin(2 * math.pi * (x * 191 + .8 * np.sin(4 * math.pi * y)))
            v = .035 * grain + .012 * detail + .015 * np.sin(2 * math.pi * x * 6)
            height = grain * .10 + detail * .03
        else:
            # Alternating warp/weft relief, periodic so every material tiles cleanly.
            a, b = np.sin(2 * math.pi * x * 128), np.sin(2 * math.pi * y * 128)
            v = .02 * a * b + .008 * np.cos(2 * math.pi * y * 7)
            height = a * b * .14
        rgb = np.clip(np.array(color)[None, None, :] + v[:, :, None], 0, 1)
        tex = m.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = image(name + '-baseColor', rgb)
        m.node_tree.links.new(tex.outputs['Color'], bs.inputs['Base Color'])
        dy, dx = np.gradient(height)
        normal = np.stack([-dx, -dy, np.ones_like(dx)], axis=-1)
        normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
        ntex = m.node_tree.nodes.new('ShaderNodeTexImage')
        ntex.image = image(name + '-normal', normal * .5 + .5, False)
        nmap = m.node_tree.nodes.new('ShaderNodeNormalMap')
        m.node_tree.links.new(ntex.outputs['Color'], nmap.inputs['Color'])
        m.node_tree.links.new(nmap.outputs['Normal'], bs.inputs['Normal'])
        # Exporter packs roughness/metalness into glTF's G/B channels.
        orm = np.stack([np.ones_like(x), np.clip(rough + v, 0, 1), np.full_like(x, metal)], axis=-1)
        otex = m.node_tree.nodes.new('ShaderNodeTexImage')
        otex.image = image(name + '-ORM', orm, False)
        sep = m.node_tree.nodes.new('ShaderNodeSeparateColor')
        m.node_tree.links.new(otex.outputs['Color'], sep.inputs['Color'])
        m.node_tree.links.new(sep.outputs['Green'], bs.inputs['Roughness'])
        m.node_tree.links.new(sep.outputs['Blue'], bs.inputs['Metallic'])
    MATERIALS[name] = m
    return m


def palette():
    return {
        'oak': material('oak-honey-grain', (.55, .38, .22), .42, pattern='wood'),
        'darkwood': material('oak-smoked', (.23, .14, .085), .45),
        'linen': material('linen-warm-ivory', (.86, .82, .72), .92, pattern='linen'),
        'sage': material('linen-sage', (.39, .44, .35), .9, pattern='linen'),
        'taupe': material('woven-taupe', (.51, .43, .34), .9, pattern='linen'),
        'white': material('porcelain-warm-white', (.92, .91, .86), .22),
        'paint': material('enamel-soft-white', (.85, .85, .81), .32),
        'stone': material('limestone-ivory', (.72, .69, .61), .55, pattern='linen'),
        'black': material('metal-matte-charcoal', (.025, .03, .027), .45, .55),
        'steel': material('metal-brushed-stainless', (.55, .57, .56), .3, .92),
        'glass': material('glass-clear', (.94, .98, .97), .08, transmission=1),
        'screen': material('glass-smoked-screen', (.012, .022, .028), .15, .32),
        'mirror': material('mirror-silver', (.95, .95, .95), .035, 1),
        'green': material('foliage-olive', (.12, .24, .10), .58),
        'green2': material('foliage-sage', (.23, .35, .13), .65),
        'clay': material('ceramic-sand', (.62, .48, .34), .8),
        'soil': material('soil', (.055, .038, .022), 1),
        'paper': material('paper-ivory', (.83, .80, .70), .95),
        'paper-sage': material('paper-sage', (.37, .42, .32), .95),
        'paper-taupe': material('paper-taupe', (.50, .41, .31), .95),
    }


def finish(obj, name, mat):
    obj.name = name
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def cube(name, loc, dims, mat, bevel=.012):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new('Manufactured edge radius', 'BEVEL')
        b.width = min(bevel, min(dims) * .4)
        b.segments = 3
        bpy.ops.object.modifier_apply(modifier=b.name)
    n = o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    bpy.ops.object.modifier_apply(modifier=n.name)
    return finish(o, name, mat)


def cylinder(name, loc, radius, depth, mat, radius2=None, vertices=48):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius if radius2 is None else radius2, depth=depth, location=loc)
    o = bpy.context.object
    b = o.modifiers.new('Soft rim', 'BEVEL')
    b.width = min(.005, depth * .15, radius * .1)
    b.segments = 2
    bpy.ops.object.modifier_apply(modifier=b.name)
    return finish(o, name, mat)


def beam(name, start, end, radius, mat):
    a, b = Vector(start), Vector(end)
    o = cylinder(name, (a + b) / 2, radius, (b - a).length, mat, vertices=20)
    o.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    return o


def cushion(name, loc, dims, mat, exponent=.45):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, radius=1, location=loc)
    o = bpy.context.object
    for v in o.data.vertices:
        for i in range(3):
            t = v.co[i]
            v.co[i] = math.copysign(abs(t) ** exponent, t) * dims[i] / 2
    return finish(o, name, mat)


def line(name, points, radius, mat, closed=False):
    c = bpy.data.curves.new(name, 'CURVE')
    c.dimensions = '3D'
    c.resolution_u = 1
    c.bevel_depth = radius
    c.bevel_resolution = 2
    s = c.splines.new('POLY')
    s.points.add(len(points) - 1)
    for p, xyz in zip(s.points, points):
        p.co = (*xyz, 1)
    s.use_cyclic_u = closed
    o = bpy.data.objects.new(name, c)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o.select_set(False)
    return finish(o, name, mat)


def bed(p, single=False):
    w, d, h = (.95, 2, .9) if single else (1.6, 2.1, 1)
    for x in [-w / 2 + .09, w / 2 - .09]:
        for y in [-d / 2 + .16, d / 2 - .16]:
            cylinder('Tapered oak foot', (x, y, .12), .038, .24, p['oak'], .03)
    cube('Oak frame', (0, 0, .25), (w, d, .18), p['oak'], .025)
    cube('Recessed slat base', (0, 0, .35), (w - .1, d - .1, .055), p['darkwood'])
    cube('Rounded oak headboard', (0, d / 2 - .045, (h + .2) / 2), (w, .09, h - .2), p['oak'], .04)
    cube('Upholstered inset', (0, d / 2 - .1, h * .7), (w - .12, .055, h * .4), p['linen'], .022)
    cushion('Linen mattress', (0, -.02, .44), (w - .1, d - .18, .25), p['linen'], .25)
    # Duvet drapes over both sides with several unequal longitudinal wrinkles.
    nx, ny = 40, 52
    verts, faces = [], []
    for j in range(ny + 1):
        y = -d / 2 + .06 + j / ny * (d - .53)
        for i in range(nx + 1):
            x = (i / nx - .5) * (w - .02)
            edge = max(0, abs(x) - (w / 2 - .13)) / .12
            z = .59 - .18 * edge ** 1.7 + .012 * math.sin(x * 28 + y * 5) * math.sin(j / ny * math.pi)
            z += .008 * math.sin(y * 37 + x * 3)
            verts.append((x, y, z))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    mesh = bpy.data.meshes.new('Draped duvet')
    mesh.from_pydata(verts, [], faces)
    o = bpy.data.objects.new('Draped duvet', mesh)
    bpy.context.collection.objects.link(o)
    uv = mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        for idx in poly.loop_indices:
            vi = mesh.loops[idx].vertex_index
            uv.data[idx].uv = ((vi % (nx + 1)) / nx, (vi // (nx + 1)) / ny)
    finish(o, 'Draped ivory duvet', p['linen'])
    solid = o.modifiers.new('Duvet thickness', 'SOLIDIFY')
    solid.thickness = .018
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=solid.name)
    line('Duvet stitched edge', [verts[j * (nx + 1)] for j in range(ny + 1)], .003, p['taupe'])
    line('Duvet stitched edge', [verts[j * (nx + 1) + nx] for j in range(ny + 1)], .003, p['taupe'])
    for x in ([0] if single else [-w * .245, w * .245]):
        pillow = cushion('Pillow with loft', (x, d / 2 - .39, .63), (w * (.78 if single else .43), .42, .15), p['linen'])
        pillow.rotation_euler.z = .06 if x <= 0 else -.04
    cube('Folded sage throw', (0, -d * .29, .615), (w - .05, .44, .045), p['sage'], .017)
    for k in range(18):
        x = (k / 17 - .5) * (w - .13)
        line('Throw fringe', [(x, -d * .29 - .22, .62), (x + .006, -d * .29 - .26, .60)], .002, p['sage'])
    return (w, d, h)


def legs(p, w, d, height, radius=.025):
    for x in [-w / 2 + .06, w / 2 - .06]:
        for y in [-d / 2 + .06, d / 2 - .06]:
            cylinder('Tapered oak leg', (x, y, height / 2), radius, height, p['oak'], radius * .75)


def pull(p, x, y, z, width=.14):
    beam('Brushed pull', (x - width / 2, y, z), (x + width / 2, y, z), .006, p['steel'])
    for t in [-1, 1]:
        beam('Pull fixing', (x + t * width / 2, y, z), (x + t * width / 2, y + .022, z), .005, p['steel'])


def cabinet(p, w, d, h, doors=2, stone=False, drawers=False, feet=.08):
    legs(p, w, d, feet, .025)
    cube('Cabinet carcass', (0, 0, (h + feet - .04) / 2), (w - .02, d - .025, h - feet - .04), p['darkwood'])
    cube('Oak top' if not stone else 'Honed stone countertop', (0, 0, h - .018), (w, d, .036), p['stone' if stone else 'oak'])
    for i in range(doors):
        if drawers:
            z = feet + (i + .5) * (h - feet - .045) / doors
            cube('Drawer with reveal', (0, -d / 2, z), (w - .025, .025, (h - feet - .045) / doors - .008), p['oak'])
            pull(p, 0, -d / 2 - .025, z)
        else:
            x = (i + .5) * (w - .02) / doors - (w - .02) / 2
            cube('Oak door with reveal', (x, -d / 2, (h + feet - .045) / 2), ((w - .02) / doors - .008, .025, h - feet - .055), p['oak'])
            pull(p, x, -d / 2 - .025, h * .74, .1)


def basin(p, w, d, h, z=0, name='Porcelain basin'):
    # Continuous rounded-rectangle outer shell, rolled rim and recessed inner bowl.
    rings = [(w * .40, d * .40, z), (w / 2, d / 2, z + h * .82),
             (w / 2, d / 2, z + h), (w / 2 - .024, d / 2 - .024, z + h + .004),
             (w / 2 - .05, d / 2 - .05, z + h - .025),
             (w * .28, d * .28, z + .035), (.018, .018, z + .03)]
    verts, faces, n = [], [], 64
    for rx, ry, zz in rings:
        for i in range(n):
            a = 2 * math.pi * i / n
            c, s = math.cos(a), math.sin(a)
            verts.append((rx * math.copysign(abs(c) ** .52, c), ry * math.copysign(abs(s) ** .52, s), zz))
    for j in range(len(rings) - 1):
        for i in range(n):
            faces.append((j * n + i, j * n + (i + 1) % n, (j + 1) * n + (i + 1) % n, (j + 1) * n + i))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    return finish(o, name, p['white'])


def faucet(p, y, z):
    beam('Faucet riser', (0, y, z), (0, y, z + .13), .013, p['steel'])
    beam('Faucet spout', (0, y, z + .13), (0, y - .10, z + .13), .012, p['steel'])
    cube('Faucet lever', (0, y, z + .155), (.025, .075, .008), p['steel'], .003)


def kitchen(p, kind):
    if kind == 'counter':
        cabinet(p, .6, .62, .92, doors=1, stone=True)
        return (.6, .62, .92)
    if kind == 'wall-cabinet':
        cabinet(p, .6, .35, .72, doors=1, feet=.008)
        return (.6, .35, .72)
    if kind == 'island':
        cabinet(p, 1.6, .8, .92, doors=3, stone=True)
        return (1.6, .8, .92)
    if kind == 'range-hood':
        cube('Vent canopy', (0, 0, .06), (.76, .5, .12), p['steel'], .018)
        cube('Chimney', (0, .11, .25), (.32, .26, .30), p['steel'])
        for x in [-.22, .22]:
            cylinder('Downlight lens', (x, -.1, .003), .035, .006, p['white'])
        for i in range(11):
            cube('Vent slot', ((i - 5) * .04, -.249, .065), (.022, .004, .018), p['black'], .002)
        return (.76, .5, .4)
    if kind == 'dishwasher':
        cube('Insulated body', (0, 0, .43), (.6, .57, .86), p['paint'])
        cube('Oak panel', (0, -.29, .41), (.584, .025, .76), p['oak'])
        cube('Control strip', (0, -.30, .815), (.584, .023, .065), p['steel'])
        pull(p, 0, -.326, .76, .36)
        return (.6, .6, .86)
    if kind == 'fridge':
        cube('Refrigerator cabinet', (0, .018, .925), (.7, .66, 1.85), p['paint'], .035)
        for z, hh in [(.36, .66), (1.26, 1.1)]:
            cube('Brushed stainless door', (0, -.335, z), (.686, .055, hh), p['steel'], .018)
            beam('Vertical handle', (-.255, -.382, z - hh * .3), (-.255, -.382, z + hh * .3), .011, p['steel'])
        cube('Toe grille', (0, -.33, .035), (.6, .015, .045), p['black'])
        return (.7, .72, 1.85)
    if kind == 'range':
        cube('Oven chassis', (0, 0, .44), (.76, .63, .88), p['steel'])
        cube('Black glass cooktop', (0, 0, .9), (.76, .65, .04), p['screen'])
        for x in [-.20, .20]:
            for y in [-.17, .17]:
                cylinder('Burner ring', (x, y, .925), .115, .004, p['black'])
                cylinder('Burner inset', (x, y, .928), .094, .004, p['steel'])
        cube('Oven door', (0, -.322, .40), (.68, .035, .58), p['black'])
        cube('Oven viewing glass', (0, -.343, .38), (.55, .012, .36), p['screen'])
        pull(p, 0, -.37, .67, .5)
        for x in [-.24, -.08, .08, .24]:
            knob = cylinder('Control dial', (x, -.34, .80), .026, .026, p['steel'])
            knob.rotation_euler.x = math.pi / 2
        return (.76, .65, .92)


def bath(p, kind):
    if kind == 'sink':
        cabinet(p, .8, .5, .68, doors=2)
        basin(p, .72, .43, .12, .68)
        faucet(p, .18, .70)
        return (.8, .5, .86)
    if kind == 'tub':
        for y in [-.35, .35]:
            cube('Tub apron', (0, y, .245), (1.68, .035, .49), p['paint'], .012)
        for x in [-.82, .82]:
            cube('Tub end panel', (x, 0, .245), (.035, .7, .49), p['paint'], .012)
        basin(p, 1.7, .75, .48, .07, 'Deep bathtub and rolled rim')
        return (1.7, .75, .56)
    if kind == 'toilet':
        cushion('Ceramic pedestal', (0, .06, .19), (.29, .46, .38), p['white'], .65)
        b = basin(p, .40, .54, .18, .30, 'Oval WC bowl')
        b.location.y = -.08
        # Oval seat ring with a real opening.
        pts = [(math.cos(a) * .19, -.08 + math.sin(a) * .25, .49) for a in np.linspace(0, 2 * math.pi, 65)]
        line('Soft-close seat ring', pts, .018, p['paint'], True)
        cube('Concealed cistern', (0, .24, .56), (.36, .17, .44), p['white'], .035)
        cylinder('Dual flush button', (0, .24, .785), .025, .004, p['steel'])
        return (.4, .7, .78)
    if kind in ['washer', 'dryer']:
        cube('Enamel cabinet', (0, 0, .425), (.6, .57, .85), p['paint'], .025)
        cube('Control fascia', (0, -.29, .76), (.57, .025, .12), p['white'])
        knob = cylinder('Program dial', (-.17, -.31, .76), .032, .018, p['steel'])
        knob.rotation_euler.x = math.pi / 2
        cube('Display', (.12, -.31, .77), (.18, .01, .04), p['screen'], .003)
        for rad, depth, yy, mat in [(.215, .035, -.29, 'steel'), (.185, .04, -.315, 'black'), (.158, .018, -.34, 'screen')]:
            o = cylinder('Front-load door', (0, yy, .40), rad, depth, p[mat], vertices=64)
            o.rotation_euler.x = math.pi / 2
        if kind == 'dryer':
            cube('Lint access panel', (0, -.291, .09), (.51, .012, .09), p['white'])
        return (.6, .6, .85)
    if kind == 'shower':
        cube('Shower tray', (0, 0, .045), (.9, .9, .09), p['white'], .025)
        cube('Tray recess', (0, 0, .093), (.82, .82, .009), p['stone'])
        for x in [-.44, .44]:
            cube('Glass side', (x, 0, 1.04), (.008, .88, 1.92), p['glass'], .002)
            beam('Black frame', (x, -.44, .09), (x, -.44, 2), .012, p['black'])
        cube('Glass door', (0, -.44, 1.04), (.86, .008, 1.92), p['glass'], .002)
        beam('Door pull', (.30, -.46, .9), (.30, -.46, 1.15), .008, p['steel'])
        beam('Shower riser', (0, .39, .75), (0, .39, 1.87), .012, p['steel'])
        beam('Shower arm', (0, .39, 1.87), (0, .15, 1.87), .012, p['steel'])
        cylinder('Rain shower head', (0, .15, 1.85), .095, .018, p['steel'])
        return (.9, .9, 2)
    if kind == 'towel-rail':
        for x in [-.28, .28]:
            beam('Rail upright', (x, 0, 0), (x, 0, .8), .014, p['black'])
        for z in [.1, .23, .36, .49, .62, .75]:
            beam('Rail bar', (-.28, 0, z), (.28, 0, z), .011, p['black'])
        cube('Folded linen towel', (0, -.02, .45), (.29, .065, .45), p['linen'], .02)
        return (.6, .1, .8)


def table(p, kind):
    if kind == 'side-table':
        cylinder('Round oak top', (0, 0, .53), .225, .04, p['oak'])
        cylinder('Fluted pedestal', (0, 0, .26), .1, .52, p['oak'])
        for i in range(20):
            a = 2 * math.pi * i / 20
            beam('Pedestal flute', (.10 * math.cos(a), .10 * math.sin(a), .04), (.10 * math.cos(a), .10 * math.sin(a), .49), .009, p['darkwood'])
        return (.45, .45, .55)
    if kind == 'table-coffee':
        legs(p, 1.0, .50, .37, .027)
        cube('Lower oak shelf', (0, 0, .13), (.95, .46, .025), p['oak'])
        cube('Rounded oak coffee top', (0, 0, .38), (1.1, .6, .04), p['oak'], .018)
        return (1.1, .6, .4)
    if kind == 'desk':
        legs(p, 1.1, .5, .71)
        cube('Desk top', (0, 0, .73), (1.2, .6, .04), p['oak'])
        cube('Shallow drawer', (.3, 0, .64), (.46, .48, .13), p['oak'])
        pull(p, .3, -.27, .64)
        return (1.2, .6, .75)
    legs(p, 1.44, .74, .71, .035)
    for x in [-.64, .64]:
        cube('End apron', (x, 0, .65), (.04, .65, .11), p['oak'])
    for y in [-.34, .34]:
        cube('Side apron', (0, y, .65), (1.35, .035, .11), p['oak'])
    cube('Solid oak tabletop', (0, 0, .7275), (1.6, .9, .045), p['oak'], .02)
    return (1.6, .9, .75)


def seat(p, kind):
    if kind == 'bar-stool':
        legs(p, .36, .36, .70, .02)
        cylinder('Oak stool seat', (0, 0, .725), .2, .05, p['oak'])
        for y in [-.13, .13]:
            beam('Foot rail', (-.13, y, .25), (.13, y, .25), .012, p['black'])
        return (.4, .4, .75)
    if kind == 'dining-chair':
        legs(p, .41, .45, .43, .018)
        cushion('Contoured oak seat', (0, 0, .45), (.45, .47, .045), p['oak'], .4)
        for x in [-.19, .19]:
            beam('Back post', (x, .19, .35), (x, .24, .79), .018, p['oak'])
        cube('Curved upper rail', (0, .24, .765), (.45, .045, .07), p['oak'], .018)
        for i in range(5):
            x = (i - 2) * .065
            beam('Back spindle', (x, .20, .47), (x, .24, .74), .009, p['oak'])
        return (.45, .52, .8)
    if kind == 'desk-chair':
        cylinder('Seat column', (0, 0, .26), .025, .42, p['steel'])
        for i in range(5):
            a = i * 2 * math.pi / 5
            x, y = .27 * math.cos(a), .27 * math.sin(a)
            beam('Five-star base', (0, 0, .11), (x, y, .065), .018, p['black'])
            o = cylinder('Caster', (x, y, .038), .035, .03, p['black'], vertices=24)
            o.rotation_euler.x = math.pi / 2
        cushion('Upholstered seat', (0, -.02, .48), (.50, .48, .095), p['taupe'])
        cushion('Curved upholstered back', (0, .20, .77), (.48, .075, .46), p['taupe'])
        return (.6, .6, 1)
    w, d, h = (2.2, .95, .8) if kind == 'sofa-fabric' else (.85, .85, .8)
    legs(p, w - .06, d - .06, .17, .028)
    cube('Oak plinth', (0, 0, .20), (w - .08, d - .06, .12), p['oak'], .02)
    cushion('Upholstered base', (0, 0, .30), (w - .03, d - .04, .19), p['linen'])
    cushion('Upholstered back', (0, d / 2 - .095, .59), (w - .04, .19, .42), p['linen'])
    for x in [-w / 2 + .075, w / 2 - .075]:
        cushion('Soft arm', (x, .015, .50), (.15, d - .12, .32), p['linen'])
    count = 3 if w > 1 else 1
    cw = (w - .34) / count
    for i in range(count):
        x = (i - (count - 1) / 2) * cw
        cushion('Seat cushion', (x, -.085, .44), (cw - .016, d - .32, .14), p['linen'])
        cushion('Back cushion', (x, d / 2 - .22, .62), (cw - .01, .15, .33), p['linen'])
    if w > 1:
        o = cushion('Sage accent pillow', (-w * .33, .05, .63), (.32, .15, .33), p['sage'])
        o.rotation_euler.y = .18
    return (w, d, h)


def storage(p, kind):
    dims = {'wardrobe': (1.2, .6, 2.1), 'tv-console': (1.8, .4, .5), 'nightstand': (.5, .4, .55), 'dresser': (1.2, .5, .8)}
    if kind in dims:
        w, d, h = dims[kind]
        cabinet(p, w, d, h, doors=3 if kind in ['dresser', 'tv-console'] else 2, drawers=kind in ['nightstand', 'dresser'])
        return dims[kind]
    w, d, h = .9, .35, 1.8
    for x in [-w / 2 + .015, w / 2 - .015]:
        cube('Bookcase side', (x, 0, h / 2), (.03, d, h), p['oak'])
    cube('Oak back panel', (0, d / 2 - .006, h / 2), (w, .012, h), p['oak'])
    for z in [.04, .45, .87, 1.29, 1.77]:
        cube('Oak shelf', (0, 0, z), (w - .03, d, .028), p['oak'])
    for row, zz in enumerate([.48, .90, 1.32]):
        for i in range(5):
            hh = .21 + .025 * ((i + row) % 3)
            cube('Bound book', (-.30 + i * .045, .025, zz + hh / 2), (.033, .19, hh), p[['paper', 'paper-sage', 'paper-taupe'][i % 3]], .002)
    return (w, d, h)


def lamp(p, kind):
    pendant = kind == 'pendant-lamp'
    floor = kind == 'floor-lamp'
    w, d, h = (.45, .45, .35) if pendant else ((.45, .45, 1.6) if floor else (.3, .3, .45))
    shade_h = .35 if floor or pendant else .22
    if not pendant:
        cylinder('Weighted lamp base', (0, 0, .025), w * .31, .05, p['black'])
        beam('Lamp stem', (0, 0, .025), (0, 0, h - .08), .012, p['black'])
    # Open linen shade shell, subtly fluted rather than a closed cone.
    n, verts, faces = 64, [], []
    for z, radius in [(h - shade_h, w / 2), (h, w * .38)]:
        for i in range(n):
            a = i * 2 * math.pi / n
            r = radius * (1 + .012 * (1 if i % 2 else -1))
            verts.append((r * math.cos(a), r * math.sin(a), z))
    for i in range(n):
        faces.append((i, (i + 1) % n, (i + 1) % n + n, i + n))
    mesh = bpy.data.meshes.new('Linen shade')
    mesh.from_pydata(verts, [], faces)
    o = bpy.data.objects.new('Linen shade', mesh)
    bpy.context.collection.objects.link(o)
    uv = mesh.uv_layers.new()
    for poly in mesh.polygons:
        for idx in poly.loop_indices:
            vi = mesh.loops[idx].vertex_index
            uv.data[idx].uv = ((vi % n) / n, vi // n)
    finish(o, 'Linen shade', p['linen'])
    p['linen'].use_backface_culling = False
    for z, r in [(h - shade_h, w / 2), (h, w * .38)]:
        line('Shade binding', [(r * math.cos(a), r * math.sin(a), z) for a in np.linspace(0, math.pi * 2, 65)], .003, p['linen'], True)
    return (w, d, h)


def plant(p, small=False):
    w, d, h = (.3, .3, .5) if small else (.6, .6, 1.7)
    pot_h = .16 if small else .34
    cylinder('Ceramic planter', (0, 0, pot_h / 2), w * .23, pot_h, p['clay'], w * .31)
    cylinder('Soil', (0, 0, pot_h - .012), w * .28, .008, p['soil'])
    if not small:
        beam('Fig trunk', (0, 0, pot_h), (.035, .015, h * .94), .012, p['darkwood'])
    for i in range(9 if small else 17):
        a = i * 2.39996
        z = pot_h if small else pot_h + (h - pot_h) * (.2 + .7 * i / 17)
        end = (math.cos(a) * w * .32, math.sin(a) * w * .32, min(h, z + (.27 if small else .15)))
        if not small:
            beam('Leaf stalk', (0, 0, z), end, .004, p['darkwood'])
        verts, faces = [], []
        ln = .31 if small else .25
        for j in range(13):
            t = j / 12
            width = (.022 if small else .075) * math.sin(math.pi * t) ** .6
            for s in [-1, 0, 1]:
                verts.append((end[0] + math.cos(a) * ln * t + math.sin(a) * width * s,
                              end[1] + math.sin(a) * ln * t - math.cos(a) * width * s,
                              end[2] + ln * .35 * math.sin(math.pi * t) - .015 * abs(s)))
        for j in range(12):
            for k in range(2):
                v = j * 3 + k
                faces.append((v, v + 1, v + 4, v + 3))
        mesh = bpy.data.meshes.new('Curved leaf')
        mesh.from_pydata(verts, [], faces)
        o = bpy.data.objects.new('Curved leaf', mesh)
        bpy.context.collection.objects.link(o)
        finish(o, 'Fig leaf' if not small else 'Snake plant leaf', p['green' if i % 2 else 'green2'])
        # Raised vein adds visible shape without alpha textures.
        line('Leaf vein', [verts[j * 3 + 1] for j in range(13)], .0015, p['green2'])
    return (w, d, h)


def decor(p, kind):
    if kind == 'tv':
        cube('Slim screen body', (0, 0, .40), (1.25, .035, .67), p['black'], .012)
        cube('Screen glass', (0, -.020, .40), (1.225, .004, .642), p['screen'], .007)
        for x in [-.43, .43]:
            beam('TV stand', (x, 0, .09), (x + .04, -.065, 0), .008, p['black'])
        return (1.25, .08, .72)
    if kind == 'rug':
        cube('Woven wool rug', (0, 0, .004), (2.4, 1.7, .008), p['linen'], .003)
        for x in [-1, -.6, -.2, .2, .6, 1]:
            cube('Muted woven stripe', (x, 0, .008), (.012, 1.65, .002), p['taupe'], 0)
        for y in [-.65, -.25, .15, .55]:
            cube('Muted woven cross stripe', (0, y, .008), (2.35, .009, .002), p['taupe'], 0)
        return (2.4, 1.7, .01)
    if kind == 'pouf':
        cushion('Wool pouf', (0, 0, .20), (.55, .55, .4), p['taupe'], .65)
        for i in range(18):
            a = i * 2 * math.pi / 18
            pts = []
            for j in range(25):
                t = j / 24 * math.pi
                r = .273 * math.sin(t) ** .65
                pts.append((r * math.cos(a), r * math.sin(a), .2 + .197 * math.cos(t)))
            line('Knitted rib', pts, .0025, p['linen'])
        return (.55, .55, .4)
    w, d, h = (.9, .04, 1.2) if kind == 'wall-art' else (.6, .03, .8)
    cube('Frame back', (0, 0, h / 2), (w, d, h), p['oak'], .008)
    cube('Print paper' if kind == 'wall-art' else 'Mirror face', (0, -d / 2 - .001, h / 2), (w - .045, .003, h - .045), p['paper' if kind == 'wall-art' else 'mirror'], .003)
    if kind == 'wall-art':
        # Original minimal geometric composition, made as shallow coloured inlays.
        o = cylinder('Abstract terracotta sun', (-.13, -d / 2 - .004, .76), .19, .001, p['clay'], vertices=64)
        o.rotation_euler.x = math.pi / 2
        cube('Abstract sage field', (.13, -d / 2 - .005, .35), (.40, .001, .24), p['paper-sage'], 0)
        line('Abstract charcoal line', [(-.30, -.029, .24), (-.05, -.029, .57), (.25, -.029, .63)], .007, p['black'])
    return (w, d, h)


BUILDERS = {'bed': lambda p: bed(p), 'bed-single': lambda p: bed(p, True)}
for key in ['counter', 'fridge', 'range', 'range-hood', 'dishwasher', 'wall-cabinet', 'island']:
    BUILDERS[key] = lambda p, k=key: kitchen(p, k)
for key in ['sink', 'toilet', 'tub', 'washer', 'dryer', 'shower', 'towel-rail']:
    BUILDERS[key] = lambda p, k=key: bath(p, k)
for key in ['table', 'table-coffee', 'side-table', 'desk']:
    BUILDERS[key] = lambda p, k=key: table(p, k)
for key in ['sofa-fabric', 'armchair', 'dining-chair', 'bar-stool', 'desk-chair']:
    BUILDERS[key] = lambda p, k=key: seat(p, k)
for key in ['wardrobe', 'tv-console', 'bookshelf', 'nightstand', 'dresser']:
    BUILDERS[key] = lambda p, k=key: storage(p, k)
for key in ['floor-lamp', 'table-lamp', 'pendant-lamp']:
    BUILDERS[key] = lambda p, k=key: lamp(p, k)
for key in ['tv', 'rug', 'pouf', 'wall-art', 'mirror']:
    BUILDERS[key] = lambda p, k=key: decor(p, k)
BUILDERS['plant-large'] = lambda p: plant(p)
BUILDERS['plant-small'] = lambda p: plant(p, True)

COLLECTIONS = {
    'models-p1': ['bed', 'bed-single', 'counter', 'fridge', 'sink', 'toilet', 'tub', 'washer', 'wardrobe', 'sofa-fabric', 'table', 'table-coffee'],
    'models-living': ['armchair', 'tv-console', 'tv', 'rug', 'floor-lamp', 'side-table', 'bookshelf', 'pouf', 'plant-large', 'plant-small', 'wall-art'],
    'models-kitchen': ['dining-chair', 'pendant-lamp', 'range', 'range-hood', 'dishwasher', 'wall-cabinet', 'bar-stool', 'island'],
    'models-bedroom-bath': ['nightstand', 'dresser', 'desk', 'desk-chair', 'table-lamp', 'shower', 'mirror', 'towel-rail', 'dryer'],
}
MOUNTING = {'wall-art': 1.2, 'mirror': 1.15, 'wall-cabinet': 1.5, 'range-hood': 1.6, 'towel-rail': .8, 'pendant-lamp': 2.35}


def write_collections(reports):
    for plan_id, keys in COLLECTIONS.items():
        if not all(key in reports for key in keys):
            continue
        story = {'level': 0, 'elevation': 0, 'height': 2.7, 'walls': [], 'openings': [], 'rooms': [], 'furniture': []}
        for i, key in enumerate(keys):
            x0, y0 = (i % 3) * 3.6, (i // 3) * 3.3
            w, d, h = reports[key]['dimensions']
            wall_mounted = key in ['wall-art', 'mirror', 'wall-cabinet', 'range-hood', 'towel-rail']
            x, y = x0 + 1.8, y0 + 3.15 - d / 2 if wall_mounted else y0 + 1.65
            story['rooms'].append({'id': key, 'name': key.replace('-', ' ').title(), 'type': 'living', 'polygon': [[x0, y0], [x0 + 3.6, y0], [x0 + 3.6, y0 + 3.3], [x0, y0 + 3.3]]})
            story['furniture'].append({'id': key, 'type': key, 'room': key, 'x': x, 'y': y, 'w': w, 'd': d, 'h': MOUNTING.get(key, h), 'rot': 0})
            if wall_mounted:
                story['walls'].append({'id': key + '-display-wall', 'a': [x0 + .6, y0 + 3.2], 'b': [x0 + 3, y0 + 3.2], 't': .1, 'exterior': False, 'party': False})
            if key in ['tv', 'table-lamp']:
                support = 'tv-console' if key == 'tv' else 'nightstand'
                sw, sd, sh = reports[support]['dimensions']
                story['furniture'][-1]['base'] = sh
                story['furniture'].append({'id': key + '-support', 'type': support, 'room': key, 'x': x, 'y': y, 'w': sw, 'd': sd, 'h': sh, 'rot': 0})
        plan = {'id': plan_id, 'name': 'Original Japandi collection: ' + plan_id.removeprefix('models-'), 'synthetic': True, 'origin': [0, 0], 'stories': [story]}
        (ROOT / 'static/plans' / (plan_id + '.json')).write_text(json.dumps(plan, indent=2) + '\n')


def export_model(key, p):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    dims = BUILDERS[key](p)
    # Normalize exact bounding dimensions and the bottom-center pivot once at authoring time.
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.context.view_layer.update()
    # Rotated cushions/feet do not occupy every corner of their local bounding box.
    coords = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
    lo = Vector(tuple(min(c[i] for c in coords) for i in range(3)))
    hi = Vector(tuple(max(c[i] for c in coords) for i in range(3)))
    center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    factors = Vector(tuple(dims[i] / (hi[i] - lo[i]) for i in range(3)))
    for o in meshes:
        matrix = o.matrix_world.copy()
        for v in o.data.vertices:
            v.co = (matrix @ v.co - center) * factors
        o.matrix_world.identity()
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    merged = bpy.context.object
    merged.name = key + '-mesh'
    root = bpy.data.objects.new(key, None)
    bpy.context.collection.objects.link(root)
    merged.parent = root
    if key == 'pendant-lamp':
        merged.location.z -= dims[2]
    bpy.ops.object.select_all(action='SELECT')
    path = OUTPUT / (key + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        export_yup=True, export_cameras=False, export_lights=False, export_animations=False,
        export_apply=True, export_materials='EXPORT', export_extras=True)
    triangles = sum(len(poly.vertices) - 2 for poly in merged.data.polygons)
    report = {'file': path.name, 'dimensions': list(dims), 'triangles': triangles, 'bytes': path.stat().st_size}
    print('MODEL_REPORT ' + json.dumps(report), flush=True)
    return report


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['bed']
    parser = argparse.ArgumentParser()
    parser.add_argument('models', nargs='+')
    opts = parser.parse_args(args)
    keys = list(BUILDERS) if opts.models == ['all'] else opts.models
    p = palette()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUTPUT / 'catalog.json'
    reports = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    for key in keys:
        reports[key] = export_model(key, p)
    manifest_path.write_text(json.dumps(reports, indent=2, sort_keys=True) + '\n')
    write_collections(reports)


if __name__ == '__main__':
    main()
