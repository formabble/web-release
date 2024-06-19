var fblTestScript = undefined;
var fblRunSimple = undefined;

import FblModule from "./fbl.js";
const binaryPath = "fbl.wasm";

// import FblModule from "./build-dbg/fbl-min-test.js";
// const binaryPath = "build-dbg/fbl-min-test.wasm";
// fblTestScript = "./scripts/test-gfx.shs";

// import FblModule from "./build-dbg/event-test.js";
// const binaryPath = "build-dbg/event-test.wasm";
// var fblRunSimple = (mod) => {
//   const fblCanvasContainer = document.getElementById("canvas-container");
//   const fblCanvas = document.getElementById("canvas");
//   mod.gfxSetup(fblCanvasContainer, fblCanvas);
//   mod._eventTestStartLoop();
// };

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
// const trapKeyEvents = (code) => { return cursorInPage; };
// window.addEventListener('keydown', (event) => { if (!trapKeyEvents(event.code)) event.stopImmediatePropagation(); }, true);
// window.addEventListener('keyup', (event) => { if (!trapKeyEvents(event.code)) event.stopImmediatePropagation(); }, true);

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
  let instance = {};

  // Restore this after load
  instance.docTitle = document.title;

  var headers = new Headers();
  headers.append('pragma', 'no-cache');
  headers.append('cache-control', 'no-cache');
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
  // mod.ENV.RUST_BACKTRACE = "1";

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
  instance.setLoggerLevel("fbl", SPDLOG_LEVEL_TRACE);
  instance.setLoggerLevel("http", SPDLOG_LEVEL_TRACE);
  // instance.setLoggerLevel("sqlite", SPDLOG_LEVEL_TRACE);

  if (fblTestScript === undefined) {
    var urlQuery = parseWindowSearchOpts();
    var cDomainUUID;
    if (urlQuery["d"] !== undefined) {
      cDomainUUID = mod.stringToNewUTF8(urlQuery["d"]);
      mod._fblSetAutoLoadDomain(fbl, cDomainUUID);
      mod._free(cDomainUUID);
    }

    // let cServerIP = mod.stringToNewUTF8("127.0.0.1");
    // mod._fblSetRelayServer(fbl, cServerIP, 7777);
    // mod._free(cServerIP);

    let cAssetsServer = mod.stringToNewUTF8("https://identity-test.formabble.com");
    mod._fblSetAssetsServer(fbl, cAssetsServer, cAssetsServer);
    mod._free(cAssetsServer);

    // var cIDServer = mod.stringToNewUTF8("http://127.0.0.1:9090");
    // mod._fblSetIDServer(fbl, cIDServer);
    // mod._free(cIDServer);
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

// export default {};

// import './App.css';
// import React from 'react';

// import AceEditor from "react-ace";
// import "ace-builds/src-noconflict/mode-clojure";
// import "ace-builds/src-noconflict/theme-monokai";

// import Terminal from 'terminal-in-react';

// import { parseEDNString, toEDNStringFromSimpleObject } from 'edn-data';

// import { makeStyles } from '@material-ui/core/styles';
// import Paper from '@material-ui/core/Paper';
// import Grid from '@material-ui/core/Grid';
// import Box from '@material-ui/core/Box';
// import Table from '@material-ui/core/Table';
// import TableBody from '@material-ui/core/TableBody';
// import TableCell from '@material-ui/core/TableCell';
// import TableContainer from '@material-ui/core/TableContainer';
// import TableHead from '@material-ui/core/TableHead';
// import TableRow from '@material-ui/core/TableRow';
// import TableSortLabel from '@material-ui/core/TableSortLabel';
// import TablePagination from '@material-ui/core/TablePagination';
// import Button from '@material-ui/core/Button';
// import ButtonGroup from '@material-ui/core/ButtonGroup';
// import TextField from '@material-ui/core/TextField';
// import Checkbox from '@material-ui/core/Checkbox';
// import FormControlLabel from '@material-ui/core/FormControlLabel';
// import Tooltip from '@material-ui/core/Tooltip';
// import Typography from '@material-ui/core/Typography';

// import IPFS from 'ipfs-mini';

// import Web3 from 'web3-eth';
// import Web3Utils from 'web3-utils';
// import detectEthereumProvider from '@metamask/detect-provider';

// import * as fcl from "@onflow/fcl"
// import * as ftype from "@onflow/types"
// import { base58_to_binary } from 'base58-js'

// fcl.config()
//   .put("accessNode.api", "https://access-testnet.onflow.org")
//   .put("challenge.handshake", "https://fcl-discovery.onflow.org/testnet/authn")
//   .put("0xHastenIndex", "0xf8d51e8d9f1ceb86")
//   .put("0xHastenScript", "0xf8d51e8d9f1ceb86")
//   .put("0xIHastenScript", "0xf8d51e8d9f1ceb86")
//   .put("0xHastenUtility", "0xf8d51e8d9f1ceb86");

// const pageParams = (new URL(document.location)).searchParams;
// const playerMode = pageParams.get("edit") !== "1";
// const fullScreenMode = pageParams.get("fullscreen") === "1";
// const fullCanvasMode = pageParams.get("fullcanvas") === "1";
// const singleThreadMode = pageParams.get("st") === "1";
// var Parameters = JSON.parse(window.localStorage.getItem("hasten-previous-params")) || {
//   isSVG: false,
//   windowTitle: "Hasten",
//   windowDesc: "My amazing app",
//   windowWidth: 512,
//   windowHeight: 512,
//   windowFullscreen: false,
//   ethContract: "0xC0DE00aa1328aF9263BA5bB5e3d17521AF58b32F",
//   ethProvider: "https://cloudflare-eth.com",
//   version: "v0.1", // only major.minor
// };

// if (!window.chainblocks) {
//   window.chainblocks = {
//     tainted: false,
//     loading: true
//   };
// }
// window.chainblocks.screenshotObjUrl = null;

// var ethExplorerURL = "https://goerli.etherscan.io/address/";

// const evmProviders = {
//   "eth": {
//     rpc: "https://cloudflare-eth.com",
//     explorer: "https://etherscan.io/address/"
//   },
//   // Testnets
//   "geth": {
//     rpc: "https://goerli.infura.io/v3/0d56b4fd3da6485a94148cbddd2b1f00",
//     explorer: "https://goerli.etherscan.io/address/"
//   },
//   "mumbai": {
//     rpc: "https://rpc-mumbai.maticvigil.com/",
//     explorer: "https://mumbai-explorer.matic.today/address/"
//   },
//   "fuji": {
//     rpc: "https://api.avax-test.network/ext/bc/C/rpc",
//     explorer: "https://cchain.explorer.avax-test.network"
//   }
// };

// const ipfsNodes = [
//   new IPFS({ host: 'ipfs.infura.io', port: 5001, protocol: 'https' }),
//   new IPFS({ host: 'ipfs.komputing.org', port: 443, protocol: 'https' })
// ];

// const code77 = Parameters.ethContract; // any chain that has the contract deployed
// const code77Abi = [
//   {
//     "inputs": [
//       {
//         "internalType": "uint160",
//         "name": "scriptHash",
//         "type": "uint160"
//       }
//     ],
//     "name": "dataOf",
//     "outputs": [
//       {
//         "internalType": "bytes",
//         "name": "immutableData",
//         "type": "bytes"
//       },
//       {
//         "internalType": "bytes",
//         "name": "mutableData",
//         "type": "bytes"
//       }
//     ],
//     "stateMutability": "view",
//     "type": "function"
//   },
//   {
//     "inputs": [
//       {
//         "internalType": "uint160",
//         "name": "scriptHash",
//         "type": "uint160"
//       }
//     ],
//     "name": "referencesOf",
//     "outputs": [
//       {
//         "internalType": "uint160[]",
//         "name": "packedRefs",
//         "type": "uint160[]"
//       }
//     ],
//     "stateMutability": "view",
//     "type": "function"
//   },
//   {
//     "inputs": [
//       {
//         "internalType": "bytes32",
//         "name": "ipfsMetadata",
//         "type": "bytes32"
//       },
//       {
//         "internalType": "bytes",
//         "name": "scriptBytes",
//         "type": "bytes"
//       },
//       {
//         "internalType": "bytes",
//         "name": "environment",
//         "type": "bytes"
//       },
//       {
//         "internalType": "uint160[]",
//         "name": "references",
//         "type": "uint160[]"
//       },
//       {
//         "internalType": "uint256",
//         "name": "includeCost",
//         "type": "uint256"
//       }
//     ],
//     "name": "upload",
//     "outputs": [],
//     "stateMutability": "nonpayable",
//     "type": "function"
//   },
//   {
//     "inputs": [
//       {
//         "internalType": "uint256",
//         "name": "tokenId",
//         "type": "uint256"
//       }
//     ],
//     "name": "tokenURI",
//     "outputs": [
//       {
//         "internalType": "string",
//         "name": "",
//         "type": "string"
//       }
//     ],
//     "stateMutability": "view",
//     "type": "function"
//   },
//   {
//     "inputs": [
//       {
//         "internalType": "uint256",
//         "name": "tokenId",
//         "type": "uint256"
//       }
//     ],
//     "name": "ownerOf",
//     "outputs": [
//       {
//         "internalType": "address",
//         "name": "",
//         "type": "address"
//       }
//     ],
//     "stateMutability": "view",
//     "type": "function"
//   }
// ];

// const useStylesGrid = makeStyles((theme) => ({
//   root: {
//     flexGrow: 1,
//     '& .MuiTextField-root': {
//       margin: theme.spacing(1),
//       width: '25ch',
//     },
//     '& .MuiTableCell-sizeSmall': {
//       "font-size": "0.7rem"
//     },
//     "& .MuiTablePagination-toolbar": {
//       "font-size": "0.7rem"
//     },
//     "& .MuiTablePagination-caption": {
//       "font-size": "0.7rem"
//     }
//   },
//   paper: {
//     padding: theme.spacing(1),
//     textAlign: 'center',
//     color: theme.palette.text.secondary,
//   },
//   table: {
//     // minWidth: 650,
//   },
//   visuallyHidden: {
//     border: 0,
//     clip: 'rect(0 0 0 0)',
//     height: 1,
//     margin: -1,
//     overflow: 'hidden',
//     padding: 0,
//     position: 'absolute',
//     top: 20,
//     width: 1,
//   }
// }));

// function severalGatewaysPush(content, json = true) {
//   const invert = p => new Promise((resolve, reject) => p.then(reject).catch(resolve)) // Invert res and rej
//   const promises = ipfsNodes.map((node) => invert(json ? node.addJSON(content) : node.add(content)))
//   return invert(Promise.all(promises))
// }

// function descendingComparator(a, b, orderBy) {
//   if (b[orderBy] < a[orderBy]) {
//     return -1;
//   }
//   if (b[orderBy] > a[orderBy]) {
//     return 1;
//   }
//   return 0;
// }

// function getComparator(order, orderBy) {
//   return order === 'desc'
//     ? (a, b) => descendingComparator(a, b, orderBy)
//     : (a, b) => -descendingComparator(a, b, orderBy);
// }

// function stableSort(array, comparator) {
//   const stabilizedThis = array.map((el, index) => [el, index]);
//   stabilizedThis.sort((a, b) => {
//     const order = comparator(a[0], b[0]);
//     if (order !== 0) return order;
//     return a[1] - b[1];
//   });
//   return stabilizedThis.map((el) => el[0]);
// }

// const headCells = [
//   { id: 'name', numeric: false, disablePadding: true, label: 'Name' },
//   { id: 'inputs', numeric: false, disablePadding: true, label: 'Inputs' },
//   { id: 'outputs', numeric: false, disablePadding: true, label: 'Outputs' },
// ];

// function EnhancedTableHead(props) {
//   const { classes, order, orderBy, onRequestSort } = props;
//   const createSortHandler = (property) => (event) => {
//     onRequestSort(event, property);
//   };

//   return (
//     <TableHead>
//       <TableRow>
//         {headCells.map((headCell) => (
//           <TableCell
//             key={headCell.id}
//             align={headCell.numeric ? 'right' : 'left'}
//             padding={headCell.disablePadding ? 'none' : 'default'}
//             sortDirection={orderBy === headCell.id ? order : false}
//           >
//             <TableSortLabel
//               active={orderBy === headCell.id}
//               direction={orderBy === headCell.id ? order : 'asc'}
//               onClick={createSortHandler(headCell.id)}
//             >
//               {headCell.label}
//               {orderBy === headCell.id ? (
//                 <span className={classes.visuallyHidden}>
//                   {order === 'desc' ? 'sorted descending' : 'sorted ascending'}
//                 </span>
//               ) : null}
//             </TableSortLabel>
//           </TableCell>
//         ))}
//       </TableRow>
//     </TableHead>
//   );
// }

// window.chainblocks.flow = { loggedIn: null };
// function setFlowUser(user) {
//   window.chainblocks.flow = user;
// }
// fcl.currentUser().subscribe(setFlowUser);

// async function uploadToFlow(getEnvState) {
//   if (!window.chainblocks.flow.loggedIn) {
//     await fcl.logIn();
//   }

//   const metadata = {
//     name: Parameters.windowTitle,
//     description: Parameters.windowDesc,
//     image: "ipfs://" + Parameters.videoCid || Parameters.screenshotCid,
//     external_url: "https://" + Parameters.version.replace(".", "-") + ".hasten.app/?flow=", // TODO
//   };

//   const bytes = window.chainblocks.instance.FS.readFile("/.hasten/live-chain-binary");
//   const codeArray = Array.from(bytes);

//   const txId = await fcl.send([
//     fcl.transaction`
//         import IHastenScript from 0xHastenScript
//         import HastenScript from 0xHastenScript
//         import HastenUtility from 0xHastenUtility

//         transaction(metadata: String, code: [UInt8]) {
//           // The reference to the collection that will be receiving the Script
//           let receiverRef: &{IHastenScript.ScriptReceiver}

//           prepare(acct: AuthAccount) {
//             var recv = acct.getLinkTarget(/public/HastenScriptReceiverM0m0)
//             if recv == nil {
//               // Setup the account in this case
//               let collection <- HastenScript.createEmptyCollection()
//               acct.save<@HastenScript.Collection>(<-collection, to: /storage/HastenScriptCollectionM0m0)
//               acct.link<&{IHastenScript.ScriptReceiver}>(/public/HastenScriptReceiverM0m0, target: /storage/HastenScriptCollectionM0m0)
//             }

//             // Get the owner's collection capability and borrow a reference
//             self.receiverRef = acct.getCapability<&{IHastenScript.ScriptReceiver}>(/public/HastenScriptReceiverM0m0).borrow() ?? panic("Could not borrow receiver reference")
//           }

//           execute {
//             // the Script into the collection that is sent as a parameter.
//             let newScript <- HastenScript.mint(metadata: metadata, code: code)
//             let newId = newScript.hashId
//             self.receiverRef.deposit(token: <-newScript)

//             // update the global index
//             let view = self.receiverRef.view(id: newId)
//             let indexAccount = getAccount(HastenUtility.ownerAddress())
//             let index = indexAccount.getCapability<&{HastenIndex.Index}>(/public/HastenIndex)
//                               .borrow() ?? panic("Could not borrow index")
//             index.update(script: view!)
//           }
//         }
//       `,
//     fcl.args([fcl.arg(JSON.stringify(metadata), ftype.String), fcl.arg(codeArray, ftype.Array(ftype.UInt8))]),
//     fcl.payer(fcl.authz), // current user is responsible for paying for the transaction
//     fcl.proposer(fcl.authz), // current user acting as the nonce
//     fcl.authorizations([fcl.authz]), // current user will be first AuthAccount
//     fcl.limit(9999), // set the compute limit
//   ]).then(fcl.decode);

//   const res = await fcl.tx(txId).onceSealed();

//   console.log(res);
// }

// function saveByteArray(fileName, byte) {
//   const blob = new Blob([byte], { type: "image/png" });
//   const objUrl = window.URL.createObjectURL(blob);
//   window.chainblocks.screenshotObjUrl = objUrl;
// }

// // just a trick to keep a chain on hold to trigger screenshots
// function screenshotSetup() {
//   window.chainblocks.screenShotPromise = new Promise((resolve, _reject) => {
//     window.chainblocks.screenShotRequest = function () {
//       console.log("Requesting screenshot");
//       window.chainblocks.screenshotObjUrl = null;
//       Parameters.screenshotCid = null;
//       // enqueue next
//       resolve("");
//       // redo the setup in order to capture another screenshot
//       screenshotSetup();
//     };
//   });

//   window.chainblocks.setScreenshotCID = function (cid) {
//     Parameters.screenshotCid = cid;
//   }
// }

// function videoCaptureSetup() {
//   window.chainblocks.videoCapturePromise = new Promise((resolve, _reject) => {
//     window.chainblocks.resolveVideoCapturePromise = function () {
//       console.log("Requesting video capture");
//       window.chainblocks.videoObjUrl = null;
//       Parameters.videoCid = null;
//       // enqueue next
//       resolve("");
//       // redo the setup in order to capture another screenshot
//       videoCaptureSetup();
//     };
//   });

//   window.chainblocks.setVideoCID = function (cid) {
//     Parameters.videoCid = cid;
//   }
// }

// async function reloadCBL(textCode, binaryCode, setBlocksMetaData, environment) {
//   window.chainblocks.loading = true;

//   stopChainblocksRunloop();

//   if (window.chainblocks.mainScript === undefined) {
//     const body = await fetch("entry.edn");
//     window.chainblocks.mainScript = await body.text();
//   }

//   if (navigator && navigator.xr) {
//     Parameters.xrSupported = await navigator.xr.isSessionSupported('immersive-vr');
//   } else {
//     Parameters.xrSupported = false;
//   }

//   const isFullscreen = fullScreenMode && playerMode;

//   window.chainblocks.canvasHolder = document.getElementById("canvas-holder");

//   // remove old canvas if any
//   if (window.chainblocks.canvas) {
//     window.chainblocks.canvas.remove();
//   }

//   // create canvas for rendering
//   window.chainblocks.canvas = document.createElement("canvas");
//   window.chainblocks.canvas.id = "canvas";
//   window.addEventListener('resize', (e) => {
//     if (fullCanvasMode && window.chainblocks.canvas) {
//       window.chainblocks.canvas.style.width = window.chainblocks.canvasHolder.clientWidth + "px";
//       window.chainblocks.canvas.style.height = window.chainblocks.canvasHolder.clientHeight + "px";
//     }
//   });

//   var templateCode = "";
//   const width = isFullscreen ?
//     window.chainblocks.canvas.scrollWidth :
//     fullCanvasMode ?
//       window.chainblocks.canvasHolder.clientWidth :
//       Parameters.windowWidth;
//   const height = isFullscreen ?
//     window.chainblocks.canvas.scrollHeight :
//     fullCanvasMode ?
//       window.chainblocks.canvasHolder.clientHeight :
//       Parameters.windowHeight;
//   // we need to re-set those here
//   Parameters.windowWidth = width;
//   Parameters.windowHeight = height;
//   Parameters.windowFullscreen = isFullscreen;
//   const eparameters = toEDNStringFromSimpleObject(Parameters);
//   templateCode += "(def _parameters " + eparameters + ")\n";
//   templateCode += "(def _environment " + JSON.stringify(environment) + ")\n";
//   templateCode += window.chainblocks.mainScript;

//   // remove cbl if exists
//   if (window.chainblocks.instance) {
//     const PThread = window.chainblocks.instance.PThread;
//     if (PThread) {
//       // temrinate all threads that might be stuck from previous instance
//       // otherwise they will keep leaking
//       PThread.terminateAllThreads();
//       window.chainblocks.instance = undefined;
//     }
//   }

//   // setup cbl module
//   window.chainblocks.instance = await window.cbl({
//     wasmBinary: window.cbl_binary,
//     postRun: async function (module) {
//       window.chainblocks.loading = false;
//       window.chainblocks.canvasHolder.appendChild(window.chainblocks.canvas);

//       // gather blocks info from FS
//       const blocksInfo = module.FS.readFile("/.hasten/blocks-info", { encoding: 'utf8' });
//       window.chainblocks.blocksData = parseEDNString(
//         blocksInfo, {
//         mapAs: 'object',
//         listAs: 'array',
//         keywordAs: 'string'
//       });

//       // filter out internal blocks starting with _
//       setBlocksMetaData(window.chainblocks.blocksData.filter(info => !info.name.startsWith("_")));

//       // prompt for fullscreen
//       if (isFullscreen) {
//         const modal = document.getElementById("fs-modal");
//         const ok = document.getElementById("fs-modal-ok");
//         const failed = document.getElementById("fs-modal-no");
//         var acceptPromise = new Promise(function (resolve, reject) {
//           failed.onclick = function () {
//             modal.style.display = "none";
//             resolve(false);
//           }
//           ok.onclick = async function () {
//             modal.style.display = "none";
//             try {
//               await window.chainblocks.canvas.requestFullscreen();
//               resolve(true);
//             } catch (e) {
//               reject(e);
//             }
//           }
//         });
//         modal.style.display = "block";
//         await acceptPromise;
//       }

//       // run on a clean stack
//       setTimeout(function () {
//         // this should nicely coincide with the first (run-empty-forever)'s sleep
//         let node = module.dynCall_i(module.CBCore.createNode);
//         window.chainblocks.node = node;
//         const nameStr = module._malloc(5);
//         module.stringToUTF8("Main", nameStr, 5);
//         const mainChain = module.dynCall_ii(module.CBCore.getGlobalChain, nameStr);
//         module._free(nameStr);
//         module.dynCall_vii(module.CBCore.schedule, node, mainChain);
//         restartChainblocksRunloop();
//       }, 0);
//     },
//     preRun: async function (module) {
//       if (!playerMode) {
//         // TODO find a better solution that allows text inputs while editing too
//         module.ENV.SDL_EMSCRIPTEN_KEYBOARD_ELEMENT = "#canvas";
//       }
//       module.FS.mkdir("/.hasten/");
//       const wrapped = "(Chain \"UserMainLoop\" " + textCode + ")";
//       module.FS.writeFile("/.hasten/main.edn", wrapped);
//       if (binaryCode != null) {
//         var bytes = new Uint8Array(binaryCode.code);
//         module.FS.writeFile("/.hasten/binary-script", bytes);
//         if (binaryCode.environment) {
//           bytes = new Uint8Array(binaryCode.environment);
//           module.FS.writeFile("/.hasten/binary-environment", bytes);
//         }
//       }

//       // preload files
//       module.FS.mkdir("/preload");
//       module.FS.writeFile("/preload/entry.edn", templateCode);
//       // shaders library
//       module.FS.mkdir("/preload/shaders/");
//       module.FS.mkdir("/preload/shaders/lib");
//       module.FS.mkdir("/preload/shaders/lib/gltf");
//       // these are needed in this module as well, as we compose the shader
//       module.FS.createPreloadedFile("/preload/shaders/lib/gltf/", "ps_entry.h", "shaders/lib/gltf/ps_entry.h", true, false);
//       module.FS.createPreloadedFile("/preload/shaders/lib/gltf/", "vs_entry.h", "shaders/lib/gltf/vs_entry.h", true, false);
//       module.FS.createPreloadedFile("/preload/shaders/lib/gltf/", "varying.txt", "shaders/lib/gltf/varying.txt", true, false);
//       module.FS.mkdir("/preload/shaders/cache");
//       module.FS.mount(module.IDBFS, {}, "/preload/shaders/cache");
//       module.FS.mkdir("/preload/shaders/tmp");

//       // mount persistent storage
//       module.FS.mkdir("/storage");
//       module.FS.mount(module.IDBFS, {}, "/storage");

//       // grab from current storage
//       await new Promise((resolve, reject) => {
//         // true == populate from the DB
//         module.FS.syncfs(true, function (err) {
//           if (err !== null) {
//             reject(err);
//           } else {
//             resolve();
//           }
//         });
//       });

//       // start sync loop to allow persistent storage
//       if (window.chainblocks.syncfs) {
//         clearInterval(window.chainblocks.syncfs);
//       }
//       window.chainblocks.syncfs = setInterval(function () {
//         // false == write from mem to the DB
//         module.FS.syncfs(false, function (err) {
//           if (err)
//             throw err;
//         });
//       }, 2000);

//       window.chainblocks.previewScreenShot = function () {
//         const screenshotBytes = module.FS.readFile("/.hasten/screenshot.png");
//         saveByteArray("screenshot.png", screenshotBytes);
//       }

//       screenshotSetup();
//       videoCaptureSetup();
//     },
//     print: (function () {
//       return function (text) {
//         if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
//         if (text.includes("ERROR")) {
//           console.error(text);
//         } else {
//           console.info(text);
//         }
//         // let cd = document.getElementById("console").lastElementChild.lastElementChild;
//         // if (cd !== null)
//         //   cd.scrollIntoView();
//       };
//     })(),
//     printErr: function (text) {
//       if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
//       console.error(text);
//       // let cd = document.getElementById("console").lastElementChild.lastElementChild;
//       // if (cd !== null)
//       //   cd.scrollIntoView();
//     },
//     canvas: (function () {
//       // As a default initial behavior, pop up an alert when webgl context is lost. To make your
//       // application robust, you may want to override this behavior before shipping!
//       // See http://www.khronos.org/registry/webgl/specs/latest/1.0/#5.15.2
//       window.chainblocks.canvas.addEventListener("webglcontextlost", function (e) {
//         alert('WebGL context lost. You will need to reload the page.');
//         e.preventDefault();
//       }, false);

//       return window.chainblocks.canvas;
//     })(),
//     arguments: ["/preload/entry.edn"]
//   });
// }

// var chainblocksRunButtonSetter = null;

// function vrFrame(_time, frame) {
//   const module = window.chainblocks.instance;
//   const session = frame.session;
//   session.chainblocks.frame = frame;
//   session.chainblocks.nextFrame = session.requestAnimationFrame(vrFrame);

//   module.dynCall_ii(module.CBCore.tick, window.chainblocks.node);
//   // -1.0 to avoid calling the internal sleep
//   module.dynCall_vdi(module.CBCore.sleep, -1.0, true);
// };

// function regularFrame() {
//   const module = window.chainblocks.instance;
//   window.chainblocks.nextFrame = requestAnimationFrame(regularFrame);

//   module.dynCall_ii(module.CBCore.tick, window.chainblocks.node);
//   // -1.0 to avoid calling the internal sleep
//   module.dynCall_vdi(module.CBCore.sleep, -1.0, true);
// };

// function restartChainblocksRunloop() {
//   console.debug("Restarting chainblocks runloop.");

//   if (window.ChainblocksWebXRSession) {
//     const session = window.ChainblocksWebXRSession;
//     if (session.chainblocks.nextFrame)
//       session.cancelAnimationFrame(session.chainblocks.nextFrame);
//     session.chainblocks.nextFrame = null;
//   }

//   window.chainblocks.nextFrame = requestAnimationFrame(regularFrame);
// }

// function stopChainblocksRunloop() {
//   if (window.chainblocks.nextFrame) {
//     cancelAnimationFrame(window.chainblocks.nextFrame);
//     window.chainblocks.nextFrame = null;
//     chainblocksRunButtonSetter("Resume");
//   }
// }

// function startChainblocksRunloop() {
//   restartChainblocksRunloop();
//   chainblocksRunButtonSetter("Pause");
// }

// function toggleChainblocksRunloop() {
//   if (window.chainblocks &&
//     window.chainblocks.instance) {
//     if (window.chainblocks.nextFrame) {
//       stopChainblocksRunloop();
//     } else {
//       startChainblocksRunloop();
//     }
//   }
// }

// function propagateCodeChanges(code) {
//   if (window.chainblocks &&
//     window.chainblocks.instance &&
//     window.chainblocks.instance.FS &&
//     !window.chainblocks.codeChangedLock) {
//     window.chainblocks.codeChangedLock = true;
//     // the running chain
//     window.chainblocks.instance.FS.writeFile("/.hasten/main.edn", code);
//   } else {
//     if (window.codeChangedTimeout) {
//       clearTimeout(window.codeChangedTimeout);
//     }
//     window.codeChangedTimeout = setTimeout(() => propagateCodeChanges(code), 2000);
//   }
// }

// function codeChanged(code) {
//   window.localStorage.setItem("hasten-previous-script", code);
//   // propagate changes to the cbl environment
//   if (window.codeChangedTimeout) {
//     clearTimeout(window.codeChangedTimeout);
//   }
//   window.chainblocks.setCanUpload(false);
//   window.codeChangedTimeout = setTimeout(() => propagateCodeChanges(code), 2000);
//   return code;
// }

// function envChanged(code) {
//   window.localStorage.setItem("hasten-previous-environment", code);
// }

// function renderBlockInfoTooltip(r) {
//   return <React.Fragment>
//     <Typography variant="h5">{r.name}</Typography>
//     <Typography variant="body1">{r.info.help}</Typography>
//     <Typography variant="h6">{r.info.parameters.length > 0 ? "Parameters:" : ""}</Typography>
//     {r.info.parameters.map((v) => {
//       return <div key={v.name}>
//         <Typography variant="body1">{v.name}</Typography>
//         <Typography variant="body2">{v.help}</Typography>
//         <Typography variant="body2">{v.types}</Typography>
//       </div>
//     })}
//   </React.Fragment>
// }

// async function loadScriptFromEVM(rpc, explorer, url) {
//   try {
//     const web3 = new Web3(rpc);
//     const contract = new web3.Contract(code77Abi, code77);
//     // const refs = await contract.methods.referencesOf(url).call();
//     const code = await contract.methods.dataOf(url).call();
//     Parameters.owner = await contract.methods.ownerOf(url).call();
//     const binaryCode = {
//       code: Web3Utils.hexToBytes(code.immutableData).slice(25),
//       environment: Web3Utils.hexToBytes(code.mutableData).slice(33)
//     };
//     if (explorer)
//       ethExplorerURL = explorer;
//     return binaryCode;
//   } catch (e) {
//     console.error(e);
//   }
// }

// function App() {
//   const classesGrid = useStylesGrid();
//   const [getCode, setCode] = React.useState(!playerMode ? window.localStorage.getItem("hasten-previous-code") || "" : "");
//   const changeCode = (v) => {
//     setCode(v);
//     codeChanged(v);
//   };
//   const [blocksMetaData, setBlocksMetaData] = React.useState([]);
//   const [uploadButtonsDisabled, setUploadButtonsDisabled] = React.useState(true);
//   const [ipfsHash, setIpfsHash] = React.useState("");
//   const [scriptEnv, setScriptEnv] = React.useState(!playerMode ? window.localStorage.getItem("hasten-previous-environment") || "" : "");
//   const changeEnv = (v) => {
//     setScriptEnv(v);
//     envChanged(v);
//   };
//   const [ethProgramAddress, setEtherProgramAddress] = React.useState("");
//   const [shouldUploadEnv, setShouldUploadEnv] = React.useState(false);
//   const changeUploadEnv = (e) => {
//     setShouldUploadEnv(e.target.checked);
//   };
//   const getShouldUploadEnv = () => shouldUploadEnv;
//   const [canvasW, setCanvasW] = React.useState(Parameters.windowWidth);
//   const changeCanvasW = (e) => {
//     const val = e.target.value;
//     if (isNaN(val))
//       return;
//     setCanvasW(val);
//     Parameters.windowWidth = parseInt(val);
//     window.localStorage.setItem("hasten-previous-params", JSON.stringify(Parameters));
//   };
//   const [canvasH, setCanvasH] = React.useState(Parameters.windowHeight);
//   const changeCanvasH = (e) => {
//     const val = e.target.value;
//     if (isNaN(val))
//       return;
//     setCanvasH(val);
//     Parameters.windowHeight = parseInt(val);
//     window.localStorage.setItem("hasten-previous-params", JSON.stringify(Parameters));
//   };
//   const [metaName, setMetaName] = React.useState(Parameters.windowTitle);
//   const changeMetaName = (e) => {
//     setMetaName(e.target.value);
//     Parameters.windowTitle = e.target.value;
//     window.localStorage.setItem("hasten-previous-params", JSON.stringify(Parameters));
//   };
//   const [metaDesc, setMetaDesc] = React.useState(Parameters.windowDesc);
//   const changeMetaDesc = (e) => {
//     setMetaDesc(e.target.value);
//     Parameters.windowDesc = e.target.value;
//     window.localStorage.setItem("hasten-previous-params", JSON.stringify(Parameters));
//   };
//   const [runloopButton, setRunloopButton] = React.useState("Pause");
//   chainblocksRunButtonSetter = setRunloopButton;

//   React.useEffect(() => {
//     if (window.chainblocks.unlockCode === undefined) {
//       window.chainblocks.unlockCode = function () {
//         window.chainblocks.codeChangedLock = undefined;
//       }
//     }

//     window.chainblocks.setCanUpload = function (enabled) {
//       setUploadButtonsDisabled(!enabled);
//     };

//     if (window.ethereum) {
//       // silence the warning
//       window.ethereum.autoRefreshOnNetworkChange = false;
//     }
//   }, []);

//   function screenShotRequest() {
//     window.chainblocks.screenShotRequest();
//   };

//   function videoCaptureRequest() {
//     if (window.chainblocks.recording)
//       return;
//     window.chainblocks.recording = true;
//     const stream = window.chainblocks.canvas.captureStream(30);
//     const recorder = new MediaRecorder(stream, {
//       audioBitsPerSecond: 128000,
//       videoBitsPerSecond: 5000000,
//       mimeType: 'video/webm'
//     });
//     var chunks = [];
//     recorder.ondataavailable = function (e) {
//       chunks.push(e.data);
//     }
//     recorder.onstop = async function () {
//       const blob = new Blob(chunks, { 'type': 'video/webm' });
//       chunks = [];
//       const buffer = await blob.arrayBuffer();
//       window.chainblocks.instance.FS.writeFile("/.hasten/recorded-canvas-video.webm", new Uint8Array(buffer));
//       window.chainblocks.resolveVideoCapturePromise();
//       window.chainblocks.videoObjUrl = URL.createObjectURL(blob);
//     };
//     recorder.start();
//     setTimeout(function () {
//       recorder.stop();
//       window.chainblocks.recording = false;
//     }, 5000);
//   }

//   async function uploadToIpfs(getEnvState) {
//     const withEnv = getEnvState();

//     const payload = {
//       code: getCode,
//       environment: withEnv ? scriptEnv : "",
//       parameters: Parameters
//     };

//     const hash = await severalGatewaysPush(payload);

//     setIpfsHash(hash);
//   }

//   async function uploadToEth() {
//     const ethId = window.chainblocks.instance.FS.readFile("/.hasten/live-chain-eth-id", { encoding: 'utf8' });

//     const metadata = {
//       name: Parameters.windowTitle,
//       description: Parameters.windowDesc,
//       image: "ipfs://" + Parameters.videoCid || Parameters.screenshotCid,
//       external_url: "https://" + Parameters.version.replace(".", "-") + ".hasten.app/?eth=" + ethId,
//     };
//     const cid = await severalGatewaysPush(metadata);
//     const bcid = base58_to_binary(cid).slice(2);
//     console.log("ETH NFT metadata CID:", cid);

//     await window.ethereum.request({ method: 'eth_requestAccounts' });
//     const provider = await detectEthereumProvider();
//     const web3 = new Web3(provider);
//     const contract = new web3.Contract(code77Abi, code77);

//     const tx = await (async () => {
//       const bytes = window.chainblocks.instance.FS.readFile("/.hasten/live-chain-binary");
//       const envBytes = window.chainblocks.instance.FS.readFile("/.hasten/live-chain-env-binary");
//       return await contract.methods.upload(
//         Web3Utils.bytesToHex(bcid),
//         Web3Utils.bytesToHex(bytes),
//         Web3Utils.bytesToHex(envBytes),
//         [],
//         0).send({ from: window.ethereum.selectedAddress });
//     })();

//     const modal = document.getElementById("eth-modal");
//     const ok = document.getElementById("eth-modal-ok");
//     ok.onclick = async function () {
//       modal.style.display = "none";
//     }
//     modal.style.display = "block";

//     if (tx.status) {
//       const address = tx.events[0].raw.topics[3];
//       setEtherProgramAddress(address);
//     } else {
//       setEtherProgramAddress("Upload failed.");
//     }
//   }

//   async function applyEnv() {
//     chainblocksRunButtonSetter("Pause");
//     await reloadCBL(getCode, null, setBlocksMetaData, scriptEnv);
//   }

//   React.useEffect(() => {
//     (async () => {
//       // This is run on page load
//       var code = "";
//       var env = "";
//       var binaryCode = null;

//       const ipfsUrl = pageParams.get("ipfs");

//       const flowUrl = pageParams.get("flow");

//       for (const [key, value] of Object.entries(evmProviders)) {
//         const url = pageParams.get(key);
//         if (url) {
//           Parameters.ethProvider = value.rpc;
//           binaryCode = await loadScriptFromEVM(value.rpc, value.explorer, url);
//           break;
//         }
//       }

//       const metamaskUrl = pageParams.get("mm");
//       if (metamaskUrl) {
//         await window.ethereum.request({ method: 'eth_requestAccounts' });
//         const provider = await detectEthereumProvider();
//         binaryCode = await loadScriptFromEVM(provider, null, metamaskUrl);
//       }

//       if (ipfsUrl) {
//         // try multiple nodes
//         for (const node of ipfsNodes) {
//           try {
//             const payload = await node.catJSON(ipfsUrl);
//             if (payload.parameters) {
//               // copy relevant parameters
//               Parameters.windowTitle = payload.parameters.windowTitle || Parameters.windowTitle;
//               Parameters.windowDesc = payload.parameters.windowDesc || Parameters.windowDesc;
//               Parameters.windowWidth = payload.parameters.windowWidth || Parameters.windowWidth;
//               Parameters.windowHeight = payload.parameters.windowHeight || Parameters.windowHeight;
//             }
//             code = payload.code;
//             env = payload.environment;
//             break;
//           } catch (e) {
//           }
//         }
//         if (code == null) {
//           const msg = "; Loading from IPFS failed"
//           codeChanged(msg);
//         } else {
//           codeChanged(code);
//           envChanged(env);
//         }
//       } else if (flowUrl) {
//         const scriptBin = await fcl.send([
//           fcl.script`
//               import IHastenScript from 0xIHastenScript
//               import HastenIndex from 0xHastenIndex
//               import HastenUtility from 0xHastenUtility

//               pub fun main(hexId: String): Address? {
//                 let hashId = HastenUtility.hexToId(hex: hexId)
//                 let source = getAccount(HastenUtility.ownerAddress())
//                 let index = source.getCapability<&{HastenIndex.Index}>(/public/HastenIndex).borrow() ?? panic("Could not borrow the index")
//                 let script = index.find(hashId: hashId)
//                 return script!.getCode()
//               }
//             `, fcl.args([fcl.arg(flowUrl, ftype.String)])]).then(fcl.decode);

//         binaryCode = {
//           code: scriptBin,
//           environment: null
//         };
//       } else if (!playerMode) {
//         code = window.localStorage.getItem("hasten-previous-script") || "";
//         env = window.localStorage.getItem("hasten-previous-environment") || "";
//       }

//       if (code === "") {
//         if (window._cbl_sample_code === undefined) {
//           const body = await fetch("main.edn");
//           window._cbl_sample_code = await body.text();
//         }
//         code = window._cbl_sample_code;
//         env = "";
//       }

//       window.chainblocks.urlScriptChanged = function () {
//         console.debug("Loading from URL...");
//         const code = window.chainblocks.instance.FS.readFile("/.hasten/main.edn", { encoding: 'utf8' });
//         setCode(code);
//         codeChanged(code);
//       };

//       window.chainblocks.ethScriptChanged = function () {
//         const code = window.chainblocks.instance.FS.readFile("/.hasten/binary-script-unpacked", { encoding: 'utf8' });
//         console.log(code);
//         const env = JSON.parse(
//           window.chainblocks.instance.FS.readFile("/.hasten/binary-environment-unpacked", { encoding: 'utf8' }));
//         console.log(env);
//         Parameters.windowWidth = env.w;
//         Parameters.windowHeight = env.h;
//         Parameters.windowTitle = env.t;
//         setCanvasW(env.w);
//         setCanvasH(env.h);
//         // TODO do something with version, env.v
//         reloadCBL(code, null, setBlocksMetaData, env.e);
//       };

//       if (!binaryCode && !playerMode) {
//         setCode(code);
//         codeChanged(code);
//         setScriptEnv(env);
//         envChanged(env);
//       }

//       // expose reloadCBL
//       window.chainblocks.reloadCBL = reloadCBL;

//       // webxr hook
//       window.ChainblocksWebXROpenDialog = function (near, far) {
//         const modal = document.getElementById("vr-modal");
//         const ok = document.getElementById("vr-modal-ok");
//         const failed = document.getElementById("vr-modal-no");
//         var acceptPromise = new Promise(function (resolve, _reject) {
//           failed.onclick = function () {
//             modal.style.display = "none";
//             resolve(null);
//           }
//           ok.onclick = async function () {
//             try {
//               let session = await navigator.xr.requestSession('immersive-vr', {
//                 requiredFeatures: ['local-floor']
//               });
//               session.chainblocks = {};
//               window.chainblocks.canvasHolder.removeChild(window.chainblocks.canvas);
//               let gl = window.chainblocks.canvas.getContext('webgl2'); // this is our already created bgfx context
//               session.chainblocks.glcontext = gl;
//               if (typeof CustomWebXRPolyfill === "undefined") {
//                 // WebXR API Emulator has/had issues with this.
//                 // https://github.com/MozillaReality/WebXR-emulator-extension/issues/266
//                 await gl.makeXRCompatible();
//               }
//               /*global XRWebGLLayer*/
//               /*eslint no-undef: "error"*/
//               let layer = new XRWebGLLayer(session, gl); // if we are here we know it's defined
//               session.updateRenderState({
//                 baseLayer: layer,
//                 depthFar: far,
//                 depthNear: near
//               });

//               modal.style.display = "none";

//               // end event won't trigger due to our setup I think, so let's make our call
//               session.chainblocks.cleanup = restartChainblocksRunloop;
//               session.chainblocks.warmup = function () {
//                 console.debug("WebXR enabled");
//                 // start the new VR runloop
//                 // stop current runloop
//                 if (window.chainblocks.nextFrame) {
//                   cancelAnimationFrame(window.chainblocks.nextFrame);
//                   window.chainblocks.nextFrame = null;
//                 }
//                 session.chainblocks.nextFrame = session.requestAnimationFrame(vrFrame);
//               };

//               console.debug("WebXR initialized");

//               resolve(session);
//             } catch (err) {
//               console.error(err);
//               modal.style.display = "none";
//               resolve(null);
//             }
//           }
//         });
//         modal.style.display = "block";
//         return acceptPromise;
//       }

//       // use mt if possible
//       // cache wasm module
//       if (window.cbl_binary === undefined) {
//         var cblScript = "cbl-st.js";
//         if (!singleThreadMode && typeof SharedArrayBuffer !== "undefined" && typeof Atomics !== "undefined") {
//           cblScript = "cbl-mt.js";
//           const response = await fetch("cbl-mt.wasm");
//           const buffer = await response.arrayBuffer();
//           window.cbl_binary = new Uint8Array(buffer);
//         } else {
//           const response = await fetch("cbl-st.wasm");
//           const buffer = await response.arrayBuffer();
//           window.cbl_binary = new Uint8Array(buffer);
//         }
//       }

//       // load cbl
//       const cbl = document.createElement("script");
//       cbl.src = cblScript;
//       cbl.async = true;
//       cbl.onload = async function () {
//         // finally start cbl
//         await reloadCBL(code, binaryCode, setBlocksMetaData, env);
//       };
//       document.body.appendChild(cbl);
//     })();
//   }, []);

//   const commandsMock = [
//     {
//       name: "myReactAceTest",
//       bindKey: { win: "Ctrl-M", mac: "Command-M" },
//       exec: () => { },
//       readOnly: true
//     },
//     {
//       name: "myTestCommand",
//       bindKey: { win: "Ctrl-W", mac: "Command-W" },
//       exec: () => { },
//       readOnly: true
//     }
//   ];

//   const [order, setOrder] = React.useState('asc');
//   const [orderBy, setOrderBy] = React.useState('name');
//   const [page, setPage] = React.useState(0);
//   const [rowsPerPage, setRowsPerPage] = React.useState(10);

//   const handleRequestSort = (_event, property) => {
//     const isAsc = orderBy === property && order === 'asc';
//     setOrder(isAsc ? 'desc' : 'asc');
//     setOrderBy(property);
//   };

//   const handleChangePage = (_event, newPage) => {
//     setPage(newPage);
//   };

//   const handleChangeRowsPerPage = (event) => {
//     setRowsPerPage(parseInt(event.target.value, 10));
//     setPage(0);
//   };

//   const renderer = playerMode ? renderPlayer : renderEditor;

//   return (
//     renderer()
//   );

//   function renderEditor() {
//     return <div className={classesGrid.root}>
//       <Grid
//         justify="flex-start"
//         alignItems="flex-start"
//         spacing={1}
//         container>
//         <Grid item sm={6} xs={12}>
//           <Paper className={classesGrid.paper}>
//             <Box>
//               {codeEditor(changeCode, getCode, "60vh")}
//             </Box>
//           </Paper>
//         </Grid>
//         <Grid item sm={6} xs={12}>
//           <Paper className={classesGrid.paper}>
//             <Box height="60vh">
//               <div id="canvas-holder" style={{ height: "100%", backgroundColor: "#101010" }}>
//                 {modalPanel2("vr-modal", "This program requests to use your VR device, do you accept?", "Yes", "No")}
//                 {modalPanel1("eth-modal", ethProgramAddress, "Ok")}
//                 {loadingScreen()}
//               </div>
//             </Box>
//           </Paper>
//         </Grid>
//         <Grid item xs={3}>
//           <Paper className={classesGrid.paper}>
//             <Box>
//               <TableContainer component={Paper}>
//                 <Table className={classesGrid.table} aria-label="simple table">
//                   <EnhancedTableHead
//                     classes={classesGrid}
//                     order={order}
//                     orderBy={orderBy}
//                     onRequestSort={handleRequestSort} />
//                   <TableBody>
//                     {stableSort(Array.isArray(blocksMetaData) ? blocksMetaData : [], getComparator(order, orderBy))
//                       .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
//                       .map((row, index) => {
//                         const labelId = `enhanced-table-checkbox-${index}`;
//                         return (
//                           <Tooltip title={renderBlockInfoTooltip(row)} key={row.name}>
//                             <TableRow
//                               hover
//                               role="checkbox"
//                               tabIndex={-1}
//                             >
//                               <TableCell component="th" id={labelId} scope="row" padding="none">{row.name}</TableCell>
//                               <TableCell align="right" size="small">{row.info.inputTypes}</TableCell>
//                               <TableCell align="right" size="small">{row.info.outputTypes}</TableCell>
//                             </TableRow>
//                           </Tooltip>
//                         );
//                       })}
//                   </TableBody>
//                 </Table>
//               </TableContainer>
//               <TablePagination
//                 className={classesGrid.table}
//                 size="small"
//                 rowsPerPageOptions={[10, 25]}
//                 component="div"
//                 count={(Array.isArray(blocksMetaData) ? blocksMetaData : []).length}
//                 rowsPerPage={rowsPerPage}
//                 page={page}
//                 onChangePage={handleChangePage}
//                 onChangeRowsPerPage={handleChangeRowsPerPage} />
//             </Box>
//             <a href="https://github.com/sinkingsugar/chainblocks/wiki" target="_blank" rel="noreferrer">
//               <Typography variant="body">For more information check the Chainblocks wiki.</Typography>
//             </a>
//           </Paper>
//         </Grid>
//         <Grid item xs={3}>
//           <Paper className={classesGrid.paper}>
//             <Paper className={classesGrid.paper}>
//               <ButtonGroup size="small" aria-label="small outlined button group">
//                 <Button onClick={toggleChainblocksRunloop}>{runloopButton}</Button>
//                 <Button onClick={applyEnv}>Reset</Button>
//               </ButtonGroup>
//             </Paper>
//             <Paper className={classesGrid.paper}>
//               <ButtonGroup size="small" aria-label="small outlined button group">
//                 <Button
//                   onClick={screenShotRequest}
//                 >Take screenshot</Button>
//                 <Button
//                   onClick={videoCaptureRequest}
//                 >Capture short video</Button>
//               </ButtonGroup>
//               <br />
//               <Typography variant="caption">Remember to take a preview screenshot or video before minting an NFT.</Typography>
//             </Paper>
//             {renderScreenshot()}
//             <Paper>
//               <Typography variant="subtitle1">Upload and save</Typography>
//               <FormControlLabel
//                 control={<Checkbox checked={shouldUploadEnv} onChange={changeUploadEnv} />}
//                 label="with environment" />
//               <br />
//               <ButtonGroup disabled={uploadButtonsDisabled} size="small" aria-label="small outlined button group">
//                 <Button onClick={() => uploadToIpfs(getShouldUploadEnv)}>IPFS</Button>
//               </ButtonGroup>
//               <br />
//               <a href={"https://ipfs.io/ipfs/" + ipfsHash}>
//                 <TextField InputLabelProps={{ shrink: true }} fullWidth={true} disabled={true} value={ipfsHash} label="IPFS Hash" />
//               </a>
//             </Paper>
//             <Paper className={classesGrid.paper}>
//               <Typography variant="subtitle1">Mint NFT</Typography>
//               <Typography variant="caption">Contracts deployed on Ethereum, Avalanche, Polygon, Binance Smart Chain and Flow</Typography>
//               <br />
//               <ButtonGroup disabled={uploadButtonsDisabled} size="small" aria-label="small outlined button group">
//                 <Button onClick={() => uploadToEth()}>Metamask</Button>
//                 <Button onClick={() => uploadToFlow(getShouldUploadEnv)}>Flow</Button>
//               </ButtonGroup>
//             </Paper>
//             <Paper>
//               <Typography variant="h6">Metadata</Typography>
//               <TextField
//                 variant="outlined"
//                 size="small"
//                 InputLabelProps={{ shrink: true }}
//                 value={metaName}
//                 label="Name"
//                 onChange={changeMetaName}
//               />
//               <TextField
//                 variant="outlined"
//                 size="small"
//                 InputLabelProps={{ shrink: true }}
//                 value={metaDesc}
//                 label="Description"
//                 onChange={changeMetaDesc}
//               />
//               <Typography variant="h6">Parameters</Typography>
//               <TextField
//                 variant="outlined"
//                 size="small"
//                 InputLabelProps={{ shrink: true }}
//                 value={canvasW}
//                 label="Canvas Width"
//                 onChange={changeCanvasW}
//               />
//               <TextField
//                 variant="outlined"
//                 size="small"
//                 InputLabelProps={{ shrink: true }}
//                 value={canvasH}
//                 label="Canvas Height"
//                 onChange={changeCanvasH}
//               />
//               <Typography variant="h6">Environment</Typography>
//               {codeEditor(changeEnv, scriptEnv, "100px", {
//                 wrap: true,
//                 showLineNumbers: false,
//                 showGutter: false
//               })}
//               <Button className={classesGrid.root} variant="outlined" onClick={applyEnv}>Apply</Button>
//             </Paper>
//           </Paper>
//         </Grid>
//         <Grid item sm={6} xs={12}>
//           <Paper className={classesGrid.paper}>
//             <Box height="35vh">
//               <Terminal
//                 watchConsoleLogging
//                 showActions={false}
//                 hideTopBar={true}
//                 allowTabs={false}
//                 startState="maximised"
//                 style={{ fontWeight: "bold", fontSize: "1em", maxHeight: "35vh" }}
//               />
//             </Box>
//           </Paper>
//         </Grid>
//       </Grid>
//     </div>;
//   }

//   function renderPlayer() {
//     const taintStr = window.chainblocks.tainted ? "No" : "Yes";
//     function owner() {
//       if (Parameters.owner) {
//         const uri = ethExplorerURL + Parameters.owner;
//         return <div>
//           <Typography variant="h6">Owner: <a href={uri}>{Parameters.owner}</a></Typography>
//           <Typography variant="h6">All data is stored on chain: {taintStr}.</Typography>
//           <Typography variant="h6">For sale: no.</Typography>
//           <Tooltip title="Windows, macOS, Linux in a single executable file. Only owners can perform this action."><Typography variant="h6">Native platforms export: (work in progress)</Typography></Tooltip>
//           <Button id="build-native-binary" disabled={true}>build</Button>
//         </div>
//       } else {
//         return null;
//       }
//     }

//     return <div className={classesGrid.root}>
//       <Paper className={classesGrid.paper}>
//         <Box height={canvasH}>
//           <div id="canvas-holder" style={{ height: "100%", background: "#101010" }}>
//             {modalPanel2("vr-modal", "This script requests to use your VR device, do you accept?", "Yes", "No")}
//             {modalPanel2("fs-modal", "This script requests to run in fullscreen mode, do you accept?", "Yes", "No")}
//             {modalPanel1("eth-modal", ethProgramAddress, "Ok")}
//             {loadingScreen()}
//           </div>
//         </Box>
//         {owner()}
//       </Paper>
//     </div>;
//   }

//   function renderScreenshot() {
//     if (window.chainblocks.videoObjUrl) {
//       return <Paper className={classesGrid.paper}>
//         <a href={window.chainblocks.videoObjUrl} download="capture.webm">
//           <video loop autoPlay alt="video" style={{ width: "128px" }} id="video-img">
//             <source src={window.chainblocks.videoObjUrl} type="video/webm" />
//           </video>
//         </a>
//       </Paper>;
//     } else if (window.chainblocks.screenshotObjUrl) {
//       return <Paper className={classesGrid.paper}>
//         <a href={window.chainblocks.screenshotObjUrl} download="screenshot.png">
//           <img alt="screenshot" style={{ width: "128px" }} id="screenshot-img" src={window.chainblocks.screenshotObjUrl} />
//         </a>
//       </Paper>;
//     } else {
//       return null;
//     }
//   }

//   function loadingScreen() {
//     if (window.chainblocks.loading) {
//       return <img height="100%" src="loading.png" alt="loading..."></img>
//     } else {
//       return null;
//     }
//   }

//   function modalPanel1(id, text, yes) {
//     return <div id={id} className="modal">
//       <div className="modal-content">
//         <p>{text}</p>
//         <button id={id + "-ok"}>{yes}</button>
//       </div>
//     </div>;
//   }

//   function modalPanel2(id, text, yes, no) {
//     return <div id={id} className="modal">
//       <div className="modal-content">
//         <p>{text}</p>
//         <button id={id + "-ok"}>{yes}</button>
//         <button id={id + "-no"}> {no}</button>
//       </div>
//     </div>;
//   }

//   function codeEditor(setter, getter, height, options) {
//     return <AceEditor
//       mode="clojure"
//       theme="monokai"
//       onChange={setter}
//       name="sourcecode"
//       value={getter}
//       editorProps={{ $blockScrolling: true }}
//       setOptions={Object.assign(options || {}, {
//         showPrintMargin: false
//       })}
//       width="100%"
//       height={height}
//       tabSize={2}
//       fontSize="12px"
//       commands={commandsMock}
//     />;
//   }
// }

// export default App;
