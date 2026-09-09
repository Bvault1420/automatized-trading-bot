import type { GameTemplate } from "@/lib/templates/types";

export const simon: GameTemplate = {
  id: "simon",
  name: "Simon Says",
  description: "Merke dir die Sequenz aus Farben und Tönen und spiele sie nach. Jede Runde wird sie länger.",
  tags: ["gedächtnis", "musik", "puzzle"],
  html: `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Simon Says</title>
<style>
  html,body{margin:0;height:100%;background:#0b0f1a;overflow:hidden;font-family:system-ui,sans-serif;color:#fff;touch-action:manipulation;user-select:none}
  #app{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:20px;box-sizing:border-box}
  #status{font-size:22px;font-weight:800;min-height:30px;text-align:center}
  #round{font-size:16px;color:#9fb3ff}
  #pad{display:grid;grid-template-columns:1fr 1fr;gap:14px;width:min(80vw,60vh)}
  .btn{aspect-ratio:1;border-radius:24px;border:0;opacity:.45;transition:opacity .12s,transform .12s;box-shadow:0 0 0 0 currentColor;background:currentColor;cursor:pointer}
  .btn.lit{opacity:1;transform:scale(1.04);box-shadow:0 0 34px -4px currentColor}
  .btn:disabled{cursor:default}
  #startBtn{background:linear-gradient(90deg,#ff2d7a,#7c5cff);border:0;color:#fff;font-weight:800;font-size:18px;padding:14px 30px;border-radius:999px}
  .hidden{display:none}
</style>
</head>
<body>
<div id="app">
  <div id="status">Simon Says</div>
  <div id="round">Merke dir die Reihenfolge</div>
  <div id="pad">
    <button class="btn" style="color:#22e5a3" data-i="0" aria-label="Grün"></button>
    <button class="btn" style="color:#ff3b5c" data-i="1" aria-label="Rot"></button>
    <button class="btn" style="color:#ffd23b" data-i="2" aria-label="Gelb"></button>
    <button class="btn" style="color:#3b82ff" data-i="3" aria-label="Blau"></button>
  </div>
  <button id="startBtn">Starten</button>
</div>
<script>
(function(){
  var pads=Array.prototype.slice.call(document.querySelectorAll('.btn')),statusEl=document.getElementById('status'),roundEl=document.getElementById('round'),startBtn=document.getElementById('startBtn');
  var seq=[],pos=0,playing=false,accepting=false,best=0,audio=null;
  var FREQ=[329.6,261.6,220,164.8];
  function beep(i,dur){
    try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();var o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=FREQ[i];g.gain.value=0.0001;o.connect(g);g.connect(audio.destination);var t=audio.currentTime;g.gain.exponentialRampToValueAtTime(0.25,t+0.02);g.gain.exponentialRampToValueAtTime(0.0001,t+dur/1000);o.start(t);o.stop(t+dur/1000+0.05);}catch(e){}
  }
  function light(i,dur){pads[i].classList.add('lit');beep(i,dur);setTimeout(function(){pads[i].classList.remove('lit');},dur);}
  function setDisabled(v){pads.forEach(function(p){p.disabled=v;});}
  function playSeq(){
    accepting=false;setDisabled(true);statusEl.textContent='Runde '+seq.length;roundEl.textContent='Beobachten …';
    var speed=Math.max(220,600-seq.length*30);var i=0;
    var iv=setInterval(function(){light(seq[i],speed*0.7);i++;if(i>=seq.length){clearInterval(iv);setTimeout(function(){accepting=true;pos=0;setDisabled(false);roundEl.textContent='Jetzt du!';},speed);}},speed);
  }
  function next(){seq.push(Math.floor(Math.random()*4));setTimeout(playSeq,500);}
  function start(){seq=[];playing=true;startBtn.classList.add('hidden');next();}
  function fail(){
    playing=false;accepting=false;setDisabled(true);best=Math.max(best,seq.length-1);
    statusEl.textContent='Falsch! Du hast '+(seq.length-1)+' geschafft.';roundEl.textContent='Bestwert: '+best;startBtn.textContent='Nochmal';startBtn.classList.remove('hidden');
    pads.forEach(function(p){p.classList.add('lit');});setTimeout(function(){pads.forEach(function(p){p.classList.remove('lit');});},400);
  }
  pads.forEach(function(p){p.addEventListener('click',function(){
    if(!accepting)return;var i=+p.dataset.i;light(i,250);
    if(seq[pos]!==i)return fail();pos++;
    if(pos===seq.length){accepting=false;setDisabled(true);roundEl.textContent='Richtig!';next();}
  });});
  startBtn.addEventListener('click',start);setDisabled(true);
})();
</script>
</body>
</html>`,
};
