// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module !== 'undefined' ? Module : {};

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)
// {{PRE_JSES}}

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
var key;
for (key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

Module['arguments'] = [];
Module['thisProgram'] = './this.program';
Module['quit'] = function(status, toThrow) {
  throw toThrow;
};
Module['preRun'] = [];
Module['postRun'] = [];

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).

var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = true;
var ENVIRONMENT_IS_SHELL = false;

if (Module['ENVIRONMENT']) {
  throw new Error('Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -s ENVIRONMENT=web or -s ENVIRONMENT=node)');
}

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

assert(typeof Module['memoryInitializerPrefixURL'] === 'undefined', 'Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['pthreadMainPrefixURL'] === 'undefined', 'Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['cdInitializerPrefixURL'] === 'undefined', 'Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['filePackagePrefixURL'] === 'undefined', 'Module.filePackagePrefixURL option was removed, use Module.locateFile instead');

// `/` should be present at the end if `scriptDirectory` is not empty
var scriptDirectory = '';
function locateFile(path) {
  if (Module['locateFile']) {
    return Module['locateFile'](path, scriptDirectory);
  } else {
    return scriptDirectory + path;
  }
}

if (ENVIRONMENT_IS_NODE) {
  scriptDirectory = __dirname + '/';
  if (!(typeof process === 'object' && typeof require === 'function')) throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  var nodeFS;
  var nodePath;

  Module['read'] = function shell_read(filename, binary) {
    var ret;
    ret = tryParseAsDataURI(filename);
    if (!ret) {
      if (!nodeFS) nodeFS = require('fs');
      if (!nodePath) nodePath = require('path');
      filename = nodePath['normalize'](filename);
      ret = nodeFS['readFileSync'](filename);
    }
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  if (process['argv'].length > 1) {
    Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });
  // Currently node will swallow unhandled rejections, but this behavior is
  // deprecated, and in the future it will exit with error status.
  process['on']('unhandledRejection', function(reason, p) {
    err('node.js exiting due to unhandled promise rejection');
    process['exit'](1);
  });

  Module['quit'] = function(status) {
    process['exit'](status);
  };

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
} else
{
  throw new Error('environment detection error');
}

// Set up the out() and err() hooks, which are how we can print to stdout or
// stderr, respectively.
// If the user provided Module.print or printErr, use that. Otherwise,
// console.log is checked first, as 'print' on the web will open a print dialogue
// printErr is preferable to console.warn (works better in shells)
// bind(console) is necessary to fix IE/Edge closed dev tools panel behavior.
var out = Module['print'] || (typeof console !== 'undefined' ? console.log.bind(console) : (typeof print !== 'undefined' ? print : null));
var err = Module['printErr'] || (typeof printErr !== 'undefined' ? printErr : ((typeof console !== 'undefined' && console.warn.bind(console)) || out));

// Merge back in the overrides
for (key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

var STACK_ALIGN = 16;

// stack management, and other functionality that is provided by the compiled code,
// should not be used before it is ready
stackSave = stackRestore = stackAlloc = setTempRet0 = getTempRet0 = function() {
  abort('cannot use the stack before compiled code is ready to run, and has provided stack access');
};

function staticAlloc(size) {
  assert(!staticSealed);
  var ret = STATICTOP;
  STATICTOP = (STATICTOP + size + 15) & -16;
  assert(STATICTOP < TOTAL_MEMORY, 'not enough memory for static allocation - increase TOTAL_MEMORY');
  return ret;
}

function dynamicAlloc(size) {
  assert(DYNAMICTOP_PTR);
  var ret = HEAP32[DYNAMICTOP_PTR>>2];
  var end = (ret + size + 15) & -16;
  HEAP32[DYNAMICTOP_PTR>>2] = end;
  if (end >= TOTAL_MEMORY) {
    var success = enlargeMemory();
    if (!success) {
      HEAP32[DYNAMICTOP_PTR>>2] = ret;
      return 0;
    }
  }
  return ret;
}

function alignMemory(size, factor) {
  if (!factor) factor = STACK_ALIGN; // stack alignment (16-byte) by default
  var ret = size = Math.ceil(size / factor) * factor;
  return ret;
}

function getNativeTypeSize(type) {
  switch (type) {
    case 'i1': case 'i8': return 1;
    case 'i16': return 2;
    case 'i32': return 4;
    case 'i64': return 8;
    case 'float': return 4;
    case 'double': return 8;
    default: {
      if (type[type.length-1] === '*') {
        return 4; // A pointer
      } else if (type[0] === 'i') {
        var bits = parseInt(type.substr(1));
        assert(bits % 8 === 0);
        return bits / 8;
      } else {
        return 0;
      }
    }
  }
}

function warnOnce(text) {
  if (!warnOnce.shown) warnOnce.shown = {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    err(text);
  }
}

var asm2wasmImports = { // special asm2wasm imports
    "f64-rem": function(x, y) {
        return x % y;
    },
    "debugger": function() {
        debugger;
    }
};



var jsCallStartIndex = 1;
var functionPointers = new Array(0);

// 'sig' parameter is only used on LLVM wasm backend
function addFunction(func, sig) {
  if (typeof sig === 'undefined') {
    err('warning: addFunction(): You should provide a wasm function signature string as a second argument. This is not necessary for asm.js and asm2wasm, but is required for the LLVM wasm backend, so it is recommended for full portability.');
  }
  var base = 0;
  for (var i = base; i < base + 0; i++) {
    if (!functionPointers[i]) {
      functionPointers[i] = func;
      return jsCallStartIndex + i;
    }
  }
  throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
}

function removeFunction(index) {
  functionPointers[index-jsCallStartIndex] = null;
}

var funcWrappers = {};

function getFuncWrapper(func, sig) {
  if (!func) return; // on null pointer, return undefined
  assert(sig);
  if (!funcWrappers[sig]) {
    funcWrappers[sig] = {};
  }
  var sigCache = funcWrappers[sig];
  if (!sigCache[func]) {
    // optimize away arguments usage in common cases
    if (sig.length === 1) {
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func);
      };
    } else if (sig.length === 2) {
      sigCache[func] = function dynCall_wrapper(arg) {
        return dynCall(sig, func, [arg]);
      };
    } else {
      // general case
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func, Array.prototype.slice.call(arguments));
      };
    }
  }
  return sigCache[func];
}


function makeBigInt(low, high, unsigned) {
  return unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0));
}

function dynCall(sig, ptr, args) {
  if (args && args.length) {
    assert(args.length == sig.length-1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
  } else {
    assert(sig.length == 1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].call(null, ptr);
  }
}


function getCompilerSetting(name) {
  throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for getCompilerSetting or emscripten_get_compiler_setting to work';
}

var Runtime = {
  // FIXME backwards compatibility layer for ports. Support some Runtime.*
  //       for now, fix it there, then remove it from here. That way we
  //       can minimize any period of breakage.
  dynCall: dynCall, // for SDL2 port
  // helpful errors
  getTempRet0: function() { abort('getTempRet0() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  staticAlloc: function() { abort('staticAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  stackAlloc: function() { abort('stackAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
};

// The address globals begin at. Very low in memory, for code size and optimization opportunities.
// Above 0 is static memory, starting with globals.
// Then the stack.
// Then 'dynamic' memory for sbrk.
var GLOBAL_BASE = 8;


// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html


function getSafeHeapType(bytes, isFloat) {
  switch (bytes) {
    case 1: return 'i8';
    case 2: return 'i16';
    case 4: return isFloat ? 'float' : 'i32';
    case 8: return 'double';
    default: assert(0);
  }
}


function SAFE_HEAP_STORE(dest, value, bytes, isFloat) {
  if (dest <= 0) abort('segmentation fault storing ' + bytes + ' bytes to address ' + dest);
  if (dest % bytes !== 0) abort('alignment error storing to address ' + dest + ', which was expected to be aligned to a multiple of ' + bytes);
  if (staticSealed) {
    if (dest + bytes > HEAP32[DYNAMICTOP_PTR>>2]) abort('segmentation fault, exceeded the top of the available dynamic heap when storing ' + bytes + ' bytes to address ' + dest + '. STATICTOP=' + STATICTOP + ', DYNAMICTOP=' + HEAP32[DYNAMICTOP_PTR>>2]);
    assert(DYNAMICTOP_PTR);
    assert(HEAP32[DYNAMICTOP_PTR>>2] <= TOTAL_MEMORY);
  } else {
    if (dest + bytes > STATICTOP) abort('segmentation fault, exceeded the top of the available static heap when storing ' + bytes + ' bytes to address ' + dest + '. STATICTOP=' + STATICTOP);
  }
  setValue(dest, value, getSafeHeapType(bytes, isFloat), 1);
}
function SAFE_HEAP_STORE_D(dest, value, bytes) {
  SAFE_HEAP_STORE(dest, value, bytes, true);
}

function SAFE_HEAP_LOAD(dest, bytes, unsigned, isFloat) {
  if (dest <= 0) abort('segmentation fault loading ' + bytes + ' bytes from address ' + dest);
  if (dest % bytes !== 0) abort('alignment error loading from address ' + dest + ', which was expected to be aligned to a multiple of ' + bytes);
  if (staticSealed) {
    if (dest + bytes > HEAP32[DYNAMICTOP_PTR>>2]) abort('segmentation fault, exceeded the top of the available dynamic heap when loading ' + bytes + ' bytes from address ' + dest + '. STATICTOP=' + STATICTOP + ', DYNAMICTOP=' + HEAP32[DYNAMICTOP_PTR>>2]);
    assert(DYNAMICTOP_PTR);
    assert(HEAP32[DYNAMICTOP_PTR>>2] <= TOTAL_MEMORY);
  } else {
    if (dest + bytes > STATICTOP) abort('segmentation fault, exceeded the top of the available static heap when loading ' + bytes + ' bytes from address ' + dest + '. STATICTOP=' + STATICTOP);
  }
  var type = getSafeHeapType(bytes, isFloat);
  var ret = getValue(dest, type, 1);
  if (unsigned) ret = unSign(ret, parseInt(type.substr(1)), 1);
  return ret;
}
function SAFE_HEAP_LOAD_D(dest, bytes, unsigned) {
  return SAFE_HEAP_LOAD(dest, bytes, unsigned, true);
}

function SAFE_FT_MASK(value, mask) {
  var ret = value & mask;
  if (ret !== value) {
    abort('Function table mask error: function pointer is ' + value + ' which is masked by ' + mask + ', the likely cause of this is that the function pointer is being called by the wrong type.');
  }
  return ret;
}

function segfault() {
  abort('segmentation fault');
}
function alignfault() {
  abort('alignment fault');
}
function ftfault() {
  abort('Function table mask error');
}

//========================================
// Runtime essentials
//========================================

// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS = 0;

/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
  return func;
}

var JSfuncs = {
  // Helpers for cwrap -- it can't refer to Runtime directly because it might
  // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
  // out what the minified function name is.
  'stackSave': function() {
    stackSave()
  },
  'stackRestore': function() {
    stackRestore()
  },
  // type conversion from js to c
  'arrayToC' : function(arr) {
    var ret = stackAlloc(arr.length);
    writeArrayToMemory(arr, ret);
    return ret;
  },
  'stringToC' : function(str) {
    var ret = 0;
    if (str !== null && str !== undefined && str !== 0) { // null string
      // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
      var len = (str.length << 2) + 1;
      ret = stackAlloc(len);
      stringToUTF8(str, ret, len);
    }
    return ret;
  }
};

// For fast lookup of conversion functions
var toC = {
  'string': JSfuncs['stringToC'], 'array': JSfuncs['arrayToC']
};


// C calling interface.
function ccall(ident, returnType, argTypes, args, opts) {
  function convertReturnValue(ret) {
    if (returnType === 'string') return Pointer_stringify(ret);
    if (returnType === 'boolean') return Boolean(ret);
    return ret;
  }

  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  assert(returnType !== 'array', 'Return type should not be "array".');
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func.apply(null, cArgs);
  ret = convertReturnValue(ret);
  if (stack !== 0) stackRestore(stack);
  return ret;
}

function cwrap(ident, returnType, argTypes, opts) {
  return function() {
    return ccall(ident, returnType, argTypes, arguments, opts);
  }
}

/** @type {function(number, number, string, boolean=)} */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
  if (noSafe) {
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= (+1) ? (tempDouble > (+0) ? ((Math_min((+(Math_floor((tempDouble)/(+4294967296)))), (+4294967295)))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/(+4294967296))))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
  } else {
    switch(type) {
      case 'i1': SAFE_HEAP_STORE(((ptr)|0), ((value)|0), 1); break;
      case 'i8': SAFE_HEAP_STORE(((ptr)|0), ((value)|0), 1); break;
      case 'i16': SAFE_HEAP_STORE(((ptr)|0), ((value)|0), 2); break;
      case 'i32': SAFE_HEAP_STORE(((ptr)|0), ((value)|0), 4); break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= (+1) ? (tempDouble > (+0) ? ((Math_min((+(Math_floor((tempDouble)/(+4294967296)))), (+4294967295)))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/(+4294967296))))))>>>0) : 0)],SAFE_HEAP_STORE(((ptr)|0), ((tempI64[0])|0), 4),SAFE_HEAP_STORE((((ptr)+(4))|0), ((tempI64[1])|0), 4)); break;
      case 'float': SAFE_HEAP_STORE_D(((ptr)|0), (+(value)), 4); break;
      case 'double': SAFE_HEAP_STORE_D(((ptr)|0), (+(value)), 8); break;
      default: abort('invalid type for setValue: ' + type);
    }
  }
}

/** @type {function(number, string, boolean=)} */
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
  if (noSafe) {
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for getValue: ' + type);
    }
  } else {
    switch(type) {
      case 'i1': return ((SAFE_HEAP_LOAD(((ptr)|0), 1, 0))|0);
      case 'i8': return ((SAFE_HEAP_LOAD(((ptr)|0), 1, 0))|0);
      case 'i16': return ((SAFE_HEAP_LOAD(((ptr)|0), 2, 0))|0);
      case 'i32': return ((SAFE_HEAP_LOAD(((ptr)|0), 4, 0))|0);
      case 'i64': return ((SAFE_HEAP_LOAD(((ptr)|0), 8, 0))|0);
      case 'float': return (+(SAFE_HEAP_LOAD_D(((ptr)|0), 4, 0)));
      case 'double': return (+(SAFE_HEAP_LOAD_D(((ptr)|0), 8, 0)));
      default: abort('invalid type for getValue: ' + type);
    }
  }
  return null;
}

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
/** @type {function((TypedArray|Array<number>|number), string, number, number=)} */
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : staticAlloc, stackAlloc, staticAlloc, dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var stop;
    ptr = ret;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(/** @type {!Uint8Array} */ (slab), ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return staticAlloc(size);
  if (!runtimeInitialized) return dynamicAlloc(size);
  return _malloc(size);
}

/** @type {function(number, number=)} */
function Pointer_stringify(ptr, length) {
  if (length === 0 || !ptr) return '';
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = ((SAFE_HEAP_LOAD((((ptr)+(i))|0), 1, 1))|0);
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return UTF8ToString(ptr);
}

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = ((SAFE_HEAP_LOAD(((ptr++)|0), 1, 0))|0);
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see:
      // http://en.wikipedia.org/wiki/UTF-8#Description
      // https://www.ietf.org/rfc/rfc2279.txt
      // https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array.
//                    This count should include the null terminator,
//                    i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) {
      var u1 = str.charCodeAt(++i);
      u = 0x10000 + ((u & 0x3FF) << 10) | (u1 & 0x3FF);
    }
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = ((SAFE_HEAP_LOAD((((ptr)+(i*2))|0), 2, 0))|0);
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    SAFE_HEAP_STORE(((outPtr)|0), ((codeUnit)|0), 2);
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  SAFE_HEAP_STORE(((outPtr)|0), ((0)|0), 2);
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}

function UTF32ToString(ptr) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = ((SAFE_HEAP_LOAD((((ptr)+(i*4))|0), 4, 0))|0);
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    SAFE_HEAP_STORE(((outPtr)|0), ((codeUnit)|0), 4);
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  SAFE_HEAP_STORE(((outPtr)|0), ((0)|0), 4);
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}

// Allocate heap space for a JS string, and write it there.
// It is the responsibility of the caller to free() that memory.
function allocateUTF8(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = _malloc(size);
  if (ret) stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Allocate stack space for a JS string, and write it there.
function allocateUTF8OnStack(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

function demangle(func) {
  warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
  return text.replace(regex,
    function(x) {
      var y = demangle(x);
      return x === y ? x : (x + ' [' + y + ']');
    });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}

// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;
var MIN_TOTAL_MEMORY = 16777216;

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP,
/** @type {ArrayBuffer} */
  buffer,
/** @type {Int8Array} */
  HEAP8,
/** @type {Uint8Array} */
  HEAPU8,
/** @type {Int16Array} */
  HEAP16,
/** @type {Uint16Array} */
  HEAPU16,
/** @type {Int32Array} */
  HEAP32,
/** @type {Uint32Array} */
  HEAPU32,
/** @type {Float32Array} */
  HEAPF32,
/** @type {Float64Array} */
  HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;


// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  assert((STACK_MAX & 3) == 0);
  HEAPU32[(STACK_MAX >> 2)-1] = 0x02135467;
  HEAPU32[(STACK_MAX >> 2)-2] = 0x89BACDFE;
}

function checkStackCookie() {
  if (HEAPU32[(STACK_MAX >> 2)-1] != 0x02135467 || HEAPU32[(STACK_MAX >> 2)-2] != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x' + HEAPU32[(STACK_MAX >> 2)-2].toString(16) + ' ' + HEAPU32[(STACK_MAX >> 2)-1].toString(16));
  }
  // Also test the global address 0 for integrity. This check is not compatible with SAFE_SPLIT_MEMORY though, since that mode already tests all address 0 accesses on its own.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) throw 'Runtime error: The application has corrupted its heap memory area (address zero)!';
}

function abortStackOverflow(allocSize) {
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - stackSave() + allocSize) + ' bytes available!');
}


function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or (4) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}

if (!Module['reallocBuffer']) Module['reallocBuffer'] = function(size) {
  var ret;
  try {
    var oldHEAP8 = HEAP8;
    ret = new ArrayBuffer(size);
    var temp = new Int8Array(ret);
    temp.set(oldHEAP8);
  } catch(e) {
    return false;
  }
  var success = _emscripten_replace_memory(ret);
  if (!success) return false;
  return ret;
};

function enlargeMemory() {
  // TOTAL_MEMORY is the current size of the actual array, and DYNAMICTOP is the new top.
  assert(HEAP32[DYNAMICTOP_PTR>>2] > TOTAL_MEMORY); // This function should only ever be called after the ceiling of the dynamic heap has already been bumped to exceed the current total size of the asm.js heap.


  var PAGE_MULTIPLE = Module["usingWasm"] ? WASM_PAGE_SIZE : ASMJS_PAGE_SIZE; // In wasm, heap size must be a multiple of 64KB. In asm.js, they need to be multiples of 16MB.
  var LIMIT = 2147483648 - PAGE_MULTIPLE; // We can do one page short of 2GB as theoretical maximum.

  if (HEAP32[DYNAMICTOP_PTR>>2] > LIMIT) {
    err('Cannot enlarge memory, asked to go up to ' + HEAP32[DYNAMICTOP_PTR>>2] + ' bytes, but the limit is ' + LIMIT + ' bytes!');
    return false;
  }

  var OLD_TOTAL_MEMORY = TOTAL_MEMORY;
  TOTAL_MEMORY = Math.max(TOTAL_MEMORY, MIN_TOTAL_MEMORY); // So the loop below will not be infinite, and minimum asm.js memory size is 16MB.

  while (TOTAL_MEMORY < HEAP32[DYNAMICTOP_PTR>>2]) { // Keep incrementing the heap size as long as it's less than what is requested.
    if (TOTAL_MEMORY <= 536870912) {
      TOTAL_MEMORY = alignUp(2 * TOTAL_MEMORY, PAGE_MULTIPLE); // Simple heuristic: double until 1GB...
    } else {
      // ..., but after that, add smaller increments towards 2GB, which we cannot reach
      TOTAL_MEMORY = Math.min(alignUp((3 * TOTAL_MEMORY + 2147483648) / 4, PAGE_MULTIPLE), LIMIT);
      if (TOTAL_MEMORY === OLD_TOTAL_MEMORY) {
        warnOnce('Cannot ask for more memory since we reached the practical limit in browsers (which is just below 2GB), so the request would have failed. Requesting only ' + TOTAL_MEMORY);
      }
    }
  }


  var start = Date.now();

  var replacement = Module['reallocBuffer'](TOTAL_MEMORY);
  if (!replacement || replacement.byteLength != TOTAL_MEMORY) {
    err('Failed to grow the heap from ' + OLD_TOTAL_MEMORY + ' bytes to ' + TOTAL_MEMORY + ' bytes, not enough memory!');
    if (replacement) {
      err('Expected to get back a buffer of size ' + TOTAL_MEMORY + ' bytes, but instead got back a buffer of size ' + replacement.byteLength);
    }
    // restore the state to before this call, we failed
    TOTAL_MEMORY = OLD_TOTAL_MEMORY;
    return false;
  }

  // everything worked

  updateGlobalBuffer(replacement);
  updateGlobalBufferViews();

  if (!Module["usingWasm"]) {
    err('Warning: Enlarging memory arrays, this is not fast! ' + [OLD_TOTAL_MEMORY, TOTAL_MEMORY]);
  }


  return true;
}

var byteLength;
try {
  byteLength = Function.prototype.call.bind(Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get);
  byteLength(new ArrayBuffer(4)); // can fail on older ie
} catch(e) { // can fail on older node/v8
  byteLength = function(buffer) { return buffer.byteLength; };
}

var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK) err('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray !== undefined && Int32Array.prototype.set !== undefined,
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
  assert(buffer.byteLength === TOTAL_MEMORY);
  Module['buffer'] = buffer;
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the main() is called

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  checkStackCookie();
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  checkStackCookie();
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated */
function writeStringToMemory(string, buffer, dontAddNull) {
  warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var /** @type {number} */ lastChar, /** @type {number} */ end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}

function writeArrayToMemory(array, buffer) {
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    SAFE_HEAP_STORE(((buffer++)|0), ((str.charCodeAt(i))|0), 1);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) SAFE_HEAP_STORE(((buffer)|0), ((0)|0), 1);
}

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}

assert(Math['imul'] && Math['fround'] && Math['clz32'] && Math['trunc'], 'this is a legacy browser, build with LEGACY_VM_SUPPORT');

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_max = Math.max;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// Module.preRun (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            err('still waiting on run dependencies:');
          }
          err('dependency: ' + dep);
        }
        if (shown) {
          err('(end of list)');
        }
      }, 10000);
    }
  } else {
    err('warning: run dependency added without ID');
  }
}

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    err('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;



// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

// Indicates whether filename is a base64 data URI.
function isDataURI(filename) {
  return String.prototype.startsWith ?
      filename.startsWith(dataURIPrefix) :
      filename.indexOf(dataURIPrefix) === 0;
}





// === Body ===

var ASM_CONSTS = [];

function _c_to_js(a,b,c_buf,c_len){ var bb = UTF8ToString(b); var js_str = Module.c_to_js(a, bb, c_buf, c_len); var len = lengthBytesUTF8(js_str) + 1; var string_on_heap = _malloc(len); stringToUTF8(js_str, string_on_heap, len + 1); return string_on_heap; }
function _module_ready(){ return global.module_ready(); }



STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 5008;
/* global initializers */  __ATINIT__.push();


memoryInitializer = "data:application/octet-stream;base64,AAAAAAAAAAARAAoAERERAAAAAAUAAAAAAAAJAAAAAAsAAAAAAAAAABEADwoREREDCgcAARMJCwsAAAkGCwAACwAGEQAAABEREQAAAAAAAAAAAAAAAAAAAAALAAAAAAAAAAARAAoKERERAAoAAAIACQsAAAAJAAsAAAsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAADAAAAAAMAAAAAAkMAAAAAAAMAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAA0AAAAEDQAAAAAJDgAAAAAADgAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAPAAAAAA8AAAAACRAAAAAAABAAABAAABIAAAASEhIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEgAAABISEgAAAAAAAAkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsAAAAAAAAAAAAAAAoAAAAACgAAAAAJCwAAAAAACwAACwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAMAAAAAAwAAAAACQwAAAAAAAwAAAwAADAxMjM0NTY3ODlBQkNERUZUISIZDQECAxFLHAwQBAsdEh4naG5vcHFiIAUGDxMUFRoIFgcoJBcYCQoOGx8lI4OCfSYqKzw9Pj9DR0pNWFlaW1xdXl9gYWNkZWZnaWprbHJzdHl6e3wAAAAAAAAAAABJbGxlZ2FsIGJ5dGUgc2VxdWVuY2UARG9tYWluIGVycm9yAFJlc3VsdCBub3QgcmVwcmVzZW50YWJsZQBOb3QgYSB0dHkAUGVybWlzc2lvbiBkZW5pZWQAT3BlcmF0aW9uIG5vdCBwZXJtaXR0ZWQATm8gc3VjaCBmaWxlIG9yIGRpcmVjdG9yeQBObyBzdWNoIHByb2Nlc3MARmlsZSBleGlzdHMAVmFsdWUgdG9vIGxhcmdlIGZvciBkYXRhIHR5cGUATm8gc3BhY2UgbGVmdCBvbiBkZXZpY2UAT3V0IG9mIG1lbW9yeQBSZXNvdXJjZSBidXN5AEludGVycnVwdGVkIHN5c3RlbSBjYWxsAFJlc291cmNlIHRlbXBvcmFyaWx5IHVuYXZhaWxhYmxlAEludmFsaWQgc2VlawBDcm9zcy1kZXZpY2UgbGluawBSZWFkLW9ubHkgZmlsZSBzeXN0ZW0ARGlyZWN0b3J5IG5vdCBlbXB0eQBDb25uZWN0aW9uIHJlc2V0IGJ5IHBlZXIAT3BlcmF0aW9uIHRpbWVkIG91dABDb25uZWN0aW9uIHJlZnVzZWQASG9zdCBpcyBkb3duAEhvc3QgaXMgdW5yZWFjaGFibGUAQWRkcmVzcyBpbiB1c2UAQnJva2VuIHBpcGUASS9PIGVycm9yAE5vIHN1Y2ggZGV2aWNlIG9yIGFkZHJlc3MAQmxvY2sgZGV2aWNlIHJlcXVpcmVkAE5vIHN1Y2ggZGV2aWNlAE5vdCBhIGRpcmVjdG9yeQBJcyBhIGRpcmVjdG9yeQBUZXh0IGZpbGUgYnVzeQBFeGVjIGZvcm1hdCBlcnJvcgBJbnZhbGlkIGFyZ3VtZW50AEFyZ3VtZW50IGxpc3QgdG9vIGxvbmcAU3ltYm9saWMgbGluayBsb29wAEZpbGVuYW1lIHRvbyBsb25nAFRvbyBtYW55IG9wZW4gZmlsZXMgaW4gc3lzdGVtAE5vIGZpbGUgZGVzY3JpcHRvcnMgYXZhaWxhYmxlAEJhZCBmaWxlIGRlc2NyaXB0b3IATm8gY2hpbGQgcHJvY2VzcwBCYWQgYWRkcmVzcwBGaWxlIHRvbyBsYXJnZQBUb28gbWFueSBsaW5rcwBObyBsb2NrcyBhdmFpbGFibGUAUmVzb3VyY2UgZGVhZGxvY2sgd291bGQgb2NjdXIAU3RhdGUgbm90IHJlY292ZXJhYmxlAFByZXZpb3VzIG93bmVyIGRpZWQAT3BlcmF0aW9uIGNhbmNlbGVkAEZ1bmN0aW9uIG5vdCBpbXBsZW1lbnRlZABObyBtZXNzYWdlIG9mIGRlc2lyZWQgdHlwZQBJZGVudGlmaWVyIHJlbW92ZWQARGV2aWNlIG5vdCBhIHN0cmVhbQBObyBkYXRhIGF2YWlsYWJsZQBEZXZpY2UgdGltZW91dABPdXQgb2Ygc3RyZWFtcyByZXNvdXJjZXMATGluayBoYXMgYmVlbiBzZXZlcmVkAFByb3RvY29sIGVycm9yAEJhZCBtZXNzYWdlAEZpbGUgZGVzY3JpcHRvciBpbiBiYWQgc3RhdGUATm90IGEgc29ja2V0AERlc3RpbmF0aW9uIGFkZHJlc3MgcmVxdWlyZWQATWVzc2FnZSB0b28gbGFyZ2UAUHJvdG9jb2wgd3JvbmcgdHlwZSBmb3Igc29ja2V0AFByb3RvY29sIG5vdCBhdmFpbGFibGUAUHJvdG9jb2wgbm90IHN1cHBvcnRlZABTb2NrZXQgdHlwZSBub3Qgc3VwcG9ydGVkAE5vdCBzdXBwb3J0ZWQAUHJvdG9jb2wgZmFtaWx5IG5vdCBzdXBwb3J0ZWQAQWRkcmVzcyBmYW1pbHkgbm90IHN1cHBvcnRlZCBieSBwcm90b2NvbABBZGRyZXNzIG5vdCBhdmFpbGFibGUATmV0d29yayBpcyBkb3duAE5ldHdvcmsgdW5yZWFjaGFibGUAQ29ubmVjdGlvbiByZXNldCBieSBuZXR3b3JrAENvbm5lY3Rpb24gYWJvcnRlZABObyBidWZmZXIgc3BhY2UgYXZhaWxhYmxlAFNvY2tldCBpcyBjb25uZWN0ZWQAU29ja2V0IG5vdCBjb25uZWN0ZWQAQ2Fubm90IHNlbmQgYWZ0ZXIgc29ja2V0IHNodXRkb3duAE9wZXJhdGlvbiBhbHJlYWR5IGluIHByb2dyZXNzAE9wZXJhdGlvbiBpbiBwcm9ncmVzcwBTdGFsZSBmaWxlIGhhbmRsZQBSZW1vdGUgSS9PIGVycm9yAFF1b3RhIGV4Y2VlZGVkAE5vIG1lZGl1bSBmb3VuZABXcm9uZyBtZWRpdW0gdHlwZQBObyBlcnJvciBpbmZvcm1hdGlvbgAAAAAAAGQJAAAFAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAwAAAEgNAAAABAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAK/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAaBMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoaW50IGEsIGNvbnN0IGNoYXIqIGIsIHVuc2lnbmVkIGNoYXIqIGNfYnVmLCBpbnQgY19sZW4pPDo6PnsgdmFyIGJiID0gVVRGOFRvU3RyaW5nKGIpOyB2YXIganNfc3RyID0gTW9kdWxlLmNfdG9fanMoYSwgYmIsIGNfYnVmLCBjX2xlbik7IHZhciBsZW4gPSBsZW5ndGhCeXRlc1VURjgoanNfc3RyKSArIDE7IHZhciBzdHJpbmdfb25faGVhcCA9IF9tYWxsb2MobGVuKTsgc3RyaW5nVG9VVEY4KGpzX3N0ciwgc3RyaW5nX29uX2hlYXAsIGxlbiArIDEpOyByZXR1cm4gc3RyaW5nX29uX2hlYXA7IH0AUmVjZWl2ZWQgYnl0ZSBhcnJheTogJXAgJWQKCQAlMDJ4IAAKAHN0cmluZ19jcmVhdGXiiIJfaW5fYzolczolZAARABJzdHJpbmdfZnJvbV9jAFJldHVybiBmcm9tIEpTOiAlcwoAKHZvaWQpPDo6PnsgcmV0dXJuIGdsb2JhbC5tb2R1bGVfcmVhZHkoKTsgfQAtKyAgIDBYMHgAKG51bGwpAC0wWCswWCAwWC0weCsweCAweABpbmYASU5GAG5hbgBOQU4ALg==";





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


  
    

  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = ((SAFE_HEAP_LOAD((((SYSCALLS.varargs)-(4))|0), 4, 0))|0);
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      // NOTE: offset_high is unused - Emscripten's off_t is 32-bit
      var offset = offset_low;
      FS.llseek(stream, offset, whence);
      SAFE_HEAP_STORE(((result)|0), ((stream.position)|0), 4);
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  function flush_NO_FILESYSTEM() {
      // flush anything remaining in the buffers during shutdown
      var fflush = Module["_fflush"];
      if (fflush) fflush(0);
      var printChar = ___syscall146.printChar;
      if (!printChar) return;
      var buffers = ___syscall146.buffers;
      if (buffers[1].length) printChar(1, 10);
      if (buffers[2].length) printChar(2, 10);
    }function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffers) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = ((SAFE_HEAP_LOAD((((iov)+(i*8))|0), 4, 0))|0);
        var len = ((SAFE_HEAP_LOAD((((iov)+(i*8 + 4))|0), 4, 0))|0);
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  
   
  
   
  
     

  function _abort() {
      Module['abort']();
    }

   

   



   

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 

   

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) SAFE_HEAP_STORE(((Module['___errno_location']())|0), ((value)|0), 4);
      else err('failed to set errno from JS');
      return value;
    } 
DYNAMICTOP_PTR = staticAlloc(4);

STACK_BASE = STACKTOP = alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");

var ASSERTIONS = true;

/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      if (ASSERTIONS) {
        assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      }
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}


// Copied from https://github.com/strophe/strophejs/blob/e06d027/src/polyfills.js#L149

// This code was written by Tyler Akins and has been placed in the
// public domain.  It would be nice if you left this header intact.
// Base64 code from Tyler Akins -- http://rumkin.com

/**
 * Decodes a base64 string.
 * @param {String} input The string to decode.
 */
var decodeBase64 = typeof atob === 'function' ? atob : function (input) {
  var keyStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  var output = '';
  var chr1, chr2, chr3;
  var enc1, enc2, enc3, enc4;
  var i = 0;
  // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
  input = input.replace(/[^A-Za-z0-9\+\/\=]/g, '');
  do {
    enc1 = keyStr.indexOf(input.charAt(i++));
    enc2 = keyStr.indexOf(input.charAt(i++));
    enc3 = keyStr.indexOf(input.charAt(i++));
    enc4 = keyStr.indexOf(input.charAt(i++));

    chr1 = (enc1 << 2) | (enc2 >> 4);
    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    chr3 = ((enc3 & 3) << 6) | enc4;

    output = output + String.fromCharCode(chr1);

    if (enc3 !== 64) {
      output = output + String.fromCharCode(chr2);
    }
    if (enc4 !== 64) {
      output = output + String.fromCharCode(chr3);
    }
  } while (i < input.length);
  return output;
};

// Converts a string of base64 into a byte array.
// Throws error on invalid input.
function intArrayFromBase64(s) {
  if (typeof ENVIRONMENT_IS_NODE === 'boolean' && ENVIRONMENT_IS_NODE) {
    var buf;
    try {
      buf = Buffer.from(s, 'base64');
    } catch (_) {
      buf = new Buffer(s, 'base64');
    }
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  try {
    var decoded = decodeBase64(s);
    var bytes = new Uint8Array(decoded.length);
    for (var i = 0 ; i < decoded.length ; ++i) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return bytes;
  } catch (_) {
    throw new Error('Converting base64 string to bytes failed.');
  }
}

// If filename is a base64 data URI, parses and returns data (Buffer on node,
// Uint8Array otherwise). If filename is not a base64 data URI, returns undefined.
function tryParseAsDataURI(filename) {
  if (!isDataURI(filename)) {
    return;
  }

  return intArrayFromBase64(filename.slice(dataURIPrefix.length));
}



function nullFunc_ii(x) { err("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiii(x) { err("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function invoke_ii(index,a1) {
  var sp = stackSave();
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    stackRestore(sp);
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  var sp = stackSave();
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    stackRestore(sp);
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity, "byteLength": byteLength };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "segfault": segfault, "alignfault": alignfault, "ftfault": ftfault, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "_abort": _abort, "_c_to_js": _c_to_js, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_module_ready": _module_ready, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX };
// EMSCRIPTEN_START_ASM
var asm = (/** @suppress {uselessCode} */ function(global, env, buffer) {
'almost asm';


  var Int8View = global.Int8Array;
  var HEAP8 = new Int8View(buffer);
  var Int16View = global.Int16Array;
  var HEAP16 = new Int16View(buffer);
  var Int32View = global.Int32Array;
  var HEAP32 = new Int32View(buffer);
  var Uint8View = global.Uint8Array;
  var HEAPU8 = new Uint8View(buffer);
  var Uint16View = global.Uint16Array;
  var HEAPU16 = new Uint16View(buffer);
  var Uint32View = global.Uint32Array;
  var HEAPU32 = new Uint32View(buffer);
  var Float32View = global.Float32Array;
  var HEAPF32 = new Float32View(buffer);
  var Float64View = global.Float64Array;
  var HEAPF64 = new Float64View(buffer);
  var byteLength = global.byteLength;

  var DYNAMICTOP_PTR=env.DYNAMICTOP_PTR|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntS = 0, tempValue = 0, tempDouble = 0.0;
  var tempRet0 = 0;

  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_max=global.Math.max;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var enlargeMemory=env.enlargeMemory;
  var getTotalMemory=env.getTotalMemory;
  var abortOnCannotGrowMemory=env.abortOnCannotGrowMemory;
  var abortStackOverflow=env.abortStackOverflow;
  var segfault=env.segfault;
  var alignfault=env.alignfault;
  var ftfault=env.ftfault;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_iiii=env.nullFunc_iiii;
  var invoke_ii=env.invoke_ii;
  var invoke_iiii=env.invoke_iiii;
  var ___setErrNo=env.___setErrNo;
  var ___syscall140=env.___syscall140;
  var ___syscall146=env.___syscall146;
  var ___syscall54=env.___syscall54;
  var ___syscall6=env.___syscall6;
  var _abort=env._abort;
  var _c_to_js=env._c_to_js;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var _module_ready=env._module_ready;
  var flush_NO_FILESYSTEM=env.flush_NO_FILESYSTEM;
  var tempFloat = 0.0;

function _emscripten_replace_memory(newBuffer) {
  if ((byteLength(newBuffer) & 0xffffff || byteLength(newBuffer) <= 0xffffff) || byteLength(newBuffer) > 0x80000000) return false;
  HEAP8 = new Int8View(newBuffer);
  HEAP16 = new Int16View(newBuffer);
  HEAP32 = new Int32View(newBuffer);
  HEAPU8 = new Uint8View(newBuffer);
  HEAPU16 = new Uint16View(newBuffer);
  HEAPU32 = new Uint32View(newBuffer);
  HEAPF32 = new Float32View(newBuffer);
  HEAPF64 = new Float64View(newBuffer);
  buffer = newBuffer;
  return true;
}

// EMSCRIPTEN_START_FUNCS

function _malloc($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i16$i = 0, $$0187$i = 0, $$0189$i = 0, $$0190$i = 0, $$0191$i = 0, $$0197 = 0, $$0199 = 0, $$02065$i$i = 0, $$0207$lcssa$i$i = 0, $$02074$i$i = 0, $$0211$i$i = 0, $$0212$i$i = 0, $$024372$i = 0, $$0286$i$i = 0, $$028711$i$i = 0, $$0288$lcssa$i$i = 0, $$028810$i$i = 0;
 var $$0294$i$i = 0, $$0295$i$i = 0, $$0340$i = 0, $$034217$i = 0, $$0343$lcssa$i = 0, $$034316$i = 0, $$0345$i = 0, $$0351$i = 0, $$0357$i = 0, $$0358$i = 0, $$0360$i = 0, $$0361$i = 0, $$0367$i = 0, $$1194$i = 0, $$1194$i$be = 0, $$1194$i$ph = 0, $$1196$i = 0, $$1196$i$be = 0, $$1196$i$ph = 0, $$124471$i = 0;
 var $$1290$i$i = 0, $$1290$i$i$be = 0, $$1290$i$i$ph = 0, $$1292$i$i = 0, $$1292$i$i$be = 0, $$1292$i$i$ph = 0, $$1341$i = 0, $$1346$i = 0, $$1362$i = 0, $$1369$i = 0, $$1369$i$be = 0, $$1369$i$ph = 0, $$1373$i = 0, $$1373$i$be = 0, $$1373$i$ph = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2353$i = 0, $$3$i = 0;
 var $$3$i$i = 0, $$3$i203 = 0, $$3$i203218 = 0, $$3348$i = 0, $$3371$i = 0, $$4$lcssa$i = 0, $$420$i = 0, $$420$i$ph = 0, $$4236$i = 0, $$4349$lcssa$i = 0, $$434919$i = 0, $$434919$i$ph = 0, $$4355$i = 0, $$535618$i = 0, $$535618$i$ph = 0, $$723947$i = 0, $$748$i = 0, $$pre = 0, $$pre$i = 0, $$pre$i$i = 0;
 var $$pre$i17$i = 0, $$pre$i208 = 0, $$pre$i210 = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i18$iZ2D = 0, $$pre$phi$i209Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi17$i$iZ2D = 0, $$pre$phiZ2D = 0, $$pre16$i$i = 0, $$sink = 0, $$sink325 = 0, $$sink326 = 0, $1 = 0, $10 = 0, $100 = 0, $1000 = 0, $1001 = 0, $1002 = 0, $1003 = 0;
 var $1004 = 0, $1005 = 0, $1006 = 0, $1007 = 0, $1008 = 0, $1009 = 0, $101 = 0, $1010 = 0, $1011 = 0, $1012 = 0, $1013 = 0, $1014 = 0, $1015 = 0, $1016 = 0, $1017 = 0, $1018 = 0, $1019 = 0, $102 = 0, $1020 = 0, $1021 = 0;
 var $1022 = 0, $1023 = 0, $1024 = 0, $1025 = 0, $1026 = 0, $1027 = 0, $1028 = 0, $1029 = 0, $103 = 0, $1030 = 0, $1031 = 0, $1032 = 0, $1033 = 0, $1034 = 0, $1035 = 0, $1036 = 0, $1037 = 0, $1038 = 0, $1039 = 0, $104 = 0;
 var $1040 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1044 = 0, $1045 = 0, $1046 = 0, $1047 = 0, $1048 = 0, $1049 = 0, $105 = 0, $1050 = 0, $1051 = 0, $1052 = 0, $1053 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $1057 = 0, $1058 = 0;
 var $1059 = 0, $106 = 0, $1060 = 0, $1061 = 0, $1062 = 0, $1063 = 0, $1064 = 0, $1065 = 0, $1066 = 0, $1067 = 0, $1068 = 0, $1069 = 0, $107 = 0, $1070 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0;
 var $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0;
 var $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0;
 var $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0;
 var $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0;
 var $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0;
 var $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0;
 var $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0;
 var $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0;
 var $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0;
 var $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0;
 var $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0;
 var $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0;
 var $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0;
 var $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0;
 var $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0;
 var $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0;
 var $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0;
 var $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0;
 var $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0;
 var $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0;
 var $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0;
 var $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0;
 var $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0;
 var $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0;
 var $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0;
 var $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0;
 var $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0;
 var $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0;
 var $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0;
 var $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0;
 var $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0;
 var $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0;
 var $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0;
 var $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0;
 var $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0;
 var $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0;
 var $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0;
 var $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0;
 var $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0, $814 = 0, $815 = 0;
 var $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0, $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0, $832 = 0, $833 = 0;
 var $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0, $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0, $850 = 0, $851 = 0;
 var $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0, $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0, $869 = 0, $87 = 0;
 var $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0, $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0, $887 = 0, $888 = 0;
 var $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0, $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0, $904 = 0, $905 = 0;
 var $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0, $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0, $922 = 0, $923 = 0;
 var $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0, $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0, $940 = 0, $941 = 0;
 var $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0, $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0, $959 = 0, $96 = 0;
 var $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0, $970 = 0, $971 = 0, $972 = 0, $973 = 0, $974 = 0, $975 = 0, $976 = 0, $977 = 0, $978 = 0;
 var $979 = 0, $98 = 0, $980 = 0, $981 = 0, $982 = 0, $983 = 0, $984 = 0, $985 = 0, $986 = 0, $987 = 0, $988 = 0, $989 = 0, $99 = 0, $990 = 0, $991 = 0, $992 = 0, $993 = 0, $994 = 0, $995 = 0, $996 = 0;
 var $997 = 0, $998 = 0, $999 = 0, $cond$i = 0, $cond$i$i = 0, $cond$i207 = 0, $not$$i = 0, $or$cond$i = 0, $or$cond$i213 = 0, $or$cond1$i = 0, $or$cond11$i = 0, $or$cond2$i = 0, $or$cond2$i214 = 0, $or$cond5$i = 0, $or$cond50$i = 0, $or$cond51$i = 0, $or$cond6$i = 0, $or$cond7$i = 0, $or$cond8$i = 0, $or$cond8$not$i = 0;
 var $spec$select$i = 0, $spec$select$i205 = 0, $spec$select1$i = 0, $spec$select3$i = 0, $spec$select49$i = 0, $spec$select7$i = 0, $spec$select9$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16 | 0;
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16 | 0);
 $1 = sp;
 $2 = $0 >>> 0 < 245;
 do {
  if ($2) {
   $3 = $0 >>> 0 < 11;
   $4 = $0 + 11 | 0;
   $5 = $4 & -8;
   $6 = $3 ? 16 : $5;
   $7 = $6 >>> 3;
   $8 = SAFE_HEAP_LOAD(1108 * 4 | 0, 4, 0) | 0 | 0;
   $9 = $8 >>> $7;
   $10 = $9 & 3;
   $11 = ($10 | 0) == 0;
   if (!$11) {
    $12 = $9 & 1;
    $13 = $12 ^ 1;
    $14 = $13 + $7 | 0;
    $15 = $14 << 1;
    $16 = 4472 + ($15 << 2) | 0;
    $17 = $16 + 8 | 0;
    $18 = SAFE_HEAP_LOAD($17 | 0, 4, 0) | 0 | 0;
    $19 = $18 + 8 | 0;
    $20 = SAFE_HEAP_LOAD($19 | 0, 4, 0) | 0 | 0;
    $21 = ($20 | 0) == ($16 | 0);
    do {
     if ($21) {
      $22 = 1 << $14;
      $23 = $22 ^ -1;
      $24 = $8 & $23;
      SAFE_HEAP_STORE(1108 * 4 | 0, $24 | 0, 4);
     } else {
      $25 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
      $26 = $25 >>> 0 > $20 >>> 0;
      if ($26) {
       _abort();
      }
      $27 = $20 + 12 | 0;
      $28 = SAFE_HEAP_LOAD($27 | 0, 4, 0) | 0 | 0;
      $29 = ($28 | 0) == ($18 | 0);
      if ($29) {
       SAFE_HEAP_STORE($27 | 0, $16 | 0, 4);
       SAFE_HEAP_STORE($17 | 0, $20 | 0, 4);
       break;
      } else {
       _abort();
      }
     }
    } while (0);
    $30 = $14 << 3;
    $31 = $30 | 3;
    $32 = $18 + 4 | 0;
    SAFE_HEAP_STORE($32 | 0, $31 | 0, 4);
    $33 = $18 + $30 | 0;
    $34 = $33 + 4 | 0;
    $35 = SAFE_HEAP_LOAD($34 | 0, 4, 0) | 0 | 0;
    $36 = $35 | 1;
    SAFE_HEAP_STORE($34 | 0, $36 | 0, 4);
    $$0 = $19;
    STACKTOP = sp;
    return $$0 | 0;
   }
   $37 = SAFE_HEAP_LOAD(4440 | 0, 4, 0) | 0 | 0;
   $38 = $6 >>> 0 > $37 >>> 0;
   if ($38) {
    $39 = ($9 | 0) == 0;
    if (!$39) {
     $40 = $9 << $7;
     $41 = 2 << $7;
     $42 = 0 - $41 | 0;
     $43 = $41 | $42;
     $44 = $40 & $43;
     $45 = 0 - $44 | 0;
     $46 = $44 & $45;
     $47 = $46 + -1 | 0;
     $48 = $47 >>> 12;
     $49 = $48 & 16;
     $50 = $47 >>> $49;
     $51 = $50 >>> 5;
     $52 = $51 & 8;
     $53 = $52 | $49;
     $54 = $50 >>> $52;
     $55 = $54 >>> 2;
     $56 = $55 & 4;
     $57 = $53 | $56;
     $58 = $54 >>> $56;
     $59 = $58 >>> 1;
     $60 = $59 & 2;
     $61 = $57 | $60;
     $62 = $58 >>> $60;
     $63 = $62 >>> 1;
     $64 = $63 & 1;
     $65 = $61 | $64;
     $66 = $62 >>> $64;
     $67 = $65 + $66 | 0;
     $68 = $67 << 1;
     $69 = 4472 + ($68 << 2) | 0;
     $70 = $69 + 8 | 0;
     $71 = SAFE_HEAP_LOAD($70 | 0, 4, 0) | 0 | 0;
     $72 = $71 + 8 | 0;
     $73 = SAFE_HEAP_LOAD($72 | 0, 4, 0) | 0 | 0;
     $74 = ($73 | 0) == ($69 | 0);
     do {
      if ($74) {
       $75 = 1 << $67;
       $76 = $75 ^ -1;
       $77 = $8 & $76;
       SAFE_HEAP_STORE(1108 * 4 | 0, $77 | 0, 4);
       $98 = $77;
      } else {
       $78 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
       $79 = $78 >>> 0 > $73 >>> 0;
       if ($79) {
        _abort();
       }
       $80 = $73 + 12 | 0;
       $81 = SAFE_HEAP_LOAD($80 | 0, 4, 0) | 0 | 0;
       $82 = ($81 | 0) == ($71 | 0);
       if ($82) {
        SAFE_HEAP_STORE($80 | 0, $69 | 0, 4);
        SAFE_HEAP_STORE($70 | 0, $73 | 0, 4);
        $98 = $8;
        break;
       } else {
        _abort();
       }
      }
     } while (0);
     $83 = $67 << 3;
     $84 = $83 - $6 | 0;
     $85 = $6 | 3;
     $86 = $71 + 4 | 0;
     SAFE_HEAP_STORE($86 | 0, $85 | 0, 4);
     $87 = $71 + $6 | 0;
     $88 = $84 | 1;
     $89 = $87 + 4 | 0;
     SAFE_HEAP_STORE($89 | 0, $88 | 0, 4);
     $90 = $71 + $83 | 0;
     SAFE_HEAP_STORE($90 | 0, $84 | 0, 4);
     $91 = ($37 | 0) == 0;
     if (!$91) {
      $92 = SAFE_HEAP_LOAD(4452 | 0, 4, 0) | 0 | 0;
      $93 = $37 >>> 3;
      $94 = $93 << 1;
      $95 = 4472 + ($94 << 2) | 0;
      $96 = 1 << $93;
      $97 = $98 & $96;
      $99 = ($97 | 0) == 0;
      if ($99) {
       $100 = $98 | $96;
       SAFE_HEAP_STORE(1108 * 4 | 0, $100 | 0, 4);
       $$pre = $95 + 8 | 0;
       $$0199 = $95;
       $$pre$phiZ2D = $$pre;
      } else {
       $101 = $95 + 8 | 0;
       $102 = SAFE_HEAP_LOAD($101 | 0, 4, 0) | 0 | 0;
       $103 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
       $104 = $103 >>> 0 > $102 >>> 0;
       if ($104) {
        _abort();
       } else {
        $$0199 = $102;
        $$pre$phiZ2D = $101;
       }
      }
      SAFE_HEAP_STORE($$pre$phiZ2D | 0, $92 | 0, 4);
      $105 = $$0199 + 12 | 0;
      SAFE_HEAP_STORE($105 | 0, $92 | 0, 4);
      $106 = $92 + 8 | 0;
      SAFE_HEAP_STORE($106 | 0, $$0199 | 0, 4);
      $107 = $92 + 12 | 0;
      SAFE_HEAP_STORE($107 | 0, $95 | 0, 4);
     }
     SAFE_HEAP_STORE(4440 | 0, $84 | 0, 4);
     SAFE_HEAP_STORE(4452 | 0, $87 | 0, 4);
     $$0 = $72;
     STACKTOP = sp;
     return $$0 | 0;
    }
    $108 = SAFE_HEAP_LOAD(4436 | 0, 4, 0) | 0 | 0;
    $109 = ($108 | 0) == 0;
    if ($109) {
     $$0197 = $6;
    } else {
     $110 = 0 - $108 | 0;
     $111 = $108 & $110;
     $112 = $111 + -1 | 0;
     $113 = $112 >>> 12;
     $114 = $113 & 16;
     $115 = $112 >>> $114;
     $116 = $115 >>> 5;
     $117 = $116 & 8;
     $118 = $117 | $114;
     $119 = $115 >>> $117;
     $120 = $119 >>> 2;
     $121 = $120 & 4;
     $122 = $118 | $121;
     $123 = $119 >>> $121;
     $124 = $123 >>> 1;
     $125 = $124 & 2;
     $126 = $122 | $125;
     $127 = $123 >>> $125;
     $128 = $127 >>> 1;
     $129 = $128 & 1;
     $130 = $126 | $129;
     $131 = $127 >>> $129;
     $132 = $130 + $131 | 0;
     $133 = 4736 + ($132 << 2) | 0;
     $134 = SAFE_HEAP_LOAD($133 | 0, 4, 0) | 0 | 0;
     $135 = $134 + 4 | 0;
     $136 = SAFE_HEAP_LOAD($135 | 0, 4, 0) | 0 | 0;
     $137 = $136 & -8;
     $138 = $137 - $6 | 0;
     $$0189$i = $134;
     $$0190$i = $134;
     $$0191$i = $138;
     while (1) {
      $139 = $$0189$i + 16 | 0;
      $140 = SAFE_HEAP_LOAD($139 | 0, 4, 0) | 0 | 0;
      $141 = ($140 | 0) == (0 | 0);
      if ($141) {
       $142 = $$0189$i + 20 | 0;
       $143 = SAFE_HEAP_LOAD($142 | 0, 4, 0) | 0 | 0;
       $144 = ($143 | 0) == (0 | 0);
       if ($144) {
        break;
       } else {
        $146 = $143;
       }
      } else {
       $146 = $140;
      }
      $145 = $146 + 4 | 0;
      $147 = SAFE_HEAP_LOAD($145 | 0, 4, 0) | 0 | 0;
      $148 = $147 & -8;
      $149 = $148 - $6 | 0;
      $150 = $149 >>> 0 < $$0191$i >>> 0;
      $spec$select$i = $150 ? $149 : $$0191$i;
      $spec$select1$i = $150 ? $146 : $$0190$i;
      $$0189$i = $146;
      $$0190$i = $spec$select1$i;
      $$0191$i = $spec$select$i;
     }
     $151 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
     $152 = $151 >>> 0 > $$0190$i >>> 0;
     if ($152) {
      _abort();
     }
     $153 = $$0190$i + $6 | 0;
     $154 = $153 >>> 0 > $$0190$i >>> 0;
     if (!$154) {
      _abort();
     }
     $155 = $$0190$i + 24 | 0;
     $156 = SAFE_HEAP_LOAD($155 | 0, 4, 0) | 0 | 0;
     $157 = $$0190$i + 12 | 0;
     $158 = SAFE_HEAP_LOAD($157 | 0, 4, 0) | 0 | 0;
     $159 = ($158 | 0) == ($$0190$i | 0);
     do {
      if ($159) {
       $169 = $$0190$i + 20 | 0;
       $170 = SAFE_HEAP_LOAD($169 | 0, 4, 0) | 0 | 0;
       $171 = ($170 | 0) == (0 | 0);
       if ($171) {
        $172 = $$0190$i + 16 | 0;
        $173 = SAFE_HEAP_LOAD($172 | 0, 4, 0) | 0 | 0;
        $174 = ($173 | 0) == (0 | 0);
        if ($174) {
         $$3$i = 0;
         break;
        } else {
         $$1194$i$ph = $173;
         $$1196$i$ph = $172;
        }
       } else {
        $$1194$i$ph = $170;
        $$1196$i$ph = $169;
       }
       $$1194$i = $$1194$i$ph;
       $$1196$i = $$1196$i$ph;
       while (1) {
        $175 = $$1194$i + 20 | 0;
        $176 = SAFE_HEAP_LOAD($175 | 0, 4, 0) | 0 | 0;
        $177 = ($176 | 0) == (0 | 0);
        if ($177) {
         $178 = $$1194$i + 16 | 0;
         $179 = SAFE_HEAP_LOAD($178 | 0, 4, 0) | 0 | 0;
         $180 = ($179 | 0) == (0 | 0);
         if ($180) {
          break;
         } else {
          $$1194$i$be = $179;
          $$1196$i$be = $178;
         }
        } else {
         $$1194$i$be = $176;
         $$1196$i$be = $175;
        }
        $$1194$i = $$1194$i$be;
        $$1196$i = $$1196$i$be;
       }
       $181 = $151 >>> 0 > $$1196$i >>> 0;
       if ($181) {
        _abort();
       } else {
        SAFE_HEAP_STORE($$1196$i | 0, 0 | 0, 4);
        $$3$i = $$1194$i;
        break;
       }
      } else {
       $160 = $$0190$i + 8 | 0;
       $161 = SAFE_HEAP_LOAD($160 | 0, 4, 0) | 0 | 0;
       $162 = $151 >>> 0 > $161 >>> 0;
       if ($162) {
        _abort();
       }
       $163 = $161 + 12 | 0;
       $164 = SAFE_HEAP_LOAD($163 | 0, 4, 0) | 0 | 0;
       $165 = ($164 | 0) == ($$0190$i | 0);
       if (!$165) {
        _abort();
       }
       $166 = $158 + 8 | 0;
       $167 = SAFE_HEAP_LOAD($166 | 0, 4, 0) | 0 | 0;
       $168 = ($167 | 0) == ($$0190$i | 0);
       if ($168) {
        SAFE_HEAP_STORE($163 | 0, $158 | 0, 4);
        SAFE_HEAP_STORE($166 | 0, $161 | 0, 4);
        $$3$i = $158;
        break;
       } else {
        _abort();
       }
      }
     } while (0);
     $182 = ($156 | 0) == (0 | 0);
     L78 : do {
      if (!$182) {
       $183 = $$0190$i + 28 | 0;
       $184 = SAFE_HEAP_LOAD($183 | 0, 4, 0) | 0 | 0;
       $185 = 4736 + ($184 << 2) | 0;
       $186 = SAFE_HEAP_LOAD($185 | 0, 4, 0) | 0 | 0;
       $187 = ($$0190$i | 0) == ($186 | 0);
       do {
        if ($187) {
         SAFE_HEAP_STORE($185 | 0, $$3$i | 0, 4);
         $cond$i = ($$3$i | 0) == (0 | 0);
         if ($cond$i) {
          $188 = 1 << $184;
          $189 = $188 ^ -1;
          $190 = $108 & $189;
          SAFE_HEAP_STORE(4436 | 0, $190 | 0, 4);
          break L78;
         }
        } else {
         $191 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
         $192 = $191 >>> 0 > $156 >>> 0;
         if ($192) {
          _abort();
         } else {
          $193 = $156 + 16 | 0;
          $194 = SAFE_HEAP_LOAD($193 | 0, 4, 0) | 0 | 0;
          $195 = ($194 | 0) == ($$0190$i | 0);
          $196 = $156 + 20 | 0;
          $$sink = $195 ? $193 : $196;
          SAFE_HEAP_STORE($$sink | 0, $$3$i | 0, 4);
          $197 = ($$3$i | 0) == (0 | 0);
          if ($197) {
           break L78;
          } else {
           break;
          }
         }
        }
       } while (0);
       $198 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
       $199 = $198 >>> 0 > $$3$i >>> 0;
       if ($199) {
        _abort();
       }
       $200 = $$3$i + 24 | 0;
       SAFE_HEAP_STORE($200 | 0, $156 | 0, 4);
       $201 = $$0190$i + 16 | 0;
       $202 = SAFE_HEAP_LOAD($201 | 0, 4, 0) | 0 | 0;
       $203 = ($202 | 0) == (0 | 0);
       do {
        if (!$203) {
         $204 = $198 >>> 0 > $202 >>> 0;
         if ($204) {
          _abort();
         } else {
          $205 = $$3$i + 16 | 0;
          SAFE_HEAP_STORE($205 | 0, $202 | 0, 4);
          $206 = $202 + 24 | 0;
          SAFE_HEAP_STORE($206 | 0, $$3$i | 0, 4);
          break;
         }
        }
       } while (0);
       $207 = $$0190$i + 20 | 0;
       $208 = SAFE_HEAP_LOAD($207 | 0, 4, 0) | 0 | 0;
       $209 = ($208 | 0) == (0 | 0);
       if (!$209) {
        $210 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
        $211 = $210 >>> 0 > $208 >>> 0;
        if ($211) {
         _abort();
        } else {
         $212 = $$3$i + 20 | 0;
         SAFE_HEAP_STORE($212 | 0, $208 | 0, 4);
         $213 = $208 + 24 | 0;
         SAFE_HEAP_STORE($213 | 0, $$3$i | 0, 4);
         break;
        }
       }
      }
     } while (0);
     $214 = $$0191$i >>> 0 < 16;
     if ($214) {
      $215 = $$0191$i + $6 | 0;
      $216 = $215 | 3;
      $217 = $$0190$i + 4 | 0;
      SAFE_HEAP_STORE($217 | 0, $216 | 0, 4);
      $218 = $$0190$i + $215 | 0;
      $219 = $218 + 4 | 0;
      $220 = SAFE_HEAP_LOAD($219 | 0, 4, 0) | 0 | 0;
      $221 = $220 | 1;
      SAFE_HEAP_STORE($219 | 0, $221 | 0, 4);
     } else {
      $222 = $6 | 3;
      $223 = $$0190$i + 4 | 0;
      SAFE_HEAP_STORE($223 | 0, $222 | 0, 4);
      $224 = $$0191$i | 1;
      $225 = $153 + 4 | 0;
      SAFE_HEAP_STORE($225 | 0, $224 | 0, 4);
      $226 = $153 + $$0191$i | 0;
      SAFE_HEAP_STORE($226 | 0, $$0191$i | 0, 4);
      $227 = ($37 | 0) == 0;
      if (!$227) {
       $228 = SAFE_HEAP_LOAD(4452 | 0, 4, 0) | 0 | 0;
       $229 = $37 >>> 3;
       $230 = $229 << 1;
       $231 = 4472 + ($230 << 2) | 0;
       $232 = 1 << $229;
       $233 = $232 & $8;
       $234 = ($233 | 0) == 0;
       if ($234) {
        $235 = $232 | $8;
        SAFE_HEAP_STORE(1108 * 4 | 0, $235 | 0, 4);
        $$pre$i = $231 + 8 | 0;
        $$0187$i = $231;
        $$pre$phi$iZ2D = $$pre$i;
       } else {
        $236 = $231 + 8 | 0;
        $237 = SAFE_HEAP_LOAD($236 | 0, 4, 0) | 0 | 0;
        $238 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
        $239 = $238 >>> 0 > $237 >>> 0;
        if ($239) {
         _abort();
        } else {
         $$0187$i = $237;
         $$pre$phi$iZ2D = $236;
        }
       }
       SAFE_HEAP_STORE($$pre$phi$iZ2D | 0, $228 | 0, 4);
       $240 = $$0187$i + 12 | 0;
       SAFE_HEAP_STORE($240 | 0, $228 | 0, 4);
       $241 = $228 + 8 | 0;
       SAFE_HEAP_STORE($241 | 0, $$0187$i | 0, 4);
       $242 = $228 + 12 | 0;
       SAFE_HEAP_STORE($242 | 0, $231 | 0, 4);
      }
      SAFE_HEAP_STORE(4440 | 0, $$0191$i | 0, 4);
      SAFE_HEAP_STORE(4452 | 0, $153 | 0, 4);
     }
     $243 = $$0190$i + 8 | 0;
     $$0 = $243;
     STACKTOP = sp;
     return $$0 | 0;
    }
   } else {
    $$0197 = $6;
   }
  } else {
   $244 = $0 >>> 0 > 4294967231;
   if ($244) {
    $$0197 = -1;
   } else {
    $245 = $0 + 11 | 0;
    $246 = $245 & -8;
    $247 = SAFE_HEAP_LOAD(4436 | 0, 4, 0) | 0 | 0;
    $248 = ($247 | 0) == 0;
    if ($248) {
     $$0197 = $246;
    } else {
     $249 = 0 - $246 | 0;
     $250 = $245 >>> 8;
     $251 = ($250 | 0) == 0;
     if ($251) {
      $$0357$i = 0;
     } else {
      $252 = $246 >>> 0 > 16777215;
      if ($252) {
       $$0357$i = 31;
      } else {
       $253 = $250 + 1048320 | 0;
       $254 = $253 >>> 16;
       $255 = $254 & 8;
       $256 = $250 << $255;
       $257 = $256 + 520192 | 0;
       $258 = $257 >>> 16;
       $259 = $258 & 4;
       $260 = $259 | $255;
       $261 = $256 << $259;
       $262 = $261 + 245760 | 0;
       $263 = $262 >>> 16;
       $264 = $263 & 2;
       $265 = $260 | $264;
       $266 = 14 - $265 | 0;
       $267 = $261 << $264;
       $268 = $267 >>> 15;
       $269 = $266 + $268 | 0;
       $270 = $269 << 1;
       $271 = $269 + 7 | 0;
       $272 = $246 >>> $271;
       $273 = $272 & 1;
       $274 = $273 | $270;
       $$0357$i = $274;
      }
     }
     $275 = 4736 + ($$0357$i << 2) | 0;
     $276 = SAFE_HEAP_LOAD($275 | 0, 4, 0) | 0 | 0;
     $277 = ($276 | 0) == (0 | 0);
     L122 : do {
      if ($277) {
       $$2353$i = 0;
       $$3$i203 = 0;
       $$3348$i = $249;
       label = 85;
      } else {
       $278 = ($$0357$i | 0) == 31;
       $279 = $$0357$i >>> 1;
       $280 = 25 - $279 | 0;
       $281 = $278 ? 0 : $280;
       $282 = $246 << $281;
       $$0340$i = 0;
       $$0345$i = $249;
       $$0351$i = $276;
       $$0358$i = $282;
       $$0361$i = 0;
       while (1) {
        $283 = $$0351$i + 4 | 0;
        $284 = SAFE_HEAP_LOAD($283 | 0, 4, 0) | 0 | 0;
        $285 = $284 & -8;
        $286 = $285 - $246 | 0;
        $287 = $286 >>> 0 < $$0345$i >>> 0;
        if ($287) {
         $288 = ($286 | 0) == 0;
         if ($288) {
          $$420$i$ph = $$0351$i;
          $$434919$i$ph = 0;
          $$535618$i$ph = $$0351$i;
          label = 89;
          break L122;
         } else {
          $$1341$i = $$0351$i;
          $$1346$i = $286;
         }
        } else {
         $$1341$i = $$0340$i;
         $$1346$i = $$0345$i;
        }
        $289 = $$0351$i + 20 | 0;
        $290 = SAFE_HEAP_LOAD($289 | 0, 4, 0) | 0 | 0;
        $291 = $$0358$i >>> 31;
        $292 = ($$0351$i + 16 | 0) + ($291 << 2) | 0;
        $293 = SAFE_HEAP_LOAD($292 | 0, 4, 0) | 0 | 0;
        $294 = ($290 | 0) == (0 | 0);
        $295 = ($290 | 0) == ($293 | 0);
        $or$cond2$i = $294 | $295;
        $$1362$i = $or$cond2$i ? $$0361$i : $290;
        $296 = ($293 | 0) == (0 | 0);
        $spec$select7$i = $$0358$i << 1;
        if ($296) {
         $$2353$i = $$1362$i;
         $$3$i203 = $$1341$i;
         $$3348$i = $$1346$i;
         label = 85;
         break;
        } else {
         $$0340$i = $$1341$i;
         $$0345$i = $$1346$i;
         $$0351$i = $293;
         $$0358$i = $spec$select7$i;
         $$0361$i = $$1362$i;
        }
       }
      }
     } while (0);
     if ((label | 0) == 85) {
      $297 = ($$2353$i | 0) == (0 | 0);
      $298 = ($$3$i203 | 0) == (0 | 0);
      $or$cond$i = $297 & $298;
      if ($or$cond$i) {
       $299 = 2 << $$0357$i;
       $300 = 0 - $299 | 0;
       $301 = $299 | $300;
       $302 = $301 & $247;
       $303 = ($302 | 0) == 0;
       if ($303) {
        $$0197 = $246;
        break;
       }
       $304 = 0 - $302 | 0;
       $305 = $302 & $304;
       $306 = $305 + -1 | 0;
       $307 = $306 >>> 12;
       $308 = $307 & 16;
       $309 = $306 >>> $308;
       $310 = $309 >>> 5;
       $311 = $310 & 8;
       $312 = $311 | $308;
       $313 = $309 >>> $311;
       $314 = $313 >>> 2;
       $315 = $314 & 4;
       $316 = $312 | $315;
       $317 = $313 >>> $315;
       $318 = $317 >>> 1;
       $319 = $318 & 2;
       $320 = $316 | $319;
       $321 = $317 >>> $319;
       $322 = $321 >>> 1;
       $323 = $322 & 1;
       $324 = $320 | $323;
       $325 = $321 >>> $323;
       $326 = $324 + $325 | 0;
       $327 = 4736 + ($326 << 2) | 0;
       $328 = SAFE_HEAP_LOAD($327 | 0, 4, 0) | 0 | 0;
       $$3$i203218 = 0;
       $$4355$i = $328;
      } else {
       $$3$i203218 = $$3$i203;
       $$4355$i = $$2353$i;
      }
      $329 = ($$4355$i | 0) == (0 | 0);
      if ($329) {
       $$4$lcssa$i = $$3$i203218;
       $$4349$lcssa$i = $$3348$i;
      } else {
       $$420$i$ph = $$3$i203218;
       $$434919$i$ph = $$3348$i;
       $$535618$i$ph = $$4355$i;
       label = 89;
      }
     }
     if ((label | 0) == 89) {
      $$420$i = $$420$i$ph;
      $$434919$i = $$434919$i$ph;
      $$535618$i = $$535618$i$ph;
      while (1) {
       $330 = $$535618$i + 4 | 0;
       $331 = SAFE_HEAP_LOAD($330 | 0, 4, 0) | 0 | 0;
       $332 = $331 & -8;
       $333 = $332 - $246 | 0;
       $334 = $333 >>> 0 < $$434919$i >>> 0;
       $spec$select$i205 = $334 ? $333 : $$434919$i;
       $spec$select3$i = $334 ? $$535618$i : $$420$i;
       $335 = $$535618$i + 16 | 0;
       $336 = SAFE_HEAP_LOAD($335 | 0, 4, 0) | 0 | 0;
       $337 = ($336 | 0) == (0 | 0);
       if ($337) {
        $338 = $$535618$i + 20 | 0;
        $339 = SAFE_HEAP_LOAD($338 | 0, 4, 0) | 0 | 0;
        $341 = $339;
       } else {
        $341 = $336;
       }
       $340 = ($341 | 0) == (0 | 0);
       if ($340) {
        $$4$lcssa$i = $spec$select3$i;
        $$4349$lcssa$i = $spec$select$i205;
        break;
       } else {
        $$420$i = $spec$select3$i;
        $$434919$i = $spec$select$i205;
        $$535618$i = $341;
       }
      }
     }
     $342 = ($$4$lcssa$i | 0) == (0 | 0);
     if ($342) {
      $$0197 = $246;
     } else {
      $343 = SAFE_HEAP_LOAD(4440 | 0, 4, 0) | 0 | 0;
      $344 = $343 - $246 | 0;
      $345 = $$4349$lcssa$i >>> 0 < $344 >>> 0;
      if ($345) {
       $346 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
       $347 = $346 >>> 0 > $$4$lcssa$i >>> 0;
       if ($347) {
        _abort();
       }
       $348 = $$4$lcssa$i + $246 | 0;
       $349 = $348 >>> 0 > $$4$lcssa$i >>> 0;
       if (!$349) {
        _abort();
       }
       $350 = $$4$lcssa$i + 24 | 0;
       $351 = SAFE_HEAP_LOAD($350 | 0, 4, 0) | 0 | 0;
       $352 = $$4$lcssa$i + 12 | 0;
       $353 = SAFE_HEAP_LOAD($352 | 0, 4, 0) | 0 | 0;
       $354 = ($353 | 0) == ($$4$lcssa$i | 0);
       do {
        if ($354) {
         $364 = $$4$lcssa$i + 20 | 0;
         $365 = SAFE_HEAP_LOAD($364 | 0, 4, 0) | 0 | 0;
         $366 = ($365 | 0) == (0 | 0);
         if ($366) {
          $367 = $$4$lcssa$i + 16 | 0;
          $368 = SAFE_HEAP_LOAD($367 | 0, 4, 0) | 0 | 0;
          $369 = ($368 | 0) == (0 | 0);
          if ($369) {
           $$3371$i = 0;
           break;
          } else {
           $$1369$i$ph = $368;
           $$1373$i$ph = $367;
          }
         } else {
          $$1369$i$ph = $365;
          $$1373$i$ph = $364;
         }
         $$1369$i = $$1369$i$ph;
         $$1373$i = $$1373$i$ph;
         while (1) {
          $370 = $$1369$i + 20 | 0;
          $371 = SAFE_HEAP_LOAD($370 | 0, 4, 0) | 0 | 0;
          $372 = ($371 | 0) == (0 | 0);
          if ($372) {
           $373 = $$1369$i + 16 | 0;
           $374 = SAFE_HEAP_LOAD($373 | 0, 4, 0) | 0 | 0;
           $375 = ($374 | 0) == (0 | 0);
           if ($375) {
            break;
           } else {
            $$1369$i$be = $374;
            $$1373$i$be = $373;
           }
          } else {
           $$1369$i$be = $371;
           $$1373$i$be = $370;
          }
          $$1369$i = $$1369$i$be;
          $$1373$i = $$1373$i$be;
         }
         $376 = $346 >>> 0 > $$1373$i >>> 0;
         if ($376) {
          _abort();
         } else {
          SAFE_HEAP_STORE($$1373$i | 0, 0 | 0, 4);
          $$3371$i = $$1369$i;
          break;
         }
        } else {
         $355 = $$4$lcssa$i + 8 | 0;
         $356 = SAFE_HEAP_LOAD($355 | 0, 4, 0) | 0 | 0;
         $357 = $346 >>> 0 > $356 >>> 0;
         if ($357) {
          _abort();
         }
         $358 = $356 + 12 | 0;
         $359 = SAFE_HEAP_LOAD($358 | 0, 4, 0) | 0 | 0;
         $360 = ($359 | 0) == ($$4$lcssa$i | 0);
         if (!$360) {
          _abort();
         }
         $361 = $353 + 8 | 0;
         $362 = SAFE_HEAP_LOAD($361 | 0, 4, 0) | 0 | 0;
         $363 = ($362 | 0) == ($$4$lcssa$i | 0);
         if ($363) {
          SAFE_HEAP_STORE($358 | 0, $353 | 0, 4);
          SAFE_HEAP_STORE($361 | 0, $356 | 0, 4);
          $$3371$i = $353;
          break;
         } else {
          _abort();
         }
        }
       } while (0);
       $377 = ($351 | 0) == (0 | 0);
       L176 : do {
        if ($377) {
         $469 = $247;
        } else {
         $378 = $$4$lcssa$i + 28 | 0;
         $379 = SAFE_HEAP_LOAD($378 | 0, 4, 0) | 0 | 0;
         $380 = 4736 + ($379 << 2) | 0;
         $381 = SAFE_HEAP_LOAD($380 | 0, 4, 0) | 0 | 0;
         $382 = ($$4$lcssa$i | 0) == ($381 | 0);
         do {
          if ($382) {
           SAFE_HEAP_STORE($380 | 0, $$3371$i | 0, 4);
           $cond$i207 = ($$3371$i | 0) == (0 | 0);
           if ($cond$i207) {
            $383 = 1 << $379;
            $384 = $383 ^ -1;
            $385 = $247 & $384;
            SAFE_HEAP_STORE(4436 | 0, $385 | 0, 4);
            $469 = $385;
            break L176;
           }
          } else {
           $386 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
           $387 = $386 >>> 0 > $351 >>> 0;
           if ($387) {
            _abort();
           } else {
            $388 = $351 + 16 | 0;
            $389 = SAFE_HEAP_LOAD($388 | 0, 4, 0) | 0 | 0;
            $390 = ($389 | 0) == ($$4$lcssa$i | 0);
            $391 = $351 + 20 | 0;
            $$sink325 = $390 ? $388 : $391;
            SAFE_HEAP_STORE($$sink325 | 0, $$3371$i | 0, 4);
            $392 = ($$3371$i | 0) == (0 | 0);
            if ($392) {
             $469 = $247;
             break L176;
            } else {
             break;
            }
           }
          }
         } while (0);
         $393 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
         $394 = $393 >>> 0 > $$3371$i >>> 0;
         if ($394) {
          _abort();
         }
         $395 = $$3371$i + 24 | 0;
         SAFE_HEAP_STORE($395 | 0, $351 | 0, 4);
         $396 = $$4$lcssa$i + 16 | 0;
         $397 = SAFE_HEAP_LOAD($396 | 0, 4, 0) | 0 | 0;
         $398 = ($397 | 0) == (0 | 0);
         do {
          if (!$398) {
           $399 = $393 >>> 0 > $397 >>> 0;
           if ($399) {
            _abort();
           } else {
            $400 = $$3371$i + 16 | 0;
            SAFE_HEAP_STORE($400 | 0, $397 | 0, 4);
            $401 = $397 + 24 | 0;
            SAFE_HEAP_STORE($401 | 0, $$3371$i | 0, 4);
            break;
           }
          }
         } while (0);
         $402 = $$4$lcssa$i + 20 | 0;
         $403 = SAFE_HEAP_LOAD($402 | 0, 4, 0) | 0 | 0;
         $404 = ($403 | 0) == (0 | 0);
         if ($404) {
          $469 = $247;
         } else {
          $405 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
          $406 = $405 >>> 0 > $403 >>> 0;
          if ($406) {
           _abort();
          } else {
           $407 = $$3371$i + 20 | 0;
           SAFE_HEAP_STORE($407 | 0, $403 | 0, 4);
           $408 = $403 + 24 | 0;
           SAFE_HEAP_STORE($408 | 0, $$3371$i | 0, 4);
           $469 = $247;
           break;
          }
         }
        }
       } while (0);
       $409 = $$4349$lcssa$i >>> 0 < 16;
       L200 : do {
        if ($409) {
         $410 = $$4349$lcssa$i + $246 | 0;
         $411 = $410 | 3;
         $412 = $$4$lcssa$i + 4 | 0;
         SAFE_HEAP_STORE($412 | 0, $411 | 0, 4);
         $413 = $$4$lcssa$i + $410 | 0;
         $414 = $413 + 4 | 0;
         $415 = SAFE_HEAP_LOAD($414 | 0, 4, 0) | 0 | 0;
         $416 = $415 | 1;
         SAFE_HEAP_STORE($414 | 0, $416 | 0, 4);
        } else {
         $417 = $246 | 3;
         $418 = $$4$lcssa$i + 4 | 0;
         SAFE_HEAP_STORE($418 | 0, $417 | 0, 4);
         $419 = $$4349$lcssa$i | 1;
         $420 = $348 + 4 | 0;
         SAFE_HEAP_STORE($420 | 0, $419 | 0, 4);
         $421 = $348 + $$4349$lcssa$i | 0;
         SAFE_HEAP_STORE($421 | 0, $$4349$lcssa$i | 0, 4);
         $422 = $$4349$lcssa$i >>> 3;
         $423 = $$4349$lcssa$i >>> 0 < 256;
         if ($423) {
          $424 = $422 << 1;
          $425 = 4472 + ($424 << 2) | 0;
          $426 = SAFE_HEAP_LOAD(1108 * 4 | 0, 4, 0) | 0 | 0;
          $427 = 1 << $422;
          $428 = $426 & $427;
          $429 = ($428 | 0) == 0;
          if ($429) {
           $430 = $426 | $427;
           SAFE_HEAP_STORE(1108 * 4 | 0, $430 | 0, 4);
           $$pre$i208 = $425 + 8 | 0;
           $$0367$i = $425;
           $$pre$phi$i209Z2D = $$pre$i208;
          } else {
           $431 = $425 + 8 | 0;
           $432 = SAFE_HEAP_LOAD($431 | 0, 4, 0) | 0 | 0;
           $433 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
           $434 = $433 >>> 0 > $432 >>> 0;
           if ($434) {
            _abort();
           } else {
            $$0367$i = $432;
            $$pre$phi$i209Z2D = $431;
           }
          }
          SAFE_HEAP_STORE($$pre$phi$i209Z2D | 0, $348 | 0, 4);
          $435 = $$0367$i + 12 | 0;
          SAFE_HEAP_STORE($435 | 0, $348 | 0, 4);
          $436 = $348 + 8 | 0;
          SAFE_HEAP_STORE($436 | 0, $$0367$i | 0, 4);
          $437 = $348 + 12 | 0;
          SAFE_HEAP_STORE($437 | 0, $425 | 0, 4);
          break;
         }
         $438 = $$4349$lcssa$i >>> 8;
         $439 = ($438 | 0) == 0;
         if ($439) {
          $$0360$i = 0;
         } else {
          $440 = $$4349$lcssa$i >>> 0 > 16777215;
          if ($440) {
           $$0360$i = 31;
          } else {
           $441 = $438 + 1048320 | 0;
           $442 = $441 >>> 16;
           $443 = $442 & 8;
           $444 = $438 << $443;
           $445 = $444 + 520192 | 0;
           $446 = $445 >>> 16;
           $447 = $446 & 4;
           $448 = $447 | $443;
           $449 = $444 << $447;
           $450 = $449 + 245760 | 0;
           $451 = $450 >>> 16;
           $452 = $451 & 2;
           $453 = $448 | $452;
           $454 = 14 - $453 | 0;
           $455 = $449 << $452;
           $456 = $455 >>> 15;
           $457 = $454 + $456 | 0;
           $458 = $457 << 1;
           $459 = $457 + 7 | 0;
           $460 = $$4349$lcssa$i >>> $459;
           $461 = $460 & 1;
           $462 = $461 | $458;
           $$0360$i = $462;
          }
         }
         $463 = 4736 + ($$0360$i << 2) | 0;
         $464 = $348 + 28 | 0;
         SAFE_HEAP_STORE($464 | 0, $$0360$i | 0, 4);
         $465 = $348 + 16 | 0;
         $466 = $465 + 4 | 0;
         SAFE_HEAP_STORE($466 | 0, 0 | 0, 4);
         SAFE_HEAP_STORE($465 | 0, 0 | 0, 4);
         $467 = 1 << $$0360$i;
         $468 = $469 & $467;
         $470 = ($468 | 0) == 0;
         if ($470) {
          $471 = $469 | $467;
          SAFE_HEAP_STORE(4436 | 0, $471 | 0, 4);
          SAFE_HEAP_STORE($463 | 0, $348 | 0, 4);
          $472 = $348 + 24 | 0;
          SAFE_HEAP_STORE($472 | 0, $463 | 0, 4);
          $473 = $348 + 12 | 0;
          SAFE_HEAP_STORE($473 | 0, $348 | 0, 4);
          $474 = $348 + 8 | 0;
          SAFE_HEAP_STORE($474 | 0, $348 | 0, 4);
          break;
         }
         $475 = SAFE_HEAP_LOAD($463 | 0, 4, 0) | 0 | 0;
         $476 = $475 + 4 | 0;
         $477 = SAFE_HEAP_LOAD($476 | 0, 4, 0) | 0 | 0;
         $478 = $477 & -8;
         $479 = ($478 | 0) == ($$4349$lcssa$i | 0);
         L218 : do {
          if ($479) {
           $$0343$lcssa$i = $475;
          } else {
           $480 = ($$0360$i | 0) == 31;
           $481 = $$0360$i >>> 1;
           $482 = 25 - $481 | 0;
           $483 = $480 ? 0 : $482;
           $484 = $$4349$lcssa$i << $483;
           $$034217$i = $484;
           $$034316$i = $475;
           while (1) {
            $491 = $$034217$i >>> 31;
            $492 = ($$034316$i + 16 | 0) + ($491 << 2) | 0;
            $487 = SAFE_HEAP_LOAD($492 | 0, 4, 0) | 0 | 0;
            $493 = ($487 | 0) == (0 | 0);
            if ($493) {
             break;
            }
            $485 = $$034217$i << 1;
            $486 = $487 + 4 | 0;
            $488 = SAFE_HEAP_LOAD($486 | 0, 4, 0) | 0 | 0;
            $489 = $488 & -8;
            $490 = ($489 | 0) == ($$4349$lcssa$i | 0);
            if ($490) {
             $$0343$lcssa$i = $487;
             break L218;
            } else {
             $$034217$i = $485;
             $$034316$i = $487;
            }
           }
           $494 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
           $495 = $494 >>> 0 > $492 >>> 0;
           if ($495) {
            _abort();
           } else {
            SAFE_HEAP_STORE($492 | 0, $348 | 0, 4);
            $496 = $348 + 24 | 0;
            SAFE_HEAP_STORE($496 | 0, $$034316$i | 0, 4);
            $497 = $348 + 12 | 0;
            SAFE_HEAP_STORE($497 | 0, $348 | 0, 4);
            $498 = $348 + 8 | 0;
            SAFE_HEAP_STORE($498 | 0, $348 | 0, 4);
            break L200;
           }
          }
         } while (0);
         $499 = $$0343$lcssa$i + 8 | 0;
         $500 = SAFE_HEAP_LOAD($499 | 0, 4, 0) | 0 | 0;
         $501 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
         $502 = $501 >>> 0 <= $$0343$lcssa$i >>> 0;
         $503 = $501 >>> 0 <= $500 >>> 0;
         $504 = $503 & $502;
         if ($504) {
          $505 = $500 + 12 | 0;
          SAFE_HEAP_STORE($505 | 0, $348 | 0, 4);
          SAFE_HEAP_STORE($499 | 0, $348 | 0, 4);
          $506 = $348 + 8 | 0;
          SAFE_HEAP_STORE($506 | 0, $500 | 0, 4);
          $507 = $348 + 12 | 0;
          SAFE_HEAP_STORE($507 | 0, $$0343$lcssa$i | 0, 4);
          $508 = $348 + 24 | 0;
          SAFE_HEAP_STORE($508 | 0, 0 | 0, 4);
          break;
         } else {
          _abort();
         }
        }
       } while (0);
       $509 = $$4$lcssa$i + 8 | 0;
       $$0 = $509;
       STACKTOP = sp;
       return $$0 | 0;
      } else {
       $$0197 = $246;
      }
     }
    }
   }
  }
 } while (0);
 $510 = SAFE_HEAP_LOAD(4440 | 0, 4, 0) | 0 | 0;
 $511 = $510 >>> 0 < $$0197 >>> 0;
 if (!$511) {
  $512 = $510 - $$0197 | 0;
  $513 = SAFE_HEAP_LOAD(4452 | 0, 4, 0) | 0 | 0;
  $514 = $512 >>> 0 > 15;
  if ($514) {
   $515 = $513 + $$0197 | 0;
   SAFE_HEAP_STORE(4452 | 0, $515 | 0, 4);
   SAFE_HEAP_STORE(4440 | 0, $512 | 0, 4);
   $516 = $512 | 1;
   $517 = $515 + 4 | 0;
   SAFE_HEAP_STORE($517 | 0, $516 | 0, 4);
   $518 = $513 + $510 | 0;
   SAFE_HEAP_STORE($518 | 0, $512 | 0, 4);
   $519 = $$0197 | 3;
   $520 = $513 + 4 | 0;
   SAFE_HEAP_STORE($520 | 0, $519 | 0, 4);
  } else {
   SAFE_HEAP_STORE(4440 | 0, 0 | 0, 4);
   SAFE_HEAP_STORE(4452 | 0, 0 | 0, 4);
   $521 = $510 | 3;
   $522 = $513 + 4 | 0;
   SAFE_HEAP_STORE($522 | 0, $521 | 0, 4);
   $523 = $513 + $510 | 0;
   $524 = $523 + 4 | 0;
   $525 = SAFE_HEAP_LOAD($524 | 0, 4, 0) | 0 | 0;
   $526 = $525 | 1;
   SAFE_HEAP_STORE($524 | 0, $526 | 0, 4);
  }
  $527 = $513 + 8 | 0;
  $$0 = $527;
  STACKTOP = sp;
  return $$0 | 0;
 }
 $528 = SAFE_HEAP_LOAD(4444 | 0, 4, 0) | 0 | 0;
 $529 = $528 >>> 0 > $$0197 >>> 0;
 if ($529) {
  $530 = $528 - $$0197 | 0;
  SAFE_HEAP_STORE(4444 | 0, $530 | 0, 4);
  $531 = SAFE_HEAP_LOAD(4456 | 0, 4, 0) | 0 | 0;
  $532 = $531 + $$0197 | 0;
  SAFE_HEAP_STORE(4456 | 0, $532 | 0, 4);
  $533 = $530 | 1;
  $534 = $532 + 4 | 0;
  SAFE_HEAP_STORE($534 | 0, $533 | 0, 4);
  $535 = $$0197 | 3;
  $536 = $531 + 4 | 0;
  SAFE_HEAP_STORE($536 | 0, $535 | 0, 4);
  $537 = $531 + 8 | 0;
  $$0 = $537;
  STACKTOP = sp;
  return $$0 | 0;
 }
 $538 = SAFE_HEAP_LOAD(1226 * 4 | 0, 4, 0) | 0 | 0;
 $539 = ($538 | 0) == 0;
 if ($539) {
  SAFE_HEAP_STORE(4912 | 0, 4096 | 0, 4);
  SAFE_HEAP_STORE(4908 | 0, 4096 | 0, 4);
  SAFE_HEAP_STORE(4916 | 0, -1 | 0, 4);
  SAFE_HEAP_STORE(4920 | 0, -1 | 0, 4);
  SAFE_HEAP_STORE(4924 | 0, 0 | 0, 4);
  SAFE_HEAP_STORE(4876 | 0, 0 | 0, 4);
  $540 = $1;
  $541 = $540 & -16;
  $542 = $541 ^ 1431655768;
  SAFE_HEAP_STORE(1226 * 4 | 0, $542 | 0, 4);
  $546 = 4096;
 } else {
  $$pre$i210 = SAFE_HEAP_LOAD(4912 | 0, 4, 0) | 0 | 0;
  $546 = $$pre$i210;
 }
 $543 = $$0197 + 48 | 0;
 $544 = $$0197 + 47 | 0;
 $545 = $546 + $544 | 0;
 $547 = 0 - $546 | 0;
 $548 = $545 & $547;
 $549 = $548 >>> 0 > $$0197 >>> 0;
 if (!$549) {
  $$0 = 0;
  STACKTOP = sp;
  return $$0 | 0;
 }
 $550 = SAFE_HEAP_LOAD(4872 | 0, 4, 0) | 0 | 0;
 $551 = ($550 | 0) == 0;
 if (!$551) {
  $552 = SAFE_HEAP_LOAD(4864 | 0, 4, 0) | 0 | 0;
  $553 = $552 + $548 | 0;
  $554 = $553 >>> 0 <= $552 >>> 0;
  $555 = $553 >>> 0 > $550 >>> 0;
  $or$cond1$i = $554 | $555;
  if ($or$cond1$i) {
   $$0 = 0;
   STACKTOP = sp;
   return $$0 | 0;
  }
 }
 $556 = SAFE_HEAP_LOAD(4876 | 0, 4, 0) | 0 | 0;
 $557 = $556 & 4;
 $558 = ($557 | 0) == 0;
 L257 : do {
  if ($558) {
   $559 = SAFE_HEAP_LOAD(4456 | 0, 4, 0) | 0 | 0;
   $560 = ($559 | 0) == (0 | 0);
   L259 : do {
    if ($560) {
     label = 173;
    } else {
     $$0$i$i = 4880;
     while (1) {
      $561 = SAFE_HEAP_LOAD($$0$i$i | 0, 4, 0) | 0 | 0;
      $562 = $561 >>> 0 > $559 >>> 0;
      if (!$562) {
       $563 = $$0$i$i + 4 | 0;
       $564 = SAFE_HEAP_LOAD($563 | 0, 4, 0) | 0 | 0;
       $565 = $561 + $564 | 0;
       $566 = $565 >>> 0 > $559 >>> 0;
       if ($566) {
        break;
       }
      }
      $567 = $$0$i$i + 8 | 0;
      $568 = SAFE_HEAP_LOAD($567 | 0, 4, 0) | 0 | 0;
      $569 = ($568 | 0) == (0 | 0);
      if ($569) {
       label = 173;
       break L259;
      } else {
       $$0$i$i = $568;
      }
     }
     $592 = $545 - $528 | 0;
     $593 = $592 & $547;
     $594 = $593 >>> 0 < 2147483647;
     if ($594) {
      $595 = $$0$i$i + 4 | 0;
      $596 = _sbrk($593 | 0) | 0;
      $597 = SAFE_HEAP_LOAD($$0$i$i | 0, 4, 0) | 0 | 0;
      $598 = SAFE_HEAP_LOAD($595 | 0, 4, 0) | 0 | 0;
      $599 = $597 + $598 | 0;
      $600 = ($596 | 0) == ($599 | 0);
      if ($600) {
       $601 = ($596 | 0) == (-1 | 0);
       if ($601) {
        $$2234243136$i = $593;
       } else {
        $$723947$i = $593;
        $$748$i = $596;
        label = 190;
        break L257;
       }
      } else {
       $$2247$ph$i = $596;
       $$2253$ph$i = $593;
       label = 181;
      }
     } else {
      $$2234243136$i = 0;
     }
    }
   } while (0);
   do {
    if ((label | 0) == 173) {
     $570 = _sbrk(0) | 0;
     $571 = ($570 | 0) == (-1 | 0);
     if ($571) {
      $$2234243136$i = 0;
     } else {
      $572 = $570;
      $573 = SAFE_HEAP_LOAD(4908 | 0, 4, 0) | 0 | 0;
      $574 = $573 + -1 | 0;
      $575 = $574 & $572;
      $576 = ($575 | 0) == 0;
      $577 = $574 + $572 | 0;
      $578 = 0 - $573 | 0;
      $579 = $577 & $578;
      $580 = $579 - $572 | 0;
      $581 = $576 ? 0 : $580;
      $spec$select49$i = $581 + $548 | 0;
      $582 = SAFE_HEAP_LOAD(4864 | 0, 4, 0) | 0 | 0;
      $583 = $spec$select49$i + $582 | 0;
      $584 = $spec$select49$i >>> 0 > $$0197 >>> 0;
      $585 = $spec$select49$i >>> 0 < 2147483647;
      $or$cond$i213 = $584 & $585;
      if ($or$cond$i213) {
       $586 = SAFE_HEAP_LOAD(4872 | 0, 4, 0) | 0 | 0;
       $587 = ($586 | 0) == 0;
       if (!$587) {
        $588 = $583 >>> 0 <= $582 >>> 0;
        $589 = $583 >>> 0 > $586 >>> 0;
        $or$cond2$i214 = $588 | $589;
        if ($or$cond2$i214) {
         $$2234243136$i = 0;
         break;
        }
       }
       $590 = _sbrk($spec$select49$i | 0) | 0;
       $591 = ($590 | 0) == ($570 | 0);
       if ($591) {
        $$723947$i = $spec$select49$i;
        $$748$i = $570;
        label = 190;
        break L257;
       } else {
        $$2247$ph$i = $590;
        $$2253$ph$i = $spec$select49$i;
        label = 181;
       }
      } else {
       $$2234243136$i = 0;
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 181) {
     $602 = 0 - $$2253$ph$i | 0;
     $603 = ($$2247$ph$i | 0) != (-1 | 0);
     $604 = $$2253$ph$i >>> 0 < 2147483647;
     $or$cond7$i = $604 & $603;
     $605 = $543 >>> 0 > $$2253$ph$i >>> 0;
     $or$cond6$i = $605 & $or$cond7$i;
     if (!$or$cond6$i) {
      $615 = ($$2247$ph$i | 0) == (-1 | 0);
      if ($615) {
       $$2234243136$i = 0;
       break;
      } else {
       $$723947$i = $$2253$ph$i;
       $$748$i = $$2247$ph$i;
       label = 190;
       break L257;
      }
     }
     $606 = SAFE_HEAP_LOAD(4912 | 0, 4, 0) | 0 | 0;
     $607 = $544 - $$2253$ph$i | 0;
     $608 = $607 + $606 | 0;
     $609 = 0 - $606 | 0;
     $610 = $608 & $609;
     $611 = $610 >>> 0 < 2147483647;
     if (!$611) {
      $$723947$i = $$2253$ph$i;
      $$748$i = $$2247$ph$i;
      label = 190;
      break L257;
     }
     $612 = _sbrk($610 | 0) | 0;
     $613 = ($612 | 0) == (-1 | 0);
     if ($613) {
      _sbrk($602 | 0) | 0;
      $$2234243136$i = 0;
      break;
     } else {
      $614 = $610 + $$2253$ph$i | 0;
      $$723947$i = $614;
      $$748$i = $$2247$ph$i;
      label = 190;
      break L257;
     }
    }
   } while (0);
   $616 = SAFE_HEAP_LOAD(4876 | 0, 4, 0) | 0 | 0;
   $617 = $616 | 4;
   SAFE_HEAP_STORE(4876 | 0, $617 | 0, 4);
   $$4236$i = $$2234243136$i;
   label = 188;
  } else {
   $$4236$i = 0;
   label = 188;
  }
 } while (0);
 if ((label | 0) == 188) {
  $618 = $548 >>> 0 < 2147483647;
  if ($618) {
   $619 = _sbrk($548 | 0) | 0;
   $620 = _sbrk(0) | 0;
   $621 = ($619 | 0) != (-1 | 0);
   $622 = ($620 | 0) != (-1 | 0);
   $or$cond5$i = $621 & $622;
   $623 = $619 >>> 0 < $620 >>> 0;
   $or$cond8$i = $623 & $or$cond5$i;
   $624 = $620;
   $625 = $619;
   $626 = $624 - $625 | 0;
   $627 = $$0197 + 40 | 0;
   $628 = $626 >>> 0 > $627 >>> 0;
   $spec$select9$i = $628 ? $626 : $$4236$i;
   $or$cond8$not$i = $or$cond8$i ^ 1;
   $629 = ($619 | 0) == (-1 | 0);
   $not$$i = $628 ^ 1;
   $630 = $629 | $not$$i;
   $or$cond50$i = $630 | $or$cond8$not$i;
   if (!$or$cond50$i) {
    $$723947$i = $spec$select9$i;
    $$748$i = $619;
    label = 190;
   }
  }
 }
 if ((label | 0) == 190) {
  $631 = SAFE_HEAP_LOAD(4864 | 0, 4, 0) | 0 | 0;
  $632 = $631 + $$723947$i | 0;
  SAFE_HEAP_STORE(4864 | 0, $632 | 0, 4);
  $633 = SAFE_HEAP_LOAD(4868 | 0, 4, 0) | 0 | 0;
  $634 = $632 >>> 0 > $633 >>> 0;
  if ($634) {
   SAFE_HEAP_STORE(4868 | 0, $632 | 0, 4);
  }
  $635 = SAFE_HEAP_LOAD(4456 | 0, 4, 0) | 0 | 0;
  $636 = ($635 | 0) == (0 | 0);
  L294 : do {
   if ($636) {
    $637 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
    $638 = ($637 | 0) == (0 | 0);
    $639 = $$748$i >>> 0 < $637 >>> 0;
    $or$cond11$i = $638 | $639;
    if ($or$cond11$i) {
     SAFE_HEAP_STORE(4448 | 0, $$748$i | 0, 4);
    }
    SAFE_HEAP_STORE(4880 | 0, $$748$i | 0, 4);
    SAFE_HEAP_STORE(4884 | 0, $$723947$i | 0, 4);
    SAFE_HEAP_STORE(4892 | 0, 0 | 0, 4);
    $640 = SAFE_HEAP_LOAD(1226 * 4 | 0, 4, 0) | 0 | 0;
    SAFE_HEAP_STORE(4468 | 0, $640 | 0, 4);
    SAFE_HEAP_STORE(4464 | 0, -1 | 0, 4);
    SAFE_HEAP_STORE(4484 | 0, 4472 | 0, 4);
    SAFE_HEAP_STORE(4480 | 0, 4472 | 0, 4);
    SAFE_HEAP_STORE(4492 | 0, 4480 | 0, 4);
    SAFE_HEAP_STORE(4488 | 0, 4480 | 0, 4);
    SAFE_HEAP_STORE(4500 | 0, 4488 | 0, 4);
    SAFE_HEAP_STORE(4496 | 0, 4488 | 0, 4);
    SAFE_HEAP_STORE(4508 | 0, 4496 | 0, 4);
    SAFE_HEAP_STORE(4504 | 0, 4496 | 0, 4);
    SAFE_HEAP_STORE(4516 | 0, 4504 | 0, 4);
    SAFE_HEAP_STORE(4512 | 0, 4504 | 0, 4);
    SAFE_HEAP_STORE(4524 | 0, 4512 | 0, 4);
    SAFE_HEAP_STORE(4520 | 0, 4512 | 0, 4);
    SAFE_HEAP_STORE(4532 | 0, 4520 | 0, 4);
    SAFE_HEAP_STORE(4528 | 0, 4520 | 0, 4);
    SAFE_HEAP_STORE(4540 | 0, 4528 | 0, 4);
    SAFE_HEAP_STORE(4536 | 0, 4528 | 0, 4);
    SAFE_HEAP_STORE(4548 | 0, 4536 | 0, 4);
    SAFE_HEAP_STORE(4544 | 0, 4536 | 0, 4);
    SAFE_HEAP_STORE(4556 | 0, 4544 | 0, 4);
    SAFE_HEAP_STORE(4552 | 0, 4544 | 0, 4);
    SAFE_HEAP_STORE(4564 | 0, 4552 | 0, 4);
    SAFE_HEAP_STORE(4560 | 0, 4552 | 0, 4);
    SAFE_HEAP_STORE(4572 | 0, 4560 | 0, 4);
    SAFE_HEAP_STORE(4568 | 0, 4560 | 0, 4);
    SAFE_HEAP_STORE(4580 | 0, 4568 | 0, 4);
    SAFE_HEAP_STORE(4576 | 0, 4568 | 0, 4);
    SAFE_HEAP_STORE(4588 | 0, 4576 | 0, 4);
    SAFE_HEAP_STORE(4584 | 0, 4576 | 0, 4);
    SAFE_HEAP_STORE(4596 | 0, 4584 | 0, 4);
    SAFE_HEAP_STORE(4592 | 0, 4584 | 0, 4);
    SAFE_HEAP_STORE(4604 | 0, 4592 | 0, 4);
    SAFE_HEAP_STORE(4600 | 0, 4592 | 0, 4);
    SAFE_HEAP_STORE(4612 | 0, 4600 | 0, 4);
    SAFE_HEAP_STORE(4608 | 0, 4600 | 0, 4);
    SAFE_HEAP_STORE(4620 | 0, 4608 | 0, 4);
    SAFE_HEAP_STORE(4616 | 0, 4608 | 0, 4);
    SAFE_HEAP_STORE(4628 | 0, 4616 | 0, 4);
    SAFE_HEAP_STORE(4624 | 0, 4616 | 0, 4);
    SAFE_HEAP_STORE(4636 | 0, 4624 | 0, 4);
    SAFE_HEAP_STORE(4632 | 0, 4624 | 0, 4);
    SAFE_HEAP_STORE(4644 | 0, 4632 | 0, 4);
    SAFE_HEAP_STORE(4640 | 0, 4632 | 0, 4);
    SAFE_HEAP_STORE(4652 | 0, 4640 | 0, 4);
    SAFE_HEAP_STORE(4648 | 0, 4640 | 0, 4);
    SAFE_HEAP_STORE(4660 | 0, 4648 | 0, 4);
    SAFE_HEAP_STORE(4656 | 0, 4648 | 0, 4);
    SAFE_HEAP_STORE(4668 | 0, 4656 | 0, 4);
    SAFE_HEAP_STORE(4664 | 0, 4656 | 0, 4);
    SAFE_HEAP_STORE(4676 | 0, 4664 | 0, 4);
    SAFE_HEAP_STORE(4672 | 0, 4664 | 0, 4);
    SAFE_HEAP_STORE(4684 | 0, 4672 | 0, 4);
    SAFE_HEAP_STORE(4680 | 0, 4672 | 0, 4);
    SAFE_HEAP_STORE(4692 | 0, 4680 | 0, 4);
    SAFE_HEAP_STORE(4688 | 0, 4680 | 0, 4);
    SAFE_HEAP_STORE(4700 | 0, 4688 | 0, 4);
    SAFE_HEAP_STORE(4696 | 0, 4688 | 0, 4);
    SAFE_HEAP_STORE(4708 | 0, 4696 | 0, 4);
    SAFE_HEAP_STORE(4704 | 0, 4696 | 0, 4);
    SAFE_HEAP_STORE(4716 | 0, 4704 | 0, 4);
    SAFE_HEAP_STORE(4712 | 0, 4704 | 0, 4);
    SAFE_HEAP_STORE(4724 | 0, 4712 | 0, 4);
    SAFE_HEAP_STORE(4720 | 0, 4712 | 0, 4);
    SAFE_HEAP_STORE(4732 | 0, 4720 | 0, 4);
    SAFE_HEAP_STORE(4728 | 0, 4720 | 0, 4);
    $641 = $$723947$i + -40 | 0;
    $642 = $$748$i + 8 | 0;
    $643 = $642;
    $644 = $643 & 7;
    $645 = ($644 | 0) == 0;
    $646 = 0 - $643 | 0;
    $647 = $646 & 7;
    $648 = $645 ? 0 : $647;
    $649 = $$748$i + $648 | 0;
    $650 = $641 - $648 | 0;
    SAFE_HEAP_STORE(4456 | 0, $649 | 0, 4);
    SAFE_HEAP_STORE(4444 | 0, $650 | 0, 4);
    $651 = $650 | 1;
    $652 = $649 + 4 | 0;
    SAFE_HEAP_STORE($652 | 0, $651 | 0, 4);
    $653 = $$748$i + $641 | 0;
    $654 = $653 + 4 | 0;
    SAFE_HEAP_STORE($654 | 0, 40 | 0, 4);
    $655 = SAFE_HEAP_LOAD(4920 | 0, 4, 0) | 0 | 0;
    SAFE_HEAP_STORE(4460 | 0, $655 | 0, 4);
   } else {
    $$024372$i = 4880;
    while (1) {
     $656 = SAFE_HEAP_LOAD($$024372$i | 0, 4, 0) | 0 | 0;
     $657 = $$024372$i + 4 | 0;
     $658 = SAFE_HEAP_LOAD($657 | 0, 4, 0) | 0 | 0;
     $659 = $656 + $658 | 0;
     $660 = ($$748$i | 0) == ($659 | 0);
     if ($660) {
      label = 199;
      break;
     }
     $661 = $$024372$i + 8 | 0;
     $662 = SAFE_HEAP_LOAD($661 | 0, 4, 0) | 0 | 0;
     $663 = ($662 | 0) == (0 | 0);
     if ($663) {
      break;
     } else {
      $$024372$i = $662;
     }
    }
    if ((label | 0) == 199) {
     $664 = $$024372$i + 4 | 0;
     $665 = $$024372$i + 12 | 0;
     $666 = SAFE_HEAP_LOAD($665 | 0, 4, 0) | 0 | 0;
     $667 = $666 & 8;
     $668 = ($667 | 0) == 0;
     if ($668) {
      $669 = $656 >>> 0 <= $635 >>> 0;
      $670 = $$748$i >>> 0 > $635 >>> 0;
      $or$cond51$i = $670 & $669;
      if ($or$cond51$i) {
       $671 = $658 + $$723947$i | 0;
       SAFE_HEAP_STORE($664 | 0, $671 | 0, 4);
       $672 = SAFE_HEAP_LOAD(4444 | 0, 4, 0) | 0 | 0;
       $673 = $672 + $$723947$i | 0;
       $674 = $635 + 8 | 0;
       $675 = $674;
       $676 = $675 & 7;
       $677 = ($676 | 0) == 0;
       $678 = 0 - $675 | 0;
       $679 = $678 & 7;
       $680 = $677 ? 0 : $679;
       $681 = $635 + $680 | 0;
       $682 = $673 - $680 | 0;
       SAFE_HEAP_STORE(4456 | 0, $681 | 0, 4);
       SAFE_HEAP_STORE(4444 | 0, $682 | 0, 4);
       $683 = $682 | 1;
       $684 = $681 + 4 | 0;
       SAFE_HEAP_STORE($684 | 0, $683 | 0, 4);
       $685 = $635 + $673 | 0;
       $686 = $685 + 4 | 0;
       SAFE_HEAP_STORE($686 | 0, 40 | 0, 4);
       $687 = SAFE_HEAP_LOAD(4920 | 0, 4, 0) | 0 | 0;
       SAFE_HEAP_STORE(4460 | 0, $687 | 0, 4);
       break;
      }
     }
    }
    $688 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
    $689 = $$748$i >>> 0 < $688 >>> 0;
    if ($689) {
     SAFE_HEAP_STORE(4448 | 0, $$748$i | 0, 4);
     $753 = $$748$i;
    } else {
     $753 = $688;
    }
    $690 = $$748$i + $$723947$i | 0;
    $$124471$i = 4880;
    while (1) {
     $691 = SAFE_HEAP_LOAD($$124471$i | 0, 4, 0) | 0 | 0;
     $692 = ($691 | 0) == ($690 | 0);
     if ($692) {
      label = 207;
      break;
     }
     $693 = $$124471$i + 8 | 0;
     $694 = SAFE_HEAP_LOAD($693 | 0, 4, 0) | 0 | 0;
     $695 = ($694 | 0) == (0 | 0);
     if ($695) {
      break;
     } else {
      $$124471$i = $694;
     }
    }
    if ((label | 0) == 207) {
     $696 = $$124471$i + 12 | 0;
     $697 = SAFE_HEAP_LOAD($696 | 0, 4, 0) | 0 | 0;
     $698 = $697 & 8;
     $699 = ($698 | 0) == 0;
     if ($699) {
      SAFE_HEAP_STORE($$124471$i | 0, $$748$i | 0, 4);
      $700 = $$124471$i + 4 | 0;
      $701 = SAFE_HEAP_LOAD($700 | 0, 4, 0) | 0 | 0;
      $702 = $701 + $$723947$i | 0;
      SAFE_HEAP_STORE($700 | 0, $702 | 0, 4);
      $703 = $$748$i + 8 | 0;
      $704 = $703;
      $705 = $704 & 7;
      $706 = ($705 | 0) == 0;
      $707 = 0 - $704 | 0;
      $708 = $707 & 7;
      $709 = $706 ? 0 : $708;
      $710 = $$748$i + $709 | 0;
      $711 = $690 + 8 | 0;
      $712 = $711;
      $713 = $712 & 7;
      $714 = ($713 | 0) == 0;
      $715 = 0 - $712 | 0;
      $716 = $715 & 7;
      $717 = $714 ? 0 : $716;
      $718 = $690 + $717 | 0;
      $719 = $718;
      $720 = $710;
      $721 = $719 - $720 | 0;
      $722 = $710 + $$0197 | 0;
      $723 = $721 - $$0197 | 0;
      $724 = $$0197 | 3;
      $725 = $710 + 4 | 0;
      SAFE_HEAP_STORE($725 | 0, $724 | 0, 4);
      $726 = ($635 | 0) == ($718 | 0);
      L317 : do {
       if ($726) {
        $727 = SAFE_HEAP_LOAD(4444 | 0, 4, 0) | 0 | 0;
        $728 = $727 + $723 | 0;
        SAFE_HEAP_STORE(4444 | 0, $728 | 0, 4);
        SAFE_HEAP_STORE(4456 | 0, $722 | 0, 4);
        $729 = $728 | 1;
        $730 = $722 + 4 | 0;
        SAFE_HEAP_STORE($730 | 0, $729 | 0, 4);
       } else {
        $731 = SAFE_HEAP_LOAD(4452 | 0, 4, 0) | 0 | 0;
        $732 = ($731 | 0) == ($718 | 0);
        if ($732) {
         $733 = SAFE_HEAP_LOAD(4440 | 0, 4, 0) | 0 | 0;
         $734 = $733 + $723 | 0;
         SAFE_HEAP_STORE(4440 | 0, $734 | 0, 4);
         SAFE_HEAP_STORE(4452 | 0, $722 | 0, 4);
         $735 = $734 | 1;
         $736 = $722 + 4 | 0;
         SAFE_HEAP_STORE($736 | 0, $735 | 0, 4);
         $737 = $722 + $734 | 0;
         SAFE_HEAP_STORE($737 | 0, $734 | 0, 4);
         break;
        }
        $738 = $718 + 4 | 0;
        $739 = SAFE_HEAP_LOAD($738 | 0, 4, 0) | 0 | 0;
        $740 = $739 & 3;
        $741 = ($740 | 0) == 1;
        if ($741) {
         $742 = $739 & -8;
         $743 = $739 >>> 3;
         $744 = $739 >>> 0 < 256;
         L325 : do {
          if ($744) {
           $745 = $718 + 8 | 0;
           $746 = SAFE_HEAP_LOAD($745 | 0, 4, 0) | 0 | 0;
           $747 = $718 + 12 | 0;
           $748 = SAFE_HEAP_LOAD($747 | 0, 4, 0) | 0 | 0;
           $749 = $743 << 1;
           $750 = 4472 + ($749 << 2) | 0;
           $751 = ($746 | 0) == ($750 | 0);
           do {
            if (!$751) {
             $752 = $753 >>> 0 > $746 >>> 0;
             if ($752) {
              _abort();
             }
             $754 = $746 + 12 | 0;
             $755 = SAFE_HEAP_LOAD($754 | 0, 4, 0) | 0 | 0;
             $756 = ($755 | 0) == ($718 | 0);
             if ($756) {
              break;
             }
             _abort();
            }
           } while (0);
           $757 = ($748 | 0) == ($746 | 0);
           if ($757) {
            $758 = 1 << $743;
            $759 = $758 ^ -1;
            $760 = SAFE_HEAP_LOAD(1108 * 4 | 0, 4, 0) | 0 | 0;
            $761 = $760 & $759;
            SAFE_HEAP_STORE(1108 * 4 | 0, $761 | 0, 4);
            break;
           }
           $762 = ($748 | 0) == ($750 | 0);
           do {
            if ($762) {
             $$pre16$i$i = $748 + 8 | 0;
             $$pre$phi17$i$iZ2D = $$pre16$i$i;
            } else {
             $763 = $753 >>> 0 > $748 >>> 0;
             if ($763) {
              _abort();
             }
             $764 = $748 + 8 | 0;
             $765 = SAFE_HEAP_LOAD($764 | 0, 4, 0) | 0 | 0;
             $766 = ($765 | 0) == ($718 | 0);
             if ($766) {
              $$pre$phi17$i$iZ2D = $764;
              break;
             }
             _abort();
            }
           } while (0);
           $767 = $746 + 12 | 0;
           SAFE_HEAP_STORE($767 | 0, $748 | 0, 4);
           SAFE_HEAP_STORE($$pre$phi17$i$iZ2D | 0, $746 | 0, 4);
          } else {
           $768 = $718 + 24 | 0;
           $769 = SAFE_HEAP_LOAD($768 | 0, 4, 0) | 0 | 0;
           $770 = $718 + 12 | 0;
           $771 = SAFE_HEAP_LOAD($770 | 0, 4, 0) | 0 | 0;
           $772 = ($771 | 0) == ($718 | 0);
           do {
            if ($772) {
             $782 = $718 + 16 | 0;
             $783 = $782 + 4 | 0;
             $784 = SAFE_HEAP_LOAD($783 | 0, 4, 0) | 0 | 0;
             $785 = ($784 | 0) == (0 | 0);
             if ($785) {
              $786 = SAFE_HEAP_LOAD($782 | 0, 4, 0) | 0 | 0;
              $787 = ($786 | 0) == (0 | 0);
              if ($787) {
               $$3$i$i = 0;
               break;
              } else {
               $$1290$i$i$ph = $786;
               $$1292$i$i$ph = $782;
              }
             } else {
              $$1290$i$i$ph = $784;
              $$1292$i$i$ph = $783;
             }
             $$1290$i$i = $$1290$i$i$ph;
             $$1292$i$i = $$1292$i$i$ph;
             while (1) {
              $788 = $$1290$i$i + 20 | 0;
              $789 = SAFE_HEAP_LOAD($788 | 0, 4, 0) | 0 | 0;
              $790 = ($789 | 0) == (0 | 0);
              if ($790) {
               $791 = $$1290$i$i + 16 | 0;
               $792 = SAFE_HEAP_LOAD($791 | 0, 4, 0) | 0 | 0;
               $793 = ($792 | 0) == (0 | 0);
               if ($793) {
                break;
               } else {
                $$1290$i$i$be = $792;
                $$1292$i$i$be = $791;
               }
              } else {
               $$1290$i$i$be = $789;
               $$1292$i$i$be = $788;
              }
              $$1290$i$i = $$1290$i$i$be;
              $$1292$i$i = $$1292$i$i$be;
             }
             $794 = $753 >>> 0 > $$1292$i$i >>> 0;
             if ($794) {
              _abort();
             } else {
              SAFE_HEAP_STORE($$1292$i$i | 0, 0 | 0, 4);
              $$3$i$i = $$1290$i$i;
              break;
             }
            } else {
             $773 = $718 + 8 | 0;
             $774 = SAFE_HEAP_LOAD($773 | 0, 4, 0) | 0 | 0;
             $775 = $753 >>> 0 > $774 >>> 0;
             if ($775) {
              _abort();
             }
             $776 = $774 + 12 | 0;
             $777 = SAFE_HEAP_LOAD($776 | 0, 4, 0) | 0 | 0;
             $778 = ($777 | 0) == ($718 | 0);
             if (!$778) {
              _abort();
             }
             $779 = $771 + 8 | 0;
             $780 = SAFE_HEAP_LOAD($779 | 0, 4, 0) | 0 | 0;
             $781 = ($780 | 0) == ($718 | 0);
             if ($781) {
              SAFE_HEAP_STORE($776 | 0, $771 | 0, 4);
              SAFE_HEAP_STORE($779 | 0, $774 | 0, 4);
              $$3$i$i = $771;
              break;
             } else {
              _abort();
             }
            }
           } while (0);
           $795 = ($769 | 0) == (0 | 0);
           if ($795) {
            break;
           }
           $796 = $718 + 28 | 0;
           $797 = SAFE_HEAP_LOAD($796 | 0, 4, 0) | 0 | 0;
           $798 = 4736 + ($797 << 2) | 0;
           $799 = SAFE_HEAP_LOAD($798 | 0, 4, 0) | 0 | 0;
           $800 = ($799 | 0) == ($718 | 0);
           do {
            if ($800) {
             SAFE_HEAP_STORE($798 | 0, $$3$i$i | 0, 4);
             $cond$i$i = ($$3$i$i | 0) == (0 | 0);
             if (!$cond$i$i) {
              break;
             }
             $801 = 1 << $797;
             $802 = $801 ^ -1;
             $803 = SAFE_HEAP_LOAD(4436 | 0, 4, 0) | 0 | 0;
             $804 = $803 & $802;
             SAFE_HEAP_STORE(4436 | 0, $804 | 0, 4);
             break L325;
            } else {
             $805 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
             $806 = $805 >>> 0 > $769 >>> 0;
             if ($806) {
              _abort();
             } else {
              $807 = $769 + 16 | 0;
              $808 = SAFE_HEAP_LOAD($807 | 0, 4, 0) | 0 | 0;
              $809 = ($808 | 0) == ($718 | 0);
              $810 = $769 + 20 | 0;
              $$sink326 = $809 ? $807 : $810;
              SAFE_HEAP_STORE($$sink326 | 0, $$3$i$i | 0, 4);
              $811 = ($$3$i$i | 0) == (0 | 0);
              if ($811) {
               break L325;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
           $813 = $812 >>> 0 > $$3$i$i >>> 0;
           if ($813) {
            _abort();
           }
           $814 = $$3$i$i + 24 | 0;
           SAFE_HEAP_STORE($814 | 0, $769 | 0, 4);
           $815 = $718 + 16 | 0;
           $816 = SAFE_HEAP_LOAD($815 | 0, 4, 0) | 0 | 0;
           $817 = ($816 | 0) == (0 | 0);
           do {
            if (!$817) {
             $818 = $812 >>> 0 > $816 >>> 0;
             if ($818) {
              _abort();
             } else {
              $819 = $$3$i$i + 16 | 0;
              SAFE_HEAP_STORE($819 | 0, $816 | 0, 4);
              $820 = $816 + 24 | 0;
              SAFE_HEAP_STORE($820 | 0, $$3$i$i | 0, 4);
              break;
             }
            }
           } while (0);
           $821 = $815 + 4 | 0;
           $822 = SAFE_HEAP_LOAD($821 | 0, 4, 0) | 0 | 0;
           $823 = ($822 | 0) == (0 | 0);
           if ($823) {
            break;
           }
           $824 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
           $825 = $824 >>> 0 > $822 >>> 0;
           if ($825) {
            _abort();
           } else {
            $826 = $$3$i$i + 20 | 0;
            SAFE_HEAP_STORE($826 | 0, $822 | 0, 4);
            $827 = $822 + 24 | 0;
            SAFE_HEAP_STORE($827 | 0, $$3$i$i | 0, 4);
            break;
           }
          }
         } while (0);
         $828 = $718 + $742 | 0;
         $829 = $742 + $723 | 0;
         $$0$i16$i = $828;
         $$0286$i$i = $829;
        } else {
         $$0$i16$i = $718;
         $$0286$i$i = $723;
        }
        $830 = $$0$i16$i + 4 | 0;
        $831 = SAFE_HEAP_LOAD($830 | 0, 4, 0) | 0 | 0;
        $832 = $831 & -2;
        SAFE_HEAP_STORE($830 | 0, $832 | 0, 4);
        $833 = $$0286$i$i | 1;
        $834 = $722 + 4 | 0;
        SAFE_HEAP_STORE($834 | 0, $833 | 0, 4);
        $835 = $722 + $$0286$i$i | 0;
        SAFE_HEAP_STORE($835 | 0, $$0286$i$i | 0, 4);
        $836 = $$0286$i$i >>> 3;
        $837 = $$0286$i$i >>> 0 < 256;
        if ($837) {
         $838 = $836 << 1;
         $839 = 4472 + ($838 << 2) | 0;
         $840 = SAFE_HEAP_LOAD(1108 * 4 | 0, 4, 0) | 0 | 0;
         $841 = 1 << $836;
         $842 = $840 & $841;
         $843 = ($842 | 0) == 0;
         do {
          if ($843) {
           $844 = $840 | $841;
           SAFE_HEAP_STORE(1108 * 4 | 0, $844 | 0, 4);
           $$pre$i17$i = $839 + 8 | 0;
           $$0294$i$i = $839;
           $$pre$phi$i18$iZ2D = $$pre$i17$i;
          } else {
           $845 = $839 + 8 | 0;
           $846 = SAFE_HEAP_LOAD($845 | 0, 4, 0) | 0 | 0;
           $847 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
           $848 = $847 >>> 0 > $846 >>> 0;
           if (!$848) {
            $$0294$i$i = $846;
            $$pre$phi$i18$iZ2D = $845;
            break;
           }
           _abort();
          }
         } while (0);
         SAFE_HEAP_STORE($$pre$phi$i18$iZ2D | 0, $722 | 0, 4);
         $849 = $$0294$i$i + 12 | 0;
         SAFE_HEAP_STORE($849 | 0, $722 | 0, 4);
         $850 = $722 + 8 | 0;
         SAFE_HEAP_STORE($850 | 0, $$0294$i$i | 0, 4);
         $851 = $722 + 12 | 0;
         SAFE_HEAP_STORE($851 | 0, $839 | 0, 4);
         break;
        }
        $852 = $$0286$i$i >>> 8;
        $853 = ($852 | 0) == 0;
        do {
         if ($853) {
          $$0295$i$i = 0;
         } else {
          $854 = $$0286$i$i >>> 0 > 16777215;
          if ($854) {
           $$0295$i$i = 31;
           break;
          }
          $855 = $852 + 1048320 | 0;
          $856 = $855 >>> 16;
          $857 = $856 & 8;
          $858 = $852 << $857;
          $859 = $858 + 520192 | 0;
          $860 = $859 >>> 16;
          $861 = $860 & 4;
          $862 = $861 | $857;
          $863 = $858 << $861;
          $864 = $863 + 245760 | 0;
          $865 = $864 >>> 16;
          $866 = $865 & 2;
          $867 = $862 | $866;
          $868 = 14 - $867 | 0;
          $869 = $863 << $866;
          $870 = $869 >>> 15;
          $871 = $868 + $870 | 0;
          $872 = $871 << 1;
          $873 = $871 + 7 | 0;
          $874 = $$0286$i$i >>> $873;
          $875 = $874 & 1;
          $876 = $875 | $872;
          $$0295$i$i = $876;
         }
        } while (0);
        $877 = 4736 + ($$0295$i$i << 2) | 0;
        $878 = $722 + 28 | 0;
        SAFE_HEAP_STORE($878 | 0, $$0295$i$i | 0, 4);
        $879 = $722 + 16 | 0;
        $880 = $879 + 4 | 0;
        SAFE_HEAP_STORE($880 | 0, 0 | 0, 4);
        SAFE_HEAP_STORE($879 | 0, 0 | 0, 4);
        $881 = SAFE_HEAP_LOAD(4436 | 0, 4, 0) | 0 | 0;
        $882 = 1 << $$0295$i$i;
        $883 = $881 & $882;
        $884 = ($883 | 0) == 0;
        if ($884) {
         $885 = $881 | $882;
         SAFE_HEAP_STORE(4436 | 0, $885 | 0, 4);
         SAFE_HEAP_STORE($877 | 0, $722 | 0, 4);
         $886 = $722 + 24 | 0;
         SAFE_HEAP_STORE($886 | 0, $877 | 0, 4);
         $887 = $722 + 12 | 0;
         SAFE_HEAP_STORE($887 | 0, $722 | 0, 4);
         $888 = $722 + 8 | 0;
         SAFE_HEAP_STORE($888 | 0, $722 | 0, 4);
         break;
        }
        $889 = SAFE_HEAP_LOAD($877 | 0, 4, 0) | 0 | 0;
        $890 = $889 + 4 | 0;
        $891 = SAFE_HEAP_LOAD($890 | 0, 4, 0) | 0 | 0;
        $892 = $891 & -8;
        $893 = ($892 | 0) == ($$0286$i$i | 0);
        L410 : do {
         if ($893) {
          $$0288$lcssa$i$i = $889;
         } else {
          $894 = ($$0295$i$i | 0) == 31;
          $895 = $$0295$i$i >>> 1;
          $896 = 25 - $895 | 0;
          $897 = $894 ? 0 : $896;
          $898 = $$0286$i$i << $897;
          $$028711$i$i = $898;
          $$028810$i$i = $889;
          while (1) {
           $905 = $$028711$i$i >>> 31;
           $906 = ($$028810$i$i + 16 | 0) + ($905 << 2) | 0;
           $901 = SAFE_HEAP_LOAD($906 | 0, 4, 0) | 0 | 0;
           $907 = ($901 | 0) == (0 | 0);
           if ($907) {
            break;
           }
           $899 = $$028711$i$i << 1;
           $900 = $901 + 4 | 0;
           $902 = SAFE_HEAP_LOAD($900 | 0, 4, 0) | 0 | 0;
           $903 = $902 & -8;
           $904 = ($903 | 0) == ($$0286$i$i | 0);
           if ($904) {
            $$0288$lcssa$i$i = $901;
            break L410;
           } else {
            $$028711$i$i = $899;
            $$028810$i$i = $901;
           }
          }
          $908 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
          $909 = $908 >>> 0 > $906 >>> 0;
          if ($909) {
           _abort();
          } else {
           SAFE_HEAP_STORE($906 | 0, $722 | 0, 4);
           $910 = $722 + 24 | 0;
           SAFE_HEAP_STORE($910 | 0, $$028810$i$i | 0, 4);
           $911 = $722 + 12 | 0;
           SAFE_HEAP_STORE($911 | 0, $722 | 0, 4);
           $912 = $722 + 8 | 0;
           SAFE_HEAP_STORE($912 | 0, $722 | 0, 4);
           break L317;
          }
         }
        } while (0);
        $913 = $$0288$lcssa$i$i + 8 | 0;
        $914 = SAFE_HEAP_LOAD($913 | 0, 4, 0) | 0 | 0;
        $915 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
        $916 = $915 >>> 0 <= $$0288$lcssa$i$i >>> 0;
        $917 = $915 >>> 0 <= $914 >>> 0;
        $918 = $917 & $916;
        if ($918) {
         $919 = $914 + 12 | 0;
         SAFE_HEAP_STORE($919 | 0, $722 | 0, 4);
         SAFE_HEAP_STORE($913 | 0, $722 | 0, 4);
         $920 = $722 + 8 | 0;
         SAFE_HEAP_STORE($920 | 0, $914 | 0, 4);
         $921 = $722 + 12 | 0;
         SAFE_HEAP_STORE($921 | 0, $$0288$lcssa$i$i | 0, 4);
         $922 = $722 + 24 | 0;
         SAFE_HEAP_STORE($922 | 0, 0 | 0, 4);
         break;
        } else {
         _abort();
        }
       }
      } while (0);
      $1059 = $710 + 8 | 0;
      $$0 = $1059;
      STACKTOP = sp;
      return $$0 | 0;
     }
    }
    $$0$i$i$i = 4880;
    while (1) {
     $923 = SAFE_HEAP_LOAD($$0$i$i$i | 0, 4, 0) | 0 | 0;
     $924 = $923 >>> 0 > $635 >>> 0;
     if (!$924) {
      $925 = $$0$i$i$i + 4 | 0;
      $926 = SAFE_HEAP_LOAD($925 | 0, 4, 0) | 0 | 0;
      $927 = $923 + $926 | 0;
      $928 = $927 >>> 0 > $635 >>> 0;
      if ($928) {
       break;
      }
     }
     $929 = $$0$i$i$i + 8 | 0;
     $930 = SAFE_HEAP_LOAD($929 | 0, 4, 0) | 0 | 0;
     $$0$i$i$i = $930;
    }
    $931 = $927 + -47 | 0;
    $932 = $931 + 8 | 0;
    $933 = $932;
    $934 = $933 & 7;
    $935 = ($934 | 0) == 0;
    $936 = 0 - $933 | 0;
    $937 = $936 & 7;
    $938 = $935 ? 0 : $937;
    $939 = $931 + $938 | 0;
    $940 = $635 + 16 | 0;
    $941 = $939 >>> 0 < $940 >>> 0;
    $942 = $941 ? $635 : $939;
    $943 = $942 + 8 | 0;
    $944 = $942 + 24 | 0;
    $945 = $$723947$i + -40 | 0;
    $946 = $$748$i + 8 | 0;
    $947 = $946;
    $948 = $947 & 7;
    $949 = ($948 | 0) == 0;
    $950 = 0 - $947 | 0;
    $951 = $950 & 7;
    $952 = $949 ? 0 : $951;
    $953 = $$748$i + $952 | 0;
    $954 = $945 - $952 | 0;
    SAFE_HEAP_STORE(4456 | 0, $953 | 0, 4);
    SAFE_HEAP_STORE(4444 | 0, $954 | 0, 4);
    $955 = $954 | 1;
    $956 = $953 + 4 | 0;
    SAFE_HEAP_STORE($956 | 0, $955 | 0, 4);
    $957 = $$748$i + $945 | 0;
    $958 = $957 + 4 | 0;
    SAFE_HEAP_STORE($958 | 0, 40 | 0, 4);
    $959 = SAFE_HEAP_LOAD(4920 | 0, 4, 0) | 0 | 0;
    SAFE_HEAP_STORE(4460 | 0, $959 | 0, 4);
    $960 = $942 + 4 | 0;
    SAFE_HEAP_STORE($960 | 0, 27 | 0, 4);
    {}
    SAFE_HEAP_STORE($943 | 0, SAFE_HEAP_LOAD(4880 | 0, 4, 0) | 0 | 0 | 0, 4);
    SAFE_HEAP_STORE($943 + 4 | 0, SAFE_HEAP_LOAD(4880 + 4 | 0, 4, 0) | 0 | 0 | 0, 4);
    SAFE_HEAP_STORE($943 + 8 | 0, SAFE_HEAP_LOAD(4880 + 8 | 0, 4, 0) | 0 | 0 | 0, 4);
    SAFE_HEAP_STORE($943 + 12 | 0, SAFE_HEAP_LOAD(4880 + 12 | 0, 4, 0) | 0 | 0 | 0, 4);
    SAFE_HEAP_STORE(4880 | 0, $$748$i | 0, 4);
    SAFE_HEAP_STORE(4884 | 0, $$723947$i | 0, 4);
    SAFE_HEAP_STORE(4892 | 0, 0 | 0, 4);
    SAFE_HEAP_STORE(4888 | 0, $943 | 0, 4);
    $962 = $944;
    while (1) {
     $961 = $962 + 4 | 0;
     SAFE_HEAP_STORE($961 | 0, 7 | 0, 4);
     $963 = $962 + 8 | 0;
     $964 = $963 >>> 0 < $927 >>> 0;
     if ($964) {
      $962 = $961;
     } else {
      break;
     }
    }
    $965 = ($942 | 0) == ($635 | 0);
    if (!$965) {
     $966 = $942;
     $967 = $635;
     $968 = $966 - $967 | 0;
     $969 = SAFE_HEAP_LOAD($960 | 0, 4, 0) | 0 | 0;
     $970 = $969 & -2;
     SAFE_HEAP_STORE($960 | 0, $970 | 0, 4);
     $971 = $968 | 1;
     $972 = $635 + 4 | 0;
     SAFE_HEAP_STORE($972 | 0, $971 | 0, 4);
     SAFE_HEAP_STORE($942 | 0, $968 | 0, 4);
     $973 = $968 >>> 3;
     $974 = $968 >>> 0 < 256;
     if ($974) {
      $975 = $973 << 1;
      $976 = 4472 + ($975 << 2) | 0;
      $977 = SAFE_HEAP_LOAD(1108 * 4 | 0, 4, 0) | 0 | 0;
      $978 = 1 << $973;
      $979 = $977 & $978;
      $980 = ($979 | 0) == 0;
      if ($980) {
       $981 = $977 | $978;
       SAFE_HEAP_STORE(1108 * 4 | 0, $981 | 0, 4);
       $$pre$i$i = $976 + 8 | 0;
       $$0211$i$i = $976;
       $$pre$phi$i$iZ2D = $$pre$i$i;
      } else {
       $982 = $976 + 8 | 0;
       $983 = SAFE_HEAP_LOAD($982 | 0, 4, 0) | 0 | 0;
       $984 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
       $985 = $984 >>> 0 > $983 >>> 0;
       if ($985) {
        _abort();
       } else {
        $$0211$i$i = $983;
        $$pre$phi$i$iZ2D = $982;
       }
      }
      SAFE_HEAP_STORE($$pre$phi$i$iZ2D | 0, $635 | 0, 4);
      $986 = $$0211$i$i + 12 | 0;
      SAFE_HEAP_STORE($986 | 0, $635 | 0, 4);
      $987 = $635 + 8 | 0;
      SAFE_HEAP_STORE($987 | 0, $$0211$i$i | 0, 4);
      $988 = $635 + 12 | 0;
      SAFE_HEAP_STORE($988 | 0, $976 | 0, 4);
      break;
     }
     $989 = $968 >>> 8;
     $990 = ($989 | 0) == 0;
     if ($990) {
      $$0212$i$i = 0;
     } else {
      $991 = $968 >>> 0 > 16777215;
      if ($991) {
       $$0212$i$i = 31;
      } else {
       $992 = $989 + 1048320 | 0;
       $993 = $992 >>> 16;
       $994 = $993 & 8;
       $995 = $989 << $994;
       $996 = $995 + 520192 | 0;
       $997 = $996 >>> 16;
       $998 = $997 & 4;
       $999 = $998 | $994;
       $1000 = $995 << $998;
       $1001 = $1000 + 245760 | 0;
       $1002 = $1001 >>> 16;
       $1003 = $1002 & 2;
       $1004 = $999 | $1003;
       $1005 = 14 - $1004 | 0;
       $1006 = $1000 << $1003;
       $1007 = $1006 >>> 15;
       $1008 = $1005 + $1007 | 0;
       $1009 = $1008 << 1;
       $1010 = $1008 + 7 | 0;
       $1011 = $968 >>> $1010;
       $1012 = $1011 & 1;
       $1013 = $1012 | $1009;
       $$0212$i$i = $1013;
      }
     }
     $1014 = 4736 + ($$0212$i$i << 2) | 0;
     $1015 = $635 + 28 | 0;
     SAFE_HEAP_STORE($1015 | 0, $$0212$i$i | 0, 4);
     $1016 = $635 + 20 | 0;
     SAFE_HEAP_STORE($1016 | 0, 0 | 0, 4);
     SAFE_HEAP_STORE($940 | 0, 0 | 0, 4);
     $1017 = SAFE_HEAP_LOAD(4436 | 0, 4, 0) | 0 | 0;
     $1018 = 1 << $$0212$i$i;
     $1019 = $1017 & $1018;
     $1020 = ($1019 | 0) == 0;
     if ($1020) {
      $1021 = $1017 | $1018;
      SAFE_HEAP_STORE(4436 | 0, $1021 | 0, 4);
      SAFE_HEAP_STORE($1014 | 0, $635 | 0, 4);
      $1022 = $635 + 24 | 0;
      SAFE_HEAP_STORE($1022 | 0, $1014 | 0, 4);
      $1023 = $635 + 12 | 0;
      SAFE_HEAP_STORE($1023 | 0, $635 | 0, 4);
      $1024 = $635 + 8 | 0;
      SAFE_HEAP_STORE($1024 | 0, $635 | 0, 4);
      break;
     }
     $1025 = SAFE_HEAP_LOAD($1014 | 0, 4, 0) | 0 | 0;
     $1026 = $1025 + 4 | 0;
     $1027 = SAFE_HEAP_LOAD($1026 | 0, 4, 0) | 0 | 0;
     $1028 = $1027 & -8;
     $1029 = ($1028 | 0) == ($968 | 0);
     L451 : do {
      if ($1029) {
       $$0207$lcssa$i$i = $1025;
      } else {
       $1030 = ($$0212$i$i | 0) == 31;
       $1031 = $$0212$i$i >>> 1;
       $1032 = 25 - $1031 | 0;
       $1033 = $1030 ? 0 : $1032;
       $1034 = $968 << $1033;
       $$02065$i$i = $1034;
       $$02074$i$i = $1025;
       while (1) {
        $1041 = $$02065$i$i >>> 31;
        $1042 = ($$02074$i$i + 16 | 0) + ($1041 << 2) | 0;
        $1037 = SAFE_HEAP_LOAD($1042 | 0, 4, 0) | 0 | 0;
        $1043 = ($1037 | 0) == (0 | 0);
        if ($1043) {
         break;
        }
        $1035 = $$02065$i$i << 1;
        $1036 = $1037 + 4 | 0;
        $1038 = SAFE_HEAP_LOAD($1036 | 0, 4, 0) | 0 | 0;
        $1039 = $1038 & -8;
        $1040 = ($1039 | 0) == ($968 | 0);
        if ($1040) {
         $$0207$lcssa$i$i = $1037;
         break L451;
        } else {
         $$02065$i$i = $1035;
         $$02074$i$i = $1037;
        }
       }
       $1044 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
       $1045 = $1044 >>> 0 > $1042 >>> 0;
       if ($1045) {
        _abort();
       } else {
        SAFE_HEAP_STORE($1042 | 0, $635 | 0, 4);
        $1046 = $635 + 24 | 0;
        SAFE_HEAP_STORE($1046 | 0, $$02074$i$i | 0, 4);
        $1047 = $635 + 12 | 0;
        SAFE_HEAP_STORE($1047 | 0, $635 | 0, 4);
        $1048 = $635 + 8 | 0;
        SAFE_HEAP_STORE($1048 | 0, $635 | 0, 4);
        break L294;
       }
      }
     } while (0);
     $1049 = $$0207$lcssa$i$i + 8 | 0;
     $1050 = SAFE_HEAP_LOAD($1049 | 0, 4, 0) | 0 | 0;
     $1051 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
     $1052 = $1051 >>> 0 <= $$0207$lcssa$i$i >>> 0;
     $1053 = $1051 >>> 0 <= $1050 >>> 0;
     $1054 = $1053 & $1052;
     if ($1054) {
      $1055 = $1050 + 12 | 0;
      SAFE_HEAP_STORE($1055 | 0, $635 | 0, 4);
      SAFE_HEAP_STORE($1049 | 0, $635 | 0, 4);
      $1056 = $635 + 8 | 0;
      SAFE_HEAP_STORE($1056 | 0, $1050 | 0, 4);
      $1057 = $635 + 12 | 0;
      SAFE_HEAP_STORE($1057 | 0, $$0207$lcssa$i$i | 0, 4);
      $1058 = $635 + 24 | 0;
      SAFE_HEAP_STORE($1058 | 0, 0 | 0, 4);
      break;
     } else {
      _abort();
     }
    }
   }
  } while (0);
  $1060 = SAFE_HEAP_LOAD(4444 | 0, 4, 0) | 0 | 0;
  $1061 = $1060 >>> 0 > $$0197 >>> 0;
  if ($1061) {
   $1062 = $1060 - $$0197 | 0;
   SAFE_HEAP_STORE(4444 | 0, $1062 | 0, 4);
   $1063 = SAFE_HEAP_LOAD(4456 | 0, 4, 0) | 0 | 0;
   $1064 = $1063 + $$0197 | 0;
   SAFE_HEAP_STORE(4456 | 0, $1064 | 0, 4);
   $1065 = $1062 | 1;
   $1066 = $1064 + 4 | 0;
   SAFE_HEAP_STORE($1066 | 0, $1065 | 0, 4);
   $1067 = $$0197 | 3;
   $1068 = $1063 + 4 | 0;
   SAFE_HEAP_STORE($1068 | 0, $1067 | 0, 4);
   $1069 = $1063 + 8 | 0;
   $$0 = $1069;
   STACKTOP = sp;
   return $$0 | 0;
  }
 }
 $1070 = ___errno_location() | 0;
 SAFE_HEAP_STORE($1070 | 0, 12 | 0, 4);
 $$0 = 0;
 STACKTOP = sp;
 return $$0 | 0;
}

function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$ = 0, $$0 = 0, $$0463$lcssa = 0, $$0463588 = 0, $$0464599 = 0, $$0471 = 0.0, $$0479 = 0, $$0487657 = 0, $$0488 = 0, $$0488669 = 0, $$0488671 = 0, $$0497670 = 0, $$0498 = 0, $$0511586 = 0.0, $$0512 = 0, $$0513 = 0, $$0516652 = 0, $$0522 = 0, $$0523 = 0, $$0525 = 0;
 var $$0527 = 0, $$0529 = 0, $$0529$in646 = 0, $$0532651 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482683 = 0, $$1489656 = 0, $$1499 = 0, $$1510587 = 0, $$1514$lcssa = 0, $$1514614 = 0, $$1517 = 0, $$1526 = 0, $$1528 = 0, $$1530621 = 0;
 var $$1533$lcssa = 0, $$1533645 = 0, $$1604 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483 = 0, $$2490$lcssa = 0, $$2490638 = 0, $$2500$lcssa = 0, $$2500682 = 0, $$2515 = 0, $$2518634 = 0, $$2531 = 0, $$2534633 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484663 = 0, $$3501$lcssa = 0;
 var $$3501676 = 0, $$3535620 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478594 = 0, $$4492 = 0, $$4502$lcssa = 0, $$4502662 = 0, $$4520 = 0, $$5$lcssa = 0, $$5486$lcssa = 0, $$5486639 = 0, $$5493603 = 0, $$5503 = 0, $$5521 = 0, $$560 = 0, $$5609 = 0, $$6 = 0, $$6494593 = 0, $$7495608 = 0;
 var $$8 = 0, $$8506 = 0, $$9 = 0, $$9507$lcssa = 0, $$9507625 = 0, $$lcssa583 = 0, $$lobit = 0, $$neg = 0, $$neg571 = 0, $$not = 0, $$pn = 0, $$pr = 0, $$pr564 = 0, $$pre = 0, $$pre$phi717Z2D = 0, $$pre$phi718Z2D = 0, $$pre720 = 0, $$sink757 = 0, $10 = 0, $100 = 0;
 var $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0;
 var $12 = 0, $120 = 0, $121 = 0.0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0.0, $129 = 0.0, $13 = 0, $130 = 0.0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0;
 var $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0.0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0;
 var $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0;
 var $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0;
 var $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0;
 var $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0;
 var $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0.0;
 var $247 = 0.0, $248 = 0, $249 = 0.0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0;
 var $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0;
 var $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0;
 var $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0;
 var $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0;
 var $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0;
 var $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0.0, $370 = 0, $371 = 0, $372 = 0, $373 = 0;
 var $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0.0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0;
 var $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0;
 var $410 = 0, $411 = 0, $412 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0.0, $54 = 0, $55 = 0, $56 = 0, $57 = 0.0, $58 = 0.0;
 var $59 = 0.0, $6 = 0, $60 = 0.0, $61 = 0.0, $62 = 0.0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0;
 var $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0.0, $91 = 0.0, $92 = 0.0, $93 = 0, $94 = 0;
 var $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $not$ = 0, $or$cond = 0, $or$cond3$not = 0, $or$cond543 = 0, $or$cond546 = 0, $or$cond556 = 0, $or$cond559 = 0, $or$cond6 = 0, $scevgep711 = 0, $scevgep711712 = 0, $spec$select = 0, $spec$select539 = 0, $spec$select540 = 0, $spec$select540722 = 0, $spec$select540723 = 0;
 var $spec$select541 = 0, $spec$select544 = 0.0, $spec$select547 = 0, $spec$select548 = 0, $spec$select549 = 0, $spec$select551 = 0, $spec$select554 = 0, $spec$select557 = 0, $spec$select561 = 0.0, $spec$select562 = 0, $spec$select563 = 0, $spec$select565 = 0, $spec$select566 = 0, $spec$select567 = 0.0, $spec$select568 = 0.0, $spec$select569 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 560 | 0;
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560 | 0);
 $6 = sp + 32 | 0;
 $7 = sp + 536 | 0;
 $8 = sp;
 $9 = $8;
 $10 = sp + 540 | 0;
 SAFE_HEAP_STORE($7 | 0, 0 | 0, 4);
 $11 = $10 + 12 | 0;
 $12 = ___DOUBLE_BITS_681($1) | 0;
 $13 = tempRet0;
 $14 = ($13 | 0) < 0;
 if ($14) {
  $15 = -$1;
  $16 = ___DOUBLE_BITS_681($15) | 0;
  $17 = tempRet0;
  $$0471 = $15;
  $$0522 = 1;
  $$0523 = 3342;
  $25 = $17;
  $412 = $16;
 } else {
  $18 = $4 & 2048;
  $19 = ($18 | 0) == 0;
  $20 = $4 & 1;
  $21 = ($20 | 0) == 0;
  $$ = $21 ? 3343 : 3348;
  $spec$select565 = $19 ? $$ : 3345;
  $22 = $4 & 2049;
  $23 = ($22 | 0) != 0;
  $spec$select566 = $23 & 1;
  $$0471 = $1;
  $$0522 = $spec$select566;
  $$0523 = $spec$select565;
  $25 = $13;
  $412 = $12;
 }
 $24 = $25 & 2146435072;
 $26 = 0 == 0;
 $27 = ($24 | 0) == 2146435072;
 $28 = $26 & $27;
 do {
  if ($28) {
   $29 = $5 & 32;
   $30 = ($29 | 0) != 0;
   $31 = $30 ? 3361 : 3365;
   $32 = $$0471 != $$0471 | 0.0 != 0.0;
   $33 = $30 ? 3369 : 3373;
   $$0512 = $32 ? $33 : $31;
   $34 = $$0522 + 3 | 0;
   $35 = $4 & -65537;
   _pad_680($0, 32, $2, $34, $35);
   _out($0, $$0523, $$0522);
   _out($0, $$0512, 3);
   $36 = $4 ^ 8192;
   _pad_680($0, 32, $2, $34, $36);
   $$sink757 = $34;
  } else {
   $37 = +_frexpl($$0471, $7);
   $38 = $37 * 2.0;
   $39 = $38 != 0.0;
   if ($39) {
    $40 = SAFE_HEAP_LOAD($7 | 0, 4, 0) | 0 | 0;
    $41 = $40 + -1 | 0;
    SAFE_HEAP_STORE($7 | 0, $41 | 0, 4);
   }
   $42 = $5 | 32;
   $43 = ($42 | 0) == 97;
   if ($43) {
    $44 = $5 & 32;
    $45 = ($44 | 0) == 0;
    $46 = $$0523 + 9 | 0;
    $spec$select = $45 ? $$0523 : $46;
    $47 = $$0522 | 2;
    $48 = $3 >>> 0 > 11;
    $49 = 12 - $3 | 0;
    $50 = ($49 | 0) == 0;
    $51 = $48 | $50;
    do {
     if ($51) {
      $$1472 = $38;
     } else {
      $$0511586 = 8.0;
      $$1510587 = $49;
      while (1) {
       $52 = $$1510587 + -1 | 0;
       $53 = $$0511586 * 16.0;
       $54 = ($52 | 0) == 0;
       if ($54) {
        break;
       } else {
        $$0511586 = $53;
        $$1510587 = $52;
       }
      }
      $55 = SAFE_HEAP_LOAD($spec$select >> 0 | 0, 1, 0) | 0 | 0;
      $56 = $55 << 24 >> 24 == 45;
      if ($56) {
       $57 = -$38;
       $58 = $57 - $53;
       $59 = $53 + $58;
       $60 = -$59;
       $$1472 = $60;
       break;
      } else {
       $61 = $38 + $53;
       $62 = $61 - $53;
       $$1472 = $62;
       break;
      }
     }
    } while (0);
    $63 = SAFE_HEAP_LOAD($7 | 0, 4, 0) | 0 | 0;
    $64 = ($63 | 0) < 0;
    $65 = 0 - $63 | 0;
    $66 = $64 ? $65 : $63;
    $67 = ($66 | 0) < 0;
    $68 = $67 << 31 >> 31;
    $69 = _fmt_u($66, $68, $11) | 0;
    $70 = ($69 | 0) == ($11 | 0);
    if ($70) {
     $71 = $10 + 11 | 0;
     SAFE_HEAP_STORE($71 >> 0 | 0, 48 | 0, 1);
     $$0513 = $71;
    } else {
     $$0513 = $69;
    }
    $72 = $63 >> 31;
    $73 = $72 & 2;
    $74 = $73 + 43 | 0;
    $75 = $74 & 255;
    $76 = $$0513 + -1 | 0;
    SAFE_HEAP_STORE($76 >> 0 | 0, $75 | 0, 1);
    $77 = $5 + 15 | 0;
    $78 = $77 & 255;
    $79 = $$0513 + -2 | 0;
    SAFE_HEAP_STORE($79 >> 0 | 0, $78 | 0, 1);
    $80 = ($3 | 0) < 1;
    $81 = $4 & 8;
    $82 = ($81 | 0) == 0;
    $$0525 = $8;
    $$2473 = $$1472;
    while (1) {
     $83 = ~~$$2473;
     $84 = 480 + $83 | 0;
     $85 = SAFE_HEAP_LOAD($84 >> 0 | 0, 1, 0) | 0 | 0;
     $86 = $85 & 255;
     $87 = $44 | $86;
     $88 = $87 & 255;
     $89 = $$0525 + 1 | 0;
     SAFE_HEAP_STORE($$0525 >> 0 | 0, $88 | 0, 1);
     $90 = +($83 | 0);
     $91 = $$2473 - $90;
     $92 = $91 * 16.0;
     $93 = $89;
     $94 = $93 - $9 | 0;
     $95 = ($94 | 0) == 1;
     if ($95) {
      $96 = $92 == 0.0;
      $or$cond3$not = $80 & $96;
      $or$cond = $82 & $or$cond3$not;
      if ($or$cond) {
       $$1526 = $89;
      } else {
       $97 = $$0525 + 2 | 0;
       SAFE_HEAP_STORE($89 >> 0 | 0, 46 | 0, 1);
       $$1526 = $97;
      }
     } else {
      $$1526 = $89;
     }
     $98 = $92 != 0.0;
     if ($98) {
      $$0525 = $$1526;
      $$2473 = $92;
     } else {
      break;
     }
    }
    $99 = ($3 | 0) == 0;
    $$pre720 = $$1526;
    if ($99) {
     label = 25;
    } else {
     $100 = -2 - $9 | 0;
     $101 = $100 + $$pre720 | 0;
     $102 = ($101 | 0) < ($3 | 0);
     if ($102) {
      $103 = $11;
      $104 = $79;
      $105 = $3 + 2 | 0;
      $106 = $105 + $103 | 0;
      $107 = $106 - $104 | 0;
      $$0527 = $107;
      $$pre$phi717Z2D = $103;
      $$pre$phi718Z2D = $104;
     } else {
      label = 25;
     }
    }
    if ((label | 0) == 25) {
     $108 = $11;
     $109 = $79;
     $110 = $108 - $9 | 0;
     $111 = $110 - $109 | 0;
     $112 = $111 + $$pre720 | 0;
     $$0527 = $112;
     $$pre$phi717Z2D = $108;
     $$pre$phi718Z2D = $109;
    }
    $113 = $$0527 + $47 | 0;
    _pad_680($0, 32, $2, $113, $4);
    _out($0, $spec$select, $47);
    $114 = $4 ^ 65536;
    _pad_680($0, 48, $2, $113, $114);
    $115 = $$pre720 - $9 | 0;
    _out($0, $8, $115);
    $116 = $$pre$phi717Z2D - $$pre$phi718Z2D | 0;
    $117 = $115 + $116 | 0;
    $118 = $$0527 - $117 | 0;
    _pad_680($0, 48, $118, 0, 0);
    _out($0, $79, $116);
    $119 = $4 ^ 8192;
    _pad_680($0, 32, $2, $113, $119);
    $$sink757 = $113;
    break;
   }
   $120 = ($3 | 0) < 0;
   $spec$select539 = $120 ? 6 : $3;
   if ($39) {
    $121 = $38 * 268435456.0;
    $122 = SAFE_HEAP_LOAD($7 | 0, 4, 0) | 0 | 0;
    $123 = $122 + -28 | 0;
    SAFE_HEAP_STORE($7 | 0, $123 | 0, 4);
    $$3 = $121;
    $$pr = $123;
   } else {
    $$pre = SAFE_HEAP_LOAD($7 | 0, 4, 0) | 0 | 0;
    $$3 = $38;
    $$pr = $$pre;
   }
   $124 = ($$pr | 0) < 0;
   $125 = $6 + 288 | 0;
   $$0498 = $124 ? $6 : $125;
   $$1499 = $$0498;
   $$4 = $$3;
   while (1) {
    $126 = ~~$$4 >>> 0;
    SAFE_HEAP_STORE($$1499 | 0, $126 | 0, 4);
    $127 = $$1499 + 4 | 0;
    $128 = +($126 >>> 0);
    $129 = $$4 - $128;
    $130 = $129 * 1.0e9;
    $131 = $130 != 0.0;
    if ($131) {
     $$1499 = $127;
     $$4 = $130;
    } else {
     break;
    }
   }
   $132 = $$0498;
   $133 = ($$pr | 0) > 0;
   if ($133) {
    $$1482683 = $$0498;
    $$2500682 = $127;
    $135 = $$pr;
    while (1) {
     $134 = ($135 | 0) < 29;
     $136 = $134 ? $135 : 29;
     $$0488669 = $$2500682 + -4 | 0;
     $137 = $$0488669 >>> 0 < $$1482683 >>> 0;
     if ($137) {
      $$2483 = $$1482683;
     } else {
      $$0488671 = $$0488669;
      $$0497670 = 0;
      while (1) {
       $138 = SAFE_HEAP_LOAD($$0488671 | 0, 4, 0) | 0 | 0;
       $139 = _bitshift64Shl($138 | 0, 0, $136 | 0) | 0;
       $140 = tempRet0;
       $141 = _i64Add($139 | 0, $140 | 0, $$0497670 | 0, 0) | 0;
       $142 = tempRet0;
       $143 = ___udivdi3($141 | 0, $142 | 0, 1e9, 0) | 0;
       $144 = tempRet0;
       $145 = ___muldi3($143 | 0, $144 | 0, 1e9, 0) | 0;
       $146 = tempRet0;
       $147 = _i64Subtract($141 | 0, $142 | 0, $145 | 0, $146 | 0) | 0;
       $148 = tempRet0;
       SAFE_HEAP_STORE($$0488671 | 0, $147 | 0, 4);
       $$0488 = $$0488671 + -4 | 0;
       $149 = $$0488 >>> 0 < $$1482683 >>> 0;
       if ($149) {
        break;
       } else {
        $$0488671 = $$0488;
        $$0497670 = $143;
       }
      }
      $150 = ($143 | 0) == 0;
      if ($150) {
       $$2483 = $$1482683;
      } else {
       $151 = $$1482683 + -4 | 0;
       SAFE_HEAP_STORE($151 | 0, $143 | 0, 4);
       $$2483 = $151;
      }
     }
     $152 = $$2500682 >>> 0 > $$2483 >>> 0;
     L57 : do {
      if ($152) {
       $$3501676 = $$2500682;
       while (1) {
        $154 = $$3501676 + -4 | 0;
        $155 = SAFE_HEAP_LOAD($154 | 0, 4, 0) | 0 | 0;
        $156 = ($155 | 0) == 0;
        if (!$156) {
         $$3501$lcssa = $$3501676;
         break L57;
        }
        $153 = $154 >>> 0 > $$2483 >>> 0;
        if ($153) {
         $$3501676 = $154;
        } else {
         $$3501$lcssa = $154;
         break;
        }
       }
      } else {
       $$3501$lcssa = $$2500682;
      }
     } while (0);
     $157 = SAFE_HEAP_LOAD($7 | 0, 4, 0) | 0 | 0;
     $158 = $157 - $136 | 0;
     SAFE_HEAP_STORE($7 | 0, $158 | 0, 4);
     $159 = ($158 | 0) > 0;
     if ($159) {
      $$1482683 = $$2483;
      $$2500682 = $$3501$lcssa;
      $135 = $158;
     } else {
      $$1482$lcssa = $$2483;
      $$2500$lcssa = $$3501$lcssa;
      $$pr564 = $158;
      break;
     }
    }
   } else {
    $$1482$lcssa = $$0498;
    $$2500$lcssa = $127;
    $$pr564 = $$pr;
   }
   $160 = ($$pr564 | 0) < 0;
   if ($160) {
    $161 = $spec$select539 + 25 | 0;
    $162 = ($161 | 0) / 9 & -1;
    $163 = $162 + 1 | 0;
    $164 = ($42 | 0) == 102;
    $$3484663 = $$1482$lcssa;
    $$4502662 = $$2500$lcssa;
    $166 = $$pr564;
    while (1) {
     $165 = 0 - $166 | 0;
     $167 = ($165 | 0) < 9;
     $168 = $167 ? $165 : 9;
     $169 = $$3484663 >>> 0 < $$4502662 >>> 0;
     if ($169) {
      $173 = 1 << $168;
      $174 = $173 + -1 | 0;
      $175 = 1e9 >>> $168;
      $$0487657 = 0;
      $$1489656 = $$3484663;
      while (1) {
       $176 = SAFE_HEAP_LOAD($$1489656 | 0, 4, 0) | 0 | 0;
       $177 = $176 & $174;
       $178 = $176 >>> $168;
       $179 = $178 + $$0487657 | 0;
       SAFE_HEAP_STORE($$1489656 | 0, $179 | 0, 4);
       $180 = Math_imul($177, $175) | 0;
       $181 = $$1489656 + 4 | 0;
       $182 = $181 >>> 0 < $$4502662 >>> 0;
       if ($182) {
        $$0487657 = $180;
        $$1489656 = $181;
       } else {
        break;
       }
      }
      $183 = SAFE_HEAP_LOAD($$3484663 | 0, 4, 0) | 0 | 0;
      $184 = ($183 | 0) == 0;
      $185 = $$3484663 + 4 | 0;
      $spec$select540 = $184 ? $185 : $$3484663;
      $186 = ($180 | 0) == 0;
      if ($186) {
       $$5503 = $$4502662;
       $spec$select540723 = $spec$select540;
      } else {
       $187 = $$4502662 + 4 | 0;
       SAFE_HEAP_STORE($$4502662 | 0, $180 | 0, 4);
       $$5503 = $187;
       $spec$select540723 = $spec$select540;
      }
     } else {
      $170 = SAFE_HEAP_LOAD($$3484663 | 0, 4, 0) | 0 | 0;
      $171 = ($170 | 0) == 0;
      $172 = $$3484663 + 4 | 0;
      $spec$select540722 = $171 ? $172 : $$3484663;
      $$5503 = $$4502662;
      $spec$select540723 = $spec$select540722;
     }
     $188 = $164 ? $$0498 : $spec$select540723;
     $189 = $$5503;
     $190 = $188;
     $191 = $189 - $190 | 0;
     $192 = $191 >> 2;
     $193 = ($192 | 0) > ($163 | 0);
     $194 = $188 + ($163 << 2) | 0;
     $spec$select541 = $193 ? $194 : $$5503;
     $195 = SAFE_HEAP_LOAD($7 | 0, 4, 0) | 0 | 0;
     $196 = $195 + $168 | 0;
     SAFE_HEAP_STORE($7 | 0, $196 | 0, 4);
     $197 = ($196 | 0) < 0;
     if ($197) {
      $$3484663 = $spec$select540723;
      $$4502662 = $spec$select541;
      $166 = $196;
     } else {
      $$3484$lcssa = $spec$select540723;
      $$4502$lcssa = $spec$select541;
      break;
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa;
    $$4502$lcssa = $$2500$lcssa;
   }
   $198 = $$3484$lcssa >>> 0 < $$4502$lcssa >>> 0;
   if ($198) {
    $199 = $$3484$lcssa;
    $200 = $132 - $199 | 0;
    $201 = $200 >> 2;
    $202 = $201 * 9 | 0;
    $203 = SAFE_HEAP_LOAD($$3484$lcssa | 0, 4, 0) | 0 | 0;
    $204 = $203 >>> 0 < 10;
    if ($204) {
     $$1517 = $202;
    } else {
     $$0516652 = $202;
     $$0532651 = 10;
     while (1) {
      $205 = $$0532651 * 10 | 0;
      $206 = $$0516652 + 1 | 0;
      $207 = $203 >>> 0 < $205 >>> 0;
      if ($207) {
       $$1517 = $206;
       break;
      } else {
       $$0516652 = $206;
       $$0532651 = $205;
      }
     }
    }
   } else {
    $$1517 = 0;
   }
   $208 = ($42 | 0) == 102;
   $209 = $208 ? 0 : $$1517;
   $210 = $spec$select539 - $209 | 0;
   $211 = ($42 | 0) == 103;
   $212 = ($spec$select539 | 0) != 0;
   $213 = $212 & $211;
   $$neg = $213 << 31 >> 31;
   $214 = $210 + $$neg | 0;
   $215 = $$4502$lcssa;
   $216 = $215 - $132 | 0;
   $217 = $216 >> 2;
   $218 = $217 * 9 | 0;
   $219 = $218 + -9 | 0;
   $220 = ($214 | 0) < ($219 | 0);
   if ($220) {
    $221 = $$0498 + 4 | 0;
    $222 = $214 + 9216 | 0;
    $223 = ($222 | 0) / 9 & -1;
    $224 = $223 + -1024 | 0;
    $225 = $221 + ($224 << 2) | 0;
    $226 = $223 * 9 | 0;
    $227 = $222 - $226 | 0;
    $228 = ($227 | 0) < 8;
    if ($228) {
     $$0529$in646 = $227;
     $$1533645 = 10;
     while (1) {
      $$0529 = $$0529$in646 + 1 | 0;
      $229 = $$1533645 * 10 | 0;
      $230 = ($$0529$in646 | 0) < 7;
      if ($230) {
       $$0529$in646 = $$0529;
       $$1533645 = $229;
      } else {
       $$1533$lcssa = $229;
       break;
      }
     }
    } else {
     $$1533$lcssa = 10;
    }
    $231 = SAFE_HEAP_LOAD($225 | 0, 4, 0) | 0 | 0;
    $232 = ($231 >>> 0) / ($$1533$lcssa >>> 0) & -1;
    $233 = Math_imul($232, $$1533$lcssa) | 0;
    $234 = $231 - $233 | 0;
    $235 = ($234 | 0) == 0;
    $236 = $225 + 4 | 0;
    $237 = ($236 | 0) == ($$4502$lcssa | 0);
    $or$cond543 = $237 & $235;
    if ($or$cond543) {
     $$4492 = $225;
     $$4520 = $$1517;
     $$8 = $$3484$lcssa;
    } else {
     $238 = $232 & 1;
     $239 = ($238 | 0) == 0;
     $spec$select544 = $239 ? 9007199254740992.0 : 9007199254740994.0;
     $240 = $$1533$lcssa >>> 1;
     $241 = $234 >>> 0 < $240 >>> 0;
     $242 = ($234 | 0) == ($240 | 0);
     $or$cond546 = $237 & $242;
     $spec$select561 = $or$cond546 ? 1.0 : 1.5;
     $spec$select567 = $241 ? .5 : $spec$select561;
     $243 = ($$0522 | 0) == 0;
     if ($243) {
      $$1467 = $spec$select567;
      $$1469 = $spec$select544;
     } else {
      $244 = SAFE_HEAP_LOAD($$0523 >> 0 | 0, 1, 0) | 0 | 0;
      $245 = $244 << 24 >> 24 == 45;
      $246 = -$spec$select544;
      $247 = -$spec$select567;
      $spec$select568 = $245 ? $246 : $spec$select544;
      $spec$select569 = $245 ? $247 : $spec$select567;
      $$1467 = $spec$select569;
      $$1469 = $spec$select568;
     }
     $248 = $231 - $234 | 0;
     SAFE_HEAP_STORE($225 | 0, $248 | 0, 4);
     $249 = $$1469 + $$1467;
     $250 = $249 != $$1469;
     if ($250) {
      $251 = $248 + $$1533$lcssa | 0;
      SAFE_HEAP_STORE($225 | 0, $251 | 0, 4);
      $252 = $251 >>> 0 > 999999999;
      if ($252) {
       $$2490638 = $225;
       $$5486639 = $$3484$lcssa;
       while (1) {
        $253 = $$2490638 + -4 | 0;
        SAFE_HEAP_STORE($$2490638 | 0, 0 | 0, 4);
        $254 = $253 >>> 0 < $$5486639 >>> 0;
        if ($254) {
         $255 = $$5486639 + -4 | 0;
         SAFE_HEAP_STORE($255 | 0, 0 | 0, 4);
         $$6 = $255;
        } else {
         $$6 = $$5486639;
        }
        $256 = SAFE_HEAP_LOAD($253 | 0, 4, 0) | 0 | 0;
        $257 = $256 + 1 | 0;
        SAFE_HEAP_STORE($253 | 0, $257 | 0, 4);
        $258 = $257 >>> 0 > 999999999;
        if ($258) {
         $$2490638 = $253;
         $$5486639 = $$6;
        } else {
         $$2490$lcssa = $253;
         $$5486$lcssa = $$6;
         break;
        }
       }
      } else {
       $$2490$lcssa = $225;
       $$5486$lcssa = $$3484$lcssa;
      }
      $259 = $$5486$lcssa;
      $260 = $132 - $259 | 0;
      $261 = $260 >> 2;
      $262 = $261 * 9 | 0;
      $263 = SAFE_HEAP_LOAD($$5486$lcssa | 0, 4, 0) | 0 | 0;
      $264 = $263 >>> 0 < 10;
      if ($264) {
       $$4492 = $$2490$lcssa;
       $$4520 = $262;
       $$8 = $$5486$lcssa;
      } else {
       $$2518634 = $262;
       $$2534633 = 10;
       while (1) {
        $265 = $$2534633 * 10 | 0;
        $266 = $$2518634 + 1 | 0;
        $267 = $263 >>> 0 < $265 >>> 0;
        if ($267) {
         $$4492 = $$2490$lcssa;
         $$4520 = $266;
         $$8 = $$5486$lcssa;
         break;
        } else {
         $$2518634 = $266;
         $$2534633 = $265;
        }
       }
      }
     } else {
      $$4492 = $225;
      $$4520 = $$1517;
      $$8 = $$3484$lcssa;
     }
    }
    $268 = $$4492 + 4 | 0;
    $269 = $$4502$lcssa >>> 0 > $268 >>> 0;
    $spec$select547 = $269 ? $268 : $$4502$lcssa;
    $$5521 = $$4520;
    $$8506 = $spec$select547;
    $$9 = $$8;
   } else {
    $$5521 = $$1517;
    $$8506 = $$4502$lcssa;
    $$9 = $$3484$lcssa;
   }
   $270 = 0 - $$5521 | 0;
   $271 = $$8506 >>> 0 > $$9 >>> 0;
   L109 : do {
    if ($271) {
     $$9507625 = $$8506;
     while (1) {
      $273 = $$9507625 + -4 | 0;
      $274 = SAFE_HEAP_LOAD($273 | 0, 4, 0) | 0 | 0;
      $275 = ($274 | 0) == 0;
      if (!$275) {
       $$9507$lcssa = $$9507625;
       $$lcssa583 = 1;
       break L109;
      }
      $272 = $273 >>> 0 > $$9 >>> 0;
      if ($272) {
       $$9507625 = $273;
      } else {
       $$9507$lcssa = $273;
       $$lcssa583 = 0;
       break;
      }
     }
    } else {
     $$9507$lcssa = $$8506;
     $$lcssa583 = 0;
    }
   } while (0);
   do {
    if ($211) {
     $not$ = $212 ^ 1;
     $276 = $not$ & 1;
     $spec$select548 = $spec$select539 + $276 | 0;
     $277 = ($spec$select548 | 0) > ($$5521 | 0);
     $278 = ($$5521 | 0) > -5;
     $or$cond6 = $277 & $278;
     if ($or$cond6) {
      $279 = $5 + -1 | 0;
      $$neg571 = $spec$select548 + -1 | 0;
      $280 = $$neg571 - $$5521 | 0;
      $$0479 = $279;
      $$2476 = $280;
     } else {
      $281 = $5 + -2 | 0;
      $282 = $spec$select548 + -1 | 0;
      $$0479 = $281;
      $$2476 = $282;
     }
     $283 = $4 & 8;
     $284 = ($283 | 0) == 0;
     if ($284) {
      if ($$lcssa583) {
       $285 = $$9507$lcssa + -4 | 0;
       $286 = SAFE_HEAP_LOAD($285 | 0, 4, 0) | 0 | 0;
       $287 = ($286 | 0) == 0;
       if ($287) {
        $$2531 = 9;
       } else {
        $288 = ($286 >>> 0) % 10 & -1;
        $289 = ($288 | 0) == 0;
        if ($289) {
         $$1530621 = 0;
         $$3535620 = 10;
         while (1) {
          $290 = $$3535620 * 10 | 0;
          $291 = $$1530621 + 1 | 0;
          $292 = ($286 >>> 0) % ($290 >>> 0) & -1;
          $293 = ($292 | 0) == 0;
          if ($293) {
           $$1530621 = $291;
           $$3535620 = $290;
          } else {
           $$2531 = $291;
           break;
          }
         }
        } else {
         $$2531 = 0;
        }
       }
      } else {
       $$2531 = 9;
      }
      $294 = $$0479 | 32;
      $295 = ($294 | 0) == 102;
      $296 = $$9507$lcssa;
      $297 = $296 - $132 | 0;
      $298 = $297 >> 2;
      $299 = $298 * 9 | 0;
      $300 = $299 + -9 | 0;
      if ($295) {
       $301 = $300 - $$2531 | 0;
       $302 = ($301 | 0) > 0;
       $spec$select549 = $302 ? $301 : 0;
       $303 = ($$2476 | 0) < ($spec$select549 | 0);
       $spec$select562 = $303 ? $$2476 : $spec$select549;
       $$1480 = $$0479;
       $$3477 = $spec$select562;
       break;
      } else {
       $304 = $300 + $$5521 | 0;
       $305 = $304 - $$2531 | 0;
       $306 = ($305 | 0) > 0;
       $spec$select551 = $306 ? $305 : 0;
       $307 = ($$2476 | 0) < ($spec$select551 | 0);
       $spec$select563 = $307 ? $$2476 : $spec$select551;
       $$1480 = $$0479;
       $$3477 = $spec$select563;
       break;
      }
     } else {
      $$1480 = $$0479;
      $$3477 = $$2476;
     }
    } else {
     $$1480 = $5;
     $$3477 = $spec$select539;
    }
   } while (0);
   $308 = ($$3477 | 0) != 0;
   $309 = $4 >>> 3;
   $$lobit = $309 & 1;
   $310 = $308 ? 1 : $$lobit;
   $311 = $$1480 | 32;
   $312 = ($311 | 0) == 102;
   if ($312) {
    $313 = ($$5521 | 0) > 0;
    $314 = $313 ? $$5521 : 0;
    $$2515 = 0;
    $$pn = $314;
   } else {
    $315 = ($$5521 | 0) < 0;
    $316 = $315 ? $270 : $$5521;
    $317 = ($316 | 0) < 0;
    $318 = $317 << 31 >> 31;
    $319 = _fmt_u($316, $318, $11) | 0;
    $320 = $11;
    $321 = $319;
    $322 = $320 - $321 | 0;
    $323 = ($322 | 0) < 2;
    if ($323) {
     $$1514614 = $319;
     while (1) {
      $324 = $$1514614 + -1 | 0;
      SAFE_HEAP_STORE($324 >> 0 | 0, 48 | 0, 1);
      $325 = $324;
      $326 = $320 - $325 | 0;
      $327 = ($326 | 0) < 2;
      if ($327) {
       $$1514614 = $324;
      } else {
       $$1514$lcssa = $324;
       break;
      }
     }
    } else {
     $$1514$lcssa = $319;
    }
    $328 = $$5521 >> 31;
    $329 = $328 & 2;
    $330 = $329 + 43 | 0;
    $331 = $330 & 255;
    $332 = $$1514$lcssa + -1 | 0;
    SAFE_HEAP_STORE($332 >> 0 | 0, $331 | 0, 1);
    $333 = $$1480 & 255;
    $334 = $$1514$lcssa + -2 | 0;
    SAFE_HEAP_STORE($334 >> 0 | 0, $333 | 0, 1);
    $335 = $334;
    $336 = $320 - $335 | 0;
    $$2515 = $334;
    $$pn = $336;
   }
   $337 = $$0522 + 1 | 0;
   $338 = $337 + $$3477 | 0;
   $$1528 = $338 + $310 | 0;
   $339 = $$1528 + $$pn | 0;
   _pad_680($0, 32, $2, $339, $4);
   _out($0, $$0523, $$0522);
   $340 = $4 ^ 65536;
   _pad_680($0, 48, $2, $339, $340);
   if ($312) {
    $341 = $$9 >>> 0 > $$0498 >>> 0;
    $spec$select554 = $341 ? $$0498 : $$9;
    $342 = $8 + 9 | 0;
    $343 = $342;
    $344 = $8 + 8 | 0;
    $$5493603 = $spec$select554;
    while (1) {
     $345 = SAFE_HEAP_LOAD($$5493603 | 0, 4, 0) | 0 | 0;
     $346 = _fmt_u($345, 0, $342) | 0;
     $347 = ($$5493603 | 0) == ($spec$select554 | 0);
     if ($347) {
      $353 = ($346 | 0) == ($342 | 0);
      if ($353) {
       SAFE_HEAP_STORE($344 >> 0 | 0, 48 | 0, 1);
       $$1465 = $344;
      } else {
       $$1465 = $346;
      }
     } else {
      $348 = $346 >>> 0 > $8 >>> 0;
      if ($348) {
       $349 = $346;
       $350 = $349 - $9 | 0;
       _memset($8 | 0, 48, $350 | 0) | 0;
       $$0464599 = $346;
       while (1) {
        $351 = $$0464599 + -1 | 0;
        $352 = $351 >>> 0 > $8 >>> 0;
        if ($352) {
         $$0464599 = $351;
        } else {
         $$1465 = $351;
         break;
        }
       }
      } else {
       $$1465 = $346;
      }
     }
     $354 = $$1465;
     $355 = $343 - $354 | 0;
     _out($0, $$1465, $355);
     $356 = $$5493603 + 4 | 0;
     $357 = $356 >>> 0 > $$0498 >>> 0;
     if ($357) {
      break;
     } else {
      $$5493603 = $356;
     }
    }
    $$not = $308 ^ 1;
    $358 = $4 & 8;
    $359 = ($358 | 0) == 0;
    $or$cond556 = $359 & $$not;
    if (!$or$cond556) {
     _out($0, 3377, 1);
    }
    $360 = $356 >>> 0 < $$9507$lcssa >>> 0;
    $361 = ($$3477 | 0) > 0;
    $362 = $360 & $361;
    if ($362) {
     $$4478594 = $$3477;
     $$6494593 = $356;
     while (1) {
      $363 = SAFE_HEAP_LOAD($$6494593 | 0, 4, 0) | 0 | 0;
      $364 = _fmt_u($363, 0, $342) | 0;
      $365 = $364 >>> 0 > $8 >>> 0;
      if ($365) {
       $366 = $364;
       $367 = $366 - $9 | 0;
       _memset($8 | 0, 48, $367 | 0) | 0;
       $$0463588 = $364;
       while (1) {
        $368 = $$0463588 + -1 | 0;
        $369 = $368 >>> 0 > $8 >>> 0;
        if ($369) {
         $$0463588 = $368;
        } else {
         $$0463$lcssa = $368;
         break;
        }
       }
      } else {
       $$0463$lcssa = $364;
      }
      $370 = ($$4478594 | 0) < 9;
      $371 = $370 ? $$4478594 : 9;
      _out($0, $$0463$lcssa, $371);
      $372 = $$6494593 + 4 | 0;
      $373 = $$4478594 + -9 | 0;
      $374 = $372 >>> 0 < $$9507$lcssa >>> 0;
      $375 = ($$4478594 | 0) > 9;
      $376 = $374 & $375;
      if ($376) {
       $$4478594 = $373;
       $$6494593 = $372;
      } else {
       $$4478$lcssa = $373;
       break;
      }
     }
    } else {
     $$4478$lcssa = $$3477;
    }
    $377 = $$4478$lcssa + 9 | 0;
    _pad_680($0, 48, $377, 9, 0);
   } else {
    $378 = $$9 + 4 | 0;
    $spec$select557 = $$lcssa583 ? $$9507$lcssa : $378;
    $379 = $$9 >>> 0 < $spec$select557 >>> 0;
    $380 = ($$3477 | 0) > -1;
    $381 = $379 & $380;
    if ($381) {
     $382 = $8 + 9 | 0;
     $383 = $4 & 8;
     $384 = ($383 | 0) == 0;
     $385 = $382;
     $386 = 0 - $9 | 0;
     $387 = $8 + 8 | 0;
     $$5609 = $$3477;
     $$7495608 = $$9;
     while (1) {
      $388 = SAFE_HEAP_LOAD($$7495608 | 0, 4, 0) | 0 | 0;
      $389 = _fmt_u($388, 0, $382) | 0;
      $390 = ($389 | 0) == ($382 | 0);
      if ($390) {
       SAFE_HEAP_STORE($387 >> 0 | 0, 48 | 0, 1);
       $$0 = $387;
      } else {
       $$0 = $389;
      }
      $391 = ($$7495608 | 0) == ($$9 | 0);
      do {
       if ($391) {
        $395 = $$0 + 1 | 0;
        _out($0, $$0, 1);
        $396 = ($$5609 | 0) < 1;
        $or$cond559 = $384 & $396;
        if ($or$cond559) {
         $$2 = $395;
         break;
        }
        _out($0, 3377, 1);
        $$2 = $395;
       } else {
        $392 = $$0 >>> 0 > $8 >>> 0;
        if (!$392) {
         $$2 = $$0;
         break;
        }
        $scevgep711 = $$0 + $386 | 0;
        $scevgep711712 = $scevgep711;
        _memset($8 | 0, 48, $scevgep711712 | 0) | 0;
        $$1604 = $$0;
        while (1) {
         $393 = $$1604 + -1 | 0;
         $394 = $393 >>> 0 > $8 >>> 0;
         if ($394) {
          $$1604 = $393;
         } else {
          $$2 = $393;
          break;
         }
        }
       }
      } while (0);
      $397 = $$2;
      $398 = $385 - $397 | 0;
      $399 = ($$5609 | 0) > ($398 | 0);
      $400 = $399 ? $398 : $$5609;
      _out($0, $$2, $400);
      $401 = $$5609 - $398 | 0;
      $402 = $$7495608 + 4 | 0;
      $403 = $402 >>> 0 < $spec$select557 >>> 0;
      $404 = ($401 | 0) > -1;
      $405 = $403 & $404;
      if ($405) {
       $$5609 = $401;
       $$7495608 = $402;
      } else {
       $$5$lcssa = $401;
       break;
      }
     }
    } else {
     $$5$lcssa = $$3477;
    }
    $406 = $$5$lcssa + 18 | 0;
    _pad_680($0, 48, $406, 18, 0);
    $407 = $11;
    $408 = $$2515;
    $409 = $407 - $408 | 0;
    _out($0, $$2515, $409);
   }
   $410 = $4 ^ 8192;
   _pad_680($0, 32, $2, $339, $410);
   $$sink757 = $339;
  }
 } while (0);
 $411 = ($$sink757 | 0) < ($2 | 0);
 $$560 = $411 ? $2 : $$sink757;
 STACKTOP = sp;
 return $$560 | 0;
}

function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$ = 0, $$0 = 0, $$0228 = 0, $$0229334 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240313 = 0, $$0240313371 = 0, $$0240333 = 0, $$0243 = 0, $$0243$ph = 0, $$0243$ph$be = 0, $$0247 = 0, $$0247$ph = 0, $$0249$lcssa = 0, $$0249321 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0;
 var $$0259 = 0, $$0262$lcssa = 0, $$0262328 = 0, $$0269$ph = 0, $$1 = 0, $$1230340 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241339 = 0, $$1248 = 0, $$1250 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242320 = 0;
 var $$2256 = 0, $$2256$ = 0, $$2261 = 0, $$2271 = 0, $$3257 = 0, $$3265 = 0, $$3272 = 0, $$3317 = 0, $$4258370 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa308 = 0, $$pre = 0, $$pre$phiZ2D = 0, $$pre360 = 0, $$pre362 = 0, $$pre363 = 0, $$pre363$pre = 0, $$pre364 = 0;
 var $$pre368 = 0, $$sink = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0;
 var $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0;
 var $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0;
 var $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0;
 var $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0;
 var $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0;
 var $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0;
 var $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0;
 var $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0;
 var $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0;
 var $334 = 0, $335 = 0, $336 = 0.0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0;
 var $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0;
 var $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current2 = 0, $arglist_next = 0;
 var $arglist_next3 = 0, $brmerge = 0, $brmerge326 = 0, $expanded = 0, $expanded10 = 0, $expanded11 = 0, $expanded13 = 0, $expanded14 = 0, $expanded15 = 0, $expanded4 = 0, $expanded6 = 0, $expanded7 = 0, $expanded8 = 0, $or$cond = 0, $or$cond276 = 0, $or$cond278 = 0, $or$cond283 = 0, $spec$select = 0, $spec$select281 = 0, $spec$select284 = 0;
 var $spec$select291 = 0, $spec$select292 = 0, $spec$select293 = 0, $spec$select294 = 0, $spec$select295 = 0, $spec$select296 = 0, $spec$select297 = 0, $spec$select298 = 0, $spec$select299 = 0, $storemerge273$lcssa = 0, $storemerge273327 = 0, $storemerge274 = 0, $trunc = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64 | 0;
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64 | 0);
 $5 = sp + 56 | 0;
 $6 = sp + 40 | 0;
 $7 = sp;
 $8 = sp + 48 | 0;
 $9 = sp + 60 | 0;
 SAFE_HEAP_STORE($5 | 0, $1 | 0, 4);
 $10 = ($0 | 0) != (0 | 0);
 $11 = $7 + 40 | 0;
 $12 = $11;
 $13 = $7 + 39 | 0;
 $14 = $8 + 4 | 0;
 $$0243$ph = 0;
 $$0247$ph = 0;
 $$0269$ph = 0;
 L1 : while (1) {
  $$0243 = $$0243$ph;
  $$0247 = $$0247$ph;
  while (1) {
   $15 = ($$0247 | 0) > -1;
   do {
    if ($15) {
     $16 = 2147483647 - $$0247 | 0;
     $17 = ($$0243 | 0) > ($16 | 0);
     if ($17) {
      $18 = ___errno_location() | 0;
      SAFE_HEAP_STORE($18 | 0, 75 | 0, 4);
      $$1248 = -1;
      break;
     } else {
      $19 = $$0243 + $$0247 | 0;
      $$1248 = $19;
      break;
     }
    } else {
     $$1248 = $$0247;
    }
   } while (0);
   $20 = SAFE_HEAP_LOAD($5 | 0, 4, 0) | 0 | 0;
   $21 = SAFE_HEAP_LOAD($20 >> 0 | 0, 1, 0) | 0 | 0;
   $22 = $21 << 24 >> 24 == 0;
   if ($22) {
    label = 94;
    break L1;
   }
   $23 = $21;
   $25 = $20;
   L12 : while (1) {
    switch ($23 << 24 >> 24) {
    case 37:
     {
      label = 10;
      break L12;
      break;
     }
    case 0:
     {
      $$0249$lcssa = $25;
      break L12;
      break;
     }
    default:
     {}
    }
    $24 = $25 + 1 | 0;
    SAFE_HEAP_STORE($5 | 0, $24 | 0, 4);
    $$pre = SAFE_HEAP_LOAD($24 >> 0 | 0, 1, 0) | 0 | 0;
    $23 = $$pre;
    $25 = $24;
   }
   L15 : do {
    if ((label | 0) == 10) {
     label = 0;
     $$0249321 = $25;
     $27 = $25;
     while (1) {
      $26 = $27 + 1 | 0;
      $28 = SAFE_HEAP_LOAD($26 >> 0 | 0, 1, 0) | 0 | 0;
      $29 = $28 << 24 >> 24 == 37;
      if (!$29) {
       $$0249$lcssa = $$0249321;
       break L15;
      }
      $30 = $$0249321 + 1 | 0;
      $31 = $27 + 2 | 0;
      SAFE_HEAP_STORE($5 | 0, $31 | 0, 4);
      $32 = SAFE_HEAP_LOAD($31 >> 0 | 0, 1, 0) | 0 | 0;
      $33 = $32 << 24 >> 24 == 37;
      if ($33) {
       $$0249321 = $30;
       $27 = $31;
      } else {
       $$0249$lcssa = $30;
       break;
      }
     }
    }
   } while (0);
   $34 = $$0249$lcssa;
   $35 = $20;
   $36 = $34 - $35 | 0;
   if ($10) {
    _out($0, $20, $36);
   }
   $37 = ($36 | 0) == 0;
   if ($37) {
    break;
   } else {
    $$0243 = $36;
    $$0247 = $$1248;
   }
  }
  $38 = SAFE_HEAP_LOAD($5 | 0, 4, 0) | 0 | 0;
  $39 = $38 + 1 | 0;
  $40 = SAFE_HEAP_LOAD($39 >> 0 | 0, 1, 0) | 0 | 0;
  $41 = $40 << 24 >> 24;
  $42 = _isdigit($41) | 0;
  $43 = ($42 | 0) == 0;
  $$pre360 = SAFE_HEAP_LOAD($5 | 0, 4, 0) | 0 | 0;
  if ($43) {
   $$0253 = -1;
   $$1270 = $$0269$ph;
   $$sink = 1;
  } else {
   $44 = $$pre360 + 2 | 0;
   $45 = SAFE_HEAP_LOAD($44 >> 0 | 0, 1, 0) | 0 | 0;
   $46 = $45 << 24 >> 24 == 36;
   if ($46) {
    $47 = $$pre360 + 1 | 0;
    $48 = SAFE_HEAP_LOAD($47 >> 0 | 0, 1, 0) | 0 | 0;
    $49 = $48 << 24 >> 24;
    $50 = $49 + -48 | 0;
    $$0253 = $50;
    $$1270 = 1;
    $$sink = 3;
   } else {
    $$0253 = -1;
    $$1270 = $$0269$ph;
    $$sink = 1;
   }
  }
  $51 = $$pre360 + $$sink | 0;
  SAFE_HEAP_STORE($5 | 0, $51 | 0, 4);
  $52 = SAFE_HEAP_LOAD($51 >> 0 | 0, 1, 0) | 0 | 0;
  $53 = $52 << 24 >> 24;
  $54 = $53 + -32 | 0;
  $55 = $54 >>> 0 > 31;
  $56 = 1 << $54;
  $57 = $56 & 75913;
  $58 = ($57 | 0) == 0;
  $brmerge326 = $55 | $58;
  if ($brmerge326) {
   $$0262$lcssa = 0;
   $$lcssa308 = $52;
   $storemerge273$lcssa = $51;
  } else {
   $$0262328 = 0;
   $60 = $54;
   $storemerge273327 = $51;
   while (1) {
    $59 = 1 << $60;
    $61 = $59 | $$0262328;
    $62 = $storemerge273327 + 1 | 0;
    SAFE_HEAP_STORE($5 | 0, $62 | 0, 4);
    $63 = SAFE_HEAP_LOAD($62 >> 0 | 0, 1, 0) | 0 | 0;
    $64 = $63 << 24 >> 24;
    $65 = $64 + -32 | 0;
    $66 = $65 >>> 0 > 31;
    $67 = 1 << $65;
    $68 = $67 & 75913;
    $69 = ($68 | 0) == 0;
    $brmerge = $66 | $69;
    if ($brmerge) {
     $$0262$lcssa = $61;
     $$lcssa308 = $63;
     $storemerge273$lcssa = $62;
     break;
    } else {
     $$0262328 = $61;
     $60 = $65;
     $storemerge273327 = $62;
    }
   }
  }
  $70 = $$lcssa308 << 24 >> 24 == 42;
  if ($70) {
   $71 = $storemerge273$lcssa + 1 | 0;
   $72 = SAFE_HEAP_LOAD($71 >> 0 | 0, 1, 0) | 0 | 0;
   $73 = $72 << 24 >> 24;
   $74 = _isdigit($73) | 0;
   $75 = ($74 | 0) == 0;
   if ($75) {
    label = 27;
   } else {
    $76 = SAFE_HEAP_LOAD($5 | 0, 4, 0) | 0 | 0;
    $77 = $76 + 2 | 0;
    $78 = SAFE_HEAP_LOAD($77 >> 0 | 0, 1, 0) | 0 | 0;
    $79 = $78 << 24 >> 24 == 36;
    if ($79) {
     $80 = $76 + 1 | 0;
     $81 = SAFE_HEAP_LOAD($80 >> 0 | 0, 1, 0) | 0 | 0;
     $82 = $81 << 24 >> 24;
     $83 = $82 + -48 | 0;
     $84 = $4 + ($83 << 2) | 0;
     SAFE_HEAP_STORE($84 | 0, 10 | 0, 4);
     $85 = SAFE_HEAP_LOAD($80 >> 0 | 0, 1, 0) | 0 | 0;
     $86 = $85 << 24 >> 24;
     $87 = $86 + -48 | 0;
     $88 = $3 + ($87 << 3) | 0;
     $89 = $88;
     $90 = $89;
     $91 = SAFE_HEAP_LOAD($90 | 0, 4, 0) | 0 | 0;
     $92 = $89 + 4 | 0;
     $93 = $92;
     $94 = SAFE_HEAP_LOAD($93 | 0, 4, 0) | 0 | 0;
     $95 = $76 + 3 | 0;
     $$0259 = $91;
     $$2271 = 1;
     $storemerge274 = $95;
    } else {
     label = 27;
    }
   }
   if ((label | 0) == 27) {
    label = 0;
    $96 = ($$1270 | 0) == 0;
    if (!$96) {
     $$0 = -1;
     break;
    }
    if ($10) {
     $arglist_current = SAFE_HEAP_LOAD($2 | 0, 4, 0) | 0 | 0;
     $97 = $arglist_current;
     $98 = 0 + 4 | 0;
     $expanded4 = $98;
     $expanded = $expanded4 - 1 | 0;
     $99 = $97 + $expanded | 0;
     $100 = 0 + 4 | 0;
     $expanded8 = $100;
     $expanded7 = $expanded8 - 1 | 0;
     $expanded6 = $expanded7 ^ -1;
     $101 = $99 & $expanded6;
     $102 = $101;
     $103 = SAFE_HEAP_LOAD($102 | 0, 4, 0) | 0 | 0;
     $arglist_next = $102 + 4 | 0;
     SAFE_HEAP_STORE($2 | 0, $arglist_next | 0, 4);
     $358 = $103;
    } else {
     $358 = 0;
    }
    $104 = SAFE_HEAP_LOAD($5 | 0, 4, 0) | 0 | 0;
    $105 = $104 + 1 | 0;
    $$0259 = $358;
    $$2271 = 0;
    $storemerge274 = $105;
   }
   SAFE_HEAP_STORE($5 | 0, $storemerge274 | 0, 4);
   $106 = ($$0259 | 0) < 0;
   $107 = $$0262$lcssa | 8192;
   $108 = 0 - $$0259 | 0;
   $spec$select291 = $106 ? $107 : $$0262$lcssa;
   $spec$select292 = $106 ? $108 : $$0259;
   $$1260 = $spec$select292;
   $$1263 = $spec$select291;
   $$3272 = $$2271;
   $112 = $storemerge274;
  } else {
   $109 = _getint($5) | 0;
   $110 = ($109 | 0) < 0;
   if ($110) {
    $$0 = -1;
    break;
   }
   $$pre362 = SAFE_HEAP_LOAD($5 | 0, 4, 0) | 0 | 0;
   $$1260 = $109;
   $$1263 = $$0262$lcssa;
   $$3272 = $$1270;
   $112 = $$pre362;
  }
  $111 = SAFE_HEAP_LOAD($112 >> 0 | 0, 1, 0) | 0 | 0;
  $113 = $111 << 24 >> 24 == 46;
  do {
   if ($113) {
    $114 = $112 + 1 | 0;
    $115 = SAFE_HEAP_LOAD($114 >> 0 | 0, 1, 0) | 0 | 0;
    $116 = $115 << 24 >> 24 == 42;
    if (!$116) {
     SAFE_HEAP_STORE($5 | 0, $114 | 0, 4);
     $152 = _getint($5) | 0;
     $$pre363$pre = SAFE_HEAP_LOAD($5 | 0, 4, 0) | 0 | 0;
     $$0254 = $152;
     $$pre363 = $$pre363$pre;
     break;
    }
    $117 = $112 + 2 | 0;
    $118 = SAFE_HEAP_LOAD($117 >> 0 | 0, 1, 0) | 0 | 0;
    $119 = $118 << 24 >> 24;
    $120 = _isdigit($119) | 0;
    $121 = ($120 | 0) == 0;
    if (!$121) {
     $122 = SAFE_HEAP_LOAD($5 | 0, 4, 0) | 0 | 0;
     $123 = $122 + 3 | 0;
     $124 = SAFE_HEAP_LOAD($123 >> 0 | 0, 1, 0) | 0 | 0;
     $125 = $124 << 24 >> 24 == 36;
     if ($125) {
      $126 = $122 + 2 | 0;
      $127 = SAFE_HEAP_LOAD($126 >> 0 | 0, 1, 0) | 0 | 0;
      $128 = $127 << 24 >> 24;
      $129 = $128 + -48 | 0;
      $130 = $4 + ($129 << 2) | 0;
      SAFE_HEAP_STORE($130 | 0, 10 | 0, 4);
      $131 = SAFE_HEAP_LOAD($126 >> 0 | 0, 1, 0) | 0 | 0;
      $132 = $131 << 24 >> 24;
      $133 = $132 + -48 | 0;
      $134 = $3 + ($133 << 3) | 0;
      $135 = $134;
      $136 = $135;
      $137 = SAFE_HEAP_LOAD($136 | 0, 4, 0) | 0 | 0;
      $138 = $135 + 4 | 0;
      $139 = $138;
      $140 = SAFE_HEAP_LOAD($139 | 0, 4, 0) | 0 | 0;
      $141 = $122 + 4 | 0;
      SAFE_HEAP_STORE($5 | 0, $141 | 0, 4);
      $$0254 = $137;
      $$pre363 = $141;
      break;
     }
    }
    $142 = ($$3272 | 0) == 0;
    if (!$142) {
     $$0 = -1;
     break L1;
    }
    if ($10) {
     $arglist_current2 = SAFE_HEAP_LOAD($2 | 0, 4, 0) | 0 | 0;
     $143 = $arglist_current2;
     $144 = 0 + 4 | 0;
     $expanded11 = $144;
     $expanded10 = $expanded11 - 1 | 0;
     $145 = $143 + $expanded10 | 0;
     $146 = 0 + 4 | 0;
     $expanded15 = $146;
     $expanded14 = $expanded15 - 1 | 0;
     $expanded13 = $expanded14 ^ -1;
     $147 = $145 & $expanded13;
     $148 = $147;
     $149 = SAFE_HEAP_LOAD($148 | 0, 4, 0) | 0 | 0;
     $arglist_next3 = $148 + 4 | 0;
     SAFE_HEAP_STORE($2 | 0, $arglist_next3 | 0, 4);
     $359 = $149;
    } else {
     $359 = 0;
    }
    $150 = SAFE_HEAP_LOAD($5 | 0, 4, 0) | 0 | 0;
    $151 = $150 + 2 | 0;
    SAFE_HEAP_STORE($5 | 0, $151 | 0, 4);
    $$0254 = $359;
    $$pre363 = $151;
   } else {
    $$0254 = -1;
    $$pre363 = $112;
   }
  } while (0);
  $$0252 = 0;
  $154 = $$pre363;
  while (1) {
   $153 = SAFE_HEAP_LOAD($154 >> 0 | 0, 1, 0) | 0 | 0;
   $155 = $153 << 24 >> 24;
   $156 = $155 + -65 | 0;
   $157 = $156 >>> 0 > 57;
   if ($157) {
    $$0 = -1;
    break L1;
   }
   $158 = $154 + 1 | 0;
   SAFE_HEAP_STORE($5 | 0, $158 | 0, 4);
   $159 = SAFE_HEAP_LOAD($154 >> 0 | 0, 1, 0) | 0 | 0;
   $160 = $159 << 24 >> 24;
   $161 = $160 + -65 | 0;
   $162 = (16 + ($$0252 * 58 | 0) | 0) + $161 | 0;
   $163 = SAFE_HEAP_LOAD($162 >> 0 | 0, 1, 0) | 0 | 0;
   $164 = $163 & 255;
   $165 = $164 + -1 | 0;
   $166 = $165 >>> 0 < 8;
   if ($166) {
    $$0252 = $164;
    $154 = $158;
   } else {
    break;
   }
  }
  $167 = $163 << 24 >> 24 == 0;
  if ($167) {
   $$0 = -1;
   break;
  }
  $168 = $163 << 24 >> 24 == 19;
  $169 = ($$0253 | 0) > -1;
  do {
   if ($168) {
    if ($169) {
     $$0 = -1;
     break L1;
    } else {
     label = 54;
    }
   } else {
    if ($169) {
     $170 = $4 + ($$0253 << 2) | 0;
     SAFE_HEAP_STORE($170 | 0, $164 | 0, 4);
     $171 = $3 + ($$0253 << 3) | 0;
     $172 = $171;
     $173 = $172;
     $174 = SAFE_HEAP_LOAD($173 | 0, 4, 0) | 0 | 0;
     $175 = $172 + 4 | 0;
     $176 = $175;
     $177 = SAFE_HEAP_LOAD($176 | 0, 4, 0) | 0 | 0;
     $178 = $6;
     $179 = $178;
     SAFE_HEAP_STORE($179 | 0, $174 | 0, 4);
     $180 = $178 + 4 | 0;
     $181 = $180;
     SAFE_HEAP_STORE($181 | 0, $177 | 0, 4);
     label = 54;
     break;
    }
    if (!$10) {
     $$0 = 0;
     break L1;
    }
    _pop_arg($6, $164, $2);
    $$pre364 = SAFE_HEAP_LOAD($5 | 0, 4, 0) | 0 | 0;
    $183 = $$pre364;
    label = 55;
   }
  } while (0);
  if ((label | 0) == 54) {
   label = 0;
   if ($10) {
    $183 = $158;
    label = 55;
   } else {
    $$0243$ph$be = 0;
   }
  }
  L77 : do {
   if ((label | 0) == 55) {
    label = 0;
    $182 = $183 + -1 | 0;
    $184 = SAFE_HEAP_LOAD($182 >> 0 | 0, 1, 0) | 0 | 0;
    $185 = $184 << 24 >> 24;
    $186 = ($$0252 | 0) != 0;
    $187 = $185 & 15;
    $188 = ($187 | 0) == 3;
    $or$cond276 = $186 & $188;
    $189 = $185 & -33;
    $$0235 = $or$cond276 ? $189 : $185;
    $190 = $$1263 & 8192;
    $191 = ($190 | 0) == 0;
    $192 = $$1263 & -65537;
    $spec$select = $191 ? $$1263 : $192;
    L79 : do {
     switch ($$0235 | 0) {
     case 110:
      {
       $trunc = $$0252 & 255;
       switch ($trunc << 24 >> 24) {
       case 0:
        {
         $199 = SAFE_HEAP_LOAD($6 | 0, 4, 0) | 0 | 0;
         SAFE_HEAP_STORE($199 | 0, $$1248 | 0, 4);
         $$0243$ph$be = 0;
         break L77;
         break;
        }
       case 1:
        {
         $200 = SAFE_HEAP_LOAD($6 | 0, 4, 0) | 0 | 0;
         SAFE_HEAP_STORE($200 | 0, $$1248 | 0, 4);
         $$0243$ph$be = 0;
         break L77;
         break;
        }
       case 2:
        {
         $201 = ($$1248 | 0) < 0;
         $202 = $201 << 31 >> 31;
         $203 = SAFE_HEAP_LOAD($6 | 0, 4, 0) | 0 | 0;
         $204 = $203;
         $205 = $204;
         SAFE_HEAP_STORE($205 | 0, $$1248 | 0, 4);
         $206 = $204 + 4 | 0;
         $207 = $206;
         SAFE_HEAP_STORE($207 | 0, $202 | 0, 4);
         $$0243$ph$be = 0;
         break L77;
         break;
        }
       case 3:
        {
         $208 = $$1248 & 65535;
         $209 = SAFE_HEAP_LOAD($6 | 0, 4, 0) | 0 | 0;
         SAFE_HEAP_STORE($209 | 0, $208 | 0, 2);
         $$0243$ph$be = 0;
         break L77;
         break;
        }
       case 4:
        {
         $210 = $$1248 & 255;
         $211 = SAFE_HEAP_LOAD($6 | 0, 4, 0) | 0 | 0;
         SAFE_HEAP_STORE($211 >> 0 | 0, $210 | 0, 1);
         $$0243$ph$be = 0;
         break L77;
         break;
        }
       case 6:
        {
         $212 = SAFE_HEAP_LOAD($6 | 0, 4, 0) | 0 | 0;
         SAFE_HEAP_STORE($212 | 0, $$1248 | 0, 4);
         $$0243$ph$be = 0;
         break L77;
         break;
        }
       case 7:
        {
         $213 = ($$1248 | 0) < 0;
         $214 = $213 << 31 >> 31;
         $215 = SAFE_HEAP_LOAD($6 | 0, 4, 0) | 0 | 0;
         $216 = $215;
         $217 = $216;
         SAFE_HEAP_STORE($217 | 0, $$1248 | 0, 4);
         $218 = $216 + 4 | 0;
         $219 = $218;
         SAFE_HEAP_STORE($219 | 0, $214 | 0, 4);
         $$0243$ph$be = 0;
         break L77;
         break;
        }
       default:
        {
         $$0243$ph$be = 0;
         break L77;
        }
       }
       break;
      }
     case 112:
      {
       $220 = $$0254 >>> 0 > 8;
       $221 = $220 ? $$0254 : 8;
       $222 = $spec$select | 8;
       $$1236 = 120;
       $$1255 = $221;
       $$3265 = $222;
       label = 67;
       break;
      }
     case 88:
     case 120:
      {
       $$1236 = $$0235;
       $$1255 = $$0254;
       $$3265 = $spec$select;
       label = 67;
       break;
      }
     case 111:
      {
       $238 = $6;
       $239 = $238;
       $240 = SAFE_HEAP_LOAD($239 | 0, 4, 0) | 0 | 0;
       $241 = $238 + 4 | 0;
       $242 = $241;
       $243 = SAFE_HEAP_LOAD($242 | 0, 4, 0) | 0 | 0;
       $244 = _fmt_o($240, $243, $11) | 0;
       $245 = $spec$select & 8;
       $246 = ($245 | 0) == 0;
       $247 = $244;
       $248 = $12 - $247 | 0;
       $249 = ($$0254 | 0) > ($248 | 0);
       $250 = $248 + 1 | 0;
       $251 = $246 | $249;
       $spec$select295 = $251 ? $$0254 : $250;
       $$0228 = $244;
       $$1233 = 0;
       $$1238 = 3325;
       $$2256 = $spec$select295;
       $$4266 = $spec$select;
       $277 = $240;
       $279 = $243;
       label = 73;
       break;
      }
     case 105:
     case 100:
      {
       $252 = $6;
       $253 = $252;
       $254 = SAFE_HEAP_LOAD($253 | 0, 4, 0) | 0 | 0;
       $255 = $252 + 4 | 0;
       $256 = $255;
       $257 = SAFE_HEAP_LOAD($256 | 0, 4, 0) | 0 | 0;
       $258 = ($257 | 0) < 0;
       if ($258) {
        $259 = _i64Subtract(0, 0, $254 | 0, $257 | 0) | 0;
        $260 = tempRet0;
        $261 = $6;
        $262 = $261;
        SAFE_HEAP_STORE($262 | 0, $259 | 0, 4);
        $263 = $261 + 4 | 0;
        $264 = $263;
        SAFE_HEAP_STORE($264 | 0, $260 | 0, 4);
        $$0232 = 1;
        $$0237 = 3325;
        $271 = $259;
        $272 = $260;
        label = 72;
        break L79;
       } else {
        $265 = $spec$select & 2048;
        $266 = ($265 | 0) == 0;
        $267 = $spec$select & 1;
        $268 = ($267 | 0) == 0;
        $$ = $268 ? 3325 : 3327;
        $spec$select296 = $266 ? $$ : 3326;
        $269 = $spec$select & 2049;
        $270 = ($269 | 0) != 0;
        $spec$select297 = $270 & 1;
        $$0232 = $spec$select297;
        $$0237 = $spec$select296;
        $271 = $254;
        $272 = $257;
        label = 72;
        break L79;
       }
       break;
      }
     case 117:
      {
       $193 = $6;
       $194 = $193;
       $195 = SAFE_HEAP_LOAD($194 | 0, 4, 0) | 0 | 0;
       $196 = $193 + 4 | 0;
       $197 = $196;
       $198 = SAFE_HEAP_LOAD($197 | 0, 4, 0) | 0 | 0;
       $$0232 = 0;
       $$0237 = 3325;
       $271 = $195;
       $272 = $198;
       label = 72;
       break;
      }
     case 99:
      {
       $288 = $6;
       $289 = $288;
       $290 = SAFE_HEAP_LOAD($289 | 0, 4, 0) | 0 | 0;
       $291 = $288 + 4 | 0;
       $292 = $291;
       $293 = SAFE_HEAP_LOAD($292 | 0, 4, 0) | 0 | 0;
       $294 = $290 & 255;
       SAFE_HEAP_STORE($13 >> 0 | 0, $294 | 0, 1);
       $$2 = $13;
       $$2234 = 0;
       $$2239 = 3325;
       $$5 = 1;
       $$6268 = $192;
       $$pre$phiZ2D = $12;
       break;
      }
     case 109:
      {
       $295 = ___errno_location() | 0;
       $296 = SAFE_HEAP_LOAD($295 | 0, 4, 0) | 0 | 0;
       $297 = _strerror($296) | 0;
       $$1 = $297;
       label = 77;
       break;
      }
     case 115:
      {
       $298 = SAFE_HEAP_LOAD($6 | 0, 4, 0) | 0 | 0;
       $299 = ($298 | 0) == (0 | 0);
       $300 = $299 ? 3335 : $298;
       $$1 = $300;
       label = 77;
       break;
      }
     case 67:
      {
       $307 = $6;
       $308 = $307;
       $309 = SAFE_HEAP_LOAD($308 | 0, 4, 0) | 0 | 0;
       $310 = $307 + 4 | 0;
       $311 = $310;
       $312 = SAFE_HEAP_LOAD($311 | 0, 4, 0) | 0 | 0;
       SAFE_HEAP_STORE($8 | 0, $309 | 0, 4);
       SAFE_HEAP_STORE($14 | 0, 0 | 0, 4);
       SAFE_HEAP_STORE($6 | 0, $8 | 0, 4);
       $$4258370 = -1;
       label = 81;
       break;
      }
     case 83:
      {
       $313 = ($$0254 | 0) == 0;
       if ($313) {
        _pad_680($0, 32, $$1260, 0, $spec$select);
        $$0240313371 = 0;
        label = 91;
       } else {
        $$4258370 = $$0254;
        label = 81;
       }
       break;
      }
     case 65:
     case 71:
     case 70:
     case 69:
     case 97:
     case 103:
     case 102:
     case 101:
      {
       $336 = +(+SAFE_HEAP_LOAD_D($6 | 0, 8));
       $337 = _fmt_fp($0, $336, $$1260, $$0254, $spec$select, $$0235) | 0;
       $$0243$ph$be = $337;
       break L77;
       break;
      }
     default:
      {
       $$2 = $20;
       $$2234 = 0;
       $$2239 = 3325;
       $$5 = $$0254;
       $$6268 = $spec$select;
       $$pre$phiZ2D = $12;
      }
     }
    } while (0);
    L103 : do {
     if ((label | 0) == 67) {
      label = 0;
      $223 = $6;
      $224 = $223;
      $225 = SAFE_HEAP_LOAD($224 | 0, 4, 0) | 0 | 0;
      $226 = $223 + 4 | 0;
      $227 = $226;
      $228 = SAFE_HEAP_LOAD($227 | 0, 4, 0) | 0 | 0;
      $229 = $$1236 & 32;
      $230 = _fmt_x($225, $228, $11, $229) | 0;
      $231 = ($225 | 0) == 0;
      $232 = ($228 | 0) == 0;
      $233 = $231 & $232;
      $234 = $$3265 & 8;
      $235 = ($234 | 0) == 0;
      $or$cond278 = $235 | $233;
      $236 = $$1236 >>> 4;
      $237 = 3325 + $236 | 0;
      $spec$select293 = $or$cond278 ? 3325 : $237;
      $spec$select294 = $or$cond278 ? 0 : 2;
      $$0228 = $230;
      $$1233 = $spec$select294;
      $$1238 = $spec$select293;
      $$2256 = $$1255;
      $$4266 = $$3265;
      $277 = $225;
      $279 = $228;
      label = 73;
     } else if ((label | 0) == 72) {
      label = 0;
      $273 = _fmt_u($271, $272, $11) | 0;
      $$0228 = $273;
      $$1233 = $$0232;
      $$1238 = $$0237;
      $$2256 = $$0254;
      $$4266 = $spec$select;
      $277 = $271;
      $279 = $272;
      label = 73;
     } else if ((label | 0) == 77) {
      label = 0;
      $301 = _memchr($$1, 0, $$0254) | 0;
      $302 = ($301 | 0) == (0 | 0);
      $303 = $301;
      $304 = $$1;
      $305 = $303 - $304 | 0;
      $306 = $$1 + $$0254 | 0;
      $$3257 = $302 ? $$0254 : $305;
      $$1250 = $302 ? $306 : $301;
      $$pre368 = $$1250;
      $$2 = $$1;
      $$2234 = 0;
      $$2239 = 3325;
      $$5 = $$3257;
      $$6268 = $192;
      $$pre$phiZ2D = $$pre368;
     } else if ((label | 0) == 81) {
      label = 0;
      $314 = SAFE_HEAP_LOAD($6 | 0, 4, 0) | 0 | 0;
      $$0229334 = $314;
      $$0240333 = 0;
      while (1) {
       $315 = SAFE_HEAP_LOAD($$0229334 | 0, 4, 0) | 0 | 0;
       $316 = ($315 | 0) == 0;
       if ($316) {
        $$0240313 = $$0240333;
        break;
       }
       $317 = _wctomb($9, $315) | 0;
       $318 = ($317 | 0) < 0;
       $319 = $$4258370 - $$0240333 | 0;
       $320 = $317 >>> 0 > $319 >>> 0;
       $or$cond283 = $318 | $320;
       if ($or$cond283) {
        label = 85;
        break;
       }
       $321 = $$0229334 + 4 | 0;
       $322 = $317 + $$0240333 | 0;
       $323 = $$4258370 >>> 0 > $322 >>> 0;
       if ($323) {
        $$0229334 = $321;
        $$0240333 = $322;
       } else {
        $$0240313 = $322;
        break;
       }
      }
      if ((label | 0) == 85) {
       label = 0;
       if ($318) {
        $$0 = -1;
        break L1;
       } else {
        $$0240313 = $$0240333;
       }
      }
      _pad_680($0, 32, $$1260, $$0240313, $spec$select);
      $324 = ($$0240313 | 0) == 0;
      if ($324) {
       $$0240313371 = 0;
       label = 91;
      } else {
       $325 = SAFE_HEAP_LOAD($6 | 0, 4, 0) | 0 | 0;
       $$1230340 = $325;
       $$1241339 = 0;
       while (1) {
        $326 = SAFE_HEAP_LOAD($$1230340 | 0, 4, 0) | 0 | 0;
        $327 = ($326 | 0) == 0;
        if ($327) {
         $$0240313371 = $$0240313;
         label = 91;
         break L103;
        }
        $328 = _wctomb($9, $326) | 0;
        $329 = $328 + $$1241339 | 0;
        $330 = ($329 | 0) > ($$0240313 | 0);
        if ($330) {
         $$0240313371 = $$0240313;
         label = 91;
         break L103;
        }
        $331 = $$1230340 + 4 | 0;
        _out($0, $9, $328);
        $332 = $329 >>> 0 < $$0240313 >>> 0;
        if ($332) {
         $$1230340 = $331;
         $$1241339 = $329;
        } else {
         $$0240313371 = $$0240313;
         label = 91;
         break;
        }
       }
      }
     }
    } while (0);
    if ((label | 0) == 73) {
     label = 0;
     $274 = ($$2256 | 0) > -1;
     $275 = $$4266 & -65537;
     $spec$select281 = $274 ? $275 : $$4266;
     $276 = ($277 | 0) != 0;
     $278 = ($279 | 0) != 0;
     $280 = $276 | $278;
     $281 = ($$2256 | 0) != 0;
     $or$cond = $281 | $280;
     $282 = $$0228;
     $283 = $12 - $282 | 0;
     $284 = $280 ^ 1;
     $285 = $284 & 1;
     $286 = $283 + $285 | 0;
     $287 = ($$2256 | 0) > ($286 | 0);
     $$2256$ = $287 ? $$2256 : $286;
     $spec$select298 = $or$cond ? $$2256$ : 0;
     $spec$select299 = $or$cond ? $$0228 : $11;
     $$2 = $spec$select299;
     $$2234 = $$1233;
     $$2239 = $$1238;
     $$5 = $spec$select298;
     $$6268 = $spec$select281;
     $$pre$phiZ2D = $12;
    } else if ((label | 0) == 91) {
     label = 0;
     $333 = $spec$select ^ 8192;
     _pad_680($0, 32, $$1260, $$0240313371, $333);
     $334 = ($$1260 | 0) > ($$0240313371 | 0);
     $335 = $334 ? $$1260 : $$0240313371;
     $$0243$ph$be = $335;
     break;
    }
    $338 = $$2;
    $339 = $$pre$phiZ2D - $338 | 0;
    $340 = ($$5 | 0) < ($339 | 0);
    $spec$select284 = $340 ? $339 : $$5;
    $341 = $spec$select284 + $$2234 | 0;
    $342 = ($$1260 | 0) < ($341 | 0);
    $$2261 = $342 ? $341 : $$1260;
    _pad_680($0, 32, $$2261, $341, $$6268);
    _out($0, $$2239, $$2234);
    $343 = $$6268 ^ 65536;
    _pad_680($0, 48, $$2261, $341, $343);
    _pad_680($0, 48, $spec$select284, $339, 0);
    _out($0, $$2, $339);
    $344 = $$6268 ^ 8192;
    _pad_680($0, 32, $$2261, $341, $344);
    $$0243$ph$be = $$2261;
   }
  } while (0);
  $$0243$ph = $$0243$ph$be;
  $$0247$ph = $$1248;
  $$0269$ph = $$3272;
 }
 L125 : do {
  if ((label | 0) == 94) {
   $345 = ($0 | 0) == (0 | 0);
   if ($345) {
    $346 = ($$0269$ph | 0) == 0;
    if ($346) {
     $$0 = 0;
    } else {
     $$2242320 = 1;
     while (1) {
      $347 = $4 + ($$2242320 << 2) | 0;
      $348 = SAFE_HEAP_LOAD($347 | 0, 4, 0) | 0 | 0;
      $349 = ($348 | 0) == 0;
      if ($349) {
       break;
      }
      $350 = $3 + ($$2242320 << 3) | 0;
      _pop_arg($350, $348, $2);
      $351 = $$2242320 + 1 | 0;
      $352 = $351 >>> 0 < 10;
      if ($352) {
       $$2242320 = $351;
      } else {
       $$0 = 1;
       break L125;
      }
     }
     $$3317 = $$2242320;
     while (1) {
      $355 = $4 + ($$3317 << 2) | 0;
      $356 = SAFE_HEAP_LOAD($355 | 0, 4, 0) | 0 | 0;
      $357 = ($356 | 0) == 0;
      $354 = $$3317 + 1 | 0;
      if (!$357) {
       $$0 = -1;
       break L125;
      }
      $353 = $354 >>> 0 < 10;
      if ($353) {
       $$3317 = $354;
      } else {
       $$0 = 1;
       break;
      }
     }
    }
   } else {
    $$0 = $$1248;
   }
  }
 } while (0);
 STACKTOP = sp;
 return $$0 | 0;
}

function _free($0) {
 $0 = $0 | 0;
 var $$0211$i = 0, $$0211$in$i = 0, $$0381438 = 0, $$0382$lcssa = 0, $$0382437 = 0, $$0394 = 0, $$0401 = 0, $$1 = 0, $$1380 = 0, $$1385 = 0, $$1385$be = 0, $$1385$ph = 0, $$1388 = 0, $$1388$be = 0, $$1388$ph = 0, $$1396 = 0, $$1396$be = 0, $$1396$ph = 0, $$1400 = 0, $$1400$be = 0;
 var $$1400$ph = 0, $$2 = 0, $$3 = 0, $$3398 = 0, $$pre = 0, $$pre$phi444Z2D = 0, $$pre$phi446Z2D = 0, $$pre$phiZ2D = 0, $$pre443 = 0, $$pre445 = 0, $$sink = 0, $$sink456 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0;
 var $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0;
 var $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0;
 var $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0;
 var $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0;
 var $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0;
 var $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0;
 var $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0;
 var $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0;
 var $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0;
 var $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0;
 var $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0;
 var $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0;
 var $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0;
 var $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $cond419 = 0, $cond420 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0 | 0) == (0 | 0);
 if ($1) {
  return;
 }
 $2 = $0 + -8 | 0;
 $3 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
 $4 = $2 >>> 0 < $3 >>> 0;
 if ($4) {
  _abort();
 }
 $5 = $0 + -4 | 0;
 $6 = SAFE_HEAP_LOAD($5 | 0, 4, 0) | 0 | 0;
 $7 = $6 & 3;
 $8 = ($7 | 0) == 1;
 if ($8) {
  _abort();
 }
 $9 = $6 & -8;
 $10 = $2 + $9 | 0;
 $11 = $6 & 1;
 $12 = ($11 | 0) == 0;
 L10 : do {
  if ($12) {
   $13 = SAFE_HEAP_LOAD($2 | 0, 4, 0) | 0 | 0;
   $14 = ($7 | 0) == 0;
   if ($14) {
    return;
   }
   $15 = 0 - $13 | 0;
   $16 = $2 + $15 | 0;
   $17 = $13 + $9 | 0;
   $18 = $16 >>> 0 < $3 >>> 0;
   if ($18) {
    _abort();
   }
   $19 = SAFE_HEAP_LOAD(4452 | 0, 4, 0) | 0 | 0;
   $20 = ($19 | 0) == ($16 | 0);
   if ($20) {
    $105 = $10 + 4 | 0;
    $106 = SAFE_HEAP_LOAD($105 | 0, 4, 0) | 0 | 0;
    $107 = $106 & 3;
    $108 = ($107 | 0) == 3;
    if (!$108) {
     $$1 = $16;
     $$1380 = $17;
     $114 = $16;
     break;
    }
    $109 = $16 + $17 | 0;
    $110 = $16 + 4 | 0;
    $111 = $17 | 1;
    $112 = $106 & -2;
    SAFE_HEAP_STORE(4440 | 0, $17 | 0, 4);
    SAFE_HEAP_STORE($105 | 0, $112 | 0, 4);
    SAFE_HEAP_STORE($110 | 0, $111 | 0, 4);
    SAFE_HEAP_STORE($109 | 0, $17 | 0, 4);
    return;
   }
   $21 = $13 >>> 3;
   $22 = $13 >>> 0 < 256;
   if ($22) {
    $23 = $16 + 8 | 0;
    $24 = SAFE_HEAP_LOAD($23 | 0, 4, 0) | 0 | 0;
    $25 = $16 + 12 | 0;
    $26 = SAFE_HEAP_LOAD($25 | 0, 4, 0) | 0 | 0;
    $27 = $21 << 1;
    $28 = 4472 + ($27 << 2) | 0;
    $29 = ($24 | 0) == ($28 | 0);
    if (!$29) {
     $30 = $3 >>> 0 > $24 >>> 0;
     if ($30) {
      _abort();
     }
     $31 = $24 + 12 | 0;
     $32 = SAFE_HEAP_LOAD($31 | 0, 4, 0) | 0 | 0;
     $33 = ($32 | 0) == ($16 | 0);
     if (!$33) {
      _abort();
     }
    }
    $34 = ($26 | 0) == ($24 | 0);
    if ($34) {
     $35 = 1 << $21;
     $36 = $35 ^ -1;
     $37 = SAFE_HEAP_LOAD(1108 * 4 | 0, 4, 0) | 0 | 0;
     $38 = $37 & $36;
     SAFE_HEAP_STORE(1108 * 4 | 0, $38 | 0, 4);
     $$1 = $16;
     $$1380 = $17;
     $114 = $16;
     break;
    }
    $39 = ($26 | 0) == ($28 | 0);
    if ($39) {
     $$pre445 = $26 + 8 | 0;
     $$pre$phi446Z2D = $$pre445;
    } else {
     $40 = $3 >>> 0 > $26 >>> 0;
     if ($40) {
      _abort();
     }
     $41 = $26 + 8 | 0;
     $42 = SAFE_HEAP_LOAD($41 | 0, 4, 0) | 0 | 0;
     $43 = ($42 | 0) == ($16 | 0);
     if ($43) {
      $$pre$phi446Z2D = $41;
     } else {
      _abort();
     }
    }
    $44 = $24 + 12 | 0;
    SAFE_HEAP_STORE($44 | 0, $26 | 0, 4);
    SAFE_HEAP_STORE($$pre$phi446Z2D | 0, $24 | 0, 4);
    $$1 = $16;
    $$1380 = $17;
    $114 = $16;
    break;
   }
   $45 = $16 + 24 | 0;
   $46 = SAFE_HEAP_LOAD($45 | 0, 4, 0) | 0 | 0;
   $47 = $16 + 12 | 0;
   $48 = SAFE_HEAP_LOAD($47 | 0, 4, 0) | 0 | 0;
   $49 = ($48 | 0) == ($16 | 0);
   do {
    if ($49) {
     $59 = $16 + 16 | 0;
     $60 = $59 + 4 | 0;
     $61 = SAFE_HEAP_LOAD($60 | 0, 4, 0) | 0 | 0;
     $62 = ($61 | 0) == (0 | 0);
     if ($62) {
      $63 = SAFE_HEAP_LOAD($59 | 0, 4, 0) | 0 | 0;
      $64 = ($63 | 0) == (0 | 0);
      if ($64) {
       $$3 = 0;
       break;
      } else {
       $$1385$ph = $63;
       $$1388$ph = $59;
      }
     } else {
      $$1385$ph = $61;
      $$1388$ph = $60;
     }
     $$1385 = $$1385$ph;
     $$1388 = $$1388$ph;
     while (1) {
      $65 = $$1385 + 20 | 0;
      $66 = SAFE_HEAP_LOAD($65 | 0, 4, 0) | 0 | 0;
      $67 = ($66 | 0) == (0 | 0);
      if ($67) {
       $68 = $$1385 + 16 | 0;
       $69 = SAFE_HEAP_LOAD($68 | 0, 4, 0) | 0 | 0;
       $70 = ($69 | 0) == (0 | 0);
       if ($70) {
        break;
       } else {
        $$1385$be = $69;
        $$1388$be = $68;
       }
      } else {
       $$1385$be = $66;
       $$1388$be = $65;
      }
      $$1385 = $$1385$be;
      $$1388 = $$1388$be;
     }
     $71 = $3 >>> 0 > $$1388 >>> 0;
     if ($71) {
      _abort();
     } else {
      SAFE_HEAP_STORE($$1388 | 0, 0 | 0, 4);
      $$3 = $$1385;
      break;
     }
    } else {
     $50 = $16 + 8 | 0;
     $51 = SAFE_HEAP_LOAD($50 | 0, 4, 0) | 0 | 0;
     $52 = $3 >>> 0 > $51 >>> 0;
     if ($52) {
      _abort();
     }
     $53 = $51 + 12 | 0;
     $54 = SAFE_HEAP_LOAD($53 | 0, 4, 0) | 0 | 0;
     $55 = ($54 | 0) == ($16 | 0);
     if (!$55) {
      _abort();
     }
     $56 = $48 + 8 | 0;
     $57 = SAFE_HEAP_LOAD($56 | 0, 4, 0) | 0 | 0;
     $58 = ($57 | 0) == ($16 | 0);
     if ($58) {
      SAFE_HEAP_STORE($53 | 0, $48 | 0, 4);
      SAFE_HEAP_STORE($56 | 0, $51 | 0, 4);
      $$3 = $48;
      break;
     } else {
      _abort();
     }
    }
   } while (0);
   $72 = ($46 | 0) == (0 | 0);
   if ($72) {
    $$1 = $16;
    $$1380 = $17;
    $114 = $16;
   } else {
    $73 = $16 + 28 | 0;
    $74 = SAFE_HEAP_LOAD($73 | 0, 4, 0) | 0 | 0;
    $75 = 4736 + ($74 << 2) | 0;
    $76 = SAFE_HEAP_LOAD($75 | 0, 4, 0) | 0 | 0;
    $77 = ($76 | 0) == ($16 | 0);
    do {
     if ($77) {
      SAFE_HEAP_STORE($75 | 0, $$3 | 0, 4);
      $cond419 = ($$3 | 0) == (0 | 0);
      if ($cond419) {
       $78 = 1 << $74;
       $79 = $78 ^ -1;
       $80 = SAFE_HEAP_LOAD(4436 | 0, 4, 0) | 0 | 0;
       $81 = $80 & $79;
       SAFE_HEAP_STORE(4436 | 0, $81 | 0, 4);
       $$1 = $16;
       $$1380 = $17;
       $114 = $16;
       break L10;
      }
     } else {
      $82 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
      $83 = $82 >>> 0 > $46 >>> 0;
      if ($83) {
       _abort();
      } else {
       $84 = $46 + 16 | 0;
       $85 = SAFE_HEAP_LOAD($84 | 0, 4, 0) | 0 | 0;
       $86 = ($85 | 0) == ($16 | 0);
       $87 = $46 + 20 | 0;
       $$sink = $86 ? $84 : $87;
       SAFE_HEAP_STORE($$sink | 0, $$3 | 0, 4);
       $88 = ($$3 | 0) == (0 | 0);
       if ($88) {
        $$1 = $16;
        $$1380 = $17;
        $114 = $16;
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
    $90 = $89 >>> 0 > $$3 >>> 0;
    if ($90) {
     _abort();
    }
    $91 = $$3 + 24 | 0;
    SAFE_HEAP_STORE($91 | 0, $46 | 0, 4);
    $92 = $16 + 16 | 0;
    $93 = SAFE_HEAP_LOAD($92 | 0, 4, 0) | 0 | 0;
    $94 = ($93 | 0) == (0 | 0);
    do {
     if (!$94) {
      $95 = $89 >>> 0 > $93 >>> 0;
      if ($95) {
       _abort();
      } else {
       $96 = $$3 + 16 | 0;
       SAFE_HEAP_STORE($96 | 0, $93 | 0, 4);
       $97 = $93 + 24 | 0;
       SAFE_HEAP_STORE($97 | 0, $$3 | 0, 4);
       break;
      }
     }
    } while (0);
    $98 = $92 + 4 | 0;
    $99 = SAFE_HEAP_LOAD($98 | 0, 4, 0) | 0 | 0;
    $100 = ($99 | 0) == (0 | 0);
    if ($100) {
     $$1 = $16;
     $$1380 = $17;
     $114 = $16;
    } else {
     $101 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
     $102 = $101 >>> 0 > $99 >>> 0;
     if ($102) {
      _abort();
     } else {
      $103 = $$3 + 20 | 0;
      SAFE_HEAP_STORE($103 | 0, $99 | 0, 4);
      $104 = $99 + 24 | 0;
      SAFE_HEAP_STORE($104 | 0, $$3 | 0, 4);
      $$1 = $16;
      $$1380 = $17;
      $114 = $16;
      break;
     }
    }
   }
  } else {
   $$1 = $2;
   $$1380 = $9;
   $114 = $2;
  }
 } while (0);
 $113 = $114 >>> 0 < $10 >>> 0;
 if (!$113) {
  _abort();
 }
 $115 = $10 + 4 | 0;
 $116 = SAFE_HEAP_LOAD($115 | 0, 4, 0) | 0 | 0;
 $117 = $116 & 1;
 $118 = ($117 | 0) == 0;
 if ($118) {
  _abort();
 }
 $119 = $116 & 2;
 $120 = ($119 | 0) == 0;
 if ($120) {
  $121 = SAFE_HEAP_LOAD(4456 | 0, 4, 0) | 0 | 0;
  $122 = ($121 | 0) == ($10 | 0);
  if ($122) {
   $123 = SAFE_HEAP_LOAD(4444 | 0, 4, 0) | 0 | 0;
   $124 = $123 + $$1380 | 0;
   SAFE_HEAP_STORE(4444 | 0, $124 | 0, 4);
   SAFE_HEAP_STORE(4456 | 0, $$1 | 0, 4);
   $125 = $124 | 1;
   $126 = $$1 + 4 | 0;
   SAFE_HEAP_STORE($126 | 0, $125 | 0, 4);
   $127 = SAFE_HEAP_LOAD(4452 | 0, 4, 0) | 0 | 0;
   $128 = ($$1 | 0) == ($127 | 0);
   if (!$128) {
    return;
   }
   SAFE_HEAP_STORE(4452 | 0, 0 | 0, 4);
   SAFE_HEAP_STORE(4440 | 0, 0 | 0, 4);
   return;
  }
  $129 = SAFE_HEAP_LOAD(4452 | 0, 4, 0) | 0 | 0;
  $130 = ($129 | 0) == ($10 | 0);
  if ($130) {
   $131 = SAFE_HEAP_LOAD(4440 | 0, 4, 0) | 0 | 0;
   $132 = $131 + $$1380 | 0;
   SAFE_HEAP_STORE(4440 | 0, $132 | 0, 4);
   SAFE_HEAP_STORE(4452 | 0, $114 | 0, 4);
   $133 = $132 | 1;
   $134 = $$1 + 4 | 0;
   SAFE_HEAP_STORE($134 | 0, $133 | 0, 4);
   $135 = $114 + $132 | 0;
   SAFE_HEAP_STORE($135 | 0, $132 | 0, 4);
   return;
  }
  $136 = $116 & -8;
  $137 = $136 + $$1380 | 0;
  $138 = $116 >>> 3;
  $139 = $116 >>> 0 < 256;
  L111 : do {
   if ($139) {
    $140 = $10 + 8 | 0;
    $141 = SAFE_HEAP_LOAD($140 | 0, 4, 0) | 0 | 0;
    $142 = $10 + 12 | 0;
    $143 = SAFE_HEAP_LOAD($142 | 0, 4, 0) | 0 | 0;
    $144 = $138 << 1;
    $145 = 4472 + ($144 << 2) | 0;
    $146 = ($141 | 0) == ($145 | 0);
    if (!$146) {
     $147 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
     $148 = $147 >>> 0 > $141 >>> 0;
     if ($148) {
      _abort();
     }
     $149 = $141 + 12 | 0;
     $150 = SAFE_HEAP_LOAD($149 | 0, 4, 0) | 0 | 0;
     $151 = ($150 | 0) == ($10 | 0);
     if (!$151) {
      _abort();
     }
    }
    $152 = ($143 | 0) == ($141 | 0);
    if ($152) {
     $153 = 1 << $138;
     $154 = $153 ^ -1;
     $155 = SAFE_HEAP_LOAD(1108 * 4 | 0, 4, 0) | 0 | 0;
     $156 = $155 & $154;
     SAFE_HEAP_STORE(1108 * 4 | 0, $156 | 0, 4);
     break;
    }
    $157 = ($143 | 0) == ($145 | 0);
    if ($157) {
     $$pre443 = $143 + 8 | 0;
     $$pre$phi444Z2D = $$pre443;
    } else {
     $158 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
     $159 = $158 >>> 0 > $143 >>> 0;
     if ($159) {
      _abort();
     }
     $160 = $143 + 8 | 0;
     $161 = SAFE_HEAP_LOAD($160 | 0, 4, 0) | 0 | 0;
     $162 = ($161 | 0) == ($10 | 0);
     if ($162) {
      $$pre$phi444Z2D = $160;
     } else {
      _abort();
     }
    }
    $163 = $141 + 12 | 0;
    SAFE_HEAP_STORE($163 | 0, $143 | 0, 4);
    SAFE_HEAP_STORE($$pre$phi444Z2D | 0, $141 | 0, 4);
   } else {
    $164 = $10 + 24 | 0;
    $165 = SAFE_HEAP_LOAD($164 | 0, 4, 0) | 0 | 0;
    $166 = $10 + 12 | 0;
    $167 = SAFE_HEAP_LOAD($166 | 0, 4, 0) | 0 | 0;
    $168 = ($167 | 0) == ($10 | 0);
    do {
     if ($168) {
      $179 = $10 + 16 | 0;
      $180 = $179 + 4 | 0;
      $181 = SAFE_HEAP_LOAD($180 | 0, 4, 0) | 0 | 0;
      $182 = ($181 | 0) == (0 | 0);
      if ($182) {
       $183 = SAFE_HEAP_LOAD($179 | 0, 4, 0) | 0 | 0;
       $184 = ($183 | 0) == (0 | 0);
       if ($184) {
        $$3398 = 0;
        break;
       } else {
        $$1396$ph = $183;
        $$1400$ph = $179;
       }
      } else {
       $$1396$ph = $181;
       $$1400$ph = $180;
      }
      $$1396 = $$1396$ph;
      $$1400 = $$1400$ph;
      while (1) {
       $185 = $$1396 + 20 | 0;
       $186 = SAFE_HEAP_LOAD($185 | 0, 4, 0) | 0 | 0;
       $187 = ($186 | 0) == (0 | 0);
       if ($187) {
        $188 = $$1396 + 16 | 0;
        $189 = SAFE_HEAP_LOAD($188 | 0, 4, 0) | 0 | 0;
        $190 = ($189 | 0) == (0 | 0);
        if ($190) {
         break;
        } else {
         $$1396$be = $189;
         $$1400$be = $188;
        }
       } else {
        $$1396$be = $186;
        $$1400$be = $185;
       }
       $$1396 = $$1396$be;
       $$1400 = $$1400$be;
      }
      $191 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
      $192 = $191 >>> 0 > $$1400 >>> 0;
      if ($192) {
       _abort();
      } else {
       SAFE_HEAP_STORE($$1400 | 0, 0 | 0, 4);
       $$3398 = $$1396;
       break;
      }
     } else {
      $169 = $10 + 8 | 0;
      $170 = SAFE_HEAP_LOAD($169 | 0, 4, 0) | 0 | 0;
      $171 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
      $172 = $171 >>> 0 > $170 >>> 0;
      if ($172) {
       _abort();
      }
      $173 = $170 + 12 | 0;
      $174 = SAFE_HEAP_LOAD($173 | 0, 4, 0) | 0 | 0;
      $175 = ($174 | 0) == ($10 | 0);
      if (!$175) {
       _abort();
      }
      $176 = $167 + 8 | 0;
      $177 = SAFE_HEAP_LOAD($176 | 0, 4, 0) | 0 | 0;
      $178 = ($177 | 0) == ($10 | 0);
      if ($178) {
       SAFE_HEAP_STORE($173 | 0, $167 | 0, 4);
       SAFE_HEAP_STORE($176 | 0, $170 | 0, 4);
       $$3398 = $167;
       break;
      } else {
       _abort();
      }
     }
    } while (0);
    $193 = ($165 | 0) == (0 | 0);
    if (!$193) {
     $194 = $10 + 28 | 0;
     $195 = SAFE_HEAP_LOAD($194 | 0, 4, 0) | 0 | 0;
     $196 = 4736 + ($195 << 2) | 0;
     $197 = SAFE_HEAP_LOAD($196 | 0, 4, 0) | 0 | 0;
     $198 = ($197 | 0) == ($10 | 0);
     do {
      if ($198) {
       SAFE_HEAP_STORE($196 | 0, $$3398 | 0, 4);
       $cond420 = ($$3398 | 0) == (0 | 0);
       if ($cond420) {
        $199 = 1 << $195;
        $200 = $199 ^ -1;
        $201 = SAFE_HEAP_LOAD(4436 | 0, 4, 0) | 0 | 0;
        $202 = $201 & $200;
        SAFE_HEAP_STORE(4436 | 0, $202 | 0, 4);
        break L111;
       }
      } else {
       $203 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
       $204 = $203 >>> 0 > $165 >>> 0;
       if ($204) {
        _abort();
       } else {
        $205 = $165 + 16 | 0;
        $206 = SAFE_HEAP_LOAD($205 | 0, 4, 0) | 0 | 0;
        $207 = ($206 | 0) == ($10 | 0);
        $208 = $165 + 20 | 0;
        $$sink456 = $207 ? $205 : $208;
        SAFE_HEAP_STORE($$sink456 | 0, $$3398 | 0, 4);
        $209 = ($$3398 | 0) == (0 | 0);
        if ($209) {
         break L111;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
     $211 = $210 >>> 0 > $$3398 >>> 0;
     if ($211) {
      _abort();
     }
     $212 = $$3398 + 24 | 0;
     SAFE_HEAP_STORE($212 | 0, $165 | 0, 4);
     $213 = $10 + 16 | 0;
     $214 = SAFE_HEAP_LOAD($213 | 0, 4, 0) | 0 | 0;
     $215 = ($214 | 0) == (0 | 0);
     do {
      if (!$215) {
       $216 = $210 >>> 0 > $214 >>> 0;
       if ($216) {
        _abort();
       } else {
        $217 = $$3398 + 16 | 0;
        SAFE_HEAP_STORE($217 | 0, $214 | 0, 4);
        $218 = $214 + 24 | 0;
        SAFE_HEAP_STORE($218 | 0, $$3398 | 0, 4);
        break;
       }
      }
     } while (0);
     $219 = $213 + 4 | 0;
     $220 = SAFE_HEAP_LOAD($219 | 0, 4, 0) | 0 | 0;
     $221 = ($220 | 0) == (0 | 0);
     if (!$221) {
      $222 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
      $223 = $222 >>> 0 > $220 >>> 0;
      if ($223) {
       _abort();
      } else {
       $224 = $$3398 + 20 | 0;
       SAFE_HEAP_STORE($224 | 0, $220 | 0, 4);
       $225 = $220 + 24 | 0;
       SAFE_HEAP_STORE($225 | 0, $$3398 | 0, 4);
       break;
      }
     }
    }
   }
  } while (0);
  $226 = $137 | 1;
  $227 = $$1 + 4 | 0;
  SAFE_HEAP_STORE($227 | 0, $226 | 0, 4);
  $228 = $114 + $137 | 0;
  SAFE_HEAP_STORE($228 | 0, $137 | 0, 4);
  $229 = SAFE_HEAP_LOAD(4452 | 0, 4, 0) | 0 | 0;
  $230 = ($$1 | 0) == ($229 | 0);
  if ($230) {
   SAFE_HEAP_STORE(4440 | 0, $137 | 0, 4);
   return;
  } else {
   $$2 = $137;
  }
 } else {
  $231 = $116 & -2;
  SAFE_HEAP_STORE($115 | 0, $231 | 0, 4);
  $232 = $$1380 | 1;
  $233 = $$1 + 4 | 0;
  SAFE_HEAP_STORE($233 | 0, $232 | 0, 4);
  $234 = $114 + $$1380 | 0;
  SAFE_HEAP_STORE($234 | 0, $$1380 | 0, 4);
  $$2 = $$1380;
 }
 $235 = $$2 >>> 3;
 $236 = $$2 >>> 0 < 256;
 if ($236) {
  $237 = $235 << 1;
  $238 = 4472 + ($237 << 2) | 0;
  $239 = SAFE_HEAP_LOAD(1108 * 4 | 0, 4, 0) | 0 | 0;
  $240 = 1 << $235;
  $241 = $239 & $240;
  $242 = ($241 | 0) == 0;
  if ($242) {
   $243 = $239 | $240;
   SAFE_HEAP_STORE(1108 * 4 | 0, $243 | 0, 4);
   $$pre = $238 + 8 | 0;
   $$0401 = $238;
   $$pre$phiZ2D = $$pre;
  } else {
   $244 = $238 + 8 | 0;
   $245 = SAFE_HEAP_LOAD($244 | 0, 4, 0) | 0 | 0;
   $246 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
   $247 = $246 >>> 0 > $245 >>> 0;
   if ($247) {
    _abort();
   } else {
    $$0401 = $245;
    $$pre$phiZ2D = $244;
   }
  }
  SAFE_HEAP_STORE($$pre$phiZ2D | 0, $$1 | 0, 4);
  $248 = $$0401 + 12 | 0;
  SAFE_HEAP_STORE($248 | 0, $$1 | 0, 4);
  $249 = $$1 + 8 | 0;
  SAFE_HEAP_STORE($249 | 0, $$0401 | 0, 4);
  $250 = $$1 + 12 | 0;
  SAFE_HEAP_STORE($250 | 0, $238 | 0, 4);
  return;
 }
 $251 = $$2 >>> 8;
 $252 = ($251 | 0) == 0;
 if ($252) {
  $$0394 = 0;
 } else {
  $253 = $$2 >>> 0 > 16777215;
  if ($253) {
   $$0394 = 31;
  } else {
   $254 = $251 + 1048320 | 0;
   $255 = $254 >>> 16;
   $256 = $255 & 8;
   $257 = $251 << $256;
   $258 = $257 + 520192 | 0;
   $259 = $258 >>> 16;
   $260 = $259 & 4;
   $261 = $260 | $256;
   $262 = $257 << $260;
   $263 = $262 + 245760 | 0;
   $264 = $263 >>> 16;
   $265 = $264 & 2;
   $266 = $261 | $265;
   $267 = 14 - $266 | 0;
   $268 = $262 << $265;
   $269 = $268 >>> 15;
   $270 = $267 + $269 | 0;
   $271 = $270 << 1;
   $272 = $270 + 7 | 0;
   $273 = $$2 >>> $272;
   $274 = $273 & 1;
   $275 = $274 | $271;
   $$0394 = $275;
  }
 }
 $276 = 4736 + ($$0394 << 2) | 0;
 $277 = $$1 + 28 | 0;
 SAFE_HEAP_STORE($277 | 0, $$0394 | 0, 4);
 $278 = $$1 + 16 | 0;
 $279 = $$1 + 20 | 0;
 SAFE_HEAP_STORE($279 | 0, 0 | 0, 4);
 SAFE_HEAP_STORE($278 | 0, 0 | 0, 4);
 $280 = SAFE_HEAP_LOAD(4436 | 0, 4, 0) | 0 | 0;
 $281 = 1 << $$0394;
 $282 = $280 & $281;
 $283 = ($282 | 0) == 0;
 L197 : do {
  if ($283) {
   $284 = $280 | $281;
   SAFE_HEAP_STORE(4436 | 0, $284 | 0, 4);
   SAFE_HEAP_STORE($276 | 0, $$1 | 0, 4);
   $285 = $$1 + 24 | 0;
   SAFE_HEAP_STORE($285 | 0, $276 | 0, 4);
   $286 = $$1 + 12 | 0;
   SAFE_HEAP_STORE($286 | 0, $$1 | 0, 4);
   $287 = $$1 + 8 | 0;
   SAFE_HEAP_STORE($287 | 0, $$1 | 0, 4);
  } else {
   $288 = SAFE_HEAP_LOAD($276 | 0, 4, 0) | 0 | 0;
   $289 = $288 + 4 | 0;
   $290 = SAFE_HEAP_LOAD($289 | 0, 4, 0) | 0 | 0;
   $291 = $290 & -8;
   $292 = ($291 | 0) == ($$2 | 0);
   L200 : do {
    if ($292) {
     $$0382$lcssa = $288;
    } else {
     $293 = ($$0394 | 0) == 31;
     $294 = $$0394 >>> 1;
     $295 = 25 - $294 | 0;
     $296 = $293 ? 0 : $295;
     $297 = $$2 << $296;
     $$0381438 = $297;
     $$0382437 = $288;
     while (1) {
      $304 = $$0381438 >>> 31;
      $305 = ($$0382437 + 16 | 0) + ($304 << 2) | 0;
      $300 = SAFE_HEAP_LOAD($305 | 0, 4, 0) | 0 | 0;
      $306 = ($300 | 0) == (0 | 0);
      if ($306) {
       break;
      }
      $298 = $$0381438 << 1;
      $299 = $300 + 4 | 0;
      $301 = SAFE_HEAP_LOAD($299 | 0, 4, 0) | 0 | 0;
      $302 = $301 & -8;
      $303 = ($302 | 0) == ($$2 | 0);
      if ($303) {
       $$0382$lcssa = $300;
       break L200;
      } else {
       $$0381438 = $298;
       $$0382437 = $300;
      }
     }
     $307 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
     $308 = $307 >>> 0 > $305 >>> 0;
     if ($308) {
      _abort();
     } else {
      SAFE_HEAP_STORE($305 | 0, $$1 | 0, 4);
      $309 = $$1 + 24 | 0;
      SAFE_HEAP_STORE($309 | 0, $$0382437 | 0, 4);
      $310 = $$1 + 12 | 0;
      SAFE_HEAP_STORE($310 | 0, $$1 | 0, 4);
      $311 = $$1 + 8 | 0;
      SAFE_HEAP_STORE($311 | 0, $$1 | 0, 4);
      break L197;
     }
    }
   } while (0);
   $312 = $$0382$lcssa + 8 | 0;
   $313 = SAFE_HEAP_LOAD($312 | 0, 4, 0) | 0 | 0;
   $314 = SAFE_HEAP_LOAD(4448 | 0, 4, 0) | 0 | 0;
   $315 = $314 >>> 0 <= $$0382$lcssa >>> 0;
   $316 = $314 >>> 0 <= $313 >>> 0;
   $317 = $316 & $315;
   if ($317) {
    $318 = $313 + 12 | 0;
    SAFE_HEAP_STORE($318 | 0, $$1 | 0, 4);
    SAFE_HEAP_STORE($312 | 0, $$1 | 0, 4);
    $319 = $$1 + 8 | 0;
    SAFE_HEAP_STORE($319 | 0, $313 | 0, 4);
    $320 = $$1 + 12 | 0;
    SAFE_HEAP_STORE($320 | 0, $$0382$lcssa | 0, 4);
    $321 = $$1 + 24 | 0;
    SAFE_HEAP_STORE($321 | 0, 0 | 0, 4);
    break;
   } else {
    _abort();
   }
  }
 } while (0);
 $322 = SAFE_HEAP_LOAD(4464 | 0, 4, 0) | 0 | 0;
 $323 = $322 + -1 | 0;
 SAFE_HEAP_STORE(4464 | 0, $323 | 0, 4);
 $324 = ($323 | 0) == 0;
 if (!$324) {
  return;
 }
 $$0211$in$i = 4888;
 while (1) {
  $$0211$i = SAFE_HEAP_LOAD($$0211$in$i | 0, 4, 0) | 0 | 0;
  $325 = ($$0211$i | 0) == (0 | 0);
  $326 = $$0211$i + 8 | 0;
  if ($325) {
   break;
  } else {
   $$0211$in$i = $326;
  }
 }
 SAFE_HEAP_STORE(4464 | 0, -1 | 0, 4);
 return;
}

function _pop_arg($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$mask = 0, $$mask31 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current11 = 0, $arglist_current14 = 0, $arglist_current17 = 0;
 var $arglist_current2 = 0, $arglist_current20 = 0, $arglist_current23 = 0, $arglist_current26 = 0, $arglist_current5 = 0, $arglist_current8 = 0, $arglist_next = 0, $arglist_next12 = 0, $arglist_next15 = 0, $arglist_next18 = 0, $arglist_next21 = 0, $arglist_next24 = 0, $arglist_next27 = 0, $arglist_next3 = 0, $arglist_next6 = 0, $arglist_next9 = 0, $expanded = 0, $expanded28 = 0, $expanded30 = 0, $expanded31 = 0;
 var $expanded32 = 0, $expanded34 = 0, $expanded35 = 0, $expanded37 = 0, $expanded38 = 0, $expanded39 = 0, $expanded41 = 0, $expanded42 = 0, $expanded44 = 0, $expanded45 = 0, $expanded46 = 0, $expanded48 = 0, $expanded49 = 0, $expanded51 = 0, $expanded52 = 0, $expanded53 = 0, $expanded55 = 0, $expanded56 = 0, $expanded58 = 0, $expanded59 = 0;
 var $expanded60 = 0, $expanded62 = 0, $expanded63 = 0, $expanded65 = 0, $expanded66 = 0, $expanded67 = 0, $expanded69 = 0, $expanded70 = 0, $expanded72 = 0, $expanded73 = 0, $expanded74 = 0, $expanded76 = 0, $expanded77 = 0, $expanded79 = 0, $expanded80 = 0, $expanded81 = 0, $expanded83 = 0, $expanded84 = 0, $expanded86 = 0, $expanded87 = 0;
 var $expanded88 = 0, $expanded90 = 0, $expanded91 = 0, $expanded93 = 0, $expanded94 = 0, $expanded95 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1 >>> 0 > 20;
 L1 : do {
  if (!$3) {
   do {
    switch ($1 | 0) {
    case 9:
     {
      $arglist_current = SAFE_HEAP_LOAD($2 | 0, 4, 0) | 0 | 0;
      $4 = $arglist_current;
      $5 = 0 + 4 | 0;
      $expanded28 = $5;
      $expanded = $expanded28 - 1 | 0;
      $6 = $4 + $expanded | 0;
      $7 = 0 + 4 | 0;
      $expanded32 = $7;
      $expanded31 = $expanded32 - 1 | 0;
      $expanded30 = $expanded31 ^ -1;
      $8 = $6 & $expanded30;
      $9 = $8;
      $10 = SAFE_HEAP_LOAD($9 | 0, 4, 0) | 0 | 0;
      $arglist_next = $9 + 4 | 0;
      SAFE_HEAP_STORE($2 | 0, $arglist_next | 0, 4);
      SAFE_HEAP_STORE($0 | 0, $10 | 0, 4);
      break L1;
      break;
     }
    case 10:
     {
      $arglist_current2 = SAFE_HEAP_LOAD($2 | 0, 4, 0) | 0 | 0;
      $11 = $arglist_current2;
      $12 = 0 + 4 | 0;
      $expanded35 = $12;
      $expanded34 = $expanded35 - 1 | 0;
      $13 = $11 + $expanded34 | 0;
      $14 = 0 + 4 | 0;
      $expanded39 = $14;
      $expanded38 = $expanded39 - 1 | 0;
      $expanded37 = $expanded38 ^ -1;
      $15 = $13 & $expanded37;
      $16 = $15;
      $17 = SAFE_HEAP_LOAD($16 | 0, 4, 0) | 0 | 0;
      $arglist_next3 = $16 + 4 | 0;
      SAFE_HEAP_STORE($2 | 0, $arglist_next3 | 0, 4);
      $18 = ($17 | 0) < 0;
      $19 = $18 << 31 >> 31;
      $20 = $0;
      $21 = $20;
      SAFE_HEAP_STORE($21 | 0, $17 | 0, 4);
      $22 = $20 + 4 | 0;
      $23 = $22;
      SAFE_HEAP_STORE($23 | 0, $19 | 0, 4);
      break L1;
      break;
     }
    case 11:
     {
      $arglist_current5 = SAFE_HEAP_LOAD($2 | 0, 4, 0) | 0 | 0;
      $24 = $arglist_current5;
      $25 = 0 + 4 | 0;
      $expanded42 = $25;
      $expanded41 = $expanded42 - 1 | 0;
      $26 = $24 + $expanded41 | 0;
      $27 = 0 + 4 | 0;
      $expanded46 = $27;
      $expanded45 = $expanded46 - 1 | 0;
      $expanded44 = $expanded45 ^ -1;
      $28 = $26 & $expanded44;
      $29 = $28;
      $30 = SAFE_HEAP_LOAD($29 | 0, 4, 0) | 0 | 0;
      $arglist_next6 = $29 + 4 | 0;
      SAFE_HEAP_STORE($2 | 0, $arglist_next6 | 0, 4);
      $31 = $0;
      $32 = $31;
      SAFE_HEAP_STORE($32 | 0, $30 | 0, 4);
      $33 = $31 + 4 | 0;
      $34 = $33;
      SAFE_HEAP_STORE($34 | 0, 0 | 0, 4);
      break L1;
      break;
     }
    case 12:
     {
      $arglist_current8 = SAFE_HEAP_LOAD($2 | 0, 4, 0) | 0 | 0;
      $35 = $arglist_current8;
      $36 = 0 + 8 | 0;
      $expanded49 = $36;
      $expanded48 = $expanded49 - 1 | 0;
      $37 = $35 + $expanded48 | 0;
      $38 = 0 + 8 | 0;
      $expanded53 = $38;
      $expanded52 = $expanded53 - 1 | 0;
      $expanded51 = $expanded52 ^ -1;
      $39 = $37 & $expanded51;
      $40 = $39;
      $41 = $40;
      $42 = $41;
      $43 = SAFE_HEAP_LOAD($42 | 0, 4, 0) | 0 | 0;
      $44 = $41 + 4 | 0;
      $45 = $44;
      $46 = SAFE_HEAP_LOAD($45 | 0, 4, 0) | 0 | 0;
      $arglist_next9 = $40 + 8 | 0;
      SAFE_HEAP_STORE($2 | 0, $arglist_next9 | 0, 4);
      $47 = $0;
      $48 = $47;
      SAFE_HEAP_STORE($48 | 0, $43 | 0, 4);
      $49 = $47 + 4 | 0;
      $50 = $49;
      SAFE_HEAP_STORE($50 | 0, $46 | 0, 4);
      break L1;
      break;
     }
    case 13:
     {
      $arglist_current11 = SAFE_HEAP_LOAD($2 | 0, 4, 0) | 0 | 0;
      $51 = $arglist_current11;
      $52 = 0 + 4 | 0;
      $expanded56 = $52;
      $expanded55 = $expanded56 - 1 | 0;
      $53 = $51 + $expanded55 | 0;
      $54 = 0 + 4 | 0;
      $expanded60 = $54;
      $expanded59 = $expanded60 - 1 | 0;
      $expanded58 = $expanded59 ^ -1;
      $55 = $53 & $expanded58;
      $56 = $55;
      $57 = SAFE_HEAP_LOAD($56 | 0, 4, 0) | 0 | 0;
      $arglist_next12 = $56 + 4 | 0;
      SAFE_HEAP_STORE($2 | 0, $arglist_next12 | 0, 4);
      $58 = $57 & 65535;
      $59 = $58 << 16 >> 16;
      $60 = ($59 | 0) < 0;
      $61 = $60 << 31 >> 31;
      $62 = $0;
      $63 = $62;
      SAFE_HEAP_STORE($63 | 0, $59 | 0, 4);
      $64 = $62 + 4 | 0;
      $65 = $64;
      SAFE_HEAP_STORE($65 | 0, $61 | 0, 4);
      break L1;
      break;
     }
    case 14:
     {
      $arglist_current14 = SAFE_HEAP_LOAD($2 | 0, 4, 0) | 0 | 0;
      $66 = $arglist_current14;
      $67 = 0 + 4 | 0;
      $expanded63 = $67;
      $expanded62 = $expanded63 - 1 | 0;
      $68 = $66 + $expanded62 | 0;
      $69 = 0 + 4 | 0;
      $expanded67 = $69;
      $expanded66 = $expanded67 - 1 | 0;
      $expanded65 = $expanded66 ^ -1;
      $70 = $68 & $expanded65;
      $71 = $70;
      $72 = SAFE_HEAP_LOAD($71 | 0, 4, 0) | 0 | 0;
      $arglist_next15 = $71 + 4 | 0;
      SAFE_HEAP_STORE($2 | 0, $arglist_next15 | 0, 4);
      $$mask31 = $72 & 65535;
      $73 = $0;
      $74 = $73;
      SAFE_HEAP_STORE($74 | 0, $$mask31 | 0, 4);
      $75 = $73 + 4 | 0;
      $76 = $75;
      SAFE_HEAP_STORE($76 | 0, 0 | 0, 4);
      break L1;
      break;
     }
    case 15:
     {
      $arglist_current17 = SAFE_HEAP_LOAD($2 | 0, 4, 0) | 0 | 0;
      $77 = $arglist_current17;
      $78 = 0 + 4 | 0;
      $expanded70 = $78;
      $expanded69 = $expanded70 - 1 | 0;
      $79 = $77 + $expanded69 | 0;
      $80 = 0 + 4 | 0;
      $expanded74 = $80;
      $expanded73 = $expanded74 - 1 | 0;
      $expanded72 = $expanded73 ^ -1;
      $81 = $79 & $expanded72;
      $82 = $81;
      $83 = SAFE_HEAP_LOAD($82 | 0, 4, 0) | 0 | 0;
      $arglist_next18 = $82 + 4 | 0;
      SAFE_HEAP_STORE($2 | 0, $arglist_next18 | 0, 4);
      $84 = $83 & 255;
      $85 = $84 << 24 >> 24;
      $86 = ($85 | 0) < 0;
      $87 = $86 << 31 >> 31;
      $88 = $0;
      $89 = $88;
      SAFE_HEAP_STORE($89 | 0, $85 | 0, 4);
      $90 = $88 + 4 | 0;
      $91 = $90;
      SAFE_HEAP_STORE($91 | 0, $87 | 0, 4);
      break L1;
      break;
     }
    case 16:
     {
      $arglist_current20 = SAFE_HEAP_LOAD($2 | 0, 4, 0) | 0 | 0;
      $92 = $arglist_current20;
      $93 = 0 + 4 | 0;
      $expanded77 = $93;
      $expanded76 = $expanded77 - 1 | 0;
      $94 = $92 + $expanded76 | 0;
      $95 = 0 + 4 | 0;
      $expanded81 = $95;
      $expanded80 = $expanded81 - 1 | 0;
      $expanded79 = $expanded80 ^ -1;
      $96 = $94 & $expanded79;
      $97 = $96;
      $98 = SAFE_HEAP_LOAD($97 | 0, 4, 0) | 0 | 0;
      $arglist_next21 = $97 + 4 | 0;
      SAFE_HEAP_STORE($2 | 0, $arglist_next21 | 0, 4);
      $$mask = $98 & 255;
      $99 = $0;
      $100 = $99;
      SAFE_HEAP_STORE($100 | 0, $$mask | 0, 4);
      $101 = $99 + 4 | 0;
      $102 = $101;
      SAFE_HEAP_STORE($102 | 0, 0 | 0, 4);
      break L1;
      break;
     }
    case 17:
     {
      $arglist_current23 = SAFE_HEAP_LOAD($2 | 0, 4, 0) | 0 | 0;
      $103 = $arglist_current23;
      $104 = 0 + 8 | 0;
      $expanded84 = $104;
      $expanded83 = $expanded84 - 1 | 0;
      $105 = $103 + $expanded83 | 0;
      $106 = 0 + 8 | 0;
      $expanded88 = $106;
      $expanded87 = $expanded88 - 1 | 0;
      $expanded86 = $expanded87 ^ -1;
      $107 = $105 & $expanded86;
      $108 = $107;
      $109 = +(+SAFE_HEAP_LOAD_D($108 | 0, 8));
      $arglist_next24 = $108 + 8 | 0;
      SAFE_HEAP_STORE($2 | 0, $arglist_next24 | 0, 4);
      SAFE_HEAP_STORE_D($0 | 0, +$109, 8);
      break L1;
      break;
     }
    case 18:
     {
      $arglist_current26 = SAFE_HEAP_LOAD($2 | 0, 4, 0) | 0 | 0;
      $110 = $arglist_current26;
      $111 = 0 + 8 | 0;
      $expanded91 = $111;
      $expanded90 = $expanded91 - 1 | 0;
      $112 = $110 + $expanded90 | 0;
      $113 = 0 + 8 | 0;
      $expanded95 = $113;
      $expanded94 = $expanded95 - 1 | 0;
      $expanded93 = $expanded94 ^ -1;
      $114 = $112 & $expanded93;
      $115 = $114;
      $116 = +(+SAFE_HEAP_LOAD_D($115 | 0, 8));
      $arglist_next27 = $115 + 8 | 0;
      SAFE_HEAP_STORE($2 | 0, $arglist_next27 | 0, 4);
      SAFE_HEAP_STORE_D($0 | 0, +$116, 8);
      break L1;
      break;
     }
    default:
     {
      break L1;
     }
    }
   } while (0);
  }
 } while (0);
 return;
}

function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $49 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $86 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $117 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $147 = 0, $149 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $152 = 0, $154$0 = 0, $r_sroa_0_0_extract_trunc = 0, $r_sroa_1_4_extract_trunc = 0, $155 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $q_sroa_0_0_insert_insert77$1 = 0, $_0$0 = 0, $_0$1 = 0;
 $n_sroa_0_0_extract_trunc = $a$0;
 $n_sroa_1_4_extract_shift$0 = $a$1;
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0;
 $d_sroa_0_0_extract_trunc = $b$0;
 $d_sroa_1_4_extract_shift$0 = $b$1;
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0;
 if (($n_sroa_1_4_extract_trunc | 0) == 0) {
  $4 = ($rem | 0) != 0;
  if (($d_sroa_1_4_extract_trunc | 0) == 0) {
   if ($4) {
    SAFE_HEAP_STORE($rem | 0, ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0) | 0, 4);
    SAFE_HEAP_STORE($rem + 4 | 0, 0 | 0, 4);
   }
   $_0$1 = 0;
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
   return (tempRet0 = $_0$1, $_0$0) | 0;
  } else {
   if (!$4) {
    $_0$1 = 0;
    $_0$0 = 0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
   }
   SAFE_HEAP_STORE($rem | 0, $a$0 & -1 | 0, 4);
   SAFE_HEAP_STORE($rem + 4 | 0, $a$1 & 0 | 0, 4);
   $_0$1 = 0;
   $_0$0 = 0;
   return (tempRet0 = $_0$1, $_0$0) | 0;
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0;
 do {
  if (($d_sroa_0_0_extract_trunc | 0) == 0) {
   if ($17) {
    if (($rem | 0) != 0) {
     SAFE_HEAP_STORE($rem | 0, ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0) | 0, 4);
     SAFE_HEAP_STORE($rem + 4 | 0, 0 | 0, 4);
    }
    $_0$1 = 0;
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
   }
   if (($n_sroa_0_0_extract_trunc | 0) == 0) {
    if (($rem | 0) != 0) {
     SAFE_HEAP_STORE($rem | 0, 0 | 0, 4);
     SAFE_HEAP_STORE($rem + 4 | 0, ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0) | 0, 4);
    }
    $_0$1 = 0;
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0;
   if (($37 & $d_sroa_1_4_extract_trunc | 0) == 0) {
    if (($rem | 0) != 0) {
     SAFE_HEAP_STORE($rem | 0, 0 | $a$0 & -1 | 0, 4);
     SAFE_HEAP_STORE($rem + 4 | 0, $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0 | 0, 4);
    }
    $_0$1 = 0;
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0);
    return (tempRet0 = $_0$1, $_0$0) | 0;
   }
   $49 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
   $51 = $49 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0;
    $58 = 31 - $51 | 0;
    $sr_1_ph = $57;
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0);
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0);
    $q_sroa_0_1_ph = 0;
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58;
    break;
   }
   if (($rem | 0) == 0) {
    $_0$1 = 0;
    $_0$0 = 0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
   }
   SAFE_HEAP_STORE($rem | 0, 0 | $a$0 & -1 | 0, 4);
   SAFE_HEAP_STORE($rem + 4 | 0, $n_sroa_1_4_extract_shift$0 | $a$1 & 0 | 0, 4);
   $_0$1 = 0;
   $_0$0 = 0;
   return (tempRet0 = $_0$1, $_0$0) | 0;
  } else {
   if (!$17) {
    $117 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
    $119 = $117 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0;
     $126 = 31 - $119 | 0;
     $130 = $119 - 31 >> 31;
     $sr_1_ph = $125;
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126;
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130;
     $q_sroa_0_1_ph = 0;
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126;
     break;
    }
    if (($rem | 0) == 0) {
     $_0$1 = 0;
     $_0$0 = 0;
     return (tempRet0 = $_0$1, $_0$0) | 0;
    }
    SAFE_HEAP_STORE($rem | 0, 0 | $a$0 & -1 | 0, 4);
    SAFE_HEAP_STORE($rem + 4 | 0, $n_sroa_1_4_extract_shift$0 | $a$1 & 0 | 0, 4);
    $_0$1 = 0;
    $_0$0 = 0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0;
   if (($66 & $d_sroa_0_0_extract_trunc | 0) != 0) {
    $86 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 | 0;
    $88 = $86 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
    $89 = 64 - $88 | 0;
    $91 = 32 - $88 | 0;
    $92 = $91 >> 31;
    $95 = $88 - 32 | 0;
    $105 = $95 >> 31;
    $sr_1_ph = $88;
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105;
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0);
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92;
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31;
    break;
   }
   if (($rem | 0) != 0) {
    SAFE_HEAP_STORE($rem | 0, $66 & $n_sroa_0_0_extract_trunc | 0, 4);
    SAFE_HEAP_STORE($rem + 4 | 0, 0 | 0, 4);
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
    $_0$0 = 0 | $a$0 & -1;
    return (tempRet0 = $_0$1, $_0$0) | 0;
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0;
    $_0$1 = 0 | $n_sroa_1_4_extract_trunc >>> ($78 >>> 0);
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
   }
  }
 } while (0);
 if (($sr_1_ph | 0) == 0) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph;
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph;
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph;
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph;
  $carry_0_lcssa$1 = 0;
  $carry_0_lcssa$0 = 0;
 } else {
  $d_sroa_0_0_insert_insert99$0 = 0 | $b$0 & -1;
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0;
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0;
  $137$1 = tempRet0;
  $q_sroa_1_1198 = $q_sroa_1_1_ph;
  $q_sroa_0_1199 = $q_sroa_0_1_ph;
  $r_sroa_1_1200 = $r_sroa_1_1_ph;
  $r_sroa_0_1201 = $r_sroa_0_1_ph;
  $sr_1202 = $sr_1_ph;
  $carry_0203 = 0;
  while (1) {
   $147 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1;
   $149 = $carry_0203 | $q_sroa_0_1199 << 1;
   $r_sroa_0_0_insert_insert42$0 = 0 | ($r_sroa_0_1201 << 1 | $q_sroa_1_1198 >>> 31);
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0;
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0;
   $150$1 = tempRet0;
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1;
   $152 = $151$0 & 1;
   $154$0 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0;
   $r_sroa_0_0_extract_trunc = $154$0;
   $r_sroa_1_4_extract_trunc = tempRet0;
   $155 = $sr_1202 - 1 | 0;
   if (($155 | 0) == 0) {
    break;
   } else {
    $q_sroa_1_1198 = $147;
    $q_sroa_0_1199 = $149;
    $r_sroa_1_1200 = $r_sroa_1_4_extract_trunc;
    $r_sroa_0_1201 = $r_sroa_0_0_extract_trunc;
    $sr_1202 = $155;
    $carry_0203 = $152;
   }
  }
  $q_sroa_1_1_lcssa = $147;
  $q_sroa_0_1_lcssa = $149;
  $r_sroa_1_1_lcssa = $r_sroa_1_4_extract_trunc;
  $r_sroa_0_1_lcssa = $r_sroa_0_0_extract_trunc;
  $carry_0_lcssa$1 = 0;
  $carry_0_lcssa$0 = $152;
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa;
 $q_sroa_0_0_insert_ext75$1 = 0;
 $q_sroa_0_0_insert_insert77$1 = $q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1;
 if (($rem | 0) != 0) {
  SAFE_HEAP_STORE($rem | 0, 0 | $r_sroa_0_1_lcssa | 0, 4);
  SAFE_HEAP_STORE($rem + 4 | 0, $r_sroa_1_1_lcssa | 0 | 0, 4);
 }
 $_0$1 = (0 | $q_sroa_0_0_insert_ext75$0) >>> 31 | $q_sroa_0_0_insert_insert77$1 << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1;
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0;
 return (tempRet0 = $_0$1, $_0$0) | 0;
}

function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0;
 var $vararg_ptr6 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48 | 0;
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48 | 0);
 $vararg_buffer3 = sp + 32 | 0;
 $vararg_buffer = sp + 16 | 0;
 $3 = sp;
 $4 = $0 + 28 | 0;
 $5 = SAFE_HEAP_LOAD($4 | 0, 4, 0) | 0 | 0;
 SAFE_HEAP_STORE($3 | 0, $5 | 0, 4);
 $6 = $3 + 4 | 0;
 $7 = $0 + 20 | 0;
 $8 = SAFE_HEAP_LOAD($7 | 0, 4, 0) | 0 | 0;
 $9 = $8 - $5 | 0;
 SAFE_HEAP_STORE($6 | 0, $9 | 0, 4);
 $10 = $3 + 8 | 0;
 SAFE_HEAP_STORE($10 | 0, $1 | 0, 4);
 $11 = $3 + 12 | 0;
 SAFE_HEAP_STORE($11 | 0, $2 | 0, 4);
 $12 = $9 + $2 | 0;
 $13 = $0 + 60 | 0;
 $14 = SAFE_HEAP_LOAD($13 | 0, 4, 0) | 0 | 0;
 $15 = $3;
 SAFE_HEAP_STORE($vararg_buffer | 0, $14 | 0, 4);
 $vararg_ptr1 = $vararg_buffer + 4 | 0;
 SAFE_HEAP_STORE($vararg_ptr1 | 0, $15 | 0, 4);
 $vararg_ptr2 = $vararg_buffer + 8 | 0;
 SAFE_HEAP_STORE($vararg_ptr2 | 0, 2 | 0, 4);
 $16 = ___syscall146(146, $vararg_buffer | 0) | 0;
 $17 = ___syscall_ret($16) | 0;
 $18 = ($12 | 0) == ($17 | 0);
 L1 : do {
  if ($18) {
   label = 3;
  } else {
   $$04756 = 2;
   $$04855 = $12;
   $$04954 = $3;
   $27 = $17;
   while (1) {
    $26 = ($27 | 0) < 0;
    if ($26) {
     break;
    }
    $35 = $$04855 - $27 | 0;
    $36 = $$04954 + 4 | 0;
    $37 = SAFE_HEAP_LOAD($36 | 0, 4, 0) | 0 | 0;
    $38 = $27 >>> 0 > $37 >>> 0;
    $39 = $$04954 + 8 | 0;
    $$150 = $38 ? $39 : $$04954;
    $40 = $38 << 31 >> 31;
    $$1 = $$04756 + $40 | 0;
    $41 = $38 ? $37 : 0;
    $$0 = $27 - $41 | 0;
    $42 = SAFE_HEAP_LOAD($$150 | 0, 4, 0) | 0 | 0;
    $43 = $42 + $$0 | 0;
    SAFE_HEAP_STORE($$150 | 0, $43 | 0, 4);
    $44 = $$150 + 4 | 0;
    $45 = SAFE_HEAP_LOAD($44 | 0, 4, 0) | 0 | 0;
    $46 = $45 - $$0 | 0;
    SAFE_HEAP_STORE($44 | 0, $46 | 0, 4);
    $47 = SAFE_HEAP_LOAD($13 | 0, 4, 0) | 0 | 0;
    $48 = $$150;
    SAFE_HEAP_STORE($vararg_buffer3 | 0, $47 | 0, 4);
    $vararg_ptr6 = $vararg_buffer3 + 4 | 0;
    SAFE_HEAP_STORE($vararg_ptr6 | 0, $48 | 0, 4);
    $vararg_ptr7 = $vararg_buffer3 + 8 | 0;
    SAFE_HEAP_STORE($vararg_ptr7 | 0, $$1 | 0, 4);
    $49 = ___syscall146(146, $vararg_buffer3 | 0) | 0;
    $50 = ___syscall_ret($49) | 0;
    $51 = ($35 | 0) == ($50 | 0);
    if ($51) {
     label = 3;
     break L1;
    } else {
     $$04756 = $$1;
     $$04855 = $35;
     $$04954 = $$150;
     $27 = $50;
    }
   }
   $28 = $0 + 16 | 0;
   SAFE_HEAP_STORE($28 | 0, 0 | 0, 4);
   SAFE_HEAP_STORE($4 | 0, 0 | 0, 4);
   SAFE_HEAP_STORE($7 | 0, 0 | 0, 4);
   $29 = SAFE_HEAP_LOAD($0 | 0, 4, 0) | 0 | 0;
   $30 = $29 | 32;
   SAFE_HEAP_STORE($0 | 0, $30 | 0, 4);
   $31 = ($$04756 | 0) == 2;
   if ($31) {
    $$051 = 0;
   } else {
    $32 = $$04954 + 4 | 0;
    $33 = SAFE_HEAP_LOAD($32 | 0, 4, 0) | 0 | 0;
    $34 = $2 - $33 | 0;
    $$051 = $34;
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $19 = $0 + 44 | 0;
  $20 = SAFE_HEAP_LOAD($19 | 0, 4, 0) | 0 | 0;
  $21 = $0 + 48 | 0;
  $22 = SAFE_HEAP_LOAD($21 | 0, 4, 0) | 0 | 0;
  $23 = $20 + $22 | 0;
  $24 = $0 + 16 | 0;
  SAFE_HEAP_STORE($24 | 0, $23 | 0, 4);
  $25 = $20;
  SAFE_HEAP_STORE($4 | 0, $25 | 0, 4);
  SAFE_HEAP_STORE($7 | 0, $25 | 0, 4);
  $$051 = $2;
 }
 STACKTOP = sp;
 return $$051 | 0;
}

function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$137$lcssa66 = 0, $$13745 = 0, $$140 = 0, $$23839 = 0, $$in = 0, $$lcssa = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond53 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1 & 255;
 $4 = $0;
 $5 = $4 & 3;
 $6 = ($5 | 0) != 0;
 $7 = ($2 | 0) != 0;
 $or$cond53 = $7 & $6;
 L1 : do {
  if ($or$cond53) {
   $8 = $1 & 255;
   $$03555 = $0;
   $$03654 = $2;
   while (1) {
    $9 = SAFE_HEAP_LOAD($$03555 >> 0 | 0, 1, 0) | 0 | 0;
    $10 = $9 << 24 >> 24 == $8 << 24 >> 24;
    if ($10) {
     $$035$lcssa65 = $$03555;
     $$036$lcssa64 = $$03654;
     label = 6;
     break L1;
    }
    $11 = $$03555 + 1 | 0;
    $12 = $$03654 + -1 | 0;
    $13 = $11;
    $14 = $13 & 3;
    $15 = ($14 | 0) != 0;
    $16 = ($12 | 0) != 0;
    $or$cond = $16 & $15;
    if ($or$cond) {
     $$03555 = $11;
     $$03654 = $12;
    } else {
     $$035$lcssa = $11;
     $$036$lcssa = $12;
     $$lcssa = $16;
     label = 5;
     break;
    }
   }
  } else {
   $$035$lcssa = $0;
   $$036$lcssa = $2;
   $$lcssa = $7;
   label = 5;
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa;
   $$036$lcssa64 = $$036$lcssa;
   label = 6;
  } else {
   label = 16;
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $17 = SAFE_HEAP_LOAD($$035$lcssa65 >> 0 | 0, 1, 0) | 0 | 0;
   $18 = $1 & 255;
   $19 = $17 << 24 >> 24 == $18 << 24 >> 24;
   if ($19) {
    $38 = ($$036$lcssa64 | 0) == 0;
    if ($38) {
     label = 16;
     break;
    } else {
     $39 = $$035$lcssa65;
     break;
    }
   }
   $20 = Math_imul($3, 16843009) | 0;
   $21 = $$036$lcssa64 >>> 0 > 3;
   L13 : do {
    if ($21) {
     $$046 = $$035$lcssa65;
     $$13745 = $$036$lcssa64;
     while (1) {
      $22 = SAFE_HEAP_LOAD($$046 | 0, 4, 0) | 0 | 0;
      $23 = $22 ^ $20;
      $24 = $23 + -16843009 | 0;
      $25 = $23 & -2139062144;
      $26 = $25 ^ -2139062144;
      $27 = $26 & $24;
      $28 = ($27 | 0) == 0;
      if (!$28) {
       $$137$lcssa66 = $$13745;
       $$in = $$046;
       break L13;
      }
      $29 = $$046 + 4 | 0;
      $30 = $$13745 + -4 | 0;
      $31 = $30 >>> 0 > 3;
      if ($31) {
       $$046 = $29;
       $$13745 = $30;
      } else {
       $$0$lcssa = $29;
       $$137$lcssa = $30;
       label = 11;
       break;
      }
     }
    } else {
     $$0$lcssa = $$035$lcssa65;
     $$137$lcssa = $$036$lcssa64;
     label = 11;
    }
   } while (0);
   if ((label | 0) == 11) {
    $32 = ($$137$lcssa | 0) == 0;
    if ($32) {
     label = 16;
     break;
    } else {
     $$137$lcssa66 = $$137$lcssa;
     $$in = $$0$lcssa;
    }
   }
   $$140 = $$in;
   $$23839 = $$137$lcssa66;
   while (1) {
    $33 = SAFE_HEAP_LOAD($$140 >> 0 | 0, 1, 0) | 0 | 0;
    $34 = $33 << 24 >> 24 == $18 << 24 >> 24;
    if ($34) {
     $39 = $$140;
     break L8;
    }
    $35 = $$140 + 1 | 0;
    $36 = $$23839 + -1 | 0;
    $37 = ($36 | 0) == 0;
    if ($37) {
     label = 16;
     break;
    } else {
     $$140 = $35;
     $$23839 = $36;
    }
   }
  }
 } while (0);
 if ((label | 0) == 16) {
  $39 = 0;
 }
 return $39 | 0;
}

function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$191 = 0, $$195 = 0, $$4 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond102 = 0, $or$cond104 = 0, $spec$select = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = SAFE_HEAP_LOAD($0 | 0, 4, 0) | 0 | 0;
 $4 = $3 + 1794895138 | 0;
 $5 = $0 + 8 | 0;
 $6 = SAFE_HEAP_LOAD($5 | 0, 4, 0) | 0 | 0;
 $7 = _swapc($6, $4) | 0;
 $8 = $0 + 12 | 0;
 $9 = SAFE_HEAP_LOAD($8 | 0, 4, 0) | 0 | 0;
 $10 = _swapc($9, $4) | 0;
 $11 = $0 + 16 | 0;
 $12 = SAFE_HEAP_LOAD($11 | 0, 4, 0) | 0 | 0;
 $13 = _swapc($12, $4) | 0;
 $14 = $1 >>> 2;
 $15 = $7 >>> 0 < $14 >>> 0;
 L1 : do {
  if ($15) {
   $16 = $7 << 2;
   $17 = $1 - $16 | 0;
   $18 = $10 >>> 0 < $17 >>> 0;
   $19 = $13 >>> 0 < $17 >>> 0;
   $or$cond = $18 & $19;
   if ($or$cond) {
    $20 = $13 | $10;
    $21 = $20 & 3;
    $22 = ($21 | 0) == 0;
    if ($22) {
     $23 = $10 >>> 2;
     $24 = $13 >>> 2;
     $$090 = 0;
     $$094 = $7;
     while (1) {
      $25 = $$094 >>> 1;
      $26 = $$090 + $25 | 0;
      $27 = $26 << 1;
      $28 = $27 + $23 | 0;
      $29 = $0 + ($28 << 2) | 0;
      $30 = SAFE_HEAP_LOAD($29 | 0, 4, 0) | 0 | 0;
      $31 = _swapc($30, $4) | 0;
      $32 = $28 + 1 | 0;
      $33 = $0 + ($32 << 2) | 0;
      $34 = SAFE_HEAP_LOAD($33 | 0, 4, 0) | 0 | 0;
      $35 = _swapc($34, $4) | 0;
      $36 = $35 >>> 0 < $1 >>> 0;
      $37 = $1 - $35 | 0;
      $38 = $31 >>> 0 < $37 >>> 0;
      $or$cond102 = $36 & $38;
      if (!$or$cond102) {
       $$4 = 0;
       break L1;
      }
      $39 = $35 + $31 | 0;
      $40 = $0 + $39 | 0;
      $41 = SAFE_HEAP_LOAD($40 >> 0 | 0, 1, 0) | 0 | 0;
      $42 = $41 << 24 >> 24 == 0;
      if (!$42) {
       $$4 = 0;
       break L1;
      }
      $43 = $0 + $35 | 0;
      $44 = _strcmp($2, $43) | 0;
      $45 = ($44 | 0) == 0;
      if ($45) {
       break;
      }
      $62 = ($$094 | 0) == 1;
      $63 = ($44 | 0) < 0;
      if ($62) {
       $$4 = 0;
       break L1;
      }
      $$191 = $63 ? $$090 : $26;
      $64 = $$094 - $25 | 0;
      $$195 = $63 ? $25 : $64;
      $$090 = $$191;
      $$094 = $$195;
     }
     $46 = $27 + $24 | 0;
     $47 = $0 + ($46 << 2) | 0;
     $48 = SAFE_HEAP_LOAD($47 | 0, 4, 0) | 0 | 0;
     $49 = _swapc($48, $4) | 0;
     $50 = $46 + 1 | 0;
     $51 = $0 + ($50 << 2) | 0;
     $52 = SAFE_HEAP_LOAD($51 | 0, 4, 0) | 0 | 0;
     $53 = _swapc($52, $4) | 0;
     $54 = $53 >>> 0 < $1 >>> 0;
     $55 = $1 - $53 | 0;
     $56 = $49 >>> 0 < $55 >>> 0;
     $or$cond104 = $54 & $56;
     if ($or$cond104) {
      $57 = $0 + $53 | 0;
      $58 = $53 + $49 | 0;
      $59 = $0 + $58 | 0;
      $60 = SAFE_HEAP_LOAD($59 >> 0 | 0, 1, 0) | 0 | 0;
      $61 = $60 << 24 >> 24 == 0;
      $spec$select = $61 ? $57 : 0;
      $$4 = $spec$select;
     } else {
      $$4 = 0;
     }
    } else {
     $$4 = 0;
    }
   } else {
    $$4 = 0;
   }
  } else {
   $$4 = 0;
  }
 } while (0);
 return $$4 | 0;
}

function _vfprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var $spec$select = 0, $spec$select41 = 0, $vacopy_currentptr = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224 | 0;
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224 | 0);
 $3 = sp + 208 | 0;
 $4 = sp + 160 | 0;
 $5 = sp + 80 | 0;
 $6 = sp;
 dest = $4;
 stop = dest + 40 | 0;
 do {
  SAFE_HEAP_STORE(dest | 0, 0 | 0 | 0, 4);
  dest = dest + 4 | 0;
 } while ((dest | 0) < (stop | 0));
 $vacopy_currentptr = SAFE_HEAP_LOAD($2 | 0, 4, 0) | 0 | 0;
 SAFE_HEAP_STORE($3 | 0, $vacopy_currentptr | 0, 4);
 $7 = _printf_core(0, $1, $3, $5, $4) | 0;
 $8 = ($7 | 0) < 0;
 if ($8) {
  $$0 = -1;
 } else {
  $9 = $0 + 76 | 0;
  $10 = SAFE_HEAP_LOAD($9 | 0, 4, 0) | 0 | 0;
  $11 = ($10 | 0) > -1;
  if ($11) {
   $12 = ___lockfile($0) | 0;
   $40 = $12;
  } else {
   $40 = 0;
  }
  $13 = SAFE_HEAP_LOAD($0 | 0, 4, 0) | 0 | 0;
  $14 = $13 & 32;
  $15 = $0 + 74 | 0;
  $16 = SAFE_HEAP_LOAD($15 >> 0 | 0, 1, 0) | 0 | 0;
  $17 = $16 << 24 >> 24 < 1;
  if ($17) {
   $18 = $13 & -33;
   SAFE_HEAP_STORE($0 | 0, $18 | 0, 4);
  }
  $19 = $0 + 48 | 0;
  $20 = SAFE_HEAP_LOAD($19 | 0, 4, 0) | 0 | 0;
  $21 = ($20 | 0) == 0;
  if ($21) {
   $23 = $0 + 44 | 0;
   $24 = SAFE_HEAP_LOAD($23 | 0, 4, 0) | 0 | 0;
   SAFE_HEAP_STORE($23 | 0, $6 | 0, 4);
   $25 = $0 + 28 | 0;
   SAFE_HEAP_STORE($25 | 0, $6 | 0, 4);
   $26 = $0 + 20 | 0;
   SAFE_HEAP_STORE($26 | 0, $6 | 0, 4);
   SAFE_HEAP_STORE($19 | 0, 80 | 0, 4);
   $27 = $6 + 80 | 0;
   $28 = $0 + 16 | 0;
   SAFE_HEAP_STORE($28 | 0, $27 | 0, 4);
   $29 = _printf_core($0, $1, $3, $5, $4) | 0;
   $30 = ($24 | 0) == (0 | 0);
   if ($30) {
    $$1 = $29;
   } else {
    $31 = $0 + 36 | 0;
    $32 = SAFE_HEAP_LOAD($31 | 0, 4, 0) | 0 | 0;
    FUNCTION_TABLE_iiii[(SAFE_FT_MASK($32 | 0, 7 | 0) | 0) & 7]($0, 0, 0) | 0;
    $33 = SAFE_HEAP_LOAD($26 | 0, 4, 0) | 0 | 0;
    $34 = ($33 | 0) == (0 | 0);
    $spec$select = $34 ? -1 : $29;
    SAFE_HEAP_STORE($23 | 0, $24 | 0, 4);
    SAFE_HEAP_STORE($19 | 0, 0 | 0, 4);
    SAFE_HEAP_STORE($28 | 0, 0 | 0, 4);
    SAFE_HEAP_STORE($25 | 0, 0 | 0, 4);
    SAFE_HEAP_STORE($26 | 0, 0 | 0, 4);
    $$1 = $spec$select;
   }
  } else {
   $22 = _printf_core($0, $1, $3, $5, $4) | 0;
   $$1 = $22;
  }
  $35 = SAFE_HEAP_LOAD($0 | 0, 4, 0) | 0 | 0;
  $36 = $35 & 32;
  $37 = ($36 | 0) == 0;
  $spec$select41 = $37 ? $$1 : -1;
  $38 = $35 | $14;
  SAFE_HEAP_STORE($0 | 0, $38 | 0, 4);
  $39 = ($40 | 0) == 0;
  if (!$39) {
   ___unlockfile($0);
  }
  $$0 = $spec$select41;
 }
 STACKTOP = sp;
 return $$0 | 0;
}

function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0 | 0) == (0 | 0);
 do {
  if ($3) {
   $$0 = 1;
  } else {
   $4 = $1 >>> 0 < 128;
   if ($4) {
    $5 = $1 & 255;
    SAFE_HEAP_STORE($0 >> 0 | 0, $5 | 0, 1);
    $$0 = 1;
    break;
   }
   $6 = ___pthread_self_430() | 0;
   $7 = $6 + 188 | 0;
   $8 = SAFE_HEAP_LOAD($7 | 0, 4, 0) | 0 | 0;
   $9 = SAFE_HEAP_LOAD($8 | 0, 4, 0) | 0 | 0;
   $10 = ($9 | 0) == (0 | 0);
   if ($10) {
    $11 = $1 & -128;
    $12 = ($11 | 0) == 57216;
    if ($12) {
     $14 = $1 & 255;
     SAFE_HEAP_STORE($0 >> 0 | 0, $14 | 0, 1);
     $$0 = 1;
     break;
    } else {
     $13 = ___errno_location() | 0;
     SAFE_HEAP_STORE($13 | 0, 84 | 0, 4);
     $$0 = -1;
     break;
    }
   }
   $15 = $1 >>> 0 < 2048;
   if ($15) {
    $16 = $1 >>> 6;
    $17 = $16 | 192;
    $18 = $17 & 255;
    $19 = $0 + 1 | 0;
    SAFE_HEAP_STORE($0 >> 0 | 0, $18 | 0, 1);
    $20 = $1 & 63;
    $21 = $20 | 128;
    $22 = $21 & 255;
    SAFE_HEAP_STORE($19 >> 0 | 0, $22 | 0, 1);
    $$0 = 2;
    break;
   }
   $23 = $1 >>> 0 < 55296;
   $24 = $1 & -8192;
   $25 = ($24 | 0) == 57344;
   $or$cond = $23 | $25;
   if ($or$cond) {
    $26 = $1 >>> 12;
    $27 = $26 | 224;
    $28 = $27 & 255;
    $29 = $0 + 1 | 0;
    SAFE_HEAP_STORE($0 >> 0 | 0, $28 | 0, 1);
    $30 = $1 >>> 6;
    $31 = $30 & 63;
    $32 = $31 | 128;
    $33 = $32 & 255;
    $34 = $0 + 2 | 0;
    SAFE_HEAP_STORE($29 >> 0 | 0, $33 | 0, 1);
    $35 = $1 & 63;
    $36 = $35 | 128;
    $37 = $36 & 255;
    SAFE_HEAP_STORE($34 >> 0 | 0, $37 | 0, 1);
    $$0 = 3;
    break;
   }
   $38 = $1 + -65536 | 0;
   $39 = $38 >>> 0 < 1048576;
   if ($39) {
    $40 = $1 >>> 18;
    $41 = $40 | 240;
    $42 = $41 & 255;
    $43 = $0 + 1 | 0;
    SAFE_HEAP_STORE($0 >> 0 | 0, $42 | 0, 1);
    $44 = $1 >>> 12;
    $45 = $44 & 63;
    $46 = $45 | 128;
    $47 = $46 & 255;
    $48 = $0 + 2 | 0;
    SAFE_HEAP_STORE($43 >> 0 | 0, $47 | 0, 1);
    $49 = $1 >>> 6;
    $50 = $49 & 63;
    $51 = $50 | 128;
    $52 = $51 & 255;
    $53 = $0 + 3 | 0;
    SAFE_HEAP_STORE($48 >> 0 | 0, $52 | 0, 1);
    $54 = $1 & 63;
    $55 = $54 | 128;
    $56 = $55 & 255;
    SAFE_HEAP_STORE($53 >> 0 | 0, $56 | 0, 1);
    $$0 = 4;
    break;
   } else {
    $57 = ___errno_location() | 0;
    SAFE_HEAP_STORE($57 | 0, 84 | 0, 4);
    $$0 = -1;
    break;
   }
  }
 } while (0);
 return $$0 | 0;
}

function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0;
 var aligned_dest_end = 0;
 var block_aligned_dest_end = 0;
 var dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0;
 }
 ret = dest | 0;
 dest_end = dest + num | 0;
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if ((num | 0) == 0) return ret | 0;
   SAFE_HEAP_STORE(dest | 0, SAFE_HEAP_LOAD(src | 0, 1, 0) | 0 | 0, 1);
   dest = dest + 1 | 0;
   src = src + 1 | 0;
   num = num - 1 | 0;
  }
  aligned_dest_end = dest_end & -4 | 0;
  block_aligned_dest_end = aligned_dest_end - 64 | 0;
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   SAFE_HEAP_STORE(dest | 0, SAFE_HEAP_LOAD(src | 0, 4, 0) | 0 | 0, 4);
   SAFE_HEAP_STORE(dest + 4 | 0, SAFE_HEAP_LOAD(src + 4 | 0, 4, 0) | 0 | 0, 4);
   SAFE_HEAP_STORE(dest + 8 | 0, SAFE_HEAP_LOAD(src + 8 | 0, 4, 0) | 0 | 0, 4);
   SAFE_HEAP_STORE(dest + 12 | 0, SAFE_HEAP_LOAD(src + 12 | 0, 4, 0) | 0 | 0, 4);
   SAFE_HEAP_STORE(dest + 16 | 0, SAFE_HEAP_LOAD(src + 16 | 0, 4, 0) | 0 | 0, 4);
   SAFE_HEAP_STORE(dest + 20 | 0, SAFE_HEAP_LOAD(src + 20 | 0, 4, 0) | 0 | 0, 4);
   SAFE_HEAP_STORE(dest + 24 | 0, SAFE_HEAP_LOAD(src + 24 | 0, 4, 0) | 0 | 0, 4);
   SAFE_HEAP_STORE(dest + 28 | 0, SAFE_HEAP_LOAD(src + 28 | 0, 4, 0) | 0 | 0, 4);
   SAFE_HEAP_STORE(dest + 32 | 0, SAFE_HEAP_LOAD(src + 32 | 0, 4, 0) | 0 | 0, 4);
   SAFE_HEAP_STORE(dest + 36 | 0, SAFE_HEAP_LOAD(src + 36 | 0, 4, 0) | 0 | 0, 4);
   SAFE_HEAP_STORE(dest + 40 | 0, SAFE_HEAP_LOAD(src + 40 | 0, 4, 0) | 0 | 0, 4);
   SAFE_HEAP_STORE(dest + 44 | 0, SAFE_HEAP_LOAD(src + 44 | 0, 4, 0) | 0 | 0, 4);
   SAFE_HEAP_STORE(dest + 48 | 0, SAFE_HEAP_LOAD(src + 48 | 0, 4, 0) | 0 | 0, 4);
   SAFE_HEAP_STORE(dest + 52 | 0, SAFE_HEAP_LOAD(src + 52 | 0, 4, 0) | 0 | 0, 4);
   SAFE_HEAP_STORE(dest + 56 | 0, SAFE_HEAP_LOAD(src + 56 | 0, 4, 0) | 0 | 0, 4);
   SAFE_HEAP_STORE(dest + 60 | 0, SAFE_HEAP_LOAD(src + 60 | 0, 4, 0) | 0 | 0, 4);
   dest = dest + 64 | 0;
   src = src + 64 | 0;
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   SAFE_HEAP_STORE(dest | 0, SAFE_HEAP_LOAD(src | 0, 4, 0) | 0 | 0, 4);
   dest = dest + 4 | 0;
   src = src + 4 | 0;
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0;
  while ((dest | 0) < (aligned_dest_end | 0)) {
   SAFE_HEAP_STORE(dest | 0, SAFE_HEAP_LOAD(src | 0, 1, 0) | 0 | 0, 1);
   SAFE_HEAP_STORE(dest + 1 | 0, SAFE_HEAP_LOAD(src + 1 | 0, 1, 0) | 0 | 0, 1);
   SAFE_HEAP_STORE(dest + 2 | 0, SAFE_HEAP_LOAD(src + 2 | 0, 1, 0) | 0 | 0, 1);
   SAFE_HEAP_STORE(dest + 3 | 0, SAFE_HEAP_LOAD(src + 3 | 0, 1, 0) | 0 | 0, 1);
   dest = dest + 4 | 0;
   src = src + 4 | 0;
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  SAFE_HEAP_STORE(dest | 0, SAFE_HEAP_LOAD(src | 0, 1, 0) | 0 | 0, 1);
  dest = dest + 1 | 0;
  src = src + 1 | 0;
 }
 return ret | 0;
}

function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$03846 = 0, $$042 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $$pre = 0, $$pre48 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $2 + 16 | 0;
 $4 = SAFE_HEAP_LOAD($3 | 0, 4, 0) | 0 | 0;
 $5 = ($4 | 0) == (0 | 0);
 if ($5) {
  $7 = ___towrite($2) | 0;
  $8 = ($7 | 0) == 0;
  if ($8) {
   $$pre = SAFE_HEAP_LOAD($3 | 0, 4, 0) | 0 | 0;
   $12 = $$pre;
   label = 5;
  } else {
   $$1 = 0;
  }
 } else {
  $6 = $4;
  $12 = $6;
  label = 5;
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0;
   $10 = SAFE_HEAP_LOAD($9 | 0, 4, 0) | 0 | 0;
   $11 = $12 - $10 | 0;
   $13 = $11 >>> 0 < $1 >>> 0;
   $14 = $10;
   if ($13) {
    $15 = $2 + 36 | 0;
    $16 = SAFE_HEAP_LOAD($15 | 0, 4, 0) | 0 | 0;
    $17 = FUNCTION_TABLE_iiii[(SAFE_FT_MASK($16 | 0, 7 | 0) | 0) & 7]($2, $0, $1) | 0;
    $$1 = $17;
    break;
   }
   $18 = $2 + 75 | 0;
   $19 = SAFE_HEAP_LOAD($18 >> 0 | 0, 1, 0) | 0 | 0;
   $20 = $19 << 24 >> 24 < 0;
   $21 = ($1 | 0) == 0;
   $or$cond = $20 | $21;
   L10 : do {
    if ($or$cond) {
     $$139 = 0;
     $$141 = $0;
     $$143 = $1;
     $32 = $14;
    } else {
     $$03846 = $1;
     while (1) {
      $23 = $$03846 + -1 | 0;
      $24 = $0 + $23 | 0;
      $25 = SAFE_HEAP_LOAD($24 >> 0 | 0, 1, 0) | 0 | 0;
      $26 = $25 << 24 >> 24 == 10;
      if ($26) {
       break;
      }
      $22 = ($23 | 0) == 0;
      if ($22) {
       $$139 = 0;
       $$141 = $0;
       $$143 = $1;
       $32 = $14;
       break L10;
      } else {
       $$03846 = $23;
      }
     }
     $27 = $2 + 36 | 0;
     $28 = SAFE_HEAP_LOAD($27 | 0, 4, 0) | 0 | 0;
     $29 = FUNCTION_TABLE_iiii[(SAFE_FT_MASK($28 | 0, 7 | 0) | 0) & 7]($2, $0, $$03846) | 0;
     $30 = $29 >>> 0 < $$03846 >>> 0;
     if ($30) {
      $$1 = $29;
      break L5;
     }
     $31 = $0 + $$03846 | 0;
     $$042 = $1 - $$03846 | 0;
     $$pre48 = SAFE_HEAP_LOAD($9 | 0, 4, 0) | 0 | 0;
     $$139 = $$03846;
     $$141 = $31;
     $$143 = $$042;
     $32 = $$pre48;
    }
   } while (0);
   _memcpy($32 | 0, $$141 | 0, $$143 | 0) | 0;
   $33 = SAFE_HEAP_LOAD($9 | 0, 4, 0) | 0 | 0;
   $34 = $33 + $$143 | 0;
   SAFE_HEAP_STORE($9 | 0, $34 | 0, 4);
   $35 = $$139 + $$143 | 0;
   $$1 = $35;
  }
 } while (0);
 return $$1 | 0;
}

function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $$014 = 0, $$015 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $spec$select = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128 | 0;
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128 | 0);
 $4 = sp + 124 | 0;
 $5 = sp;
 dest = $5;
 src = 2528;
 stop = dest + 124 | 0;
 do {
  SAFE_HEAP_STORE(dest | 0, SAFE_HEAP_LOAD(src | 0, 4, 0) | 0 | 0 | 0, 4);
  dest = dest + 4 | 0;
  src = src + 4 | 0;
 } while ((dest | 0) < (stop | 0));
 $6 = $1 + -1 | 0;
 $7 = $6 >>> 0 > 2147483646;
 if ($7) {
  $8 = ($1 | 0) == 0;
  if ($8) {
   $$014 = $4;
   $$015 = 1;
   label = 4;
  } else {
   $9 = ___errno_location() | 0;
   SAFE_HEAP_STORE($9 | 0, 75 | 0, 4);
   $$0 = -1;
  }
 } else {
  $$014 = $0;
  $$015 = $1;
  label = 4;
 }
 if ((label | 0) == 4) {
  $10 = $$014;
  $11 = -2 - $10 | 0;
  $12 = $$015 >>> 0 > $11 >>> 0;
  $spec$select = $12 ? $11 : $$015;
  $13 = $5 + 48 | 0;
  SAFE_HEAP_STORE($13 | 0, $spec$select | 0, 4);
  $14 = $5 + 20 | 0;
  SAFE_HEAP_STORE($14 | 0, $$014 | 0, 4);
  $15 = $5 + 44 | 0;
  SAFE_HEAP_STORE($15 | 0, $$014 | 0, 4);
  $16 = $$014 + $spec$select | 0;
  $17 = $5 + 16 | 0;
  SAFE_HEAP_STORE($17 | 0, $16 | 0, 4);
  $18 = $5 + 28 | 0;
  SAFE_HEAP_STORE($18 | 0, $16 | 0, 4);
  $19 = _vfprintf($5, $2, $3) | 0;
  $20 = ($spec$select | 0) == 0;
  if ($20) {
   $$0 = $19;
  } else {
   $21 = SAFE_HEAP_LOAD($14 | 0, 4, 0) | 0 | 0;
   $22 = SAFE_HEAP_LOAD($17 | 0, 4, 0) | 0 | 0;
   $23 = ($21 | 0) == ($22 | 0);
   $24 = $23 << 31 >> 31;
   $25 = $21 + $24 | 0;
   SAFE_HEAP_STORE($25 >> 0 | 0, 0 | 0, 1);
   $$0 = $19;
  }
 }
 STACKTOP = sp;
 return $$0 | 0;
}

function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1 >>> 0 > 0;
 $4 = $0 >>> 0 > 4294967295;
 $5 = ($1 | 0) == 0;
 $6 = $5 & $4;
 $7 = $3 | $6;
 if ($7) {
  $$0914 = $2;
  $8 = $0;
  $9 = $1;
  while (1) {
   $10 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0;
   $11 = tempRet0;
   $12 = ___muldi3($10 | 0, $11 | 0, 10, 0) | 0;
   $13 = tempRet0;
   $14 = _i64Subtract($8 | 0, $9 | 0, $12 | 0, $13 | 0) | 0;
   $15 = tempRet0;
   $16 = $14 & 255;
   $17 = $16 | 48;
   $18 = $$0914 + -1 | 0;
   SAFE_HEAP_STORE($18 >> 0 | 0, $17 | 0, 1);
   $19 = $9 >>> 0 > 9;
   $20 = $8 >>> 0 > 4294967295;
   $21 = ($9 | 0) == 9;
   $22 = $21 & $20;
   $23 = $19 | $22;
   if ($23) {
    $$0914 = $18;
    $8 = $10;
    $9 = $11;
   } else {
    break;
   }
  }
  $$010$lcssa$off0 = $10;
  $$09$lcssa = $18;
 } else {
  $$010$lcssa$off0 = $0;
  $$09$lcssa = $2;
 }
 $24 = ($$010$lcssa$off0 | 0) == 0;
 if ($24) {
  $$1$lcssa = $$09$lcssa;
 } else {
  $$012 = $$010$lcssa$off0;
  $$111 = $$09$lcssa;
  while (1) {
   $25 = ($$012 >>> 0) / 10 & -1;
   $26 = $25 * 10 | 0;
   $27 = $$012 - $26 | 0;
   $28 = $27 | 48;
   $29 = $28 & 255;
   $30 = $$111 + -1 | 0;
   SAFE_HEAP_STORE($30 >> 0 | 0, $29 | 0, 1);
   $31 = $$012 >>> 0 < 10;
   if ($31) {
    $$1$lcssa = $30;
    break;
   } else {
    $$012 = $25;
    $$111 = $30;
   }
  }
 }
 return $$1$lcssa | 0;
}

function _js_to_c($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer2 = 0, $vararg_buffer5 = 0, $vararg_buffer7 = 0, $vararg_ptr1 = 0, $vararg_ptr10 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64 | 0;
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64 | 0);
 $vararg_buffer7 = sp + 24 | 0;
 $vararg_buffer5 = sp + 16 | 0;
 $vararg_buffer2 = sp + 8 | 0;
 $vararg_buffer = sp;
 $9 = sp + 32 | 0;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $10 = $6;
 $11 = $7;
 SAFE_HEAP_STORE($vararg_buffer | 0, $10 | 0, 4);
 $vararg_ptr1 = $vararg_buffer + 4 | 0;
 SAFE_HEAP_STORE($vararg_ptr1 | 0, $11 | 0, 4);
 _printf(3179, $vararg_buffer) | 0;
 $8 = 0;
 while (1) {
  $12 = $8;
  $13 = $7;
  $14 = ($12 | 0) < ($13 | 0);
  if (!$14) {
   break;
  }
  $15 = $6;
  $16 = $8;
  $17 = $15 + $16 | 0;
  $18 = SAFE_HEAP_LOAD($17 >> 0 | 0, 1, 0) | 0 | 0;
  $19 = $18 & 255;
  SAFE_HEAP_STORE($vararg_buffer2 | 0, $19 | 0, 4);
  _printf(3208, $vararg_buffer2) | 0;
  $20 = $8;
  $21 = $20 + 1 | 0;
  $8 = $21;
 }
 _printf(3214, $vararg_buffer5) | 0;
 SAFE_HEAP_STORE($9 | 0, 0 | 0, 4);
 $22 = $4;
 $23 = $5;
 $24 = $23 << 1;
 SAFE_HEAP_STORE($vararg_buffer7 | 0, $22 | 0, 4);
 $vararg_ptr10 = $vararg_buffer7 + 4 | 0;
 SAFE_HEAP_STORE($vararg_ptr10 | 0, $24 | 0, 4);
 _asprintf($9, 3216, $vararg_buffer7) | 0;
 $25 = SAFE_HEAP_LOAD($9 | 0, 4, 0) | 0 | 0;
 STACKTOP = sp;
 return $25 | 0;
}

function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0;
 value = value & 255;
 if ((num | 0) >= 67) {
  while ((ptr & 3) != 0) {
   SAFE_HEAP_STORE(ptr | 0, value | 0, 1);
   ptr = ptr + 1 | 0;
  }
  aligned_end = end & -4 | 0;
  block_aligned_end = aligned_end - 64 | 0;
  value4 = value | value << 8 | value << 16 | value << 24;
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   SAFE_HEAP_STORE(ptr | 0, value4 | 0, 4);
   SAFE_HEAP_STORE(ptr + 4 | 0, value4 | 0, 4);
   SAFE_HEAP_STORE(ptr + 8 | 0, value4 | 0, 4);
   SAFE_HEAP_STORE(ptr + 12 | 0, value4 | 0, 4);
   SAFE_HEAP_STORE(ptr + 16 | 0, value4 | 0, 4);
   SAFE_HEAP_STORE(ptr + 20 | 0, value4 | 0, 4);
   SAFE_HEAP_STORE(ptr + 24 | 0, value4 | 0, 4);
   SAFE_HEAP_STORE(ptr + 28 | 0, value4 | 0, 4);
   SAFE_HEAP_STORE(ptr + 32 | 0, value4 | 0, 4);
   SAFE_HEAP_STORE(ptr + 36 | 0, value4 | 0, 4);
   SAFE_HEAP_STORE(ptr + 40 | 0, value4 | 0, 4);
   SAFE_HEAP_STORE(ptr + 44 | 0, value4 | 0, 4);
   SAFE_HEAP_STORE(ptr + 48 | 0, value4 | 0, 4);
   SAFE_HEAP_STORE(ptr + 52 | 0, value4 | 0, 4);
   SAFE_HEAP_STORE(ptr + 56 | 0, value4 | 0, 4);
   SAFE_HEAP_STORE(ptr + 60 | 0, value4 | 0, 4);
   ptr = ptr + 64 | 0;
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   SAFE_HEAP_STORE(ptr | 0, value4 | 0, 4);
   ptr = ptr + 4 | 0;
  }
 }
 while ((ptr | 0) < (end | 0)) {
  SAFE_HEAP_STORE(ptr | 0, value | 0, 1);
  ptr = ptr + 1 | 0;
 }
 return end - num | 0;
}

function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0.0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $9 = 0.0, $storemerge = 0, $trunc$clear = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 SAFE_HEAP_STORE_D(tempDoublePtr | 0, +$0, 8);
 $2 = SAFE_HEAP_LOAD(tempDoublePtr | 0, 4, 0) | 0 | 0;
 $3 = SAFE_HEAP_LOAD(tempDoublePtr + 4 | 0, 4, 0) | 0 | 0;
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0;
 $5 = tempRet0;
 $6 = $4 & 65535;
 $trunc$clear = $6 & 2047;
 switch ($trunc$clear << 16 >> 16) {
 case 0:
  {
   $7 = $0 != 0.0;
   if ($7) {
    $8 = $0 * 18446744073709551616.0;
    $9 = +_frexp($8, $1);
    $10 = SAFE_HEAP_LOAD($1 | 0, 4, 0) | 0 | 0;
    $11 = $10 + -64 | 0;
    $$016 = $9;
    $storemerge = $11;
   } else {
    $$016 = $0;
    $storemerge = 0;
   }
   SAFE_HEAP_STORE($1 | 0, $storemerge | 0, 4);
   $$0 = $$016;
   break;
  }
 case 2047:
  {
   $$0 = $0;
   break;
  }
 default:
  {
   $12 = $4 & 2047;
   $13 = $12 + -1022 | 0;
   SAFE_HEAP_STORE($1 | 0, $13 | 0, 4);
   $14 = $3 & -2146435073;
   $15 = $14 | 1071644672;
   SAFE_HEAP_STORE(tempDoublePtr | 0, $2 | 0, 4);
   SAFE_HEAP_STORE(tempDoublePtr + 4 | 0, $15 | 0, 4);
   $16 = +(+SAFE_HEAP_LOAD_D(tempDoublePtr | 0, 8));
   $$0 = $16;
  }
 }
 return +$$0;
}

function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $$115$ph = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $$016 = 0;
 while (1) {
  $2 = 496 + $$016 | 0;
  $3 = SAFE_HEAP_LOAD($2 >> 0 | 0, 1, 0) | 0 | 0;
  $4 = $3 & 255;
  $5 = ($4 | 0) == ($0 | 0);
  if ($5) {
   label = 4;
   break;
  }
  $6 = $$016 + 1 | 0;
  $7 = ($6 | 0) == 87;
  if ($7) {
   $$115$ph = 87;
   label = 5;
   break;
  } else {
   $$016 = $6;
  }
 }
 if ((label | 0) == 4) {
  $8 = ($$016 | 0) == 0;
  if ($8) {
   $$012$lcssa = 592;
  } else {
   $$115$ph = $$016;
   label = 5;
  }
 }
 if ((label | 0) == 5) {
  $$01214 = 592;
  $$115 = $$115$ph;
  while (1) {
   $$113 = $$01214;
   while (1) {
    $9 = SAFE_HEAP_LOAD($$113 >> 0 | 0, 1, 0) | 0 | 0;
    $10 = $9 << 24 >> 24 == 0;
    $11 = $$113 + 1 | 0;
    if ($10) {
     break;
    } else {
     $$113 = $11;
    }
   }
   $12 = $$115 + -1 | 0;
   $13 = ($12 | 0) == 0;
   if ($13) {
    $$012$lcssa = $11;
    break;
   } else {
    $$01214 = $11;
    $$115 = $12;
   }
  }
 }
 $14 = $1 + 20 | 0;
 $15 = SAFE_HEAP_LOAD($14 | 0, 4, 0) | 0 | 0;
 $16 = ___lctrans($$012$lcssa, $15) | 0;
 return $16 | 0;
}

function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$pre = 0, $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32 | 0;
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32 | 0);
 $vararg_buffer = sp;
 $3 = sp + 20 | 0;
 $4 = $0 + 60 | 0;
 $5 = SAFE_HEAP_LOAD($4 | 0, 4, 0) | 0 | 0;
 $6 = $3;
 SAFE_HEAP_STORE($vararg_buffer | 0, $5 | 0, 4);
 $vararg_ptr1 = $vararg_buffer + 4 | 0;
 SAFE_HEAP_STORE($vararg_ptr1 | 0, 0 | 0, 4);
 $vararg_ptr2 = $vararg_buffer + 8 | 0;
 SAFE_HEAP_STORE($vararg_ptr2 | 0, $1 | 0, 4);
 $vararg_ptr3 = $vararg_buffer + 12 | 0;
 SAFE_HEAP_STORE($vararg_ptr3 | 0, $6 | 0, 4);
 $vararg_ptr4 = $vararg_buffer + 16 | 0;
 SAFE_HEAP_STORE($vararg_ptr4 | 0, $2 | 0, 4);
 $7 = ___syscall140(140, $vararg_buffer | 0) | 0;
 $8 = ___syscall_ret($7) | 0;
 $9 = ($8 | 0) < 0;
 if ($9) {
  SAFE_HEAP_STORE($3 | 0, -1 | 0, 4);
  $10 = -1;
 } else {
  $$pre = SAFE_HEAP_LOAD($3 | 0, 4, 0) | 0 | 0;
  $10 = $$pre;
 }
 STACKTOP = sp;
 return $10 | 0;
}

function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = $0 + 74 | 0;
 $2 = SAFE_HEAP_LOAD($1 >> 0 | 0, 1, 0) | 0 | 0;
 $3 = $2 << 24 >> 24;
 $4 = $3 + 255 | 0;
 $5 = $4 | $3;
 $6 = $5 & 255;
 SAFE_HEAP_STORE($1 >> 0 | 0, $6 | 0, 1);
 $7 = SAFE_HEAP_LOAD($0 | 0, 4, 0) | 0 | 0;
 $8 = $7 & 8;
 $9 = ($8 | 0) == 0;
 if ($9) {
  $11 = $0 + 8 | 0;
  SAFE_HEAP_STORE($11 | 0, 0 | 0, 4);
  $12 = $0 + 4 | 0;
  SAFE_HEAP_STORE($12 | 0, 0 | 0, 4);
  $13 = $0 + 44 | 0;
  $14 = SAFE_HEAP_LOAD($13 | 0, 4, 0) | 0 | 0;
  $15 = $0 + 28 | 0;
  SAFE_HEAP_STORE($15 | 0, $14 | 0, 4);
  $16 = $0 + 20 | 0;
  SAFE_HEAP_STORE($16 | 0, $14 | 0, 4);
  $17 = $14;
  $18 = $0 + 48 | 0;
  $19 = SAFE_HEAP_LOAD($18 | 0, 4, 0) | 0 | 0;
  $20 = $17 + $19 | 0;
  $21 = $0 + 16 | 0;
  SAFE_HEAP_STORE($21 | 0, $20 | 0, 4);
  $$0 = 0;
 } else {
  $10 = $7 | 32;
  SAFE_HEAP_STORE($0 | 0, $10 | 0, 4);
  $$0 = -1;
 }
 return $$0 | 0;
}

function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32 | 0;
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32 | 0);
 $vararg_buffer = sp;
 $3 = sp + 16 | 0;
 $4 = $0 + 36 | 0;
 SAFE_HEAP_STORE($4 | 0, 5 | 0, 4);
 $5 = SAFE_HEAP_LOAD($0 | 0, 4, 0) | 0 | 0;
 $6 = $5 & 64;
 $7 = ($6 | 0) == 0;
 if ($7) {
  $8 = $0 + 60 | 0;
  $9 = SAFE_HEAP_LOAD($8 | 0, 4, 0) | 0 | 0;
  $10 = $3;
  SAFE_HEAP_STORE($vararg_buffer | 0, $9 | 0, 4);
  $vararg_ptr1 = $vararg_buffer + 4 | 0;
  SAFE_HEAP_STORE($vararg_ptr1 | 0, 21523 | 0, 4);
  $vararg_ptr2 = $vararg_buffer + 8 | 0;
  SAFE_HEAP_STORE($vararg_ptr2 | 0, $10 | 0, 4);
  $11 = ___syscall54(54, $vararg_buffer | 0) | 0;
  $12 = ($11 | 0) == 0;
  if (!$12) {
   $13 = $0 + 75 | 0;
   SAFE_HEAP_STORE($13 >> 0 | 0, -1 | 0, 1);
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0;
 STACKTOP = sp;
 return $14 | 0;
}

function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $2 = SAFE_HEAP_LOAD($0 >> 0 | 0, 1, 0) | 0 | 0;
 $3 = SAFE_HEAP_LOAD($1 >> 0 | 0, 1, 0) | 0 | 0;
 $4 = $2 << 24 >> 24 != $3 << 24 >> 24;
 $5 = $2 << 24 >> 24 == 0;
 $or$cond9 = $5 | $4;
 if ($or$cond9) {
  $$lcssa = $3;
  $$lcssa8 = $2;
 } else {
  $$011 = $1;
  $$0710 = $0;
  while (1) {
   $6 = $$0710 + 1 | 0;
   $7 = $$011 + 1 | 0;
   $8 = SAFE_HEAP_LOAD($6 >> 0 | 0, 1, 0) | 0 | 0;
   $9 = SAFE_HEAP_LOAD($7 >> 0 | 0, 1, 0) | 0 | 0;
   $10 = $8 << 24 >> 24 != $9 << 24 >> 24;
   $11 = $8 << 24 >> 24 == 0;
   $or$cond = $11 | $10;
   if ($or$cond) {
    $$lcssa = $9;
    $$lcssa8 = $8;
    break;
   } else {
    $$011 = $7;
    $$0710 = $6;
   }
  }
 }
 $12 = $$lcssa8 & 255;
 $13 = $$lcssa & 255;
 $14 = $12 - $13 | 0;
 return $14 | 0;
}

function _pad_680($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256 | 0;
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256 | 0);
 $5 = sp;
 $6 = $4 & 73728;
 $7 = ($6 | 0) == 0;
 $8 = ($2 | 0) > ($3 | 0);
 $or$cond = $8 & $7;
 if ($or$cond) {
  $9 = $2 - $3 | 0;
  $10 = $1 << 24 >> 24;
  $11 = $9 >>> 0 < 256;
  $12 = $11 ? $9 : 256;
  _memset($5 | 0, $10 | 0, $12 | 0) | 0;
  $13 = $9 >>> 0 > 255;
  if ($13) {
   $14 = $2 - $3 | 0;
   $$011 = $9;
   while (1) {
    _out($0, $5, 256);
    $15 = $$011 + -256 | 0;
    $16 = $15 >>> 0 > 255;
    if ($16) {
     $$011 = $15;
    } else {
     break;
    }
   }
   $17 = $14 & 255;
   $$0$lcssa = $17;
  } else {
   $$0$lcssa = $9;
  }
  _out($0, $5, $$0$lcssa);
 }
 STACKTOP = sp;
 return;
}

function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $4 = ($0 | 0) == 0;
 $5 = ($1 | 0) == 0;
 $6 = $4 & $5;
 if ($6) {
  $$05$lcssa = $2;
 } else {
  $$056 = $2;
  $15 = $1;
  $8 = $0;
  while (1) {
   $7 = $8 & 15;
   $9 = 480 + $7 | 0;
   $10 = SAFE_HEAP_LOAD($9 >> 0 | 0, 1, 0) | 0 | 0;
   $11 = $10 & 255;
   $12 = $11 | $3;
   $13 = $12 & 255;
   $14 = $$056 + -1 | 0;
   SAFE_HEAP_STORE($14 >> 0 | 0, $13 | 0, 1);
   $16 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0;
   $17 = tempRet0;
   $18 = ($16 | 0) == 0;
   $19 = ($17 | 0) == 0;
   $20 = $18 & $19;
   if ($20) {
    $$05$lcssa = $14;
    break;
   } else {
    $$056 = $14;
    $15 = $17;
    $8 = $16;
   }
  }
 }
 return $$05$lcssa | 0;
}

function _getint($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = SAFE_HEAP_LOAD($0 | 0, 4, 0) | 0 | 0;
 $2 = SAFE_HEAP_LOAD($1 >> 0 | 0, 1, 0) | 0 | 0;
 $3 = $2 << 24 >> 24;
 $4 = _isdigit($3) | 0;
 $5 = ($4 | 0) == 0;
 if ($5) {
  $$0$lcssa = 0;
 } else {
  $$04 = 0;
  while (1) {
   $6 = $$04 * 10 | 0;
   $7 = SAFE_HEAP_LOAD($0 | 0, 4, 0) | 0 | 0;
   $8 = SAFE_HEAP_LOAD($7 >> 0 | 0, 1, 0) | 0 | 0;
   $9 = $8 << 24 >> 24;
   $10 = $6 + -48 | 0;
   $11 = $10 + $9 | 0;
   $12 = $7 + 1 | 0;
   SAFE_HEAP_STORE($0 | 0, $12 | 0, 4);
   $13 = SAFE_HEAP_LOAD($12 >> 0 | 0, 1, 0) | 0 | 0;
   $14 = $13 << 24 >> 24;
   $15 = _isdigit($14) | 0;
   $16 = ($15 | 0) == 0;
   if ($16) {
    $$0$lcssa = $11;
    break;
   } else {
    $$04 = $11;
   }
  }
 }
 return $$0$lcssa | 0;
}

function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0 | 0) == 0;
 $4 = ($1 | 0) == 0;
 $5 = $3 & $4;
 if ($5) {
  $$0$lcssa = $2;
 } else {
  $$06 = $2;
  $11 = $1;
  $7 = $0;
  while (1) {
   $6 = $7 & 255;
   $8 = $6 & 7;
   $9 = $8 | 48;
   $10 = $$06 + -1 | 0;
   SAFE_HEAP_STORE($10 >> 0 | 0, $9 | 0, 1);
   $12 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0;
   $13 = tempRet0;
   $14 = ($12 | 0) == 0;
   $15 = ($13 | 0) == 0;
   $16 = $14 & $15;
   if ($16) {
    $$0$lcssa = $10;
    break;
   } else {
    $$06 = $10;
    $11 = $13;
    $7 = $12;
   }
  }
 }
 return $$0$lcssa | 0;
}

function _vasprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vacopy_currentptr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16 | 0;
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16 | 0);
 $3 = sp;
 $vacopy_currentptr = SAFE_HEAP_LOAD($2 | 0, 4, 0) | 0 | 0;
 SAFE_HEAP_STORE($3 | 0, $vacopy_currentptr | 0, 4);
 $4 = _vsnprintf(0, 0, $1, $3) | 0;
 $5 = ($4 | 0) < 0;
 if ($5) {
  $$0 = -1;
 } else {
  $6 = $4 + 1 | 0;
  $7 = _malloc($6) | 0;
  SAFE_HEAP_STORE($0 | 0, $7 | 0, 4);
  $8 = ($7 | 0) == (0 | 0);
  if ($8) {
   $$0 = -1;
  } else {
   $9 = _vsnprintf($7, $6, $1, $2) | 0;
   $$0 = $9;
  }
 }
 STACKTOP = sp;
 return $$0 | 0;
}

function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0;
 var oldDynamicTopOnChange = 0;
 var newDynamicTop = 0;
 var totalMemory = 0;
 oldDynamicTop = SAFE_HEAP_LOAD(DYNAMICTOP_PTR | 0, 4, 0) | 0 | 0;
 newDynamicTop = oldDynamicTop + increment | 0;
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0;
  ___setErrNo(12);
  return -1;
 }
 SAFE_HEAP_STORE(DYNAMICTOP_PTR | 0, newDynamicTop | 0, 4);
 totalMemory = getTotalMemory() | 0;
 if ((newDynamicTop | 0) > (totalMemory | 0)) {
  if ((enlargeMemory() | 0) == 0) {
   SAFE_HEAP_STORE(DYNAMICTOP_PTR | 0, oldDynamicTop | 0, 4);
   ___setErrNo(12);
   return -1;
  }
 }
 return oldDynamicTop | 0;
}

function _callback() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16 | 0;
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16 | 0);
 $vararg_buffer = sp;
 $0 = sp + 8 | 0;
 {}
 SAFE_HEAP_STORE($0 >> 0 | 0, SAFE_HEAP_LOAD(3244 >> 0 | 0, 1, 0) | 0 | 0 | 0, 1);
 SAFE_HEAP_STORE($0 + 1 >> 0 | 0, SAFE_HEAP_LOAD(3244 + 1 >> 0 | 0, 1, 0) | 0 | 0 | 0, 1);
 SAFE_HEAP_STORE($0 + 2 >> 0 | 0, SAFE_HEAP_LOAD(3244 + 2 >> 0 | 0, 1, 0) | 0 | 0 | 0, 1);
 $2 = _c_to_js(7, 3247 | 0, $0 | 0, 3) | 0;
 $1 = $2;
 $3 = $1;
 SAFE_HEAP_STORE($vararg_buffer | 0, $3 | 0, 4);
 _printf(3261, $vararg_buffer) | 0;
 $4 = $1;
 _free($4);
 STACKTOP = sp;
 return;
}

function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$cast = 0, $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $spec$select = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $0 + 16 | 0;
 $4 = SAFE_HEAP_LOAD($3 | 0, 4, 0) | 0 | 0;
 $5 = $0 + 20 | 0;
 $6 = SAFE_HEAP_LOAD($5 | 0, 4, 0) | 0 | 0;
 $7 = $4 - $6 | 0;
 $8 = $7 >>> 0 > $2 >>> 0;
 $spec$select = $8 ? $2 : $7;
 $$cast = $6;
 _memcpy($$cast | 0, $1 | 0, $spec$select | 0) | 0;
 $9 = SAFE_HEAP_LOAD($5 | 0, 4, 0) | 0 | 0;
 $10 = $9 + $spec$select | 0;
 SAFE_HEAP_STORE($5 | 0, $10 | 0, 4);
 return $2 | 0;
}

function ___muldi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0, $2 = 0;
 $x_sroa_0_0_extract_trunc = $a$0;
 $y_sroa_0_0_extract_trunc = $b$0;
 $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0;
 $1$1 = tempRet0;
 $2 = Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0;
 return (tempRet0 = ((Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $2 | 0) + $1$1 | $1$1 & 0, 0 | $1$0 & -1) | 0;
}

function SAFE_HEAP_LOAD(dest, bytes, unsigned) {
 dest = dest | 0;
 bytes = bytes | 0;
 unsigned = unsigned | 0;
 if ((dest | 0) <= 0) segfault();
 if ((dest + bytes | 0) > (HEAP32[DYNAMICTOP_PTR >> 2] | 0)) segfault();
 if ((bytes | 0) == 4) {
  if (dest & 3) alignfault();
  return HEAP32[dest >> 2] | 0;
 } else if ((bytes | 0) == 1) {
  if (unsigned) {
   return HEAPU8[dest >> 0] | 0;
  } else {
   return HEAP8[dest >> 0] | 0;
  }
 }
 if (dest & 1) alignfault();
 if (unsigned) return HEAPU16[dest >> 1] | 0;
 return HEAP16[dest >> 1] | 0;
}

function ___stdio_close($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16 | 0;
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16 | 0);
 $vararg_buffer = sp;
 $1 = $0 + 60 | 0;
 $2 = SAFE_HEAP_LOAD($1 | 0, 4, 0) | 0 | 0;
 $3 = _dummy_569($2) | 0;
 SAFE_HEAP_STORE($vararg_buffer | 0, $3 | 0, 4);
 $4 = ___syscall6(6, $vararg_buffer | 0) | 0;
 $5 = ___syscall_ret($4) | 0;
 STACKTOP = sp;
 return $5 | 0;
}

function runPostSets() {}
function ___muldsi3($a, $b) {
 $a = $a | 0;
 $b = $b | 0;
 var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
 $1 = $a & 65535;
 $2 = $b & 65535;
 $3 = Math_imul($2, $1) | 0;
 $6 = $a >>> 16;
 $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0;
 $11 = $b >>> 16;
 $12 = Math_imul($11, $1) | 0;
 return (tempRet0 = (($8 >>> 16) + (Math_imul($11, $6) | 0) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, 0 | ($8 + $12 << 16 | $3 & 65535)) | 0;
}

function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1 | 0) == (0 | 0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = SAFE_HEAP_LOAD($1 | 0, 4, 0) | 0 | 0;
  $4 = $1 + 4 | 0;
  $5 = SAFE_HEAP_LOAD($4 | 0, 4, 0) | 0 | 0;
  $6 = ___mo_lookup($3, $5, $0) | 0;
  $$0 = $6;
 }
 $7 = ($$0 | 0) == (0 | 0);
 $8 = $7 ? $0 : $$0;
 return $8 | 0;
}

function SAFE_HEAP_STORE(dest, value, bytes) {
 dest = dest | 0;
 value = value | 0;
 bytes = bytes | 0;
 if ((dest | 0) <= 0) segfault();
 if ((dest + bytes | 0) > (HEAP32[DYNAMICTOP_PTR >> 2] | 0)) segfault();
 if ((bytes | 0) == 4) {
  if (dest & 3) alignfault();
  HEAP32[dest >> 2] = value;
 } else if ((bytes | 0) == 1) {
  HEAP8[dest >> 0] = value;
 } else {
  if (dest & 1) alignfault();
  HEAP16[dest >> 1] = value;
 }
}

function _printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16 | 0;
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16 | 0);
 $1 = sp;
 SAFE_HEAP_STORE($1 | 0, $varargs | 0, 4);
 $2 = SAFE_HEAP_LOAD(600 * 4 | 0, 4, 0) | 0 | 0;
 $3 = _vfprintf($2, $0, $1) | 0;
 STACKTOP = sp;
 return $3 | 0;
}

function SAFE_HEAP_STORE_D(dest, value, bytes) {
 dest = dest | 0;
 value = +value;
 bytes = bytes | 0;
 if ((dest | 0) <= 0) segfault();
 if ((dest + bytes | 0) > (HEAP32[DYNAMICTOP_PTR >> 2] | 0)) segfault();
 if ((bytes | 0) == 8) {
  if (dest & 7) alignfault();
  HEAPF64[dest >> 3] = value;
 } else {
  if (dest & 3) alignfault();
  HEAPF32[dest >> 2] = value;
 }
}

function _asprintf($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16 | 0;
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16 | 0);
 $2 = sp;
 SAFE_HEAP_STORE($2 | 0, $varargs | 0, 4);
 $3 = _vasprintf($0, $1, $2) | 0;
 STACKTOP = sp;
 return $3 | 0;
}

function SAFE_HEAP_LOAD_D(dest, bytes) {
 dest = dest | 0;
 bytes = bytes | 0;
 if ((dest | 0) <= 0) segfault();
 if ((dest + bytes | 0) > (HEAP32[DYNAMICTOP_PTR >> 2] | 0)) segfault();
 if ((bytes | 0) == 8) {
  if (dest & 7) alignfault();
  return +HEAPF64[dest >> 3];
 }
 if (dest & 3) alignfault();
 return +HEAPF32[dest >> 2];
}

function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 var ander = 0;
 if ((bits | 0) < 32) {
  ander = (1 << bits) - 1 | 0;
  tempRet0 = high << bits | (low & ander << 32 - bits) >>> 32 - bits;
  return low << bits;
 }
 tempRet0 = low << bits - 32;
 return 0;
}

function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = $0 >>> 0 > 4294963200;
 if ($1) {
  $2 = 0 - $0 | 0;
  $3 = ___errno_location() | 0;
  SAFE_HEAP_STORE($3 | 0, $2 | 0, 4);
  $$0 = -1;
 } else {
  $$0 = $0;
 }
 return $$0 | 0;
}

function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 var ander = 0;
 if ((bits | 0) < 32) {
  ander = (1 << bits) - 1 | 0;
  tempRet0 = high >>> bits;
  return low >>> bits | (high & ander) << 32 - bits;
 }
 tempRet0 = 0;
 return high >>> bits - 32 | 0;
}

function ___DOUBLE_BITS_681($0) {
 $0 = +$0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 SAFE_HEAP_STORE_D(tempDoublePtr | 0, +$0, 8);
 $1 = SAFE_HEAP_LOAD(tempDoublePtr | 0, 4, 0) | 0 | 0;
 $2 = SAFE_HEAP_LOAD(tempDoublePtr + 4 | 0, 4, 0) | 0 | 0;
 tempRet0 = $2;
 return $1 | 0;
}

function _out($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = SAFE_HEAP_LOAD($0 | 0, 4, 0) | 0 | 0;
 $4 = $3 & 32;
 $5 = ($4 | 0) == 0;
 if ($5) {
  ___fwritex($1, $2, $0) | 0;
 }
 return;
}

function _strerror($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ___pthread_self_105() | 0;
 $2 = $1 + 188 | 0;
 $3 = SAFE_HEAP_LOAD($2 | 0, 4, 0) | 0 | 0;
 $4 = ___strerror_l($0, $3) | 0;
 return $4 | 0;
}

function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0 | 0) == (0 | 0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = _wcrtomb($0, $1, 0) | 0;
  $$0 = $3;
 }
 return $$0 | 0;
}

function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $3 = 0, $spec$select = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1 | 0) == 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0;
 $spec$select = $2 ? $0 : $3;
 return $spec$select | 0;
}
function stackAlloc(size) {
 size = size | 0;
 var ret = 0;
 ret = STACKTOP;
 STACKTOP = STACKTOP + size | 0;
 STACKTOP = STACKTOP + 15 & -16;
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(size | 0);
 return ret | 0;
}

function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0, h = 0;
 l = a - c >>> 0;
 h = b - d >>> 0;
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0;
 return (tempRet0 = h, l | 0) | 0;
}

function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $1$0 = 0;
 $1$0 = ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0;
 return $1$0 | 0;
}

function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[(SAFE_FT_MASK(index | 0, 7 | 0) | 0) & 7](a1 | 0, a2 | 0, a3 | 0) | 0;
}

function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0, h = 0;
 l = a + c >>> 0;
 h = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0;
 return (tempRet0 = h, l | 0) | 0;
}

function _isdigit($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = $0 + -48 | 0;
 $2 = $1 >>> 0 < 10;
 $3 = $2 & 1;
 return $3 | 0;
}

function SAFE_FT_MASK(value, mask) {
 value = value | 0;
 mask = mask | 0;
 var ret = 0;
 ret = value & mask;
 if ((ret | 0) != (value | 0)) ftfault();
 return ret | 0;
}

function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ___lctrans_impl($0, $1) | 0;
 return $2 | 0;
}

function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase;
 STACK_MAX = stackMax;
}

function setThrew(threw, value) {
 threw = threw | 0;
 value = value | 0;
 if ((__THREW__ | 0) == 0) {
  __THREW__ = threw;
  threwValue = value;
 }
}

function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[(SAFE_FT_MASK(index | 0, 1 | 0) | 0) & 1](a1 | 0) | 0;
}

function _frexpl($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $2 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = +_frexp($0, $1);
 return +$2;
}

function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0;
}

function ___pthread_self_430() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = _pthread_self() | 0;
 return $0 | 0;
}

function ___pthread_self_105() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = _pthread_self() | 0;
 return $0 | 0;
}

function setDynamicTop(value) {
 value = value | 0;
 SAFE_HEAP_STORE(DYNAMICTOP_PTR | 0, value | 0, 4);
}

function _llvm_cttz_i32(x) {
 x = x | 0;
 return (x ? 31 - (Math_clz32(x ^ x - 1) | 0) | 0 : 32) | 0;
}

function b1(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(1);
 return 0;
}

function _dummy_569($0) {
 $0 = $0 | 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return $0 | 0;
}

function ___em_js__module_ready() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 3281 | 0;
}

function ___unlockfile($0) {
 $0 = $0 | 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}

function ___lockfile($0) {
 $0 = $0 | 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}

function ___errno_location() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 4992 | 0;
}

function ___em_js__c_to_js() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 2896 | 0;
}

function _main() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 _module_ready();
 return 0;
}

function _pthread_self() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 2652 | 0;
}

function setTempRet0(value) {
 value = value | 0;
 tempRet0 = value;
}

function stackRestore(top) {
 top = top | 0;
 STACKTOP = top;
}

function b0(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0);
 return 0;
}

function getTempRet0() {
 return tempRet0 | 0;
}

function stackSave() {
 return STACKTOP | 0;
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b0,___stdio_close];
var FUNCTION_TABLE_iiii = [b1,b1,___stdout_write,___stdio_seek,_sn_write,___stdio_write,b1,b1];

  return { ___em_js__c_to_js: ___em_js__c_to_js, ___em_js__module_ready: ___em_js__module_ready, ___muldi3: ___muldi3, ___udivdi3: ___udivdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _callback: _callback, _emscripten_replace_memory: _emscripten_replace_memory, _free: _free, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _js_to_c: _js_to_c, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setDynamicTop: setDynamicTop, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var real____em_js__c_to_js = asm["___em_js__c_to_js"]; asm["___em_js__c_to_js"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____em_js__c_to_js.apply(null, arguments);
};

var real____em_js__module_ready = asm["___em_js__module_ready"]; asm["___em_js__module_ready"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____em_js__module_ready.apply(null, arguments);
};

var real____muldi3 = asm["___muldi3"]; asm["___muldi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____muldi3.apply(null, arguments);
};

var real____udivdi3 = asm["___udivdi3"]; asm["___udivdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____udivdi3.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Lshr.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Shl.apply(null, arguments);
};

var real__callback = asm["_callback"]; asm["_callback"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__callback.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__free.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Add.apply(null, arguments);
};

var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Subtract.apply(null, arguments);
};

var real__js_to_c = asm["_js_to_c"]; asm["_js_to_c"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__js_to_c.apply(null, arguments);
};

var real__llvm_bswap_i32 = asm["_llvm_bswap_i32"]; asm["_llvm_bswap_i32"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__llvm_bswap_i32.apply(null, arguments);
};

var real__main = asm["_main"]; asm["_main"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__main.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__malloc.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__sbrk.apply(null, arguments);
};

var real_establishStackSpace = asm["establishStackSpace"]; asm["establishStackSpace"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_establishStackSpace.apply(null, arguments);
};

var real_getTempRet0 = asm["getTempRet0"]; asm["getTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_getTempRet0.apply(null, arguments);
};

var real_setDynamicTop = asm["setDynamicTop"]; asm["setDynamicTop"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setDynamicTop.apply(null, arguments);
};

var real_setTempRet0 = asm["setTempRet0"]; asm["setTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setTempRet0.apply(null, arguments);
};

var real_setThrew = asm["setThrew"]; asm["setThrew"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setThrew.apply(null, arguments);
};

var real_stackAlloc = asm["stackAlloc"]; asm["stackAlloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackAlloc.apply(null, arguments);
};

var real_stackRestore = asm["stackRestore"]; asm["stackRestore"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackRestore.apply(null, arguments);
};

var real_stackSave = asm["stackSave"]; asm["stackSave"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackSave.apply(null, arguments);
};
var ___em_js__c_to_js = Module["___em_js__c_to_js"] = asm["___em_js__c_to_js"];
var ___em_js__module_ready = Module["___em_js__module_ready"] = asm["___em_js__module_ready"];
var ___muldi3 = Module["___muldi3"] = asm["___muldi3"];
var ___udivdi3 = Module["___udivdi3"] = asm["___udivdi3"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var _callback = Module["_callback"] = asm["_callback"];
var _emscripten_replace_memory = Module["_emscripten_replace_memory"] = asm["_emscripten_replace_memory"];
var _free = Module["_free"] = asm["_free"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var _js_to_c = Module["_js_to_c"] = asm["_js_to_c"];
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
var _main = Module["_main"] = asm["_main"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _memset = Module["_memset"] = asm["_memset"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var getTempRet0 = Module["getTempRet0"] = asm["getTempRet0"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var setDynamicTop = Module["setDynamicTop"] = asm["setDynamicTop"];
var setTempRet0 = Module["setTempRet0"] = asm["setTempRet0"];
var setThrew = Module["setThrew"] = asm["setThrew"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var stackSave = Module["stackSave"] = asm["stackSave"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
;



// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;

if (!Module["intArrayFromString"]) Module["intArrayFromString"] = function() { abort("'intArrayFromString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["intArrayToString"]) Module["intArrayToString"] = function() { abort("'intArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
Module["ccall"] = ccall;
Module["cwrap"] = cwrap;
if (!Module["setValue"]) Module["setValue"] = function() { abort("'setValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getValue"]) Module["getValue"] = function() { abort("'getValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocate"]) Module["allocate"] = function() { abort("'allocate' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getMemory"]) Module["getMemory"] = function() { abort("'getMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
Module["Pointer_stringify"] = Pointer_stringify;
if (!Module["AsciiToString"]) Module["AsciiToString"] = function() { abort("'AsciiToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToAscii"]) Module["stringToAscii"] = function() { abort("'stringToAscii' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ArrayToString"]) Module["UTF8ArrayToString"] = function() { abort("'UTF8ArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ToString"]) Module["UTF8ToString"] = function() { abort("'UTF8ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8Array"]) Module["stringToUTF8Array"] = function() { abort("'stringToUTF8Array' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8"]) Module["stringToUTF8"] = function() { abort("'stringToUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF8"]) Module["lengthBytesUTF8"] = function() { abort("'lengthBytesUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF16ToString"]) Module["UTF16ToString"] = function() { abort("'UTF16ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF16"]) Module["stringToUTF16"] = function() { abort("'stringToUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF16"]) Module["lengthBytesUTF16"] = function() { abort("'lengthBytesUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF32ToString"]) Module["UTF32ToString"] = function() { abort("'UTF32ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF32"]) Module["stringToUTF32"] = function() { abort("'stringToUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF32"]) Module["lengthBytesUTF32"] = function() { abort("'lengthBytesUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocateUTF8"]) Module["allocateUTF8"] = function() { abort("'allocateUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackTrace"]) Module["stackTrace"] = function() { abort("'stackTrace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreRun"]) Module["addOnPreRun"] = function() { abort("'addOnPreRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnInit"]) Module["addOnInit"] = function() { abort("'addOnInit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreMain"]) Module["addOnPreMain"] = function() { abort("'addOnPreMain' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnExit"]) Module["addOnExit"] = function() { abort("'addOnExit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPostRun"]) Module["addOnPostRun"] = function() { abort("'addOnPostRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeStringToMemory"]) Module["writeStringToMemory"] = function() { abort("'writeStringToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeArrayToMemory"]) Module["writeArrayToMemory"] = function() { abort("'writeArrayToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeAsciiToMemory"]) Module["writeAsciiToMemory"] = function() { abort("'writeAsciiToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addRunDependency"]) Module["addRunDependency"] = function() { abort("'addRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["removeRunDependency"]) Module["removeRunDependency"] = function() { abort("'removeRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["ENV"]) Module["ENV"] = function() { abort("'ENV' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["FS"]) Module["FS"] = function() { abort("'FS' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["FS_createFolder"]) Module["FS_createFolder"] = function() { abort("'FS_createFolder' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPath"]) Module["FS_createPath"] = function() { abort("'FS_createPath' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDataFile"]) Module["FS_createDataFile"] = function() { abort("'FS_createDataFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPreloadedFile"]) Module["FS_createPreloadedFile"] = function() { abort("'FS_createPreloadedFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLazyFile"]) Module["FS_createLazyFile"] = function() { abort("'FS_createLazyFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLink"]) Module["FS_createLink"] = function() { abort("'FS_createLink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDevice"]) Module["FS_createDevice"] = function() { abort("'FS_createDevice' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_unlink"]) Module["FS_unlink"] = function() { abort("'FS_unlink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["GL"]) Module["GL"] = function() { abort("'GL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["staticAlloc"]) Module["staticAlloc"] = function() { abort("'staticAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynamicAlloc"]) Module["dynamicAlloc"] = function() { abort("'dynamicAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["warnOnce"]) Module["warnOnce"] = function() { abort("'warnOnce' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadDynamicLibrary"]) Module["loadDynamicLibrary"] = function() { abort("'loadDynamicLibrary' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadWebAssemblyModule"]) Module["loadWebAssemblyModule"] = function() { abort("'loadWebAssemblyModule' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getLEB"]) Module["getLEB"] = function() { abort("'getLEB' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFunctionTables"]) Module["getFunctionTables"] = function() { abort("'getFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["alignFunctionTables"]) Module["alignFunctionTables"] = function() { abort("'alignFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["registerFunctions"]) Module["registerFunctions"] = function() { abort("'registerFunctions' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addFunction"]) Module["addFunction"] = function() { abort("'addFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["removeFunction"]) Module["removeFunction"] = function() { abort("'removeFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFuncWrapper"]) Module["getFuncWrapper"] = function() { abort("'getFuncWrapper' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["prettyPrint"]) Module["prettyPrint"] = function() { abort("'prettyPrint' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["makeBigInt"]) Module["makeBigInt"] = function() { abort("'makeBigInt' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynCall"]) Module["dynCall"] = function() { abort("'dynCall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getCompilerSetting"]) Module["getCompilerSetting"] = function() { abort("'getCompilerSetting' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackSave"]) Module["stackSave"] = function() { abort("'stackSave' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackRestore"]) Module["stackRestore"] = function() { abort("'stackRestore' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackAlloc"]) Module["stackAlloc"] = function() { abort("'stackAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["establishStackSpace"]) Module["establishStackSpace"] = function() { abort("'establishStackSpace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["print"]) Module["print"] = function() { abort("'print' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["printErr"]) Module["printErr"] = function() { abort("'printErr' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["intArrayFromBase64"]) Module["intArrayFromBase64"] = function() { abort("'intArrayFromBase64' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["tryParseAsDataURI"]) Module["tryParseAsDataURI"] = function() { abort("'tryParseAsDataURI' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };if (!Module["ALLOC_NORMAL"]) Object.defineProperty(Module, "ALLOC_NORMAL", { get: function() { abort("'ALLOC_NORMAL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STACK"]) Object.defineProperty(Module, "ALLOC_STACK", { get: function() { abort("'ALLOC_STACK' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STATIC"]) Object.defineProperty(Module, "ALLOC_STATIC", { get: function() { abort("'ALLOC_STATIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_DYNAMIC"]) Object.defineProperty(Module, "ALLOC_DYNAMIC", { get: function() { abort("'ALLOC_DYNAMIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_NONE"]) Object.defineProperty(Module, "ALLOC_NONE", { get: function() { abort("'ALLOC_NONE' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });

if (memoryInitializer) {
  if (!isDataURI(memoryInitializer)) {
    memoryInitializer = locateFile(memoryInitializer);
  }
  if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
    var data = Module['readBinary'](memoryInitializer);
    HEAPU8.set(data, GLOBAL_BASE);
  } else {
    addRunDependency('memory initializer');
    var applyMemoryInitializer = function(data) {
      if (data.byteLength) data = new Uint8Array(data);
      for (var i = 0; i < data.length; i++) {
        assert(HEAPU8[GLOBAL_BASE + i] === 0, "area for memory initializer should not have been touched before it's loaded");
      }
      HEAPU8.set(data, GLOBAL_BASE);
      // Delete the typed array that contains the large blob of the memory initializer request response so that
      // we won't keep unnecessary memory lying around. However, keep the XHR object itself alive so that e.g.
      // its .status field can still be accessed later.
      if (Module['memoryInitializerRequest']) delete Module['memoryInitializerRequest'].response;
      removeRunDependency('memory initializer');
    }
    function doBrowserLoad() {
      Module['readAsync'](memoryInitializer, applyMemoryInitializer, function() {
        throw 'could not load memory initializer ' + memoryInitializer;
      });
    }
    var memoryInitializerBytes = tryParseAsDataURI(memoryInitializer);
    if (memoryInitializerBytes) {
      applyMemoryInitializer(memoryInitializerBytes.buffer);
    } else
    if (Module['memoryInitializerRequest']) {
      // a network request has already been created, just use that
      function useRequest() {
        var request = Module['memoryInitializerRequest'];
        var response = request.response;
        if (request.status !== 200 && request.status !== 0) {
          var data = tryParseAsDataURI(Module['memoryInitializerRequestURL']);
          if (data) {
            response = data.buffer;
          } else {
            // If you see this warning, the issue may be that you are using locateFile and defining it in JS. That
            // means that the HTML file doesn't know about it, and when it tries to create the mem init request early, does it to the wrong place.
            // Look in your browser's devtools network console to see what's going on.
            console.warn('a problem seems to have happened with Module.memoryInitializerRequest, status: ' + request.status + ', retrying ' + memoryInitializer);
            doBrowserLoad();
            return;
          }
        }
        applyMemoryInitializer(response);
      }
      if (Module['memoryInitializerRequest'].response) {
        setTimeout(useRequest, 0); // it's already here; but, apply it asynchronously
      } else {
        Module['memoryInitializerRequest'].addEventListener('load', useRequest); // wait for it
      }
    } else {
      // fetch it from the network ourselves
      doBrowserLoad();
    }
  }
}



/**
 * @constructor
 * @extends {Error}
 * @this {ExitStatus}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  var argv = stackAlloc((argc + 1) * 4);
  HEAP32[argv >> 2] = allocateUTF8OnStack(Module['thisProgram']);
  for (var i = 1; i < argc; i++) {
    HEAP32[(argv >> 2) + i] = allocateUTF8OnStack(args[i - 1]);
  }
  HEAP32[(argv >> 2) + argc] = 0;


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
      exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      var toLog = e;
      if (e && typeof e === 'object' && e.stack) {
        toLog = [e, e.stack];
      }
      err('exception thrown: ' + toLog);
      Module['quit'](1, e);
    }
  } finally {
    calledMain = true;
  }
}




/** @type {function(Array=)} */
function run(args) {
  args = args || Module['arguments'];

  if (runDependencies > 0) {
    return;
  }

  writeStackCookie();

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}
Module['run'] = run;

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in NO_FILESYSTEM
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var print = out;
  var printErr = err;
  var has = false;
  out = err = function(x) {
    has = true;
  }
  try { // it doesn't matter if it fails
    var flush = flush_NO_FILESYSTEM;
    if (flush) flush(0);
  } catch(e) {}
  out = print;
  err = printErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set NO_EXIT_RUNTIME to 0 (see the FAQ), or make sure to emit a newline when you printf etc.');
  }
}

function exit(status, implicit) {
  checkUnflushedContent();

  // if this is just main exit-ing implicitly, and the status is 0, then we
  // don't need to do anything here and can just leave. if the status is
  // non-zero, though, then we need to report it.
  // (we may have warned about this earlier, if a situation justifies doing so)
  if (implicit && Module['noExitRuntime'] && status === 0) {
    return;
  }

  if (Module['noExitRuntime']) {
    // if exit() was called, we may warn the user if the runtime isn't actually being shut down
    if (!implicit) {
      err('exit(' + status + ') called, but NO_EXIT_RUNTIME is set, so halting execution but not exiting the runtime or preventing further async execution (build with NO_EXIT_RUNTIME=0, if you want a true shutdown)');
    }
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  Module['quit'](status, new ExitStatus(status));
}

var abortDecorators = [];

function abort(what) {
  if (Module['onAbort']) {
    Module['onAbort'](what);
  }

  if (what !== undefined) {
    out(what);
    err(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';
  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = abort;

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}

Module["noExitRuntime"] = true;

run();





// {{MODULE_ADDITIONS}}







