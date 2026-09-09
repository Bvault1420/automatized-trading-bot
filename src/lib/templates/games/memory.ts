import type { GameTemplate } from "@/lib/templates/types";

export const memory: GameTemplate = {
  id: "memory",
  name: "Emoji Memory",
  description: "Finde alle Paare mit so wenigen Zügen wie möglich. Trainiert dein Gedächtnis!",
  tags: ["puzzle", "memory", "gehirn"],
  html: `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Emoji Memory</title>
<style>
  html,body{margin:0;height:100%;background:#120a1e;overflow:hidden;font-family:system-ui,sans-serif;color:#fff;touch-action:manipulation;user-select:none}
  #app{position:absolute;inset:0;display:flex;flex-direction:column;padding:16px;box-sizing:border-box}
  #top{display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:20px;padding:6px 4px 14px}
  #grid{flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;align-content:center}
  .card{aspect-ratio:3/4;perspective:600px;background:none;border:0;padding:0;cursor:pointer}
  .inner{position:relative;width:100%;height:100%;transition:transform .35s;transform-style:preserve-3d}
  .card.open .inner,.card.done .inner{transform:rotateY(180deg)}
  .face{position:absolute;inset:0;border-radius:14px;display:flex;align-items:center;justify-content:center;backface-visibility:hidden;font-size:clamp(26px,9vw,54px)}
  .front{background:linear-gradient(135deg,#7c5cff,#ff2d7a);box-shadow:0 8px 20px -8px #ff2d7a}
  .back{background:#241640;border:1px solid rgba(255,255,255,.15);transform:rotateY(180deg)}
  .card.done .back{background:#1f3b2f;border-color:#22e5a3}
  button.reset{background:rgba(255,255,255,.1);border:0;color:#fff;font-weight:700;padding:8px 14px;border-radius:999px;font-size:14px}
  #win{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(18,10,30,.85);text-align:center}
  #win.show{display:flex}
  .box{background:#1c1130;border:1px solid rgba(255,255,255,.15);padding:24px 30px;border-radius:20px}
  h1{margin:0 0 6px;font-size:30px}
  p{margin:4px 0;color:#d6ccff}
</style>
</head>
<body>
<div id="app">
  <div id="top"><span>Züge: <span id="moves">0</span></span><span id="timer">0:00</span><button class="reset" id="reset">Neu</button></div>
  <div id="grid"></div>
</div>
<div id="win"><div class="box"><h1>Geschafft! 🎉</h1><p id="result"></p><p id="best"></p><p>Tippe für eine neue Runde</p></div></div>
<script>
(function(){
  var EMOJI=['🍕','🚀','🐸','🎧','🌈','🍩','🦊','⚡'];
  var grid=document.getElementById('grid'),movesEl=document.getElementById('moves'),timerEl=document.getElementById('timer'),win=document.getElementById('win');
  var first=null,lock=false,moves,matched,startTime,timer,best=null;
  function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}
  function fmt(ms){var s=Math.floor(ms/1000);return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2);}
  function build(){
    grid.innerHTML='';first=null;lock=false;moves=0;matched=0;movesEl.textContent='0';timerEl.textContent='0:00';startTime=null;clearInterval(timer);win.classList.remove('show');
    shuffle(EMOJI.concat(EMOJI)).forEach(function(e){
      var b=document.createElement('button');b.className='card';b.setAttribute('aria-label','Karte');
      b.innerHTML='<div class="inner"><div class="face front"></div><div class="face back">'+e+'</div></div>';
      b.dataset.v=e;b.addEventListener('click',function(){flip(b);});grid.appendChild(b);
    });
  }
  function flip(card){
    if(lock||card.classList.contains('open')||card.classList.contains('done'))return;
    if(!startTime){startTime=Date.now();timer=setInterval(function(){timerEl.textContent=fmt(Date.now()-startTime);},250);}
    card.classList.add('open');
    if(!first){first=card;return;}
    moves++;movesEl.textContent=moves;
    if(first.dataset.v===card.dataset.v){first.classList.add('done');card.classList.add('done');first=null;matched++;if(matched===EMOJI.length)finish();}
    else{lock=true;var a=first;first=null;setTimeout(function(){a.classList.remove('open');card.classList.remove('open');lock=false;},700);}
  }
  function finish(){
    clearInterval(timer);var t=Date.now()-startTime;if(best===null||moves<best)best=moves;
    document.getElementById('result').textContent=moves+' Züge in '+fmt(t);document.getElementById('best').textContent='Beste Runde: '+best+' Züge';win.classList.add('show');
  }
  win.addEventListener('click',build);document.getElementById('reset').addEventListener('click',build);
  build();
})();
</script>
</body>
</html>`,
};
