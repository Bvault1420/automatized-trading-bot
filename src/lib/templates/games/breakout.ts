import type { GameTemplate } from "@/lib/templates/types";

export const breakout: GameTemplate = {
  id: "breakout",
  name: "Brick Blast",
  description: "Steuere das Paddle mit dem Finger und räume alle Blöcke ab. Jede Ebene wird schneller.",
  tags: ["arcade", "breakout", "klassiker"],
  html: `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Brick Blast</title>
<style>
  html,body{margin:0;height:100%;background:#050a1a;overflow:hidden;font-family:system-ui,sans-serif;color:#fff;touch-action:none;user-select:none}
  canvas{display:block;width:100%;height:100%}
  #hud{position:absolute;top:14px;left:18px;right:18px;display:flex;justify-content:space-between;font-weight:800;font-size:20px;text-shadow:0 0 12px #5cf0ff}
  #ui{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;text-align:center}
  .card{background:rgba(5,10,26,.8);border:1px solid rgba(255,255,255,.15);padding:22px 28px;border-radius:20px}
  h1{margin:0 0 6px;font-size:30px;text-shadow:0 0 16px #5cf0ff}
  p{margin:4px 0;color:#bfefff;font-size:15px}
  .hidden{display:none}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="hud"><span id="score">0</span><span id="lives">♥♥♥</span></div>
<div id="ui">
  <div class="card" id="start"><h1>Brick Blast</h1><p>Finger oder Maus bewegen steuert das Paddle</p><p>Tippe zum Starten</p></div>
  <div class="card hidden" id="over"><h1 id="overTitle">Game Over</h1><p id="final"></p><p>Tippe für eine neue Runde</p></div>
</div>
<script>
(function(){
  var canvas=document.getElementById('c'),ctx=canvas.getContext('2d');
  var W,H,dpr;
  function resize(){dpr=Math.min(window.devicePixelRatio||1,2);W=window.innerWidth;H=window.innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);layout();}
  var state='start',paddle,ball,bricks,score,lives,level;
  var scoreEl=document.getElementById('score'),livesEl=document.getElementById('lives'),startEl=document.getElementById('start'),overEl=document.getElementById('over');
  var PALETTE=['#ff2d7a','#ff8a3b','#ffd23b','#22e5a3','#5cf0ff','#a35cff'];
  function layout(){
    paddle={w:Math.max(80,W*0.24),h:14,x:W/2,y:H-70};
    if(ball&&state!=='play'){ball.x=W/2;ball.y=paddle.y-20;}
  }
  function buildBricks(){
    bricks=[];var cols=7,rows=5+Math.min(level,3);var gap=6,bw=(W-40-gap*(cols-1))/cols,bh=22;
    for(var r=0;r<rows;r++)for(var c=0;c<cols;c++)bricks.push({x:20+c*(bw+gap),y:70+r*(bh+gap),w:bw,h:bh,col:PALETTE[r%PALETTE.length],alive:true});
  }
  function serve(){var sp=5+level*0.6;var ang=(-Math.PI/2)+(Math.random()*0.8-0.4);ball={x:W/2,y:paddle.y-20,r:8,vx:Math.cos(ang)*sp,vy:Math.sin(ang)*sp};}
  function reset(){score=0;lives=3;level=1;scoreEl.textContent='0';livesEl.textContent='♥♥♥';layout();buildBricks();serve();}
  resize();reset();window.addEventListener('resize',resize);
  function start(){if(state==='over'){reset();overEl.classList.add('hidden');}else startEl.classList.add('hidden');state='play';}
  window.addEventListener('pointerdown',function(e){e.preventDefault();if(state!=='play')start();paddle.x=e.clientX;});
  window.addEventListener('pointermove',function(e){paddle.x=e.clientX;});
  window.addEventListener('keydown',function(e){if(e.key==='ArrowLeft')paddle.x-=30;else if(e.key==='ArrowRight')paddle.x+=30;else if(e.key===' '&&state!=='play')start();else return;e.preventDefault();});
  function loseLife(){lives--;livesEl.textContent='♥♥♥'.slice(0,lives);if(lives<=0){state='over';document.getElementById('overTitle').textContent='Game Over';document.getElementById('final').textContent='Punkte: '+score;overEl.classList.remove('hidden');}else serve();}
  function update(){
    if(state!=='play')return;
    paddle.x=Math.max(paddle.w/2,Math.min(W-paddle.w/2,paddle.x));
    ball.x+=ball.vx;ball.y+=ball.vy;
    if(ball.x-ball.r<0){ball.x=ball.r;ball.vx*=-1;}if(ball.x+ball.r>W){ball.x=W-ball.r;ball.vx*=-1;}
    if(ball.y-ball.r<0){ball.y=ball.r;ball.vy*=-1;}
    if(ball.y+ball.r>=paddle.y-paddle.h/2&&ball.y-ball.r<=paddle.y+paddle.h/2&&ball.x>paddle.x-paddle.w/2-ball.r&&ball.x<paddle.x+paddle.w/2+ball.r&&ball.vy>0){
      var rel=(ball.x-paddle.x)/(paddle.w/2);var sp=Math.hypot(ball.vx,ball.vy);var ang=-Math.PI/2+rel*1.1;ball.vx=Math.cos(ang)*sp;ball.vy=Math.sin(ang)*sp;ball.y=paddle.y-paddle.h/2-ball.r;
    }
    if(ball.y-ball.r>H)return loseLife();
    var remaining=0;
    for(var i=0;i<bricks.length;i++){var b=bricks[i];if(!b.alive)continue;remaining++;
      if(ball.x+ball.r>b.x&&ball.x-ball.r<b.x+b.w&&ball.y+ball.r>b.y&&ball.y-ball.r<b.y+b.h){
        b.alive=false;score+=10;scoreEl.textContent=score;remaining--;
        var ox=Math.min(ball.x+ball.r-b.x,b.x+b.w-(ball.x-ball.r)),oy=Math.min(ball.y+ball.r-b.y,b.y+b.h-(ball.y-ball.r));
        if(ox<oy)ball.vx*=-1;else ball.vy*=-1;break;
      }
    }
    if(remaining===0){level++;buildBricks();serve();}
  }
  function draw(){
    ctx.fillStyle='#050a1a';ctx.fillRect(0,0,W,H);
    for(var i=0;i<bricks.length;i++){var b=bricks[i];if(!b.alive)continue;ctx.shadowBlur=10;ctx.shadowColor=b.col;ctx.fillStyle=b.col;ctx.fillRect(b.x,b.y,b.w,b.h);}
    ctx.shadowBlur=16;ctx.shadowColor='#5cf0ff';ctx.fillStyle='#5cf0ff';
    ctx.fillRect(paddle.x-paddle.w/2,paddle.y-paddle.h/2,paddle.w,paddle.h);
    ctx.fillStyle='#fff';ctx.shadowColor='#fff';ctx.beginPath();ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  }
  function loop(){update();draw();requestAnimationFrame(loop);}
  loop();
})();
</script>
</body>
</html>`,
};
