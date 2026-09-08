import type { GameTemplate } from "@/lib/templates/types";

export const stack: GameTemplate = {
  id: "stack",
  name: "Turmbau",
  description: "Tippe im richtigen Moment, um Blöcke exakt übereinander zu stapeln. Je genauer, desto höher der Turm.",
  tags: ["timing", "stapeln", "geschick"],
  html: `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Turmbau</title>
<style>
  html,body{margin:0;height:100%;background:#0a1020;overflow:hidden;font-family:system-ui,sans-serif;color:#fff;touch-action:none;user-select:none}
  canvas{display:block;width:100%;height:100%}
  #hud{position:absolute;top:14px;left:0;right:0;text-align:center;font-weight:800;font-size:38px;text-shadow:0 0 14px #a35cff}
  #ui{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;text-align:center}
  .card{background:rgba(10,16,32,.8);border:1px solid rgba(255,255,255,.15);padding:22px 28px;border-radius:20px}
  h1{margin:0 0 6px;font-size:30px;text-shadow:0 0 16px #a35cff}
  p{margin:4px 0;color:#dccbff;font-size:15px}
  .hidden{display:none}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="hud">0</div>
<div id="ui">
  <div class="card" id="start"><h1>Turmbau</h1><p>Tippe, wenn der Block genau über dem Turm ist</p><p>Tippe zum Starten</p></div>
  <div class="card hidden" id="over"><h1>Umgekippt!</h1><p id="final"></p><p id="best"></p><p>Tippe für eine neue Runde</p></div>
</div>
<script>
(function(){
  var canvas=document.getElementById('c'),ctx=canvas.getContext('2d');
  var W,H,dpr;
  function resize(){dpr=Math.min(window.devicePixelRatio||1,2);W=window.innerWidth;H=window.innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);}
  window.addEventListener('resize',resize);resize();
  var state='start',blocks,mover,score,best=0,camY,BH=28,debris;
  var hud=document.getElementById('hud'),startEl=document.getElementById('start'),overEl=document.getElementById('over');
  function color(i){return 'hsl('+((i*22)%360)+' 80% 60%)';}
  function reset(){var w=Math.min(W*0.6,260);blocks=[{x:(W-w)/2,w:w}];score=0;camY=0;debris=[];hud.textContent='0';newMover();}
  function newMover(){var last=blocks[blocks.length-1];var dir=blocks.length%2===0?1:-1;mover={x:dir===1?-last.w:W,w:last.w,dir:dir,v:3+Math.min(6,blocks.length*0.25)};}
  reset();
  function start(){if(state==='over'){reset();overEl.classList.add('hidden');}else startEl.classList.add('hidden');state='play';}
  function place(){
    var last=blocks[blocks.length-1];var left=Math.max(mover.x,last.x),right=Math.min(mover.x+mover.w,last.x+last.w);var w=right-left;
    if(w<=6){debris.push({x:mover.x,w:mover.w,y:topY(),vy:0,vx:mover.dir*2});return end();}
    if(mover.x<last.x)debris.push({x:mover.x,w:last.x-mover.x,y:topY(),vy:0,vx:-2});
    if(mover.x+mover.w>last.x+last.w)debris.push({x:last.x+last.w,w:mover.x+mover.w-(last.x+last.w),y:topY(),vy:0,vx:2});
    var perfect=Math.abs(mover.x-last.x)<4;if(perfect){left=last.x;w=last.w;}
    blocks.push({x:left,w:w,perfect:perfect});score+=perfect?2:1;hud.textContent=score;newMover();
  }
  function topY(){return H-120-(blocks.length-1)*BH+camY;}
  function end(){state='over';best=Math.max(best,score);document.getElementById('final').textContent='Blöcke: '+score;document.getElementById('best').textContent='Bestwert: '+best;overEl.classList.remove('hidden');}
  window.addEventListener('pointerdown',function(e){e.preventDefault();if(state!=='play')start();else place();});
  window.addEventListener('keydown',function(e){if(e.key===' '){e.preventDefault();if(state!=='play')start();else place();}});
  function update(){
    var target=Math.max(0,(blocks.length-6)*BH);camY+=(target-camY)*0.1;
    if(state==='play'){mover.x+=mover.v*mover.dir;if(mover.dir===1&&mover.x>W)mover.x=-mover.w;if(mover.dir===-1&&mover.x+mover.w<0)mover.x=W;}
    for(var i=debris.length-1;i>=0;i--){var d=debris[i];d.vy+=0.5;d.y+=d.vy;d.x+=d.vx;if(d.y>H+60)debris.splice(i,1);}
  }
  function draw(){
    var g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#141c3a');g.addColorStop(1,'#0a1020');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    for(var i=0;i<blocks.length;i++){var b=blocks[i];var y=H-120-i*BH+camY;ctx.fillStyle=color(i);ctx.shadowBlur=b.perfect?18:0;ctx.shadowColor='#fff';ctx.fillRect(b.x,y,b.w,BH-2);ctx.shadowBlur=0;}
    ctx.fillStyle='#0a1020';ctx.fillRect(0,H-92+camY,W,H);
    ctx.fillStyle='#1d2748';ctx.fillRect(0,H-92+camY,W,4);
    for(var j=0;j<debris.length;j++){var d=debris[j];ctx.globalAlpha=0.7;ctx.fillStyle=color(blocks.length);ctx.fillRect(d.x,d.y,d.w,BH-2);ctx.globalAlpha=1;}
    if(state==='play'){ctx.fillStyle=color(blocks.length);ctx.shadowBlur=14;ctx.shadowColor=color(blocks.length);ctx.fillRect(mover.x,topY()-BH,mover.w,BH-2);ctx.shadowBlur=0;}
  }
  function loop(){update();draw();requestAnimationFrame(loop);}
  loop();
})();
</script>
</body>
</html>`,
};
