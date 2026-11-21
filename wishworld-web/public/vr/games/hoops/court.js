// The Snow Hoops court: backboard, rim, pole, the five spots and the arc as ONE vertex-lit mesh (one draw call,
// a few hundred triangles), and the net as one LineSegments that stretches when a ball drops through.
// Everything is in the world frame of rules.js; `c` is the physics court (physics.js makeCourt).

import * as THREE from 'three';
import { MeshBuilder } from '/shared/models.js';

const DEG = Math.PI / 180;

export function createCourt(c, COURT, COLORS) {
  const group = new THREE.Group();
  group.name = 'HoopsCourt';
  // MeshBuilder.build({ mirror: 'x' }) negates x, so x is written negated here and lands where it should.
  const X = (x) => -x;
  const mb = new MeshBuilder();
  const rim = c.rim, bd = c.board, hx = rim.x;

  // backboard, its border and the square above the rim
  const bw = bd.x1 - bd.x0, bh = bd.y1 - bd.y0, front = bd.z + 0.004;
  mb.cube([X(hx), bd.y0 + bh / 2, bd.z - bd.thickness / 2], [bw, bh, bd.thickness], COLORS.board);
  const line = (x, y, w, h) => mb.cube([X(x), y, front], [w, h, 0.006], COLORS.boardLine);
  const L = 0.035;
  line(hx, bd.y1 - L / 2, bw, L); line(hx, bd.y0 + L / 2, bw, L);
  line(bd.x0 + L / 2, bd.y0 + bh / 2, L, bh); line(bd.x1 - L / 2, bd.y0 + bh / 2, L, bh);
  const sqW = 0.59, sqH = 0.45, sqY = rim.y + 0.03;
  line(hx, sqY + sqH, sqW, 0.03); line(hx - sqW / 2, sqY + sqH / 2, 0.03, sqH); line(hx + sqW / 2, sqY + sqH / 2, 0.03, sqH);
  line(hx, sqY + 0.015, sqW, 0.03);

  // pole behind the board, an arm to it, and a base on the snow
  const poleZ = bd.z - 0.75;
  mb.cylinder([X(hx), bd.y1 / 2, poleZ], [0.12, bd.y1, 0.12], COLORS.pole, null, 1, 8);
  mb.cube([X(hx), rim.y + 0.25, (poleZ + bd.z) / 2 - bd.thickness / 2], [0.08, 0.08, bd.z - poleZ], COLORS.pole);
  mb.cube([X(hx), 0.15, poleZ - 0.1], [0.8, 0.3, 0.6], COLORS.base);

  // the rim: 24 short boxes round the ring (the same ring physics.js collides with), and its bracket
  const n = c.segCount, segLen = 2 * Math.PI * c.rimRadius / n * 1.08;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    // written mirrored: after the x flip each box lies along the ring's tangent
    mb.cube([X(rim.x + Math.cos(a) * c.rimRadius), rim.y, rim.z + Math.sin(a) * c.rimRadius],
      [segLen, c.tube * 2, c.tube * 2], COLORS.rim, [0, (a - Math.PI / 2) / DEG, 0]);
  }
  mb.cube([X(hx), rim.y - 0.01, (rim.z - c.rimRadius + bd.z) / 2], [0.12, 0.02, rim.z - c.rimRadius - bd.z + 0.02], COLORS.rim);

  // the arc and the five spots, a hair above the snow
  const [fx, , fz] = COURT.hoop;
  for (let d = -84; d <= 84; d += 4) {
    const a = d * DEG, r = COURT.arcRadius + 0.35;
    mb.cube([X(fx + Math.sin(a) * r), 0.008, fz + Math.cos(a) * r], [0.06, 0.01, r * 4 * DEG * 1.05], COLORS.arc, [0, -d, 0]);
  }
  const spotMeshStart = [];
  for (const s of c.spots) {
    spotMeshStart.push(mb.pos.length / 3);
    mb.disc([X(s.x), 0.012, s.z], [0.55, 0.55], COLORS.spot, null, 16);
  }
  const spotVerts = 18;            // disc: centre + 17 ring points (seg 16)

  const mesh = mb.mesh({ mirror: 'x' });
  mesh.name = 'HoopsCourtMesh';
  group.add(mesh);

  // the spot to stand on next is peach: recolour its disc's vertices (no extra material)
  const colorAttr = mesh.geometry.attributes.color;
  const spotLin = new THREE.Color().setRGB(...COLORS.spot, THREE.SRGBColorSpace);
  const nextLin = new THREE.Color().setRGB(...COLORS.spotNext, THREE.SRGBColorSpace);
  function markSpot(index) {
    spotMeshStart.forEach((start, i) => {
      const col = i === index ? nextLin : spotLin;
      for (let k = 0; k < spotVerts; k++) colorAttr.setXYZ(start + k, col.r, col.g, col.b);
    });
    colorAttr.needsUpdate = true;
  }

  // the net: four rings narrowing downward, laced in a zig-zag
  const rings = [[0, c.rimRadius], [-0.13, 0.2], [-0.26, 0.17], [-0.38, 0.145]];
  // Each ring's knots sit half a step round from the ring above; every knot is tied to the two nearest below.
  const strands = 12, step = Math.PI * 2 / strands, pts = [];
  for (let r = 0; r < rings.length; r++) {
    const [y, rad] = rings[r];
    for (let i = 0; i < strands; i++) {
      const a = (i + (r % 2) * 0.5) * step;
      if (r === rings.length - 1) pts.push(Math.cos(a) * rad, y, Math.sin(a) * rad, Math.cos(a + step) * rad, y, Math.sin(a + step) * rad);
      if (r < rings.length - 1) {
        const [y2, rad2] = rings[r + 1];
        for (const b of [a - step / 2, a + step / 2]) pts.push(Math.cos(a) * rad, y, Math.sin(a) * rad, Math.cos(b) * rad2, y2, Math.sin(b) * rad2);
      }
    }
  }
  const netGeo = new THREE.BufferGeometry();
  netGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const netMat = new THREE.LineBasicMaterial({ color: new THREE.Color().setRGB(...COLORS.net, THREE.SRGBColorSpace) });
  const net = new THREE.LineSegments(netGeo, netMat);
  net.name = 'HoopsNet';
  net.position.set(rim.x, rim.y - c.tube, rim.z);
  group.add(net);
  let stretch = 0, stretchV = 0;

  return {
    group, mesh, net, markSpot,
    /** A ball went through: the net jumps. */
    swish(amount = 1) { stretchV += 3.2 * amount; },
    update(dt) {
      // a damped spring on the net's length
      stretchV += (-60 * stretch - 7 * stretchV) * dt;
      stretch += stretchV * dt;
      net.scale.set(1 - stretch * 0.15, 1 + stretch * 0.6, 1 - stretch * 0.15);
    },
    get triangles() { return mesh.geometry.index.count / 3; },
    dispose() {
      mesh.geometry.dispose();
      netGeo.dispose(); netMat.dispose();
      if (group.parent) group.parent.remove(group);
    },
  };
}
