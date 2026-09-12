import {bounds, filenameBase, availableName, imageMatrix, resolution} from "./geometry.mjs";

const ID = "tilemaker";
let session;

function pickerClass() {
  // Forge extends the global picker with its Assets Library source.
  if (globalThis.ForgeVTT?.usingTheForge && globalThis.FilePicker) return globalThis.FilePicker;
  return foundry.applications.apps.FilePicker;
}

Hooks.once("init", () => {
  game.settings.register(ID, "directory", {
    name: "Tile save folder",
    hint: "Relative to your Forge Assets Library (or local User Data). This folder must already exist.",
    scope: "world", config: true, type: String,
    default: "Tokens/Mapmaking Tiles/Custom"
  });
  game.modules.get(ID).api = {start};
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user?.isGM) return;
  const tiles = controls.tiles ?? controls.find?.(c => c.name === "tiles");
  if (!tiles) return;
  const tool = {name: ID, title: "Snip Background", icon: "fa-solid fa-scissors",
    order: 90, button: true, onChange: () => start()};
  if (Array.isArray(tiles.tools)) tiles.tools.push(tool);
  else tiles.tools[ID] = tool;
});
Hooks.on("canvasTearDown", () => session?.cancel());

function start() {
  if (!game.user?.isGM) return ui.notifications.warn("TileMaker is a GM tool.");
  if (!canvas.ready || !canvas.primary?.backgroundSource)
    return ui.notifications.warn("Open a scene with a background image first.");
  if (session?.saving) return ui.notifications.warn("Please wait for the current tile to finish saving.");
  session?.cancel();
  session = new SnipSession();
  session.begin();
}

class SnipSession {
  constructor() {
    this.scene = canvas.scene;
    this.source = canvas.primary.backgroundSource;
    this.mesh = canvas.primary.background;
    this.points = [];
    this.events = new AbortController();
    this.closed = false;
    this.busy = false;
    this.saving = false;
  }

  begin() {
    this.view = canvas.app.canvas ?? canvas.app.view;
    this.overlay = document.createElement("canvas");
    this.overlay.id = "tilemaker-outline";
    document.body.append(this.overlay);
    this.bar = document.createElement("div");
    this.bar.id = "tilemaker-bar";
    this.bar.innerHTML = '<span>Click points • Enter: finish • Backspace: undo • Esc: cancel • Right-drag: pan</span><button type="button">Finish</button><button type="button">Cancel</button>';
    document.body.append(this.bar);
    this.bar.querySelectorAll("button")[0].onclick = () => this.finish();
    this.bar.querySelectorAll("button")[1].onclick = () => this.cancel();
    const options = {capture: true, signal: this.events.signal};
    for (const type of ["pointerdown", "pointerup", "click", "dblclick"]) {
      document.addEventListener(type, e => {
        if (this.busy || e.target !== this.view || e.button !== 0) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (type !== "pointerdown") return;
        const p = this.scenePoint(e);
        const first = this.points[0];
        const screen = first && this.screenPoint(first);
        if (this.points.length >= 3 && Math.hypot(screen.x-e.clientX,screen.y-e.clientY) < 10)
          return void this.finish();
        if (!this.points.length || Math.hypot(p.x-this.points.at(-1).x,p.y-this.points.at(-1).y)>0.01)
          this.points.push({x:p.x,y:p.y});
      }, options);
    }
    document.addEventListener("pointermove", e => {
      if (!this.busy && e.target === this.view) this.hover = this.scenePoint(e);
    }, options);
    document.addEventListener("keydown", e => {
      if (this.busy || e.target.closest?.("input,textarea,select,[contenteditable=true]")) return;
      if (!["Escape", "Backspace", "Enter"].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "Escape") this.cancel();
      else if (e.key === "Backspace") this.points.pop();
      else this.finish();
    }, options);
    this.previousCursor = this.view.style.cursor;
    this.view.style.cursor = "crosshair";
    this.draw();
  }

  scenePoint(e) {
    const r = this.view.getBoundingClientRect(), s = canvas.app.renderer.screen;
    return canvas.stage.toLocal({x:(e.clientX-r.left)*s.width/r.width, y:(e.clientY-r.top)*s.height/r.height});
  }

  screenPoint(p) {
    const r = this.view.getBoundingClientRect(), s = canvas.app.renderer.screen;
    const q = canvas.stage.toGlobal(p);
    return {x:r.left+q.x*r.width/s.width, y:r.top+q.y*r.height/s.height};
  }

  draw() {
    if (this.closed) return;
    const r = this.view.getBoundingClientRect();
    const c = this.overlay, dpr = devicePixelRatio || 1;
    c.style.left = r.left+"px"; c.style.top = r.top+"px";
    c.style.width = r.width+"px"; c.style.height = r.height+"px";
    const w = Math.round(r.width*dpr), h = Math.round(r.height*dpr);
    if (c.width !== w || c.height !== h) { c.width=w; c.height=h; }
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,r.width,r.height);
    const pts = this.points.map(p => { const q=this.screenPoint(p); return {x:q.x-r.left,y:q.y-r.top}; });
    if (pts.length) {
      ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
      for (const p of pts.slice(1)) ctx.lineTo(p.x,p.y);
      if (this.hover && !this.busy) {
        const p=this.screenPoint(this.hover); ctx.lineTo(p.x-r.left,p.y-r.top);
      }
      ctx.closePath(); ctx.fillStyle="#74d6ff33"; ctx.fill("evenodd");
      ctx.strokeStyle="#09121b"; ctx.lineWidth=4; ctx.stroke();
      ctx.strokeStyle="#74d6ff"; ctx.lineWidth=2; ctx.stroke();
      pts.forEach((p,i) => {
        ctx.beginPath(); ctx.arc(p.x,p.y,i?3:6,0,Math.PI*2);
        ctx.fillStyle=i?"#ffffff":"#74d6ff"; ctx.fill();
      });
    }
    this.frame=requestAnimationFrame(() => this.draw());
  }

  crop() {
    if (canvas.scene !== this.scene || canvas.primary.backgroundSource !== this.source)
      throw new Error("The background changed. Cancel and start a new selection.");
    const source=this.source, mesh=this.mesh;
    const iw=source.naturalWidth ?? source.videoWidth, ih=source.naturalHeight ?? source.videoHeight;
    if (!iw || !ih) throw new Error("The background image has not loaded.");
    const tex=mesh.texture.orig;
    const ax=mesh.anchor.x*tex.width, ay=mesh.anchor.y*tex.height;
    // Convert texture corners through the live mesh: includes padding, offsets,
    // scale, rotation and mirroring, independently of camera pan and zoom.
    const toScene=(x,y) => canvas.stage.toLocal(mesh.toGlobal({x:x-ax,y:y-ay}));
    const m=imageMatrix(toScene(0,0),toScene(tex.width,0),toScene(0,tex.height),iw,ih);
    const box=bounds(this.points), density=resolution(m);
    const width=Math.max(1,Math.ceil(box.width*density)), height=Math.max(1,Math.ceil(box.height*density));
    if (width>16384 || height>16384 || width*height>32*1024*1024)
      throw new Error("This selection is too large to export at source detail. Select a smaller region.");
    const out=document.createElement("canvas"); out.width=width; out.height=height;
    const ctx=out.getContext("2d", {willReadFrequently:true});
    if (!ctx) throw new Error("The browser could not allocate the crop canvas.");
    const sx=width/box.width, sy=height/box.height;
    ctx.setTransform(sx,0,0,sy,-box.x*sx,-box.y*sy);
    ctx.beginPath();
    this.points.forEach((p,i) => i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.closePath(); ctx.clip("evenodd");
    ctx.transform(m.a,m.b,m.c,m.d,m.e,m.f);
    ctx.drawImage(source,0,0,iw,ih);
    // Also detects a CORS-tainted source before opening the save dialog.
    const pixels=ctx.getImageData(0,0,width,height).data;
    let opaque=false;
    for (let i=3;i<pixels.length;i+=4) if (pixels[i]) {opaque=true; break;}
    if (!opaque) throw new Error("The selection contains no visible background pixels.");
    return {out,box};
  }

  async finish() {
    if (this.busy || this.closed) return;
    this.busy=true;
    try {
      const {out,box}=this.crop();
      const blob=await new Promise(resolve => out.toBlob(resolve,"image/png"));
      if (this.closed) return;
      if (!blob) throw new Error("The browser could not encode the PNG.");
      this.showSave(blob,box);
    } catch (error) {
      console.error(ID, error);
      ui.notifications.error("TileMaker: "+error.message);
      this.busy=false;
    }
  }

  showSave(blob,box) {
    const dialog=document.createElement("dialog");
    this.dialog=dialog;
    dialog.className="tilemaker-dialog";
    dialog.setAttribute("aria-label","Name and save tile");
    dialog.innerHTML='<form><h2>Name your tile</h2><img alt="Transparent tile preview"><label>Tile name<input name="name" required maxlength="104" autocomplete="off"></label><p data-destination></p><p role="status" aria-live="polite"></p><footer><button type="button" data-back>Back to selection</button><button type="submit">Save &amp; Place Tile</button></footer></form>';
    this.previewURL=URL.createObjectURL(blob);
    dialog.querySelector("img").src=this.previewURL;
    const input=dialog.querySelector("input");
    input.value="Map tile";
    const directory=game.settings.get(ID,"directory").trim().replace(/^\/+|\/+$/g,"");
    dialog.querySelector("[data-destination]").textContent="Save to: "+directory+" / name.png";
    const status=dialog.querySelector("[role=status]");
    const back=() => {
      if (this.saving) return;
      dialog.close(); dialog.remove(); this.dialog=null;
      URL.revokeObjectURL(this.previewURL); this.previewURL=null; this.busy=false;
    };
    dialog.querySelector("[data-back]").onclick=back;
    dialog.addEventListener("cancel",e => { e.preventDefault(); back(); });
    let savedPath, savedName;
    dialog.querySelector("form").addEventListener("submit",async e => {
      e.preventDefault();
      if (this.saving || this.closed) return;
      this.saving=true;
      for (const b of dialog.querySelectorAll("button")) b.disabled=true;
      input.disabled=true;
      try {
        if (!game.user.isGM || canvas.scene !== this.scene || !canvas.ready)
          throw new Error("The original scene must be open to place this tile.");
        if (!savedPath) {
          const base=filenameBase(input.value);
          if (!directory || directory.split("/").some(p => p===".." || p===".") || /[:\\]/.test(directory))
            throw new Error("Set a valid relative Tile save folder in Module Settings.");
          const picker=pickerClass();
          const source=globalThis.ForgeVTT?.usingTheForge?"forgevtt":"data";
          status.textContent="Checking destination and filename…";
          const listing=await picker.browse(source,directory);
          if (this.closed) return;
          if (!Array.isArray(listing?.files)) throw new Error("Could not list the destination folder. Check its path and permissions.");
          savedName=availableName(base,listing.files);
          status.textContent="Saving "+savedName+"…";
          const result=await picker.upload(source,directory,new File([blob],savedName,{type:"image/png"}),{}, {notify:false});
          if (!result?.path || result.error) throw new Error(result?.error || "Upload did not return a saved path.");
          savedPath=result.path;
          if (this.closed) {
            ui.notifications.info("Tile image saved: "+savedPath+". Placement was cancelled.");
            return;
          }
        }
        if (canvas.scene !== this.scene || this.closed) throw new Error("The scene changed. The image was saved, but no tile was placed.");
        status.textContent="Placing tile…";
        const [tile]=await this.scene.createEmbeddedDocuments("Tile",[{
          x:box.x,y:box.y,width:box.width,height:box.height,
          texture:{src:savedPath},rotation:0,alpha:1,hidden:false,locked:false,
          flags:{[ID]:{name:savedName.replace(/\.png$/i,""),sourceScene:this.scene.id}}
        }]);
        if (!tile) throw new Error("Foundry did not return a created tile.");
        // Creation is committed. Failure to select must not offer a duplicate retry.
        this.cancel();
        try {
          if (canvas.scene === this.scene) {
            canvas.tiles.activate();
            tile.object?.control({releaseOthers:true});
          }
        } catch (error) { console.warn(ID+" | Tile created but could not select it",error); }
        ui.notifications.info("Created tile: "+savedName);
      } catch (error) {
        console.error(ID,error);
        status.textContent=savedPath
          ? "Image saved at "+savedPath+". Placement failed: "+error.message+" Retry to place the saved image."
          : error.message;
      } finally {
        this.saving=false;
        if (!this.closed) {
          for (const b of dialog.querySelectorAll("button")) b.disabled=false;
          input.disabled=Boolean(savedPath);
        }
      }
    });
    document.body.append(dialog); dialog.showModal(); input.focus(); input.select();
  }

  cancel() {
    this.closed=true;
    this.events.abort();
    cancelAnimationFrame(this.frame);
    this.overlay?.remove(); this.bar?.remove();
    this.dialog?.close(); this.dialog?.remove();
    if (this.previewURL) URL.revokeObjectURL(this.previewURL);
    if (this.view) this.view.style.cursor=this.previousCursor;
    if (session===this) session=null;
  }
}

