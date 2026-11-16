import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
const run=promisify(execFile);
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const screenshots=['01-drill-overview.png','02-drill-level-1.png','03-drill-level-2.png','04-drill-up-overview.png','05-diagram-linked-wiki.png','06-wiki-second-linked-page.png','07-diagram-linked-slides.png','08-linked-deck-window.png','09-export-animated-gif.png','10-export-completed.png'];
const result={screenshots:[],animations:[],videos:[]};
for(const filename of screenshots){const data=await readFile(join(root,'screenshots',filename));assert.equal(data.toString('ascii',1,4),'PNG');const width=data.readUInt32BE(16),height=data.readUInt32BE(20);assert.equal(width,1600);assert.equal(height,1000);result.screenshots.push({filename,width,height,bytes:data.length});}
for(const [directory,names] of [['gif',['01-drill-levels.gif','02-linked-wiki.gif','03-linked-slides.gif','04-exported-diagram.gif']],['videos',['01-drill-levels.mp4','02-linked-wiki.mp4','03-linked-slides.mp4']]]){
  for(const filename of names){const path=join(root,directory,filename);const metadata=JSON.parse((await run('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',path])).stdout);const stream=metadata.streams[0];assert(Number(stream.nb_read_frames)>1,`${filename} must have multiple frames`);const seconds=Number(metadata.format.duration);assert(seconds>0&&seconds<=25,`${filename} must be short`);await run('ffmpeg',['-v','error','-threads','2','-i',path,'-f','null','-']);const record={filename,width:stream.width,height:stream.height,frames:Number(stream.nb_read_frames),seconds,bytes:(await stat(path)).size};result[directory==='gif'?'animations':'videos'].push(record);}
}
for(const id of ['01','02','03','04']){const evidence=JSON.parse(await readFile(join(root,`notes/capture-evidence-${id}.json`),'utf8'));assert.deepEqual(evidence.browserErrors,[]);}
await writeFile(join(root,'notes/asset-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
