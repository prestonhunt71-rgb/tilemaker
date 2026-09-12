import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as geometry from "../scripts/geometry.mjs";

test("tight bounds preserve fractional scene coordinates and concave polygons", () => {
  assert.deepEqual(geometry.bounds([{x:10.5,y:20.25},{x:50.5,y:20.25},{x:30,y:30},{x:50.5,y:60.25},{x:10.5,y:60.25}]),
    {x:10.5,y:20.25,width:40,height:40});
  assert.throws(()=>geometry.bounds([{x:0,y:0},{x:1,y:1},{x:2,y:2}]));
  assert.throws(()=>geometry.bounds([{x:0,y:0}]));
});

test("names retain useful spaces and Unicode, reject paths and reserved names", () => {
  assert.equal(geometry.filenameBase("  Café table.png  "),"Café table");
  for (const name of ["", "../chair", "a\\b", "CON", "x?", "x.", "a".repeat(101)])
    assert.throws(()=>geometry.filenameBase(name));
});

test("duplicate names account for encoded Forge URLs and case", () => {
  assert.equal(geometry.availableName("Oak Table",[
    "https://assets.forge-vtt.com/user/Tokens/Oak%20Table.png",
    "Tokens/OAK TABLE (2).PNG"
  ]),"Oak Table (3).png");
});

test("image transform preserves rotated, offset, mirrored and nonuniform backgrounds", () => {
  const m=geometry.imageMatrix({x:150,y:200},{x:150,y:250},{x:250,y:200},100,100);
  assert.deepEqual(m,{a:0,b:0.5,c:1,d:0,e:150,f:200});
  assert.equal(geometry.resolution(m),2);
  const ordinary=geometry.imageMatrix({x:100,y:200},{x:300,y:200},{x:100,y:400},100,100);
  assert.equal(geometry.resolution(ordinary),0.5);
  assert.throws(()=>geometry.imageMatrix({x:0,y:0},{x:0,y:0},{x:0,y:0},100,100));
});

function harness() {
  const hooks={}, settings=new Map(), notifications=[];
  const ctx={
    ...geometry, console, AbortController, URL, File, Blob,
    requestAnimationFrame:()=>1, cancelAnimationFrame:()=>{},
    Hooks:{once:(k,v)=>hooks[k]=v,on:(k,v)=>hooks[k]=v},
    foundry:{applications:{apps:{FilePicker:{}}}},
    game:{user:{isGM:true},settings:{get:()=> "Tokens/Mapmaking Tiles/Custom",
      register:(id,key,data)=>settings.set(key,data)},modules:new Map([["tilemaker",{}]])},
    ui:{notifications:{warn:m=>notifications.push(m),error:m=>notifications.push(m),info:m=>notifications.push(m)}},
    canvas:{scene:{id:"scene-1"}, primary:{},ready:true},
    document:{}, devicePixelRatio:1
  };
  const source=fs.readFileSync(new URL("../scripts/tilemaker.js",import.meta.url),"utf8")
    .replace(/^import .*?;\s*/,"");
  vm.runInNewContext(source+"\nglobalThis.TestSession=SnipSession; globalThis.testPicker=pickerClass;",ctx);
  return {ctx,hooks,settings,notifications};
}

test("V13/V14 controls register a GM-only launch button and configured folder", () => {
  const {ctx,hooks,settings}=harness();
  hooks.init();
  assert.equal(settings.get("directory").default,"Tokens/Mapmaking Tiles/Custom");
  for (const controls of [{tiles:{tools:{}}},[{name:"tiles",tools:[]}]]) {
    hooks.getSceneControlButtons(controls);
    const tools=controls.tiles?.tools ?? controls[0].tools;
    assert.equal((tools.tilemaker ?? tools[0]).button,true);
  }
  ctx.game.user.isGM=false;
  const controls={tiles:{tools:{}}};
  hooks.getSceneControlButtons(controls);
  assert.deepEqual(controls.tiles.tools,{});
});

test("Forge uses its augmented picker; local installs use the namespaced picker", () => {
  const {ctx}=harness();
  const local=ctx.foundry.applications.apps.FilePicker;
  assert.equal(ctx.testPicker(),local);
  ctx.ForgeVTT={usingTheForge:true}; ctx.FilePicker={forge:true};
  assert.equal(ctx.testPicker(),ctx.FilePicker);
});

test("crop uses source pixels with polygon clipping and tight placement coordinates", () => {
  const {ctx}=harness();
  const calls=[];
  const drawing={
    setTransform:(...a)=>calls.push(["setTransform",...a]),beginPath:()=>{},moveTo:()=>{},lineTo:()=>{},
    closePath:()=>{},clip:rule=>calls.push(["clip",rule]),transform:(...a)=>calls.push(["transform",...a]),
    drawImage:(...a)=>calls.push(["drawImage",...a]),getImageData:()=>({data:[0,0,0,255]})
  };
  ctx.document.createElement=()=>({getContext:()=>drawing});
  ctx.canvas.stage={toLocal:p=>p};
  ctx.canvas.primary={
    backgroundSource:{naturalWidth:100,naturalHeight:100},
    background:{texture:{orig:{width:100,height:100}},anchor:{x:0.5,y:0.5},
      toGlobal:p=>({x:p.x*2+200,y:p.y*2+300})}
  };
  const s=new ctx.TestSession();
  s.points=[{x:110,y:210},{x:150,y:210},{x:130,y:250}];
  const {out,box}=s.crop();
  assert.equal(out.width,20); assert.equal(out.height,20);
  assert.equal(box.x,110); assert.equal(box.width,40);
  assert.deepEqual(calls.find(c=>c[0]==="transform"),["transform",2,0,0,2,100,200]);
  assert.ok(calls.some(c=>c[0]==="clip" && c[1]==="evenodd"));
  assert.equal(calls.find(c=>c[0]==="drawImage")[1],ctx.canvas.primary.backgroundSource);
  ctx.canvas.primary.backgroundSource={};
  assert.throws(()=>s.crop(),/background changed/);
});

test("cancel removes listeners, overlays, dialog and preview URL", () => {
  const {ctx}=harness();
  const s=new ctx.TestSession();
  let removed=0,closed=0;
  s.overlay={remove:()=>removed++}; s.bar={remove:()=>removed++};
  s.dialog={close:()=>closed++,remove:()=>removed++};
  s.view={style:{cursor:"crosshair"}}; s.previousCursor="default";
  s.cancel();
  assert.equal(s.events.signal.aborted,true);
  assert.equal(removed,3); assert.equal(closed,1);
  assert.equal(s.view.style.cursor,"default");
});

test("save retries placement without uploading a second asset", async () => {
  const {ctx}=harness();
  const elements={};
  const form={addEventListener:(k,f)=>{form.submit=f;}};
  const buttons=[{disabled:false},{disabled:false}];
  const input={value:"",focus(){},select(){}};
  const status={textContent:""};
  const dialog={className:"",setAttribute(){},innerHTML:"",showModal(){},close(){},remove(){},
    addEventListener(){},querySelector:s=>({
      form,input,"img":{},"[data-destination]":{},"[role=status]":status,"[data-back]":buttons[0]
    })[s],querySelectorAll:()=>buttons};
  ctx.document={createElement:()=>dialog,body:{append(){}}};
  let uploads=0,creates=0,created;
  ctx.foundry.applications.apps.FilePicker={
    browse:async()=>({files:["Tokens/Mapmaking Tiles/Custom/Chair.png"]}),
    upload:async(source,dir,file)=>{uploads++; assert.equal(file.name,"Chair (2).png"); return {path:"assets/Chair%20(2).png"};}
  };
  ctx.canvas.scene.createEmbeddedDocuments=async(type,data)=>{
    creates++; created=data[0]; if(creates===1) throw new Error("Temporary failure");
    return [{object:{control(){}}}];
  };
  ctx.canvas.tiles={activate(){}};
  const s=new ctx.TestSession();
  s.showSave(new Blob(["test"],{type:"image/png"}),{x:10,y:20,width:30,height:40});
  input.value="Chair";
  await form.submit({preventDefault(){}});
  assert.equal(uploads,1); assert.equal(creates,1);
  assert.match(status.textContent,/Image saved.*Placement failed/);
  assert.equal(input.disabled,true);
  await form.submit({preventDefault(){}});
  assert.equal(uploads,1); assert.equal(creates,2);
  assert.equal(created.texture.src,"assets/Chair%20(2).png");
  assert.equal(created.width,30); assert.equal(created.flags.tilemaker.name,"Chair (2)");
  assert.equal(s.closed,true);
});

