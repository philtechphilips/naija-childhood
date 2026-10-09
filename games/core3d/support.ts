/** WebGL2 check without importing three.js (keeps the 3D code out of the main bundle). */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2"));
  } catch {
    return false;
  }
}
