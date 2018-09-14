let once = (process.argv.length > 1 && process.argv[2] === "1");

// Allocate and copy a Javascript typed array to C heap
function array_to_c_heap(a) {
	// calculate byte size
	var n = a.length * a.BYTES_PER_ELEMENT;

	// allocate bytes in C heap.
	var ptr = m._malloc(n);

	// Since Emscripten's C heap is just an Uint8Array,
	// directly accessible via m.HEAPU8.buffer,
	// "ptr" is just an offset within that array.

	// define (not allocate) byte array in heap area
	var ap = new Uint8Array(m.HEAPU8.buffer, ptr, n);

	// copy raw data to heap-allocated array
	ap.set(new Uint8Array(a.buffer));

	return ap;
}

function free_array_c_heap(ap) {
	m._free(ap.byteOffset);
}

function f() {
	var bytearray = new Uint8Array([0x5a, 0xbb, 0x01, 0x00, 0x66, 0x10]);
	// copy array to C heap
	let ap = array_to_c_heap(bytearray);

	// call C
	let ret_ptr = js_to_c("string_from_js", 3, ap.byteOffset, ap.length);

	// free array from C heap
	free_array_c_heap(ap);

	// convert returned pointer to string, and free the pointer
	let ret = m.Pointer_stringify(ret_ptr);
	m._free(ret_ptr);

	console.log("Result from C:" + ret);
}

/* C function wrapper */
let js_to_c = null;

/* Called when Enscriptem module is ready to use.
   This function is in 'global' context because, depending on how
   Emscripten module is compiled, functions added directly to the
   C module are not available yet when main() is called. */

global.module_ready = () => {
	// defer execution to guarantee that "m" is filled
	setTimeout(() => {
		console.log("Enscriptem module is ready to use");

		// create C function wrapper
		// return is declared 'number' because it is a
		// dynamically-allocated string that must be freed
		// by the caller, so we need the pointer.

		js_to_c = m.cwrap('js_to_c', 'number',
			['string', 'number', 'number', 'number']);

		if (once) {
			f();
		} else {
			setInterval(() => { f(); }, 0);
		}
	}, 0);
	
	return;
};

// Module calls global.module_ready() when ready to use
let m = require('./c_module.js');
