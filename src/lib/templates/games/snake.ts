import type { GameTemplate } from "@/lib/templates/types";

export const snake: GameTemplate = {
  id: "snake",
  name: "Neon Snake",
  description: "Der Klassiker: Wische, um die Schlange zu steuern, sammle Punkte und beiße dir nicht selbst in den Schwanz.",
  tags: ["klassiker", "snake", "arcade"],
  html: `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Neon Snake</title>
<style>
  html,body{margin:0;height:100%;background:#06111a;overflow:hidden;font-family:system-ui,sans-serif;color:#fff;touch-action:none;user-select:none}
  canvas{display:block;width:100%;height:100%}
  #hud{position:absolute;top:14px;left:0;right:0;text-align:center;font-weight:800;font-size:28px;text-shadow:0 0 14px #22e5a3}
  #ui{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;text-align:center}
  .card{background:rgba(6,17,26,.8);border:1px solid rgba(255,255,255,.15);padding:22px 28px;border-radius:20px}
  h1{margin:0 0 6px;font-size:30px;text-shadow:0 0 16px #22e5a3}
  p{margin:4px 0;color:#b8f5df;font-size:15px}
  .hidden{display:none}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="hud">0</div>
<div id="ui">
  <div class="card" id="start"><h1>Neon Snake</h1><p>Wischen oder Pfeiltasten</p><p>Tippe zum Starten</p></div>
  <div class="card hidden" id="over"><h1>Vorbei!</h1><p id="final"></p><p>Tippe für eine neue Runde</p></div>
</div>
<script>
(function(){
  var canvas=document.getElementById('c'),ctx=canvas.getContext('2d');
  var W,H,dpr,cols=17,rows,cell,ox,oy;
  function resize(){
    dpr=Math.min(window.devicePixelRatio||1,2);W=window.innerWidth;H=window.innerHeight;
    canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    cell=Math.floor(Math.min((W-20)/cols,(H-90)/24));rows=Math.floor((H-90)/cell);
    ox=Math.floor((W-cols*cell)/2);oy=Math.floor((H-rows*cell)/2)+20;
  }
  window.addEventListener('resize',resize);resize();
  var state='start',snake,dir,nextDir,food,score,tick,interval;
  var hud=document.getElementById('hud'),startEl=document.getElementById('start'),overEl=document.getElementById('over');
  function reset(){snake=[{x:8,y:Math.floor(rows/2)},{x:7,y:Math.floor(rows/2)},{x:6,y:Math.floor(rows/2)}];dir={x:1,y:0};nextDir=dir;score=0;interval=150;tick=0;hud.textContent='0';placeFood();}
  function placeFood(){
    var ok=false;while(!ok){food={x:Math.floor(Math.random()*cols),y:Math.floor(Math.random()*rows)};ok=true;for(var i=0;i<snake.length;i++){if(snake[i].x===food.x&&snake[i].y===food.y)ok=false;}}
  }
  reset();
  function start(){if(state==='start'){startEl.classList.add('hidden');}else{overEl.classList.add('hidden');reset();}state='play';}
  function setDir(x,y){if(state!=='play')return;if(x===-dir.x&&y===-dir.y)return;nextDir={x:x,y:y};}
  var sx,sy;
  window.addEventListener('pointerdown',function(e){e.preventDefault();sx=e.clientX;sy=e.clientY;if(state!=='play')start();});
  window.addEventListener('pointerup',function(e){
    if(sx==null)return;var dx=e.clientX-sx,dy=e.clientY-sy;sx=null;
    if(Math.abs(dx)<12&&Math.abs(dy)<12)return;
    if(Math.abs(dx)>Math.abs(dy))setDir(dx>0?1:-1,0);else setDir(0,dy>0?1:-1);
  });
  window.addEventListener('keydown',function(e){
    var k=e.key;
    if(k==='ArrowUp'||k==='w')setDir(0,-1);else if(k==='ArrowDown'||k==='s')setDir(0,1);
    else if(k==='ArrowLeft'||k==='a')setDir(-1,0);else if(k==='ArrowRight'||k==='d')setDir(1,0);
    else if(k===' '&&state!=='play')start();else return;e.preventDefault();
  });
  function step(){
    dir=nextDir;var head={x:snake[0].x+dir.x,y:snake[0].y+dir.y};
    if(head.x<0||head.y<0||head.x>=cols||head.y>=rows){return gameOver();}
    for(var i=0;i<snake.length;i++){if(snake[i].x===head.x&&snake[i].y===head.y)return gameOver();}
    snake.unshift(head);
    if(head.x===food.x&&head.y===food.y){score++;hud.textContent=score;interval=Math.max(70,150-score*4);placeFood();}else snake.pop();
  }
  function gameOver(){state='over';document.getElementById('final').textContent='Punkte: '+score;overEl.classList.remove('hidden');}
  var last=0;
  function loop(ts){
    if(state==='play'&&ts-last>interval){last=ts;step();}
    draw();requestAnimationFrame(loop);
  }
  function draw(){
    ctx.fillStyle='#06111a';ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(34,229,163,.12)';ctx.lineWidth=1;
    for(var x=0;x<=cols;x++){ctx.beginPath();ctx.moveTo(ox+x*cell,oy);ctx.lineTo(ox+x*cell,oy+rows*cell);ctx.stroke();}
    for(var y=0;y<=rows;y++){ctx.beginPath();ctx.moveTo(ox,oy+y*cell);ctx.lineTo(ox+cols*cell,oy+y*cell);ctx.stroke();}
    ctx.shadowBlur=14;ctx.shadowColor='#ff2d7a';ctx.fillStyle='#ff2d7a';
    ctx.beginPath();ctx.arc(ox+food.x*cell+cell/2,oy+food.y*cell+cell/2,cell*0.35,0,Math.PI*2);ctx.fill();
    ctx.shadowColor='#22e5a3';
    for(var i=snake.length-1;i>=0;i--){
      var s=snake[i];var a=1-i/(snake.length+4);
      ctx.fillStyle='rgba(34,229,163,'+Math.max(0.35,a)+')';
      var pad=i===0?1:3;
      roundRect(ox+s.x*cell+pad,oy+s.y*cell+pad,cell-pad*2,cell-pad*2,6);
    }
    ctx.shadowBlur=0;
  }
  function roundRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();ctx.fill();}
  requestAnimationFrame(loop);
})();
</script>
</body>
</html>`,
};
