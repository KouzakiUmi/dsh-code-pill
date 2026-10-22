/** Synthetic CoT + sidebar churn: compare feature-off/on work counters, not production desktop FPS. */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const bundle = readFileSync(process.argv[2] || new URL('../lib/client.js', import.meta.url), 'utf8');
const output = process.argv[3] || fileURLToPath(new URL('../dist/think-ink-benchmark-results.json', import.meta.url));
mkdirSync(dirname(output), { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
const results = [];
try {
  for (const enabled of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://ink-perf.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<style>body{background:#17181c;color:#adb2b8;font:16px Arial;display:flex;gap:20px}aside{width:210px;height:650px;overflow:auto}main{width:700px;height:650px;overflow:auto}p{margin:8px 0;line-height:1.6}</style><aside id="sidebar">${Array.from({length:30},(_,i)=>`<div class="workspace">Workspace ${i}</div>`).join('')}</aside><main data-chat-flow id="chat"><div data-chat-flow-kind="think"><div data-variant="think" data-state="running"><div data-markdown-variant="compact">${Array.from({length:300},()=>'<p>Existing reasoning content stays unchanged while new words stream into the final paragraph.</p>').join('')}<p id="tail">Existing tail.</p></div></div></div></main>` }));
    await page.goto('https://ink-perf.test/');
    await page.evaluate(enabled => {
      const nativeRaf = requestAnimationFrame.bind(window), nativeTimeout = setTimeout.bind(window);
      const stats = { observerCallbacks:0, observerMs:0, observerMaxMs:0, animationCallbacks:0, animationMs:0, adds:0, deletes:0, activeRanges:0, peakRanges:0, measuring:false };
      window.stats=stats;window.nativeRaf=nativeRaf;window.pause=ms=>new Promise(resolve=>nativeTimeout(resolve,ms));
      const NativeObserver=MutationObserver;
      window.MutationObserver=class extends NativeObserver { constructor(cb) { super((mutations, observer)=>{const t=performance.now();cb(mutations,observer);if(stats.measuring){const ms=performance.now()-t;stats.observerCallbacks++;stats.observerMs+=ms;stats.observerMaxMs=Math.max(stats.observerMaxMs,ms);}}); } };
      const add=Highlight.prototype.add, del=Highlight.prototype.delete;
      Highlight.prototype.add=function(range){if(stats.measuring&&!this.has(range)){stats.adds++;stats.activeRanges++;stats.peakRanges=Math.max(stats.peakRanges,stats.activeRanges);}return add.call(this,range);};
      Highlight.prototype.delete=function(range){if(stats.measuring&&this.has(range)){stats.deletes++;stats.activeRanges--;}return del.call(this,range);};
      function timed(cb,args){const t=performance.now();const out=cb(...args);if(stats.measuring&&cb.name==='tick'){stats.animationCallbacks++;stats.animationMs+=performance.now()-t;}return out;}
      window.requestAnimationFrame=cb=>nativeRaf(t=>timed(cb,[t]));
      window.setTimeout=(cb,delay,...args)=>nativeTimeout(typeof cb==='function'?()=>timed(cb,args):cb,delay);
      localStorage.setItem('dsh-code-pill.settings.v1',JSON.stringify({version:1,thinkRainbow:enabled,toolPath:false,rowTint:false,marker:'off'}));
      const disposers=[];window.__ModuleLoader__={load(spec){spec.factory(()=>{throw Error('unexpected require');}).apply({effect(cb){disposers.push(cb());}});}};
      window.dispose=()=>disposers.reverse().forEach(off=>off());
    }, enabled);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(()=>new Promise(resolve=>nativeRaf(()=>nativeRaf(resolve))));
    const result = await page.evaluate(async enabled => {
      const chat=document.getElementById('chat'),tail=document.getElementById('tail').firstChild,rows=[...document.querySelectorAll('.workspace')];
      chat.scrollTop=chat.scrollHeight;await pause(100);
      stats.measuring=true;let running=true,last=performance.now();const intervals=[];
      function frame(t){if(!running)return;intervals.push(t-last);last=t;nativeRaf(frame);}nativeRaf(frame);
      const started=performance.now();
      for(let i=0;i<56;i++){
        tail.nodeValue+=' alpha beta gamma delta epsilon zeta theta lambda';
        for(let j=0;j<rows.length;j++){rows[j].className='workspace '+((i+j)%2?'odd':'even');rows[j].firstChild.nodeValue='Workspace '+(i+j);}
        chat.scrollTop=chat.scrollHeight;
        await pause(25);
      }
      await pause(450);running=false;stats.measuring=false;
      intervals.sort((a,b)=>a-b);
      const ink=[...CSS.highlights].filter(([name])=>name.startsWith('dshcp-ink-'));
      const result={enabled,elapsedMs:performance.now()-started,observerCallbacks:stats.observerCallbacks,observerMs:stats.observerMs,observerMaxMs:stats.observerMaxMs,animationCallbacks:stats.animationCallbacks,animationMs:stats.animationMs,highlightAdds:stats.adds,highlightDeletes:stats.deletes,peakRanges:stats.peakRanges,registeredHighlights:ink.length,frameCount:intervals.length,p95FrameMs:intervals[Math.floor(intervals.length*.95)]||0,maxFrameMs:intervals.at(-1)||0};
      dispose();result.remainingInkHighlights=[...CSS.highlights.keys()].filter(name=>name.startsWith('dshcp-ink-')).length;
      return result;
    },enabled);
    assert.deepEqual(errors,[]);assert.equal(result.remainingInkHighlights,0);
    results.push(result);await page.close();
  }
  const report={browser:browser.version(),scenario:'56 updates × 8 words, 25ms pacing; 300 historical paragraphs; 30 sidebar rows mutate per update; isolated synthetic page, not a desktop FPS measurement',results};
  writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
