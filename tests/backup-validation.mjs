import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { build }=createRequire(import.meta.resolve('vite/package.json'))('esbuild');
let events=[];
const mocks={native:true,failWrite:false,failShare:false};
globalThis.__backupMocks={
  Capacitor:{isNativePlatform:()=>mocks.native},
  Directory:{Cache:'CACHE'},Encoding:{UTF8:'utf8'},
  Filesystem:{
    writeFile:async options=>{events.push(['write',options]);if(mocks.failWrite)throw Error('write failed');return {uri:'file://test-backup.json'};},
    deleteFile:async options=>{events.push(['delete',options]);}
  },
  Share:{share:async options=>{events.push(['share',options]);if(mocks.failShare)throw Error('cancelled');}}
};
const bundle=await build({entryPoints:['src/backup.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'native-mocks',setup(api){
  api.onResolve({filter:/^@capacitor\//},args=>({path:args.path,namespace:'mock'}));
  api.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const {Capacitor,Filesystem,Directory,Encoding,Share}=globalThis.__backupMocks;'}));
}}]});
const {exportBackupFile}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
await exportBackupFile('{"version":2}');
assert.deepEqual(events.map(e=>e[0]),['write','share','delete']);
assert.equal(events[0][1].data,'{"version":2}');assert.equal(events[0][1].directory,'CACHE');
events=[];mocks.failShare=true;
await assert.rejects(exportBackupFile('{}'));
assert.deepEqual(events.map(e=>e[0]),['write','share','delete']);
events=[];mocks.failWrite=true;
await assert.rejects(exportBackupFile('{}'));
assert.deepEqual(events.map(e=>e[0]),['write']);
mocks.native=false;events=[];
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{canShare:()=>true,share:async options=>{events.push(['webShare',options]);}}});
await exportBackupFile('{}');assert.equal(events[0][0],'webShare');assert.match(events[0][1].files[0].name,/\.json$/);
console.log('Backup validation: native success, cancellation cleanup, write failure and web file sharing passed.');
