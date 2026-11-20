export interface Mesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array;
  /** Largest distance of any vertex from the origin (used for camera fitting of orbital lobes). */
  extent?: number;
}

/** Unit sphere, normals equal to positions. */
export function sphereMesh(latSegments: number, lonSegments: number): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= latSegments; i++) {
    const theta = (i * Math.PI) / latSegments;
    for (let j = 0; j <= lonSegments; j++) {
      const phi = (j * 2 * Math.PI) / lonSegments;
      positions.push(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
    }
  }
  const row = lonSegments + 1;
  for (let i = 0; i < latSegments; i++) {
    for (let j = 0; j < lonSegments; j++) {
      const a = i * row + j, b = a + row;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const p = new Float32Array(positions);
  return { positions: p, normals: p, indices: new Uint16Array(indices) };
}

/** Open cylinder of radius 1 along +Z from 0 to 1 (end caps are hidden inside the atom spheres). */
export function cylinderMesh(segments: number): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i * 2 * Math.PI) / segments;
    const c = Math.cos(a), s = Math.sin(a);
    positions.push(c, s, 0, c, s, 1);
    normals.push(c, s, 0, c, s, 0);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, c, b, b, c, d);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}
