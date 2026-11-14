// CDP ile senaryo: gerçek fare/dokunma olayları + düğmeler + ara görüntüler.
// Kullanım: node tools/play.mjs <url> <çıktı-öneki> <senaryo-json>
// Senaryo adımları: {"wait":ms} {"untilPlay":true} {"tapTop":n} {"click":"#css"} {"shot":"ad"} {"eval":"js"} {"drag":[x0,y0,x1,y1]}
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [,, url, prefix, scenario] = process.argv;
const steps = JSON.parse(scenario);
const CH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const prof=mkdtempSync(join(process.env.TMPDIR||tmpdir(),'chprof-'));
const port=9300+Math.floor(Math.random()*600);
const W=390,H=844;
const p=spawn(CH,['--headless=new','--remote-debugging-port='+port,'--use-angle=swiftshader','--enable-unsafe-swiftshader','--hide-scrollbars','--window-size='+W+','+H,'--user-data-dir='+prof,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let tabs; for(let i=0;i<60;i++){try{tabs=await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if(tabs.length)break;}catch{} await sleep(250);}
const t=tabs.find(x=>x.type==='page');
const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true}); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description;};
await send('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:2,mobile:true});
await send('Page.navigate',{url});
const mouse=async(type,x,y)=>send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1,pointerType:'mouse'});
for (const s of steps) {
  if (s.wait) await sleep(s.wait);
  if (s.untilPlay) { for(let i=0;i<240;i++){ const ph=await ev('window.__tidy&&window.__tidy.state().phase'); if(ph==='play')break; await sleep(500);} }
  if (s.tapTop) for (let k=0;k<s.tapTop;k++) { const pt=await ev('JSON.stringify(window.__tidy.topScreen())'); const o=JSON.parse(pt||'null'); if(!o)break; await mouse('mouseMoved',o.x,o.y); await mouse('mousePressed',o.x,o.y); await sleep(60); await mouse('mouseReleased',o.x,o.y); console.log('tap',o.type,Math.round(o.x),Math.round(o.y)); await sleep(s.gap||900); }
  if (s.click) { const r=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(s.click)}); if(!e) return null; const b=e.getBoundingClientRect(); return JSON.stringify({x:b.left+b.width/2,y:b.top+b.height/2});})()`); const o=JSON.parse(r||'null'); if(o){await mouse('mouseMoved',o.x,o.y); await mouse('mousePressed',o.x,o.y); await mouse('mouseReleased',o.x,o.y); console.log('click',s.click);} }
  if (s.drag) { const [x0,y0,x1,y1]=s.drag; await mouse('mousePressed',x0,y0); for(let i=1;i<=12;i++){ await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x0+(x1-x0)*i/12,y:y0+(y1-y0)*i/12,button:'left',buttons:1}); await sleep(30);} await mouse('mouseReleased',x1,y1); console.log('drag'); }
  if (s.eval) console.log('eval:', await ev(s.eval));
  if (s.shot) { const r=await send('Page.captureScreenshot',{format:'png'}); writeFileSync(`${prefix}_${s.shot}.png`,Buffer.from(r.result.data,'base64')); console.log('shot',s.shot); }
}
console.log('errors:', await ev('JSON.stringify(window.__errors.map(e=>e.slice(0,200)))'));
ws.close(); p.kill();
