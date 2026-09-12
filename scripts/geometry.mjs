export function bounds(points) {
  if (points.length < 3 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    throw new Error("Select at least three points.");
  let area = 0;
  points.forEach((p, i) => { const q = points[(i + 1) % points.length]; area += p.x*q.y-q.x*p.y; });
  if (Math.abs(area) < 1) throw new Error("The selection has no usable area. Draw a polygon without crossing its edges.");
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  return {x, y, width: Math.max(...points.map(p => p.x))-x, height: Math.max(...points.map(p => p.y))-y};
}

export function filenameBase(value) {
  const name = String(value).normalize("NFC").trim().replace(/\.png$/i, "");
  if (!name || name.length > 100 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    throw new Error("Enter a name of 1–100 characters, without slashes or filename punctuation such as : ? *.");
  return name;
}

export function availableName(base, files) {
  const used = new Set(files.map(path => {
    let leaf = path.split("?")[0].split("/").pop();
    try { leaf = decodeURIComponent(leaf); } catch { /* Keep malformed escapes literally. */ }
    return leaf.toLowerCase();
  }));
  let name = base + ".png", n = 2;
  while (used.has(name.toLowerCase())) name = base + " (" + n++ + ").png";
  return name;
}

// Affine map from source image pixels into scene coordinates.
export function imageMatrix(origin, right, bottom, width, height) {
  const m = {a:(right.x-origin.x)/width, b:(right.y-origin.y)/width,
    c:(bottom.x-origin.x)/height, d:(bottom.y-origin.y)/height, e:origin.x, f:origin.y};
  if (!Object.values(m).every(Number.isFinite) || Math.abs(m.a*m.d-m.b*m.c)<1e-10)
    throw new Error("The background transform is not usable.");
  return m;
}

export function resolution(m) {
  // Largest singular value of the inverse preserves the most compressed axis.
  const det = m.a*m.d-m.b*m.c;
  const sum = m.a*m.a+m.b*m.b+m.c*m.c+m.d*m.d;
  return Math.sqrt((sum+Math.sqrt(Math.max(0,sum*sum-4*det*det)))/2)/Math.abs(det);
}

