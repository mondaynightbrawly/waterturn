export function validateRing(ring: unknown): asserts ring is number[][] {
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 5000)
    throw Error("Polygon needs 3–4999 vertices plus a closing point.");
  for (const p of ring)
    if (
      !Array.isArray(p) ||
      p.length !== 2 ||
      !p.every(Number.isFinite) ||
      Math.abs(p[0]) > 180 ||
      Math.abs(p[1]) > 90
    )
      throw Error("Use valid [longitude, latitude] coordinates.");
  if (JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1)))
    throw Error("Close the polygon by repeating its first point.");
  const cross = (a: number[], b: number[], c: number[]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    if (JSON.stringify(ring[i]) === JSON.stringify(ring[i + 1]))
      throw Error("Polygon has duplicate adjacent points.");
    for (let j = i + 2; j < ring.length - 1; j++) {
      if (i === 0 && j === ring.length - 2) continue;
      const a = ring[i],
        b = ring[i + 1],
        c = ring[j],
        d = ring[j + 1];
      if (
        cross(a, b, c) * cross(a, b, d) < 0 &&
        cross(c, d, a) * cross(c, d, b) < 0
      )
        throw Error("Polygon edges cannot cross.");
    }
  }
  if (Math.abs(area) < 1e-12)
    throw Error("Polygon must enclose a nonzero area.");
}
export function parseBoundary(text: string) {
  let v = JSON.parse(text);
  if (v.type === "Feature") v = v.geometry;
  if (v.type === "Polygon") {
    if (!Array.isArray(v.coordinates) || v.coordinates.length !== 1)
      throw Error("Import one polygon without holes.");
    v = v.coordinates[0];
  }
  validateRing(v);
  return v;
}
