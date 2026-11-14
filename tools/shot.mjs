// Headless Chrome (CDP) ile sayfa görüntüsü + değerlendirme.
// Kullanım: node tools/shot.mjs <url> <out.png> [beklemeMs=8000] [genişlik=390] [yükseklik=844] [js-ifadesi]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [,, url, out, waitMs='8000', W='390', H='844', expr] = process.argv;
const CH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const prof=mkdtempSync(join(process.env.TMPDIR||tmpdir(),'chprof-'));
const port=9300+Math.floor(Math.random()*600);
const p=spawn(CH,['--headless=new','--remote-debugging-port='+port,'--use-angle=swiftshader','--enable-unsafe-swiftshader','--hide-scrollbars','--autoplay-policy=no-user-gesture-required','--window-size='+W+','+H,'--user-data-dir='+prof,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let tabs; for(let i=0;i<60;i++){try{tabs=await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if(tabs.length)break;}catch{} await sleep(250);}
const t=tabs.find(x=>x.type==='page');
const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend=new Map(); const logs=[];
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);} else if(m.method==='Runtime.consoleAPICalled'){logs.push(m.params.type+': '+m.params.args.map(a=>a.value??a.description).join(' '));} else if(m.method==='Runtime.exceptionThrown'){logs.push('EXC: '+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text));}};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:+W,height:+H,deviceScaleFactor:2,mobile:+W<700});
await send('Page.navigate',{url});
await sleep(+waitMs);
if(expr){const ev=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true}); console.log('EVAL:',JSON.stringify(ev.result?.result?.value ?? ev.result?.exceptionDetails?.exception?.description));}
const s=await send('Page.captureScreenshot',{format:'png'});
writeFileSync(out,Buffer.from(s.result.data,'base64'));
if(logs.length) console.log(logs.slice(-12).map(l=>l.slice(0,400)).join('\n'));
ws.close(); p.kill();
