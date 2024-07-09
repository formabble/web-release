var fblTestScript = undefined;
var fblRunSimple = undefined;

import FblModule from "./fbl-f4dc00c.js";
const binaryPath = "https://app-bin.formabble.com/fbl-f4dc00c.wasm";

function parseWindowSearchOpts(query_) {
  var opts = {};
  var query = query_ || window.location.search.substring(1);
  var vars = query.split('&');
  for (var i = 0; i < vars.length; i++) {
    var pair = vars[i].split('=');
    opts[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
  }
  return opts;
}

// nanoid
let a = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict"; export let nanoid = (e = 21) => { let t = "", r = crypto.getRandomValues(new Uint8Array(e)); for (let n = 0; n < e; n++)t += a[63 & r[n]]; return t };

let LoaderUI = {
  root: document.getElementById("loader"),
  errorRoot: document.getElementById("loader-error"),
  label: document.getElementById("loading-text"),
  errorLabel: document.getElementById("error-text"),
  setText: function (text) {
    this.label.innerText = text;
  },
  setError: function (text) {
    this.root.classList.add("hidden");
    this.errorRoot.classList.remove("hidden");
    this.errorLabel.innerText = text;
  },
  hide: function () {
    this.root.classList.add("hidden");
  }
};
LoaderUI.setText("loading fbl.wasm");

const SPDLOG_LEVEL_TRACE = 0;
const SPDLOG_LEVEL_DEBUG = 1;
const SPDLOG_LEVEL_INFO = 2;
const SPDLOG_LEVEL_WARN = 3;
const SPDLOG_LEVEL_ERROR = 4;
const SPDLOG_LEVEL_CRITICAL = 5;
const SPDLOG_LEVEL_OFF = 6;

let fblCanvasContainer = document.getElementById("canvas-container");
let fblCanvas = document.getElementById("canvas");
let fblCanvasDrop = document.getElementById("canvas-drop");
// NOTE: can rename canvas element using specialHTMLTargets:
// https://github.com/msft-mirror-aosp/platform.external.webp/commit/f88666eb4798123f6cde17a2eb49cd0b78384951

// To prevent right click menu from showing up when trying to right-click the canvas
fblCanvas.oncontextmenu = function (e) {
  e.preventDefault();
};

// Used to bypass SDL trapping key events when the cursor is outside the page
var cursorInPage = false;
window.onmouseout = () => {
  cursorInPage = false;
};
window.onmouseover = () => {
  cursorInPage = true;
};

function toKB(bytes) {
  return new Intl.NumberFormat().format(Math.floor(bytes / 1024));
}

async function sleep(ms) {
  await new Promise(done => setTimeout(done, ms));
}

var DropHandler = {
  enabled: false,
  setInstance: function (instance) { this.instance = instance; },
  droppedDataPath: null,
  lastCheckedDroppedDataPath: null,
  copyInProgress: false,
  setEnabled: function (enable) {
    console.log("DropHandler.setEnabled: ", enable);
    this.enabled = enable;
    this.setAccept(false);
  },
  setAccept: function (v) {
    if (v) {
      fblCanvasDrop.classList.remove("hidden");
    } else {
      fblCanvasDrop.classList.add("hidden");
    }
  },
  // Discards temporary dropped file data
  discardData: function () {
    if (this.copyInProgress) {
      console.error("Cannot discard data while copy is in progress");
      return;
    }
    const FS = this.instance.module.FS;

    if (this.droppedDataPath != null) {
      console.log("Discarding dropped data at", this.droppedDataPath);
      // var lookup = FS.lookupPath(this.droppedDataPath);
      // var node = lookup.node;
      let nodes = FS.readdir(this.droppedDataPath);
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node === "." || node === "..")
          continue;
        FS.unlink(`${this.droppedDataPath}/${node}`);
      }
      FS.rmdir(this.droppedDataPath);
      this.droppedDataPath = null;
    }
  },
  handleDrop: function (e) {
    e.preventDefault();
    if (!this.enabled)
      return;
    if (this.copyInProgress) {
      console.log("Copy in progress, ignoring drop");
      return;
    }

    this.setAccept(false);
    const dt = e.dataTransfer;

    // Clear out old data
    this.discardData();

    const FS = this.instance.module.FS;
    const tmpMountFolder = `/uploads/${nanoid()}/`;
    FS.mkdir(tmpMountFolder);
    const fileList = [];
    if (dt.items) {
      [...dt.items].forEach((item, i) => {
        // If dropped items aren't files, reject them
        if (item.kind === "file") {
          const file = item.getAsFile();
          fileList.push(file);
        }
      });
    } else {
      // Use DataTransfer interface to access the file(s)
      [...dt.files].forEach((file, i) => {
        fileList.push(file);
      });
    }
    const copyFilesPromise = (async () => {
      for (var i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        console.log(`file[${i}].name = ${file.name}`);
        const reader = new FileReader();
        const result = await (new Promise((ok, err) => {
          console.log(`Loading file ${file.name}`, file);
          reader.onload = () => {
            ok(reader.result);
          };
          reader.onerror = err;
          reader.readAsArrayBuffer(file);
        }));
        console.log(`Loaded dragged file ${file.name} with size ${result.byteLength}`, result);
        var resultU8 = new Uint8Array(result);
        FS.writeFile(`${tmpMountFolder}/${file.name}`, resultU8);
      }
    })();
    copyFilesPromise.finally((() => {
      this.droppedDataPath = tmpMountFolder;
      this.copyInProgress = false;
    }).bind(this));
  },
  handleDragOver: function (e) {
    if (!this.enabled)
      return;
    e.preventDefault();
    this.setAccept(true);
  },
  handleDragLeave: function (e) {
    if (!this.enabled)
      return;
    this.setAccept(false);
  },
  handleDragEnd: function (e) {
    if (!this.enabled)
      return;
    this.setAccept(false);
  },
};
fblCanvas.ondrop = DropHandler.handleDrop.bind(DropHandler);
fblCanvas.ondragover = DropHandler.handleDragOver.bind(DropHandler);
fblCanvas.ondragleave = DropHandler.handleDragLeave.bind(DropHandler);
fblCanvas.ondragend = DropHandler.handleDragEnd.bind(DropHandler);

function fblOnBoot(instance) {
  // Hide the loader & Show the WebGPU canvas
  LoaderUI.hide();
  fblCanvas.classList.remove("hidden");

  DropHandler.setEnabled(true);

  // SDL overwrites this
  document.title = instance.docTitle;
}

async function bootFbl() {
  let instance = {
    urlQuery: parseWindowSearchOpts()
  };
  const urlQuery = instance.urlQuery;

  // Restore this after load
  instance.docTitle = document.title;

  var headers = new Headers();
  if (urlQuery["noCache"] !== undefined) {
    headers.append('pragma', 'no-cache');
    headers.append('cache-control', 'no-cache');
  }
  const response = await fetch(binaryPath, { headers: headers });

  if (!response.ok) {
    LoaderUI.setError(`Failed to fetch fbl.wasm: ${response.statusText}`);
    return;
  }

  const contentLength = response.headers.get("Content-Length");
  const reader = response.body.getReader();

  let receivedLength = 0;
  let receivedChunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done)
      break;

    if (!value)
      continue;

    receivedChunks.push(value);
    receivedLength += value.length;

    LoaderUI.setText(`loading fbl.wasm ${toKB(receivedLength)}/${toKB(contentLength)} KB`);
  }

  console.log("Received all data");

  let wasmArray = new Uint8Array(receivedLength);
  let position = 0;
  for (let chunk of receivedChunks) {
    wasmArray.set(chunk, position);
    position += chunk.length;
  }
  instance.wasm = wasmArray;

  LoaderUI.setText("spawning module");
  instance.module = await FblModule({
    wasmBinary: instance.wasm,
  });
  console.log("Module spawned", instance.module);

  LoaderUI.setText("creating instance");
  const mod = instance.module;

  DropHandler.setInstance(instance);
  mod["fblDropHandler"] = DropHandler;

  mod["canvas"] = fblCanvas;

  // Set the canvas to use for input and graphics
  mod.gfxSetup(fblCanvasContainer, fblCanvas);

  // Setup FBL folder structure
  const FS = mod.FS;
  FS.mkdir("/uploads");

  if (fblRunSimple !== undefined) {
    fblRunSimple(mod);
    return;
  }

  instance.setLoggerLevel = (loggerName, level) => {
    const tmpStr = mod.stringToNewUTF8(loggerName);
    mod._fblSetLoggerLevel(tmpStr, level);
    mod._free(tmpStr);
  };

  const fbl = mod._fblCreateInstance();
  instance.setLoggerLevel("gfx", SPDLOG_LEVEL_INFO);
  instance.setLoggerLevel("wgpu", SPDLOG_LEVEL_INFO);
  instance.setLoggerLevel("shards", SPDLOG_LEVEL_INFO);
  instance.setLoggerLevel("fbl", SPDLOG_LEVEL_INFO);
  instance.setLoggerLevel("http", SPDLOG_LEVEL_INFO);

  if (fblTestScript === undefined) {
    var cDomainUUID;
    if (urlQuery["d"] !== undefined) {
      cDomainUUID = mod.stringToNewUTF8(urlQuery["d"]);
      mod._fblSetAutoLoadDomain(fbl, cDomainUUID);
      mod._free(cDomainUUID);
    }

    // let cServerIP = mod.stringToNewUTF8("127.0.0.1");
    // mod._fblSetRelayServer(fbl, cServerIP, 7777);
    // mod._free(cServerIP);

    // let cAssetsServer = mod.stringToNewUTF8("https://assets.formabble.com");
    // mod._fblSetAssetsServer(fbl, cAssetsServer, cAssetsServer);
    // mod._free(cAssetsServer);

    var idUrl = "https://identity.formabble.com";
    if (urlQuery["test"] !== undefined) {
      idUrl = "https://identity-test.formabble.com";
    }
    var cIDServer = mod.stringToNewUTF8(idUrl);
    mod._fblSetIDServer(fbl, cIDServer);
    mod._free(cIDServer);
  }

  instance.fbl = fbl;

  // Test code
  if (fblTestScript !== undefined) {
    const testScriptStr = await (await fetch(fblTestScript)).text();
    const src = mod.stringToNewUTF8(testScriptStr);
    mod._fblUpdateScript(fbl, src);
    mod._free(src);
  }

  mod._fblStart(fbl);

  await (async () => {
    while (true) {
      if (mod._fblHasBooted(fbl))
        break;
      await sleep(50);
    }
  })();

  fblOnBoot(instance);
}

console.log("Hello");
bootFbl();
