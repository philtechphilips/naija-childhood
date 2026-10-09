import { lerp, mix } from "./draw";

/**
 * Procedurally drawn child, ~100 units tall with feet at (0, 0).
 * Used by Ten-Ten (front and back view) and Suwe (back view).
 */
export interface KidLook {
  skin: string;
  hair: "threaded" | "cornrows" | "short" | "puffs";
  hairColor: string;
  thread: string;
  top: string;
  bottom: string;
  /** Pinafore dress (girls' uniform) vs shirt + shorts. */
  dress: boolean;
  socks: string;
  shoes: string;
  collar: string;
}

export interface KidPose {
  facing: "front" | "back";
  /** Body raised off the ground, in units. */
  lift: number;
  /** 0 = arms relaxed, 1 = hands clapped at the chest. */
  clap: number;
  /** 0..1 arms raised in celebration. */
  cheer: number;
  /**
   * Foot offsets from the neutral stance, in units (x sideways, y up is negative).
   * Screen space: footL is always the foot on the left of the screen, whichever way the kid faces.
   */
  footL: { x: number; y: number };
  footR: { x: number; y: number };
  /** Knee bend outward 0..1 (a raised leg on a hop). */
  bendL: number;
  bendR: number;
  /** Squash on landing, 0..1. */
  squash: number;
  lean: number;
  /** Mouth: 0 neutral smile, 1 open grin, -1 frown. */
  mood: number;
}

export const neutralPose = (facing: "front" | "back"): KidPose => ({
  facing,
  lift: 0,
  clap: 0,
  cheer: 0,
  footL: { x: 0, y: 0 },
  footR: { x: 0, y: 0 },
  bendL: 0,
  bendR: 0,
  squash: 0,
  lean: 0,
  mood: 0,
});

export const LOOKS: Record<string, KidLook> = {
  greenPinafore: {
    skin: "#6b3f26",
    hair: "threaded",
    hairColor: "#17110d",
    thread: "#f2efe9",
    top: "#f7f5ef",
    bottom: "#1d7a46",
    dress: true,
    socks: "#f7f5ef",
    shoes: "#1a1614",
    collar: "#f7f5ef",
  },
  bluePinafore: {
    skin: "#4e2c1a",
    hair: "puffs",
    hairColor: "#140f0c",
    thread: "#e8b23a",
    top: "#fbfaf6",
    bottom: "#2c5aa0",
    dress: true,
    socks: "#fbfaf6",
    shoes: "#231b16",
    collar: "#fbfaf6",
  },
  maroonPinafore: {
    skin: "#7a4a2e",
    hair: "cornrows",
    hairColor: "#1a120e",
    thread: "#3b2a20",
    top: "#f5efe3",
    bottom: "#7c1f2c",
    dress: true,
    socks: "#f5efe3",
    shoes: "#201814",
    collar: "#f5efe3",
  },
  brownShorts: {
    skin: "#5a3420",
    hair: "short",
    hairColor: "#120d0a",
    thread: "#120d0a",
    top: "#f3eee2",
    bottom: "#6b4a2b",
    dress: false,
    socks: "#f3eee2",
    shoes: "#1b1512",
    collar: "#f3eee2",
  },
};

interface Pt {
  x: number;
  y: number;
}

/** Two-segment limb with a knee/elbow pushed perpendicular to the limb. */
function limb(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, bend: number, width: number, color: string, outline: string) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const kx = mx + (-dy / len) * bend;
  const ky = my + (dx / len) * bend;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = outline;
  ctx.lineWidth = width + 1.6;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(kx, ky, b.x, b.y);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  return { kx, ky };
}

export function drawKid(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, look: KidLook, pose: KidPose) {
  const front = pose.facing === "front";
  const outline = "rgba(20,10,6,0.55)";
  const skinDark = mix(look.skin, "#000000", 0.25);
  const skinLight = mix(look.skin, "#ffffff", 0.18);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(pose.lean);

  const sq = pose.squash;
  const lift = pose.lift;
  const hipY = -46 + sq * 4 - lift;
  const shoulderY = -80 + sq * 6 - lift;

  // Feet are in screen space. Neutral stance is 7 units either side of centre.
  const screenLeftFoot = { x: -7 + pose.footL.x, y: pose.footL.y - lift };
  const screenRightFoot = { x: 7 + pose.footR.x, y: pose.footR.y - lift };
  const bendScreenLeft = pose.bendL;
  const bendScreenRight = pose.bendR;

  const drawLeg = (hipX: number, foot: Pt, bend: number, side: -1 | 1) => {
    const hip = { x: hipX, y: hipY };
    limb(ctx, hip, foot, bend * 10 * -side, 7.4, look.skin, outline);
    // Sock
    const sx = lerp(foot.x, hip.x, 0.16);
    const sy = lerp(foot.y, hip.y, 0.16);
    ctx.strokeStyle = look.socks;
    ctx.lineWidth = 7.8;
    ctx.beginPath();
    ctx.moveTo(foot.x, foot.y - 1);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    // Shoe: front view shows a rounded toe, back view a heel.
    ctx.fillStyle = look.shoes;
    ctx.beginPath();
    ctx.ellipse(foot.x + side * (front ? 0.5 : 0), foot.y + 0.6, 5.6, 3.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(foot.x - 1.5, foot.y - 0.8, 2.2, 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  drawLeg(-6, screenLeftFoot, bendScreenLeft, -1);
  drawLeg(6, screenRightFoot, bendScreenRight, 1);

  // Arms are drawn behind the body in back view, in front in front view.
  const restHand = (side: -1 | 1): Pt => ({ x: side * 17, y: hipY - 2 });
  const clapHand = (side: -1 | 1): Pt => ({ x: side * 1.6, y: shoulderY + 10 });
  const cheerHand = (side: -1 | 1): Pt => ({ x: side * 20, y: shoulderY - 30 });
  const handAt = (side: -1 | 1): Pt => {
    const r = restHand(side);
    const c = clapHand(side);
    const h = cheerHand(side);
    const base = { x: lerp(r.x, c.x, pose.clap), y: lerp(r.y, c.y, pose.clap) };
    return { x: lerp(base.x, h.x, pose.cheer), y: lerp(base.y, h.y, pose.cheer) };
  };
  const drawArm = (side: -1 | 1) => {
    const shoulder = { x: side * 12.5, y: shoulderY + 3 };
    const hand = handAt(side);
    const bend = side * lerp(4, 9, pose.clap) * (front ? -1 : 1);
    limb(ctx, shoulder, hand, bend, 5.6, look.skin, outline);
    // Short sleeve
    ctx.strokeStyle = look.top;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(lerp(shoulder.x, hand.x, 0.22), lerp(shoulder.y, hand.y, 0.22));
    ctx.stroke();
    ctx.fillStyle = skinDark;
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, 3.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.arc(hand.x - 0.4, hand.y - 0.4, 2.8, 0, Math.PI * 2);
    ctx.fill();
  };
  if (!front) {
    drawArm(-1);
    drawArm(1);
  }

  // Torso
  const torsoGrad = ctx.createLinearGradient(-18, 0, 18, 0);
  if (look.dress) {
    // White blouse under a pinafore dress.
    ctx.fillStyle = look.top;
    ctx.beginPath();
    ctx.moveTo(-12.5, shoulderY);
    ctx.quadraticCurveTo(0, shoulderY - 3, 12.5, shoulderY);
    ctx.lineTo(10, hipY - 4);
    ctx.lineTo(-10, hipY - 4);
    ctx.closePath();
    ctx.fill();
    torsoGrad.addColorStop(0, mix(look.bottom, "#ffffff", 0.12));
    torsoGrad.addColorStop(0.6, look.bottom);
    torsoGrad.addColorStop(1, mix(look.bottom, "#000000", 0.3));
    ctx.fillStyle = torsoGrad;
    const hemY = hipY + 12 + sq * 2;
    const flare = 18 + pose.lift * 0.15;
    ctx.beginPath();
    ctx.moveTo(-9.5, shoulderY + 2);
    ctx.lineTo(-6, shoulderY + 2);
    ctx.lineTo(-6, shoulderY + 9);
    ctx.lineTo(6, shoulderY + 9);
    ctx.lineTo(6, shoulderY + 2);
    ctx.lineTo(9.5, shoulderY + 2);
    ctx.lineTo(10.5, hipY - 5);
    ctx.quadraticCurveTo(flare + 1, hemY - 4, flare, hemY);
    ctx.quadraticCurveTo(0, hemY + 2.5, -flare, hemY);
    ctx.quadraticCurveTo(-flare - 1, hemY - 4, -10.5, hipY - 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // Pleats
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 0.8;
    for (const px of [-8, -3, 2, 7]) {
      ctx.beginPath();
      ctx.moveTo(px * 0.7, hipY - 3);
      ctx.lineTo(px * 1.25, hemY - 0.5);
      ctx.stroke();
    }
    // Belt line
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(-10.8, hipY - 6, 21.6, 1.6);
  } else {
    // Shirt and shorts
    torsoGrad.addColorStop(0, mix(look.top, "#ffffff", 0.3));
    torsoGrad.addColorStop(0.7, look.top);
    torsoGrad.addColorStop(1, mix(look.top, "#000000", 0.18));
    ctx.fillStyle = look.bottom;
    ctx.beginPath();
    ctx.moveTo(-11, hipY - 6);
    ctx.lineTo(11, hipY - 6);
    ctx.lineTo(12.5, hipY + 7);
    ctx.lineTo(1.5, hipY + 7);
    ctx.lineTo(0, hipY + 1);
    ctx.lineTo(-1.5, hipY + 7);
    ctx.lineTo(-12.5, hipY + 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = torsoGrad;
    ctx.beginPath();
    ctx.moveTo(-12.5, shoulderY);
    ctx.quadraticCurveTo(0, shoulderY - 3, 12.5, shoulderY);
    ctx.lineTo(11.5, hipY - 4);
    ctx.lineTo(-11.5, hipY - 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    if (front) {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(0, shoulderY + 6 + i * 7, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Neck and collar
  ctx.fillStyle = skinDark;
  ctx.fillRect(-3.2, shoulderY - 6, 6.4, 7);
  ctx.fillStyle = look.collar;
  ctx.beginPath();
  if (front) {
    ctx.moveTo(-5.5, shoulderY - 1);
    ctx.lineTo(0, shoulderY + 4.5);
    ctx.lineTo(5.5, shoulderY - 1);
    ctx.lineTo(3, shoulderY - 2);
    ctx.lineTo(0, shoulderY + 1.5);
    ctx.lineTo(-3, shoulderY - 2);
  } else {
    ctx.ellipse(0, shoulderY - 0.5, 6, 2.4, 0, 0, Math.PI * 2);
  }
  ctx.fill();

  if (front) {
    drawArm(-1);
    drawArm(1);
  }

  // Head
  const headY = shoulderY - 16;
  const headGrad = ctx.createRadialGradient(-4, headY - 4, 2, 0, headY, 13);
  headGrad.addColorStop(0, skinLight);
  headGrad.addColorStop(1, look.skin);
  // Ears
  ctx.fillStyle = skinDark;
  ctx.beginPath();
  ctx.arc(-11, headY + 1, 2.6, 0, Math.PI * 2);
  ctx.arc(11, headY + 1, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.ellipse(0, headY, 11, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 0.9;
  ctx.stroke();

  drawHair(ctx, look, headY, front);

  if (front) {
    // Eyes
    for (const ex of [-4.2, 4.2]) {
      ctx.fillStyle = "#fbf7f0";
      ctx.beginPath();
      ctx.ellipse(ex, headY + 0.5, 2.3, 1.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a0f0a";
      ctx.beginPath();
      ctx.arc(ex + 0.3, headY + 0.7, 1.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ex + 0.8, headY + 0.1, 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    // Brows
    ctx.strokeStyle = look.hairColor;
    ctx.lineWidth = 1.1;
    ctx.lineCap = "round";
    for (const ex of [-4.2, 4.2]) {
      ctx.beginPath();
      ctx.moveTo(ex - 2, headY - 3 - (pose.mood < 0 ? -0.6 : 0));
      ctx.quadraticCurveTo(ex, headY - 4.2, ex + 2, headY - 3);
      ctx.stroke();
    }
    // Nose
    ctx.fillStyle = skinDark;
    ctx.beginPath();
    ctx.ellipse(0, headY + 4, 1.8, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    // Mouth
    if (pose.mood > 0.5) {
      ctx.fillStyle = "#3a1410";
      ctx.beginPath();
      ctx.moveTo(-3.6, headY + 6.6);
      ctx.quadraticCurveTo(0, headY + 11.5, 3.6, headY + 6.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(-2.6, headY + 6.7, 5.2, 1.2);
    } else {
      ctx.strokeStyle = "#3a1410";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const curve = pose.mood < 0 ? -1.6 : 2;
      ctx.moveTo(-3, headY + 7.4);
      ctx.quadraticCurveTo(0, headY + 7.4 + curve, 3, headY + 7.4);
      ctx.stroke();
    }
    // Cheek glow
    ctx.fillStyle = "rgba(255,140,110,0.12)";
    ctx.beginPath();
    ctx.arc(-6.5, headY + 4.5, 2.4, 0, Math.PI * 2);
    ctx.arc(6.5, headY + 4.5, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawHair(ctx: CanvasRenderingContext2D, look: KidLook, headY: number, front: boolean) {
  const hc = look.hairColor;
  ctx.fillStyle = hc;
  // Base cap: covers the top of the head in front view, most of it from behind.
  ctx.beginPath();
  if (front) {
    ctx.ellipse(0, headY - 2.5, 11.4, 10, 0, Math.PI, Math.PI * 2);
    ctx.lineTo(11.4, headY - 1);
    ctx.quadraticCurveTo(0, headY - 6, -11.4, headY - 1);
  } else {
    ctx.ellipse(0, headY, 11.6, 12.3, 0, 0, Math.PI * 2);
  }
  ctx.fill();

  if (look.hair === "threaded") {
    // Irun kiko: hair wrapped in thread into stiff stalks.
    const stalks = front ? [-0.95, -0.55, -0.15, 0.25, 0.65, 1.0] : [-1.0, -0.6, -0.2, 0.2, 0.6, 1.0];
    for (const s of stalks) {
      const ang = -Math.PI / 2 + s * 0.95;
      const bx = Math.cos(ang) * 8;
      const by = headY - 3 + Math.sin(ang) * 8;
      const tx = Math.cos(ang) * 19;
      const ty = headY - 3 + Math.sin(ang) * 19;
      ctx.strokeStyle = hc;
      ctx.lineWidth = 3.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo((bx + tx) / 2 + s * 2, (by + ty) / 2, tx, ty);
      ctx.stroke();
      ctx.strokeStyle = look.thread;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([1.4, 1.1]);
      ctx.beginPath();
      ctx.moveTo(bx + (tx - bx) * 0.2, by + (ty - by) * 0.2);
      ctx.lineTo(bx + (tx - bx) * 0.85, by + (ty - by) * 0.85);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = hc;
      ctx.beginPath();
      ctx.arc(tx, ty, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (look.hair === "cornrows") {
    ctx.strokeStyle = mix(hc, "#ffffff", 0.16);
    ctx.lineWidth = 0.9;
    const rows = [-7, -3.5, 0, 3.5, 7];
    for (const r of rows) {
      ctx.beginPath();
      if (front) {
        ctx.moveTo(r, headY - 3);
        ctx.quadraticCurveTo(r * 1.1, headY - 9, r * 0.8, headY - 12);
      } else {
        ctx.moveTo(r * 0.8, headY - 11);
        ctx.quadraticCurveTo(r * 1.2, headY, r * 0.9, headY + 10);
      }
      ctx.stroke();
    }
  } else if (look.hair === "puffs") {
    for (const side of [-1, 1]) {
      const g = ctx.createRadialGradient(side * 10 - 1, headY - 12, 1, side * 10, headY - 10, 7.5);
      g.addColorStop(0, mix(hc, "#ffffff", 0.12));
      g.addColorStop(1, hc);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(side * 10, headY - 10, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = look.thread;
      ctx.fillRect(side * 10 - 2.5 - side * 3, headY - 5.5, 5, 2);
    }
  } else {
    // Low cut: speckled texture.
    ctx.fillStyle = mix(hc, "#ffffff", 0.1);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * (front ? 1 : 2) + (front ? Math.PI : 0);
      const r = 5 + (i % 3) * 2.2;
      ctx.fillRect(Math.cos(a) * r, headY - 2 + Math.sin(a) * r, 0.9, 0.9);
    }
  }
}
