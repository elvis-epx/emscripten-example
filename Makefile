CFLAGS=-Wall -s 'EXTRA_EXPORTED_RUNTIME_METHODS=["ccall", "cwrap", "Pointer_stringify"]' -s 'WASM=0' -s 'NO_FILESYSTEM=1' -s ALLOW_MEMORY_GROWTH=1  -s ENVIRONMENT=node -O0 -g3 -s "SAFE_HEAP=1" -s "STACK_OVERFLOW_CHECK=1" -s "ASSERTIONS=1" -s 'ALIASING_FUNCTION_POINTERS=0'
# -s "SAFE_HEAP_LOG=1"

all: c_module.js test_c2js test_js2c

# Compiling
c_module.o: c_module.c Makefile
	emcc c_module.c -c $(CFLAGS)

# Linking
c_module.js: c_module.o Makefile
	emcc c_module.o -o c_module.js -Wall $(CFLAGS)

test_c2js: c_module.js
	node c2js.js 1

test_js2c: c_module.js
	node js2c.js 1
