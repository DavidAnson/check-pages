'use strict';

// Imports
var fs = require('fs');
var url = require('url');

// Helper throws if the 'file:' protocol is not being used
function ensureFileProtocol(uri) {
  var parsedUri = url.parse(uri);
  if (parsedUri.protocol !== 'file:') {
    throw new Error('URI does not use the \'file:\' protocol: ' + uri);
  }
  return parsedUri;
}

// Returns an object that looks like http.IncomingMessage
function responseFor(uri) {
  return {
    headers: {},
    request: {
      href: uri
    },
    statusCode: 200
  };
}

/**
 * Returns a readable stream for the specified file in a similar manner to the
 * request package.
 *
 * @param {string} uri URI for the file using the 'file:' protocol.
 * @returns {Stream} Readable stream for the file's content.
 */
function requestFile(uri) {
  var parsedUri = ensureFileProtocol(uri);
  var stream = fs.createReadStream(parsedUri.pathname);
  // Make stream look like http.ClientRequest
  stream.abort = function unused() {};
  stream.on('readable', function onReadable() {
    stream.emit('response', responseFor(uri));
    stream.emit('end');
  });
  return stream;
}

/**
 * Invokes callback with a response and body for the specified file in a
 * similar manner to the request package.
 *
 * @param {string} uri URI for the file using the 'file:' protocol.
 * @param {function} callback Callback taking (error, response, body).
 * @returns {void}
 */
requestFile.get = function requestFileGet(uri, callback) {
  var parsedUri = ensureFileProtocol(uri);
  // Read file and invoke callback
  fs.readFile(parsedUri.pathname, { encoding: 'utf8' }, function onRead(err, body) {
    callback(err, responseFor(uri), body);
  });
};

// Export a request-like API (subset)
module.exports = requestFile;
