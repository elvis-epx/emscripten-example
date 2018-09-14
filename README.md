# Emscripten examples 

This code implements a full round of examples of interaction between Javascript
and an Emscripten module written in C.

You need Node.js installed to run the examples. The compiled module is included,
but you probably want to install Emscripten to recompile and tweak the C code.

The *js2c.js* program illustrates a C function call from Javascript.
The *c2js.js* program illustrates a Javascript function call from C.

In both cases, the example function receives three parameter types (numeric,
string and byte array) and returns a string. In all cases, correct preparation
and leak avoidance are implemented and explained.
