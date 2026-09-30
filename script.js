const N=10,SIZES=[4,3,3,2,2,2,1,1,1,1],KEY='battleship_v1',L='АБВГДЕЖЗИК';
const $=id=>document.getElementById(id);
const rnd=n=>Math.floor(Math.random()*n);
const newBoard=()=>({ships:[],shots:Array(100).fill(0)});
const fresh=(level='medium')=>({phase:'setup',turn:'player',level,ai:{hits:[]},mark:{p:-1,c:-1},log:[],me:newBoard(),cpu:newBoard(),last:{p:'',c:''},winner:null});
let S=load()||fresh(),timer=null,fx=null;

function validBoard(b){
  return b&&Array.isArray(b.shots)&&b.shots.length===100&&Array.isArray(b.ships)&&
    (b.ships.length===0||b.ships.length===SIZES.length)&&
    b.ships.every(s=>Array.isArray(s.cells)&&s.cells.every(i=>Number.isInteger(i)&&i>=0&&i<100));
}
function load(){
  try{
    const s=JSON.parse(localStorage.getItem(KEY));
    if(s&&['setup','battle','over'].includes(s.phase)&&validBoard(s.me)&&validBoard(s.cpu)&&s.last){
      s.level=['easy','medium','hard'].includes(s.level)?s.level:'medium';
      s.ai=s.ai&&Array.isArray(s.ai.hits)?s.ai:{hits:[]};s.mark=s.mark||{p:-1,c:-1};s.log=Array.isArray(s.log)?s.log:[];
      return s;
    }
  }catch(e){}
  return null;
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}

const around=i=>{const r=Math.floor(i/N),c=i%N,o=[];
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const y=r+dr,x=c+dc;if(y>=0&&y<N&&x>=0&&x<N)o.push(y*N+x)}
  return o};
const name=i=>L[i%N]+(Math.floor(i/N)+1);

// Расстановка: корабли не пересекаются и не касаются (в т.ч. по диагонали)
function autoPlace(){
  for(let t=0;t<500;t++){
    const ships=[],occ=Array(100).fill(0);let ok=true;
    for(const size of SIZES){
      let done=false;
      for(let k=0;k<300&&!done;k++){
        const h=Math.random()<.5,r=rnd(h?N:N-size+1),c=rnd(h?N-size+1:N),cells=[];
        for(let i=0;i<size;i++)cells.push(h?r*N+c+i:(r+i)*N+c);
        if(cells.every(i=>around(i).every(j=>!occ[j]))){cells.forEach(i=>occ[i]=1);ships.push({cells});done=true}
      }
      if(!done){ok=false;break}
    }
    if(ok)return ships;
  }
  return [];
}
const shipOf=(b,i)=>b.ships.find(s=>s.cells.includes(i));
const isSunk=(b,s)=>s.cells.every(i=>b.shots[i]);
const alive=b=>b.ships.filter(s=>!isSunk(b,s)).length;

function shoot(b,i){
  b.shots[i]=1;
  const s=shipOf(b,i);
  if(!s)return'miss';
  if(!isSunk(b,s))return'hit';
  s.cells.forEach(c=>around(c).forEach(j=>b.shots[j]=1)); // клетки вокруг потопленного — заведомо пустые
  return'sunk';
}
const word={miss:'мимо',hit:'попадание',sunk:'потоплен'};

function playerShot(i){
  if(S.phase!=='battle'||S.turn!=='player'||S.cpu.shots[i])return;
  const res=shoot(S.cpu,i);
  S.last.p=name(i)+': '+word[res];S.last.c='';S.mark.p=i;
  log('p','> '+name(i)+' … '+LOGW[res],res);stat(res);
  
  if(alive(S.cpu)===0){
    S.phase='over';
    S.winner='player';finish('player');
  } else if(res==='miss'){
    S.turn='cpu'; // Передача хода компьютеру при промахе
  }
  
  fx='cpu';save();render();fx=null;
  if(S.turn==='cpu') schedule();
}

// Компьютер знает только результаты своих выстрелов (мимо / попал / потопил), расстановку игрока не читает
const orth=i=>{const r=Math.floor(i/N),c=i%N,o=[];
  if(r>0)o.push(i-N);if(r<N-1)o.push(i+N);if(c>0)o.push(i-1);if(c<N-1)o.push(i+1);return o};
const group=(hits,start)=>{const set=new Set(hits),out=[start];
  for(let k=0;k<out.length;k++)for(const n of orth(out[k]))if(set.has(n)&&!out.includes(n))out.push(n);return out};

function aiLearn(i,res){
  if(res==='miss')return;
  S.ai.hits.push(i);
  if(res==='sunk'){const dead=group(S.ai.hits,i);S.ai.hits=S.ai.hits.filter(x=>!dead.includes(x))}
}

function aiPick(){
  const free=[];S.me.shots.forEach((v,i)=>{if(!v)free.push(i)});
  const pick=a=>a[rnd(a.length)],row=i=>Math.floor(i/N);
  if(S.level!=='easy'&&S.ai.hits.length){            // средний и сложный: добивают подбитый корабль
    const g=group(S.ai.hits,S.ai.hits[0]);
    let cand=g.flatMap(orth).filter(n=>!S.me.shots[n]);
    if(g.length>1){const h=row(g[0])===row(g[1]);cand=cand.filter(n=>h?row(n)===row(g[0]):n%N===g[0]%N)}
    if(cand.length)return pick(cand);
  }
  if(S.level==='hard'){const p=free.filter(i=>(row(i)+i%N)%2===0);if(p.length)return pick(p)}  // поиск «шахматкой»
  return pick(free);
}

function cpuMove(){
  timer=null;
  if(S.phase!=='battle'||S.turn!=='cpu')return;
  const i=aiPick();
  const res=shoot(S.me,i);
  aiLearn(i,res);
  S.last.c=name(i)+': '+word[res];S.mark.c=i;
  log('c','< '+name(i)+' … '+LOGW[res],res);
  
  if(alive(S.me)===0){
    S.phase='over';
    S.winner='cpu';finish('cpu');
  } else if(res==='miss'){
    S.turn='player'; // Передача хода игроку при промахе
  }
  
  fx='me';save();render();fx=null;
  if(S.phase==='battle'&&S.turn==='cpu') schedule(); // Бот стреляет еще раз
}

function schedule(){
  if(S.phase==='battle'&&S.turn==='cpu'&&!timer)timer=setTimeout(cpuMove,550);
}

function boardHTML(b,own,reveal){
  const occ={};b.ships.forEach(s=>s.cells.forEach(i=>occ[i]=s));
  let h='<div class="bw"><span></span><div class="cols">'+[...L].map(x=>'<span>'+x+'</span>').join('')+'</div><div class="rows">'+
    Array.from({length:10},(_,i)=>'<span>'+(i+1)+'</span>').join('')+'</div><div class="board '+(own?'':'enemy'+(S.phase==='battle'&&S.turn==='player'?' live':''))+'">';
  for(let i=0;i<100;i++){
    const s=occ[i],shot=b.shots[i];let cls='c';
    if(shot&&i===(own?S.mark.c:S.mark.p))cls+=' last'+(fx===(own?'me':'cpu')?' pop':'');
    if(shot){cls+=s?(isSunk(b,s)?' hit sunk':' hit'):' miss'}
    else if(s&&(own||reveal))cls+=own?' ship':' reveal';
    else cls+=' free';
    h+=own?'<div class="'+cls+'"></div>':'<button class="'+cls+'" data-i="'+i+'" aria-label="'+name(i)+'"'+(shot?' disabled':'')+'></button>';
  }
  return h+'</div></div>';
}

function render(){
  const placedMe=S.me.ships.length>0,placedCpu=S.cpu.ships.length>0;
  $('me').innerHTML=boardHTML(S.me,true);
  $('cpu').innerHTML=boardHTML(S.cpu,false,S.phase==='over');
  $('cme').textContent=placedMe?'Кораблей осталось: '+alive(S.me)+' из 10':'Флот не расставлен';
  $('ccpu').textContent=placedCpu?'Кораблей осталось: '+alive(S.cpu)+' из 10':'Флот не расставлен';
  let st;
  if(S.phase==='setup')st='<b>Расстановка.</b> Расставьте оба флота, затем начните бой.';
  else if(S.phase==='battle')st=S.turn==='player'?'<b>Ваш ход.</b> Выберите клетку на поле противника.':'<b>Ход компьютера…</b>';
  else st='<b>Бой окончен.</b>';
  if(S.last.p||S.last.c)st+='<br>'+(S.last.p?'Вы — '+S.last.p:'')+(S.last.p&&S.last.c?'. ':'')+(S.last.c?'Компьютер — '+S.last.c:'');
  $('status').innerHTML=st;
  $('term').innerHTML=S.log.map(l=>'<div class="l '+l.w+' '+l.c+'"><i>['+l.t+']</i> '+l.m+'</div>').join('')+'<div class="l"><i>$</i> <span class="cur">_</span></div>';
  $('term').scrollTop=$('term').scrollHeight;
  const setup=S.phase==='setup';
  document.querySelectorAll('#lvl [data-l]').forEach(b=>{b.classList.toggle('on',b.dataset.l===S.level);b.disabled=!setup});
  $('bMe').disabled=$('bCpu').disabled=!setup;
  $('bGo').disabled=!(setup&&placedMe&&placedCpu);
  $('bGo').style.display=setup?'':'none';
  $('bMe').style.display=$('bCpu').style.display=S.phase==='over'?'none':'';
  $('bNew').style.display=S.phase==='over'?'none':'';
  $('over').className=S.phase==='over'?'on':'';
  $('overTxt').textContent=S.winner==='player'?'ACCESS GRANTED. Флот противника уничтожен.':'ACCESS DENIED. Ваш флот уничтожен.';
}

$('cpu').addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(b)playerShot(+b.dataset.i)});
$('lvl').addEventListener('click',e=>{const b=e.target.closest('[data-l]');if(b&&S.phase==='setup'){S.level=b.dataset.l;save();render()}});
$('bMe').onclick=()=>{S.me=newBoard();S.me.ships=autoPlace();save();render()};
$('bCpu').onclick=()=>{S.cpu=newBoard();S.cpu.ships=autoPlace();save();render()};
$('bGo').onclick=()=>{S.phase='battle';S.turn='player';S.last={p:'',c:''};S.ai={hits:[]};S.mark={p:-1,c:-1};S.log=[];log('s','Сессия начата. Защита цели: '+LVN[S.level]);save();render()};
const reset=()=>{clearTimeout(timer);timer=null;S=fresh(S.level);save();render()};
$('bNew').onclick=reset;$('bNew2').onclick=reset;

// ================= SPA, профиль, PRO (обёртка над движком) =================
const LOGW={miss:'TIMEOUT',hit:'CRITICAL ERROR',sunk:'NODE COMPROMISED'};
const LVN={easy:'Script Kiddie',medium:'SysAdmin',hard:'Hacker'};
const SKEY='battleship_profile_v1',VIEWS=['home','game','profile','pro'];
function loadStats(){
  const d={name:'',games:0,wins:0,shots:0,hits:0,pro:false};
  try{const s=JSON.parse(localStorage.getItem(SKEY));if(s&&typeof s==='object')return Object.assign(d,s)}catch(e){}
  return d;
}
let ST=loadStats();
const saveStats=()=>{try{localStorage.setItem(SKEY,JSON.stringify(ST))}catch(e){}};
const hhmm=()=>new Date().toLocaleTimeString('ru-RU',{hour12:false});
function log(w,m,c){S.log.push({t:hhmm(),w,m,c:c||''});if(S.log.length>80)S.log.shift()}
function stat(res){ST.shots++;if(res!=='miss')ST.hits++;saveStats()}
function finish(w){
  ST.games++;if(w==='player')ST.wins++;saveStats();
  log('s',w==='player'?'ACCESS GRANTED — цель скомпрометирована':'ACCESS DENIED — ваша сеть уничтожена',w==='player'?'':'hit');
}
function renderProfile(){
  $('callsign').value=ST.name;$('hName').textContent=ST.name||'operator';
  $('sGames').textContent=ST.games;
  $('sWin').textContent=ST.games?Math.round(ST.wins/ST.games*100)+'%':'—';
  $('sAcc').textContent=ST.shots?Math.round(ST.hits/ST.shots*100)+'%':'—';
}
function renderPro(){if(ST.pro){$('payMsg').className='mono ok';$('payMsg').textContent='Статус: ROOT активен (тестовый режим).'}}
function go(v){
  if(!VIEWS.includes(v))v='home';
  VIEWS.forEach(x=>{$('v-'+x).hidden=x!==v});
  document.querySelectorAll('#nav [data-v]').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  if(v==='game')$('term').scrollTop=$('term').scrollHeight;
  if(v==='profile'||v==='home')renderProfile();
  if(v==='pro')renderPro();
  if(location.hash!=='#'+v)location.hash=v;
  window.scrollTo(0,0);
}
$('nav').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(b)go(b.dataset.v)});
document.addEventListener('click',e=>{const g=e.target.closest('[data-go]');if(g)go(g.dataset.go)});
window.addEventListener('hashchange',()=>go(location.hash.slice(1)));
$('bName').onclick=()=>{
  ST.name=$('callsign').value.trim().slice(0,16);saveStats();renderProfile();
  $('bName').textContent='Сохранено ✓';setTimeout(()=>$('bName').textContent='Сохранить',1200);
};
// Оплата — демо: данные карты нигде не сохраняются и не отправляются
$('cn').oninput=e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim()};
$('cx').oninput=e=>{let v=e.target.value.replace(/\D/g,'').slice(0,4);if(v.length>2)v=v.slice(0,2)+'/'+v.slice(2);e.target.value=v};
$('cc').oninput=e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,3)};
$('bPay').onclick=()=>{
  const n=$('cn').value.replace(/\s/g,''),x=$('cx').value,c=$('cc').value,m=$('payMsg'),mm=+x.slice(0,2);
  if(n.length!==16||x.length!==5||!(mm>=1&&mm<=12)||c.length!==3){m.className='mono err';m.textContent='ERROR: проверьте номер карты, срок (MM/YY) и CVC';return}
  ST.pro=true;saveStats();$('cn').value=$('cx').value=$('cc').value='';
  m.className='mono ok';m.textContent='ROOT ДОСТУП активирован (тест). Деньги не списаны, данные карты не сохраняются.';
};

render();schedule();   // после перезагрузки страницы партия и ход компьютера продолжаются
go(location.hash.slice(1));   // после перезагрузки страницы партия и ход компьютера продолжаются