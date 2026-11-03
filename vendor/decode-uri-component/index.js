'use strict';
// Drop-in replacement for decode-uri-component@0.2 (used by expo-router via
// query-string). The original's fallback decoder can take exponential /
// quadratic time on crafted links (GHSA-vcc3-ghjq-m6fr, GHSA-qr28-fpjm-wq7f),
// which a malicious roami:// link could use to freeze the app. This version
// does the same job in a single left-to-right pass.

function decodeRun(run) {
	// `run` is one or more %XX escapes in a row.
	try {
		return decodeURIComponent(run);
	} catch (err) {
		// Malformed somewhere: decode one UTF-8 character at a time.
	}
	var out = '';
	var count = run.length / 3;
	var i = 0;
	while (i < count) {
		var lead = parseInt(run.substr(i * 3 + 1, 2), 16);
		var len = lead < 0x80 ? 1 : lead >> 5 === 6 ? 2 : lead >> 4 === 14 ? 3 : lead >> 3 === 30 ? 4 : 1;
		try {
			out += decodeURIComponent(run.substr(i * 3, len * 3));
			i += len;
		} catch (err) {
			out += '�';
			i += 1;
		}
	}
	return out;
}

module.exports = function (encodedURI) {
	if (typeof encodedURI !== 'string') {
		throw new TypeError('Expected `encodedURI` to be of type `string`, got `' + typeof encodedURI + '`');
	}
	encodedURI = encodedURI.replace(/\+/g, ' ');
	try {
		return decodeURIComponent(encodedURI);
	} catch (err) {
		return encodedURI.replace(/(?:%[0-9a-fA-F]{2})+/g, decodeRun);
	}
};
