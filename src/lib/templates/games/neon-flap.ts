import type { GameTemplate } from "@/lib/templates/types";

export const neonFlap: GameTemplate = {
  id: "neon-flap",
  name: "Neon Flap",
  description: "Tippe, um zu flattern, und weiche den Neon-Säulen aus. Wie weit kommst du?",
  tags: ["arcade", "reflex", "flappy"],
  html: `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Neon Flap</title>
<style>
  html,body{margin:0;height:100%;background:#0b0620;overflow:hidden;font-family:system-ui,sans-serif;color:#fff;touch-action:none;user-select:none}
  canvas{display:block;width:100%;height:100%}
  #ui{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;text-align:center}
  #score{position:absolute;top:18px;left:0;right:0;font-size:44px;font-weight:800;text-shadow:0 0 18px #ff2d7a}
  .card{background:rgba(10,5,30,.75);border:1px solid rgba(255,255,255,.15);padding:22px 28px;border-radius:20px;backdrop-filter:blur(6px)}
  h1{margin:0 0 6px;font-size:30px;letter-spacing:.5px;text-shadow:0 0 16px #7c5cff}
  p{margin:4px 0;color:#c9c3ff;font-size:15px}
  .hidden{display:none}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="score">0</div>
<div id="ui">
  <div class="card" id="start"><h1>Neon Flap</h1><p>Tippen oder Leertaste zum Flattern</p><p>Tippe zum Starten</p></div>
  <div class="card hidden" id="over"><h1>Game Over</h1><p id="final"></p><p id="best"></p><p>Tippe für eine neue Runde</p></div>
</div>
<script>
(function(){
  var canvas=document.getElementById('c'),ctx=canvas.getContext('2d');
  var W=0,H=0,dpr=1;
  function resize(){dpr=Math.min(window.devicePixelRatio||1,2);W=window.innerWidth;H=window.innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);}
  window.addEventListener('resize',resize);resize();
  var state='start',bird,pipes,score,best=0,t=0,speed;
  var scoreEl=document.getElementById('score'),startEl=document.getElementById('start'),overEl=document.getElementById('over');
  function reset(){bird={x:W*0.3,y:H*0.45,vy:0,r:16};pipes=[];score=0;t=0;speed=Math.max(2.4,W/180);scoreEl.textContent='0';}
  reset();
  function flap(){
    if(state==='start'){state='play';startEl.classList.add('hidden');bird.vy=-7.5;return;}
    if(state==='over'){reset();state='play';overEl.classList.add('hidden');return;}
    bird.vy=-7.5;
  }
  window.addEventListener('pointerdown',function(e){e.preventDefault();flap();});
  window.addEventListener('keydown',function(e){if(e.code==='Space'||e.code==='ArrowUp'){e.preventDefault();flap();}});
  function spawn(){var gap=Math.max(150,H*0.24);var top=60+Math.random()*(H-gap-160);pipes.push({x:W+60,top:top,gap:gap,w:64,passed:false});}
  function gameOver(){state='over';best=Math.max(best,score);document.getElementById('final').textContent='Punkte: '+score;document.getElementById('best').textContent='Bestwert: '+best;overEl.classList.remove('hidden');}
  function update(){
    if(state!=='play')return;
    t++;
    bird.vy+=0.38;bird.y+=bird.vy;
    if(t%Math.round(95*(3/speed))===0)spawn();
    for(var i=pipes.length-1;i>=0;i--){
      var p=pipes[i];p.x-=speed;
      if(!p.passed&&p.x+p.w<bird.x){p.passed=true;score++;scoreEl.textContent=score;if(score%5===0)speed+=0.25;}
      if(p.x+p.w<-10)pipes.splice(i,1);
      var inX=bird.x+bird.r>p.x&&bird.x-bird.r<p.x+p.w;
      var inGap=bird.y-bird.r>p.top&&bird.y+bird.r<p.top+p.gap;
      if(inX&&!inGap)gameOver();
    }
    if(bird.y+bird.r>H||bird.y-bird.r<0)gameOver();
  }
  function draw(){
    ctx.clearRect(0,0,W,H);
    var g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#15093a');g.addColorStop(1,'#0b0620');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.globalAlpha=0.25;ctx.strokeStyle='#7c5cff';ctx.lineWidth=1;
    for(var x=(-(t*0.5)%40);x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    ctx.restore();
    ctx.shadowBlur=18;ctx.shadowColor='#ff2d7a';ctx.fillStyle='#ff2d7a';
    for(var i=0;i<pipes.length;i++){var p=pipes[i];ctx.fillRect(p.x,0,p.w,p.top);ctx.fillRect(p.x,p.top+p.gap,p.w,H-p.top-p.gap);}
    ctx.shadowColor='#5cf0ff';ctx.fillStyle='#5cf0ff';
    ctx.save();ctx.translate(bird.x,bird.y);ctx.rotate(Math.max(-0.5,Math.min(0.8,bird.vy*0.08)));
    ctx.beginPath();ctx.arc(0,0,bird.r,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle='#0b0620';ctx.beginPath();ctx.arc(6,-4,4,0,Math.PI*2);ctx.fill();
    ctx.restore();ctx.shadowBlur=0;
  }
  function loop(){update();draw();requestAnimationFrame(loop);}
  loop();
})();
</script>
</body>
</html>`,
};
