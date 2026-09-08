import type { GameTemplate } from "@/lib/templates/types";

export const colorTap: GameTemplate = {
  id: "color-tap",
  name: "Farbtreffer",
  description: "Tippe so schnell wie möglich auf den Kreis mit der angesagten Farbe. Achtung: Die Zeit läuft!",
  tags: ["reflex", "farben", "schnell"],
  html: `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Farbtreffer</title>
<style>
  html,body{margin:0;height:100%;background:#0e0b1f;overflow:hidden;font-family:system-ui,sans-serif;color:#fff;touch-action:none;user-select:none}
  #app{position:absolute;inset:0;display:flex;flex-direction:column}
  #top{padding:18px 20px 8px;display:flex;justify-content:space-between;font-weight:800;font-size:22px}
  #target{text-align:center;font-size:34px;font-weight:900;letter-spacing:1px;margin:6px 0 10px;text-transform:uppercase;text-shadow:0 0 18px currentColor}
  #bar{height:8px;margin:0 20px;background:rgba(255,255,255,.12);border-radius:8px;overflow:hidden}
  #fill{height:100%;width:100%;background:linear-gradient(90deg,#ff2d7a,#7c5cff);transition:width .1s linear}
  #grid{flex:1;display:grid;grid-template-columns:repeat(2,1fr);gap:16px;padding:20px}
  .dot{border-radius:50%;aspect-ratio:1;align-self:center;justify-self:center;width:min(38vw,26vh);box-shadow:0 0 30px -6px currentColor;background:currentColor;transition:transform .08s}
  .dot:active{transform:scale(.92)}
  #ui{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;background:rgba(14,11,31,.7)}
  .card{background:rgba(20,15,45,.95);border:1px solid rgba(255,255,255,.15);padding:24px 30px;border-radius:20px}
  h1{margin:0 0 6px;font-size:30px}
  p{margin:4px 0;color:#cfc8ff;font-size:15px}
  .hidden,#ui.hidden{display:none}
</style>
</head>
<body>
<div id="app">
  <div id="top"><span id="score">0</span><span id="streak"></span></div>
  <div id="target">–</div>
  <div id="bar"><div id="fill"></div></div>
  <div id="grid"></div>
</div>
<div id="ui">
  <div class="card" id="start"><h1>Farbtreffer</h1><p>Tippe auf die Farbe, die oben steht.</p><p>Falsche Farbe = Zeitstrafe.</p><p>Tippe zum Starten</p></div>
  <div class="card hidden" id="over"><h1>Zeit abgelaufen</h1><p id="final"></p><p id="best"></p><p>Tippe für eine neue Runde</p></div>
</div>
<script>
(function(){
  var COLORS=[{n:'Rot',c:'#ff3b5c'},{n:'Blau',c:'#3b82ff'},{n:'Grün',c:'#22e5a3'},{n:'Gelb',c:'#ffd23b'},{n:'Lila',c:'#a35cff'},{n:'Orange',c:'#ff8a3b'}];
  var grid=document.getElementById('grid'),targetEl=document.getElementById('target'),scoreEl=document.getElementById('score'),streakEl=document.getElementById('streak'),fill=document.getElementById('fill');
  var ui=document.getElementById('ui'),startEl=document.getElementById('start'),overEl=document.getElementById('over');
  var state='start',score,streak,time,maxTime=20,target,best=0,last;
  function pick(n){var a=COLORS.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a.slice(0,n);}
  function round(){
    var set=pick(4);target=set[Math.floor(Math.random()*4)];
    targetEl.textContent=target.n;targetEl.style.color=target.c;
    grid.innerHTML='';
    set.forEach(function(col){var d=document.createElement('button');d.className='dot';d.style.color=col.c;d.setAttribute('aria-label',col.n);d.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();hit(col);});grid.appendChild(d);});
  }
  function hit(col){
    if(state!=='play')return;
    if(col===target){score++;streak++;time=Math.min(maxTime,time+0.6);}else{streak=0;time-=2;}
    scoreEl.textContent=score;streakEl.textContent=streak>=3?'🔥 '+streak:'';round();
  }
  function start(){state='play';score=0;streak=0;time=maxTime;scoreEl.textContent='0';streakEl.textContent='';ui.classList.add('hidden');round();last=performance.now();}
  function end(){state='over';best=Math.max(best,score);document.getElementById('final').textContent='Treffer: '+score;document.getElementById('best').textContent='Bestwert: '+best;startEl.classList.add('hidden');overEl.classList.remove('hidden');ui.classList.remove('hidden');}
  ui.addEventListener('pointerdown',function(e){e.preventDefault();if(state!=='play')start();});
  function loop(ts){
    if(state==='play'){time-=(ts-last)/1000;last=ts;fill.style.width=Math.max(0,time/maxTime*100)+'%';if(time<=0)end();}
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
</script>
</body>
</html>`,
};
