import { breakout } from "@/lib/templates/games/breakout";
import { colorTap } from "@/lib/templates/games/color-tap";
import { dodge } from "@/lib/templates/games/dodge";
import { memory } from "@/lib/templates/games/memory";
import { neonFlap } from "@/lib/templates/games/neon-flap";
import { simon } from "@/lib/templates/games/simon";
import { snake } from "@/lib/templates/games/snake";
import { stack } from "@/lib/templates/games/stack";
import type { GameTemplate } from "@/lib/templates/types";

export type { GameTemplate };

/** Startvorlagen für das Studio – und gleichzeitig Seed-Inhalte für einen frischen Feed. */
export const TEMPLATES: GameTemplate[] = [neonFlap, snake, colorTap, breakout, memory, dodge, stack, simon];

export const BLANK_TEMPLATE = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Mein Spiel</title>
<style>
  html, body { margin: 0; height: 100%; background: #111; color: #fff; font-family: system-ui, sans-serif; overflow: hidden; touch-action: none; user-select: none; }
  canvas { display: block; width: 100%; height: 100%; }
  #hud { position: absolute; top: 16px; left: 0; right: 0; text-align: center; font-size: 28px; font-weight: 800; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="hud">0</div>
<script>
  // Dein Spiel: Der Canvas füllt den ganzen Bildschirm. Tippe irgendwo, um Punkte zu sammeln.
  var canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
  var W, H, dpr, score = 0, dots = [];
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize); resize();
  window.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    score++;
    document.getElementById('hud').textContent = score;
    dots.push({ x: e.clientX, y: e.clientY, r: 4, a: 1 });
  });
  function loop() {
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
    for (var i = dots.length - 1; i >= 0; i--) {
      var d = dots[i]; d.r += 4; d.a -= 0.03;
      if (d.a <= 0) { dots.splice(i, 1); continue; }
      ctx.strokeStyle = 'rgba(255,45,122,' + d.a + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.stroke();
    }
    requestAnimationFrame(loop);
  }
  loop();
</script>
</body>
</html>`;

export function getTemplate(id: string): GameTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
