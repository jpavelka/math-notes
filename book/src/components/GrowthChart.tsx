import React from 'react';

const FUNCS = [
  { id: 'log',     label: 'log x',   color: '#06b6d4' },
  { id: 'linear',  label: 'x',       color: '#3b82f6' },
  { id: 'nlogn',   label: 'x log x', color: '#84cc16' },
  { id: 'quad',    label: 'x²',      color: '#22c55e' },
  { id: 'cubic',   label: 'x³',      color: '#f97316' },
  { id: 'quartic', label: 'x⁴',      color: '#a855f7' },
  { id: 'exp',     label: '2ˣ',      color: '#ef4444' },
  { id: 'fact',    label: 'x!',      color: '#ec4899' },
];

const W = 600, H = 340;
const ML = 62, MR = 95, MT = 15, MB = 40;
const CW = W - ML - MR;
const CH = H - MT - MB;

const script = `(function(){
var w=document.currentScript.previousElementSibling;
var svg=w.querySelector('svg');
var sl=w.querySelector('.gc-sl');
var nv=w.querySelector('.gc-nv');
var ML=${ML},CW=${CW},MT=${MT},CH=${CH};
var fns=[
  {id:'log',    fn:function(x){return x<=0?0:Math.log2(x);},                          c:'#06b6d4'},
  {id:'linear', fn:function(x){return x;},                                             c:'#3b82f6'},
  {id:'nlogn',  fn:function(x){return x<=1?0:x*Math.log2(x);},                       c:'#84cc16'},
  {id:'quad',   fn:function(x){return x*x;},                                           c:'#22c55e'},
  {id:'cubic',  fn:function(x){return x*x*x;},                                         c:'#f97316'},
  {id:'quartic',fn:function(x){return x*x*x*x;},                                       c:'#a855f7'},
  {id:'exp',    fn:function(x){return Math.pow(2,x);},                                 c:'#ef4444'},
  {id:'fact',   fn:function(x){var r=1;for(var i=2;i<=x;i++)r*=i;return r;},          c:'#ec4899'},
];
var active={};
fns.forEach(function(f){active[f.id]=true;});
active['log']=false;active['linear']=false;active['nlogn']=false;active['fact']=false;
var curN=+sl.value;
function niceStep(max){
  if(!max)return 1;
  var r=max/5,e=Math.floor(Math.log10(r)),p=Math.pow(10,e),f=r/p;
  return f<1.5?p:f<3?2*p:f<7?5*p:10*p;
}
function fmt(v){
  if(v>=1e15)return v.toExponential(0);
  if(v>=1e12)return +(v/1e12).toFixed(1)+'T';
  if(v>=1e9)return +(v/1e9).toFixed(1)+'B';
  if(v>=1e6)return +(v/1e6).toFixed(1)+'M';
  if(v>=1e3)return +(v/1e3).toFixed(1)+'K';
  return Math.round(v);
}
function mk(tag,a){
  var e=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(var k in a)e.setAttribute(k,a[k]);
  return e;
}
function txt(attrs,label){var t=mk('text',attrs);t.textContent=label;return t;}
function draw(n){
  curN=n;
  nv.value=n;
  var maxY=1;
  fns.forEach(function(f){
    if(!active[f.id])return;
    for(var x=0;x<=n;x++){var y=f.fn(x);if(isFinite(y))maxY=Math.max(maxY,y);}
  });
  var sx=function(x){return ML+(n?x/n:0)*CW;};
  var sy=function(y){return MT+CH-(y/maxY)*CH;};
  fns.forEach(function(f){
    var poly=svg.querySelector('#gc-'+f.id);
    if(!active[f.id]){poly.setAttribute('points','');return;}
    var pts=[];
    for(var x=0;x<=n;x++){
      var y=f.fn(x);
      if(!isFinite(y)||y<0)continue;
      pts.push(sx(x)+','+sy(y));
    }
    poly.setAttribute('points',pts.join(' '));
  });
  var yg=svg.querySelector('.gc-yt');
  yg.innerHTML='';
  var s=niceStep(maxY);
  for(var v=0;v<=maxY*1.001;v+=s){
    var yp=sy(v);
    yg.appendChild(mk('line',{x1:ML,x2:ML+CW,y1:yp,y2:yp,stroke:'currentColor','stroke-opacity':'0.1'}));
    yg.appendChild(mk('line',{x1:ML-4,x2:ML,y1:yp,y2:yp,stroke:'currentColor','stroke-opacity':'0.4'}));
    yg.appendChild(txt({x:ML-7,y:yp,'text-anchor':'end','dominant-baseline':'middle','font-size':'11',fill:'currentColor','fill-opacity':'0.7'},fmt(v)));
  }
  var xg=svg.querySelector('.gc-xt');
  xg.innerHTML='';
  var xs=n<=10?1:n<=20?2:5;
  for(var xi=0;xi<=n;xi+=xs){
    var xp=sx(xi);
    xg.appendChild(mk('line',{x1:xp,x2:xp,y1:MT+CH,y2:MT+CH+4,stroke:'currentColor','stroke-opacity':'0.4'}));
    xg.appendChild(txt({x:xp,y:MT+CH+15,'text-anchor':'middle','font-size':'11',fill:'currentColor','fill-opacity':'0.7'},xi));
  }
}
fns.forEach(function(f){
  var leg=w.querySelector('#gc-leg-'+f.id);
  if(!leg)return;
  leg.style.cursor='pointer';
  leg.style.opacity=active[f.id]?'1':'0.35';
  leg.addEventListener('click',function(){
    active[f.id]=!active[f.id];
    leg.style.opacity=active[f.id]?'1':'0.35';
    draw(curN);
  });
});
sl.addEventListener('input',function(){nv.value=sl.value;draw(+sl.value);});
nv.addEventListener('change',function(){
  var v=parseInt(nv.value,10);
  if(!v||v<4)v=4;
  if(v>30)v=30;
  nv.value=v;
  sl.value=Math.min(v,+sl.max);
  draw(v);
});
draw(+sl.value);
})();`;

export function GrowthChart() {
  return (
    <>
      <div>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: 'block', maxWidth: '100%', height: 'auto', color: 'var(--text)' }}
        >
          <rect x={ML} y={MT} width={CW} height={CH} fill="none" stroke="currentColor" strokeOpacity={0.2} />
          <g className="gc-yt" />
          <g className="gc-xt" />
          <g>
            {FUNCS.map(f => (
              <polyline
                key={f.id}
                id={`gc-${f.id}`}
                fill="none"
                stroke={f.color}
                strokeWidth={2}
                strokeLinejoin="round"
                points=""
              />
            ))}
          </g>
          <text x={ML + CW / 2} y={H - 3} textAnchor="middle" fontSize={12} fill="currentColor" fillOpacity={0.6}>x</text>
          <text
            x={11}
            y={MT + CH / 2}
            textAnchor="middle"
            fontSize={12}
            fill="currentColor"
            fillOpacity={0.6}
            transform={`rotate(-90,11,${MT + CH / 2})`}
          >
            f(x)
          </text>
          {FUNCS.map((f, i) => (
            <g key={f.id} id={`gc-leg-${f.id}`} transform={`translate(${ML + CW + 12},${MT + 10 + i * 22})`}>
              <line x1={0} y1={7} x2={16} y2={7} stroke={f.color} strokeWidth={2} />
              <text x={20} y={11} fontSize={12} fill="currentColor">{f.label}</text>
            </g>
          ))}
        </svg>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            Plot up to x =
          </span>
          <input
            type="range"
            className="gc-sl"
            min={4}
            max={30}
            defaultValue={8}
            style={{ flex: 1, cursor: 'pointer' }}
          />
          <input
            type="number"
            className="gc-nv"
            min={4}
            max={30}
            defaultValue={8}
            style={{
              fontVariantNumeric: 'tabular-nums',
              fontSize: '0.875rem',
              width: '5ch',
              textAlign: 'right',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid currentColor',
              color: 'inherit',
              padding: 0,
            }}
          />
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: script }} />
    </>
  );
}
