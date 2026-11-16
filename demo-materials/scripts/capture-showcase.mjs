// Reproducible captures of the real app. Run after npm run dev.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { fixture } from './showcase-fixture.mjs';

const run = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const url = process.argv[2] ?? 'http://127.0.0.1:5173';
const scratch = await mkdtemp(join(tmpdir(), 'marmerlade-showcase-'));
for (const name of ['screenshots','gif','videos','notes','fixtures']) await mkdir(join(root,name),{recursive:true});
await writeFile(join(root,'fixtures/halloween.marmerlade.json'),JSON.stringify(fixture,null,2)+'\n');
const browser = await chromium.launch({headless:true});
const evidence = { viewport:{width:1600,height:1000}, appearance:'halloween', captures:[], downloads:[], browserErrors:[] };
const requested = process.env.CAPTURE_CASE;

async function session(name) {
  const raw = join(scratch,name); await mkdir(raw);
  const context = await browser.newContext({viewport:evidence.viewport,deviceScaleFactor:1,reducedMotion:'no-preference'});
  const page = await context.newPage();
  page.on('crash',()=>console.error(`Browser page crashed: ${name}`));
  const data=structuredClone(fixture);
  if(name==='02-linked-wiki'||name==='03-linked-slides'){
    const positions={Question:[40,40],Kiro:[300,40],Draft:[40,300],Check:[300,300],Reply:[560,300]};
    for(const n of data.diagram.nodes){if(positions[n.id]){const [x,y]=positions[n.id];n.position={x,y};}else{n.position.x+=220;}}
  }
  page.setDefaultTimeout(12000);
  page.on('pageerror', e=>evidence.browserErrors.push(e.message));
  await page.addInitScript(data=>{
    localStorage.setItem('marmerlade.diagram',JSON.stringify(data));
    localStorage.setItem('marmerlade.appearance',JSON.stringify({selected:'halloween',custom:null}));
  },data);
  await page.goto(url);
  await page.getByRole('button',{name:'Close panel',exact:true}).click();
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('html').getAttribute('data-appearance'),'halloween');
  // Capture staging only: remove the automatic style inspector and minimap.
  // Keep the app's actual canvas, documents, theme, and animation untouched.
  await page.addStyleTag({content:`
    .mf-style-panel,.react-flow__minimap {display:none!important}
    * {cursor:none!important}
    #demo-cursor {position:fixed;z-index:2147483647;width:14px;height:14px;border-radius:50%;border:2px solid #fff0dd;background:#ff963f;box-shadow:0 0 0 4px #ff963f25,0 2px 10px #0008;pointer-events:none;transform:translate(-50%,-50%)}
  `});
  await page.evaluate(()=>{
    const c=document.createElement('div');c.id='demo-cursor';c.style.left='80px';c.style.top='920px';document.body.append(c);
    document.addEventListener('mousemove',e=>{c.style.left=`${e.clientX}px`;c.style.top=`${e.clientY}px`;});
  });
  await page.mouse.move(80,920);
  const node = id=>page.locator(`.react-flow__node[data-id="${id}"]`);
  async function click(locator){await locator.waitFor({state:'visible'});const b=await locator.boundingBox();assert(b);await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:16});await page.waitForTimeout(180);await locator.click({delay:100});await page.waitForTimeout(250);}
  async function fit(){await click(page.getByRole('button',{name:'Fit View',exact:true}));await page.waitForTimeout(400);await click(page.getByRole('button',{name:'Zoom Out',exact:true}));await page.waitForTimeout(400);}
  async function park(){await page.mouse.move(80,920,{steps:25});await page.waitForTimeout(250);}
  async function geometry(label){
    const result=await page.evaluate(()=>{
      const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
      const nodes=[...document.querySelectorAll('.react-flow__node')].map(el=>({id:el.dataset.id,...rect(el)})).filter(r=>r.w>0&&r.h>0);
      return {nodes,toolbar:rect(document.querySelector('.mf-toolbar')),canvas:rect(document.querySelector('.react-flow'))};
    });
    const ancestors=id=>{const chain=[];for(let n=fixture.diagram.nodes.find(n=>n.id===id);n?.parentId;n=fixture.diagram.nodes.find(p=>p.id===n.parentId))chain.push(n.parentId);return chain;};
    const clean=id=>id.replace('__sheet__','');
    const overlaps=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>2&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>2;
    for(const n of result.nodes){
      assert(n.x>=result.canvas.x+12&&n.y>=75&&n.x+n.w<=result.canvas.x+result.canvas.w-12&&n.y+n.h<=result.canvas.h-25,`${label}: clipped ${n.id}`);
      assert(!overlaps(n,result.toolbar),`${label}: toolbar covers ${n.id}`);
      for(const other of result.nodes){
        if(n.id>=other.id||ancestors(clean(n.id)).includes(clean(other.id))||ancestors(clean(other.id)).includes(clean(n.id)))continue;
        assert(!overlaps(n,other),`${label}: ${n.id} overlaps ${other.id}`);
      }
    }
    return result;
  }
  async function screenshot(filename){await park();const boxes=await geometry(filename);await page.locator('#demo-cursor').evaluate(el=>el.style.visibility='hidden');await page.screenshot({path:join(root,'screenshots',filename)});await page.locator('#demo-cursor').evaluate(el=>el.style.visibility='visible');evidence.captures.push({filename,...boxes});console.log(`Captured ${filename}`);}
  async function unfold(id,child){await click(node(id).getByRole('button',{name:/^Unfold/}));await node(child).waitFor({state:'visible'});await page.waitForTimeout(550);await fit();}
  async function fold(id){await click(node(`__sheet__${id}`).getByRole('button',{name:'Fold',exact:true}));await node(id).waitFor({state:'visible'});await page.waitForTimeout(350);await fit();}
  async function panelWidth(width){const h=page.getByRole('separator',{name:'Resize right panel'});const b=await h.boundingBox();assert(b);await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:20});await page.mouse.down();await page.mouse.move(1600-width,b.y+b.height/2,{steps:18});await page.mouse.up();await page.waitForTimeout(400);}
  await fit();
  // Use lossless frames so the paper texture stays stable during encoding.
  let recording=true;const frames=[];
  const started=performance.now();
  const recordingFrames=(async()=>{while(recording && name!=='04-export-gif'){const at=performance.now();const path=join(raw,`frame-${String(frames.length).padStart(5,'0')}.png`);await page.screenshot({path});frames.push({path,at});await page.waitForTimeout(Math.max(1,150-(performance.now()-at)));}})().catch(error=>{if(!page.isClosed())console.error("Frame capture ended:",error.message);});
  async function finish(){
    recording=false;await recordingFrames;const end=performance.now();
    if(name==='04-export-gif'){await context.close();return;}
    const list=join(raw,'frames.txt');
    await writeFile(list,frames.map((f,i)=>`file '${f.path}'\nduration ${Math.max(.01,((frames[i+1]?.at??end)-f.at)/1000).toFixed(4)}`).join('\n')+'\n');
    await context.close();
    const input=['-f','concat','-safe','0','-i',list];const palette=join(raw,'palette.png');const speed=Math.min(1,24/((end-started)/1000));const filter=`setpts=${speed}*(PTS-STARTPTS),fps=10,scale=1280:-1:flags=lanczos`;
    await run('ffmpeg',['-y',...input,'-vf',`${filter},palettegen=max_colors=192:stats_mode=diff`,'-frames:v','1',palette]);
    await run('ffmpeg',['-y',...input,'-i',palette,'-filter_complex_threads','1','-filter_complex',`[0:v]${filter}[v];[v][1:v]paletteuse=dither=none:diff_mode=rectangle`,'-loop','0',join(root,'gif',`${name}.gif`)]);
    // The MP4 uses the same trimmed capture interval as the GIF.
    await run('ffmpeg',['-y',...input,'-vf',`setpts=${speed}*(PTS-STARTPTS),fps=24`,'-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',join(root,'videos',`${name}.mp4`)]);
    evidence.captures.push({walkthrough:name,seconds:(end-started)/1000,frames:frames.length,losslessFrames:raw});
    console.log(`Finished ${name}`);
  }
  return {page,node,click,fit,park,screenshot,unfold,fold,panelWidth,finish};
}

try {
  if(!requested||requested==='01'){
    const s=await session('01-drill-levels');
    await s.screenshot('01-drill-overview.png');await s.page.waitForTimeout(1000);
    await s.unfold('Retrieval','Rewrite');await s.screenshot('02-drill-level-1.png');await s.page.waitForTimeout(1100);
    await s.unfold('Search','GitHub');await s.screenshot('03-drill-level-2.png');await s.page.waitForTimeout(1600);
    await s.fold('Search');await s.page.waitForTimeout(900);await s.fold('Retrieval');
    await s.screenshot('04-drill-up-overview.png');await s.page.waitForTimeout(1000);await s.finish();
  }
  if(!requested||requested==='02'){
    const s=await session('02-linked-wiki');await s.page.waitForTimeout(1000);
    await s.click(s.node('Kiro').getByRole('button',{name:'Open page',exact:true}));
    await s.click(s.page.getByRole('tab',{name:'Read',exact:true}));await s.panelWidth(620);await s.fit();
    await s.page.getByRole('textbox',{name:'Page title',exact:true}).waitFor();
    assert.equal(await s.page.getByRole('textbox',{name:'Page title',exact:true}).inputValue(),'Kiro agent design');
    await s.screenshot('05-diagram-linked-wiki.png');await s.page.waitForTimeout(1800);
    await s.click(s.page.getByRole('button',{name:'Pages on this node',exact:true}));
    await s.click(s.page.getByRole('menuitemradio',{name:'Support runbook',exact:true}));
    assert.equal(await s.page.getByRole('textbox',{name:'Page title',exact:true}).inputValue(),'Support runbook');
    await s.screenshot('06-wiki-second-linked-page.png');await s.page.waitForTimeout(1600);await s.finish();
  }
  if(!requested||requested==='03'){
    const s=await session('03-linked-slides');await s.page.waitForTimeout(1000);
    await s.click(s.node('Kiro').getByRole('button',{name:'Open slides',exact:true}));await s.panelWidth(660);await s.fit();
    assert.equal(await s.page.getByRole('textbox',{name:'Deck title',exact:true}).inputValue(),'Inside the haunted help desk');
    await s.screenshot('07-diagram-linked-slides.png');await s.page.waitForTimeout(1800);
    const popupPromise=s.page.waitForEvent('popup');popupPromise.catch(()=>{});await s.click(s.page.getByRole('button',{name:'Open in slides',exact:true}));
    const presentation=await popupPromise;await presentation.waitForLoadState();
    await presentation.getByRole('link',{name:'Present',exact:true}).click();
    await presentation.getByRole('heading',{name:'Inside the haunted help desk',exact:true}).waitFor({state:'visible'});
    await presentation.evaluate(()=>document.fonts.ready);await presentation.waitForTimeout(600);
    await presentation.screenshot({path:join(root,'screenshots/08-linked-deck-window.png')});
    await presentation.close();await s.page.waitForTimeout(1000);await s.finish();
  }
  if(!requested||requested==='04'){
    const s=await session('04-export-gif');await s.unfold('Retrieval','Rewrite');await s.unfold('Search','GitHub');
    await s.click(s.page.getByRole('button',{name:'More actions',exact:true}));
    await s.screenshot('09-export-animated-gif.png');await s.page.waitForTimeout(1200);
    const downloadPromise=s.page.waitForEvent('download',{timeout:300000});
    downloadPromise.catch(()=>{});
    await s.click(s.page.getByRole('menuitem',{name:'Export GIF',exact:true}));
    const download=await downloadPromise;
    const path=join(root,'gif/04-exported-diagram.gif');await download.saveAs(path);assert.equal(await download.failure(),null);
    const probe=JSON.parse((await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path])).stdout);
    assert(Number(probe.streams[0].nb_frames)>1,'The export must be animated');
    evidence.downloads.push({filename:'04-exported-diagram.gif',suggestedFilename:download.suggestedFilename(),frames:probe.streams[0].nb_frames,seconds:probe.format.duration,bytes:(await stat(path)).size});
    // Export frames the canvas again; restore capture margins afterwards.
    await s.fit();await s.screenshot('10-export-completed.png');await s.page.waitForTimeout(1200);await s.finish();
  }
  assert.deepEqual(evidence.browserErrors,[]);
  await writeFile(join(root,`notes/capture-evidence${requested?`-${requested}`:''}.json`),JSON.stringify(evidence,null,2)+'\n');
  console.log(`Raw recording and frames: ${scratch}`);
} catch(error) {console.error(error);throw error;} finally {await browser.close();}
