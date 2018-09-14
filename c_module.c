#include <emscripten.h>
#include <stdlib.h>

// Example of C wrapper of a Javascript function, allowing C code
// to call a Javascript function and get a return value.
// Sends: number, string, byte array. Returns string.
// Note that wrapping code is Javascript.

EM_JS(char*, c_to_js, (int a, const char* b,
			unsigned char* c_buf, int c_len),
{
	// convert char* to Javascript string
	var bb = UTF8ToString(b);

	// Calls Javascript function previously added to our own Module
	var js_str = Module.c_to_js(a, bb, c_buf, c_len);

	// convert returned Javascript string to char*
	// # calculate UTF-8 size
	var len = lengthBytesUTF8(js_str) + 1;
	// # allocate space in C heap. Must be freed afterwards!
	var string_on_heap = _malloc(len);
	// # copy string to heap, converting to UTF-8
	stringToUTF8(js_str, string_on_heap, len + 1);

	// result must be freed by C caller
	return string_on_heap;
});

// Example of C function callable from Javascript
// Sends number, string and byte array; returns heap string

EMSCRIPTEN_KEEPALIVE
char* js_to_c(char *a, int b, unsigned char *data_buf, int data_len)
{
	printf("Received byte array: %p %d\n\t", data_buf, data_len);
	for (int i = 0; i < data_len; ++i) {
		printf("%02x ", data_buf[i]);
	}
	printf("\n");

	// asprintf() allocates, so result must be freed by JS caller
	char *result = 0;
	asprintf(&result, "string_create∂_in_c:%s:%d", a, b * 2);
	return result;
}

// Called by JS so we can call Javascript back

EMSCRIPTEN_KEEPALIVE
void callback()
{
	unsigned char my_buf[3] = { 17, 0, 18 };
	char* ret = c_to_js(7, "string_from_c", my_buf, 3);
	printf("Return from JS: %s\n", ret);
	free(ret);
}

// Called by main() when Emscripten module is ready to use

EM_JS(void, module_ready, (void),
{
	return global.module_ready();
});

EMSCRIPTEN_KEEPALIVE
int main()
{
	module_ready();
}
