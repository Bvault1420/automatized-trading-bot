import type { GameTemplate } from "@/lib/templates/types";

export const dodge: GameTemplate = {
  id: "dodge",
  name: "Asteroid Dodge",
  description: "Ziehe dein Schiff nach links und rechts und weiche den Asteroiden aus. Der Weltraum wird immer voller …",
  tags: ["arcade", "weltraum", "ausweichen"],
  html: `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Asteroid Dodge</title>
<style>
  html,body{margin:0;height:100%;background:#03040c;overflow:hidden;font-family:system-ui,sans-serif;color:#fff;touch-action:none;user-select:none}
  canvas{display:block;width:100%;height:100%}
  #hud{position:absolute;top:14px;left:0;right:0;text-align:center;font-weight:800;font-size:30px;text-shadow:0 0 14px #ffd23b}
  #ui{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;text-align:center}
  .card{background:rgba(3,4,12,.8);border:1px solid rgba(255,255,255,.15);padding:22px 28px;border-radius:20px}
  h1{margin:0 0 6px;font-size:30px;text-shadow:0 0 16px #ffd23b}
  p{margin:4px 0;color:#ffe9a8;font-size:15px}
  .hidden{display:none}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="hud">0</div>
<div id="ui">
  <div class="card" id="start"><h1>Asteroid Dodge</h1><p>Finger ziehen oder Pfeiltasten</p><p>Tippe zum Starten</p></div>
  <div class="card hidden" id="over"><h1>Zerschellt!</h1><p id="final"></p><p id="best"></p><p>Tippe für eine neue Runde</p></div>
</div>
<script>
(function(){
  var canvas=document.getElementById('c'),ctx=canvas.getContext('2d');
  var W,H,dpr;
  function resize(){dpr=Math.min(window.devicePixelRatio||1,2);W=window.innerWidth;H=window.innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);}
  window.addEventListener('resize',resize);resize();
  var state='start',ship,rocks,stars,score,best=0,t,spawnEvery,keys={};
  var hud=document.getElementById('hud'),startEl=document.getElementById('start'),overEl=document.getElementById('over');
  function reset(){ship={x:W/2,y:H-90,w:34,h:44,tx:W/2};rocks=[];score=0;t=0;spawnEvery=48;hud.textContent='0';
    stars=[];for(var i=0;i<70;i++)stars.push({x:Math.random()*W,y:Math.random()*H,s:Math.random()*1.6+0.4,v:Math.random()*1.5+0.5});}
  reset();
  function start(){if(state==='over'){reset();overEl.classList.add('hidden');}else startEl.classList.add('hidden');state='play';}
  window.addEventListener('pointerdown',function(e){e.preventDefault();if(state!=='play')start();ship.tx=e.clientX;});
  window.addEventListener('pointermove',function(e){if(e.buttons||e.pointerType==='touch')ship.tx=e.clientX;});
  window.addEventListener('keydown',function(e){keys[e.key]=true;if(e.key===' '&&state!=='play')start();if(e.key.indexOf('Arrow')===0)e.preventDefault();});
  window.addEventListener('keyup',function(e){keys[e.key]=false;});
  function spawn(){var r=14+Math.random()*26;rocks.push({x:r+Math.random()*(W-2*r),y:-r,r:r,v:2.2+Math.random()*2+score/600,rot:Math.random()*Math.PI*2,vr:(Math.random()-0.5)*0.05});}
  function end(){state='over';best=Math.max(best,score);document.getElementById('final').textContent='Punkte: '+score;document.getElementById('best').textContent='Bestwert: '+best;overEl.classList.remove('hidden');}
  function update(){
    for(var i=0;i<stars.length;i++){var s=stars[i];s.y+=s.v*(state==='play'?2:0.6);if(s.y>H){s.y=-2;s.x=Math.random()*W;}}
    if(state!=='play')return;
    t++;score++;if(t%10===0)hud.textContent=score;
    if(keys.ArrowLeft||keys.a)ship.tx-=7;if(keys.ArrowRight||keys.d)ship.tx+=7;
    ship.tx=Math.max(ship.w/2,Math.min(W-ship.w/2,ship.tx));ship.x+=(ship.tx-ship.x)*0.25;
    if(t%Math.max(14,Math.round(spawnEvery-score/40))===0)spawn();
    for(var j=rocks.length-1;j>=0;j--){var k=rocks[j];k.y+=k.v;k.rot+=k.vr;if(k.y-k.r>H){rocks.splice(j,1);continue;}
      var dx=Math.abs(k.x-ship.x),dy=Math.abs(k.y-ship.y);
      if(dx<k.r*0.8+ship.w*0.35&&dy<k.r*0.8+ship.h*0.35)return end();}
  }
  function draw(){
    ctx.fillStyle='#03040c';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#fff';for(var i=0;i<stars.length;i++){var s=stars[i];ctx.globalAlpha=0.3+s.s/2;ctx.fillRect(s.x,s.y,s.s,s.s*3);}ctx.globalAlpha=1;
    for(var j=0;j<rocks.length;j++){var k=rocks[j];ctx.save();ctx.translate(k.x,k.y);ctx.rotate(k.rot);ctx.fillStyle='#8b7355';ctx.strokeStyle='#c9a37a';ctx.lineWidth=2;ctx.beginPath();
      for(var a=0;a<7;a++){var ang=a/7*Math.PI*2;var rr=k.r*(0.8+((a*37)%10)/40);ctx.lineTo(Math.cos(ang)*rr,Math.sin(ang)*rr);}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
    ctx.save();ctx.translate(ship.x,ship.y);ctx.shadowBlur=18;ctx.shadowColor='#5cf0ff';ctx.fillStyle='#5cf0ff';
    ctx.beginPath();ctx.moveTo(0,-ship.h/2);ctx.lineTo(ship.w/2,ship.h/2);ctx.lineTo(0,ship.h/3);ctx.lineTo(-ship.w/2,ship.h/2);ctx.closePath();ctx.fill();
    if(state==='play'){ctx.shadowColor='#ff8a3b';ctx.fillStyle='#ff8a3b';ctx.beginPath();ctx.moveTo(-6,ship.h/2-4);ctx.lineTo(0,ship.h/2+12+Math.random()*10);ctx.lineTo(6,ship.h/2-4);ctx.closePath();ctx.fill();}
    ctx.restore();ctx.shadowBlur=0;
  }
  function loop(){update();draw();requestAnimationFrame(loop);}
  loop();
})();
</script>
</body>
</html>`,
};
