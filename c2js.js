let once = (process.argv.length > 1 && process.argv[2] === "1");

// Function called by C
function c_to_js(n, s, cbuf, clen)
{
	console.log("c_to_js n:" + n + " s:" + s);

	// convert C byte array to Javascript array
	var ac = new Uint8Array(m.HEAPU8.buffer, cbuf, clen);
	console.log("\t byte array from C: " + ac);

	// return a string
	return "delta=∆.";
}

// Called when Enscriptem module is ready to use.
global.module_ready = () => {
	setTimeout(() => {
		console.log("Enscriptem module is ready to use");

		// Add JS function to C module 
		m.c_to_js = c_to_js;

		// Calls C so it can wake up and call JS
		let cb = m.cwrap('callback', 'void', []);

		if (once) {
			cb();
		} else {
			setInterval(() => { cb(); }, 0);
		}
	}, 0);
	
	return;
};

let m = require('./c_module.js');
