'use strict';

// Requires
var domain = require('domain');
var path = require('path');
var zlib = require('zlib');
var nock = require('nock');
var checkPages = require('../checkPages.js');

/* Infrastructure */

// Block all unexpected network calls
nock.disableNetConnect();

// Placeholder
function noop() {}

// Run a test
function runTest(options, callback) {
  // Test context
  var context = {
    options: options,
    log: [],
    error: []
  };

  // Host functions for checkPages
  var host = {
    log: context.log.push.bind(context.log),
    error: context.error.push.bind(context.error)
  };

  // Create a domain for control over exception handling
  var d = domain.create();
  d.on('error', function(err) {
    d.dispose();
    callback(err, null, -1);
  });
  d.run(function() {
    // Use nextTick to include synchronous exceptions in the domain
    process.nextTick(function() {
      checkPages(host, context.options, function(err, count) {
        callback(err, context, count);
      });
    });
  });
}

// Verify test output
function testOutput(test, log, error, exception) {
  return function(err, context, count) {
    if (err || exception) {
      test.equal(err.message, exception, 'Wrong exception text');
    }
    if (context) {
      test.equal(context.log.length, log.length, 'Wrong log count');
      test.equal(context.error.length, error.length, 'Wrong error count');
      test.equal(context.error.length - (context.options.summary ? 1 : 0), count, 'Wrong issue count');
      while (context.log.length && log.length) {
        test.equal(context.log.shift().replace(/\(\d+ms\)/g, '(00ms)'), log.shift(), 'Wrong log item');
      }
      while (context.error.length && error.length) {
        test.equal(context.error.shift().replace(/\(\d+ms\)/g, '(00ms)').replace(/ECONNREFUSED \d+\.\d+\.\d+\.\d+:\d+/g, 'ECONNREFUSED'), error.shift(), 'Wrong error item');
      }
    }
    test.done();
  };
}

/* Helpers for mocking HTTP requests */

function nockFiles(files, base, headers) {
  var scope = nock(base || 'http://example.com');
  files.forEach(function(file) {
    scope
      .get('/' + file)
      .replyWithFile(200, path.join(__dirname, file.split('?')[0]), headers);
  });
}
function nockLinks(links, base) {
  var scope = nock(base || 'http://example.com');
  links.forEach(function(link) {
    scope
      .head('/' + link)
      .reply(200);
  });
}
function nockRedirect(link, status, noRedirects, noLocation) {
  var slashLink = '/' + link;
  var scope = nock('http://example.com')
    .head(slashLink)
    .reply(status, '', noLocation ? null : { 'Location': slashLink + '_redirected' });
    if (noRedirects) {
      scope
        .get(slashLink)
        .reply(status, '', noLocation ? null : { 'Location': slashLink + '_redirected' });
    } else {
      scope
        .head(slashLink + '_redirected')
        .reply(200);
    }
}

exports.checkPages = {

  // Parameters

  hostMissing: function(test) {
    test.expect(1);
    test.throws(function() {
      checkPages(null, {}, noop);
    }, /host parameter is missing or invalid; it should be an object/);
    test.done();
  },

  hostWrongType: function(test) {
    test.expect(1);
    test.throws(function() {
      checkPages('string', {}, noop);
    }, /host parameter is missing or invalid; it should be an object/);
    test.done();
  },

  hostLogMissing: function(test) {
    test.expect(1);
    test.throws(function() {
      checkPages({}, {}, noop);
    }, /host.log is missing or invalid; it should be a function/);
    test.done();
  },

  hostLogWrongType: function(test) {
    test.expect(1);
    test.throws(function() {
      checkPages({ log: 'string' }, {}, noop);
    }, /host.log is missing or invalid; it should be a function/);
    test.done();
  },

  hostErrorMissing: function(test) {
    test.expect(1);
    test.throws(function() {
      checkPages({ log: noop }, {}, noop);
    }, /host.error is missing or invalid; it should be a function/);
    test.done();
  },

  hostErrorWrongType: function(test) {
    test.expect(1);
    test.throws(function() {
      checkPages({ log: noop, error: 'string' }, {}, noop);
    }, /host.error is missing or invalid; it should be a function/);
    test.done();
  },

  doneMissing: function(test) {
    test.expect(1);
    test.throws(function() {
      checkPages({ log: noop, error: noop, fail: noop }, {}, null);
    }, /done is missing or invalid; it should be a function/);
    test.done();
  },

  doneWrongType: function(test) {
    test.expect(1);
    test.throws(function() {
      checkPages({ log: noop, error: noop, fail: noop }, {}, 'string');
    }, /done is missing or invalid; it should be a function/);
    test.done();
  },

  optionsMissing: function(test) {
    test.expect(1);
    runTest(
      null,
    testOutput(test,
      [],
      [],
      'options parameter is missing or invalid; it should be an object'));
  },

  optionsWrongType: function(test) {
    test.expect(1);
    runTest(
      'string',
    testOutput(test,
      [],
      [],
      'options parameter is missing or invalid; it should be an object'));
  },

  pageUrlsMissing: function(test) {
    test.expect(1);
    runTest(
      {},
    testOutput(test,
      [],
      [],
      'pageUrls option is missing or invalid; it should be an array of URLs'));
  },

  pageUrlsWrongType: function(test) {
    test.expect(1);
    runTest({
      pageUrls: 'string'
    },
    testOutput(test,
      [],
      [],
      'pageUrls option is missing or invalid; it should be an array of URLs'));
  },

  linksToIgnoreWrongType: function(test) {
    test.expect(1);
    runTest({
      pageUrls: [],
      linksToIgnore: 'string'
    },
    testOutput(test,
      [],
      [],
      'linksToIgnore option is invalid; it should be an array'));
  },

  maxResponseTimeWrongType: function(test) {
    test.expect(1);
    runTest({
      pageUrls: [],
      maxResponseTime: 'string'
    },
    testOutput(test,
      [],
      [],
      'maxResponseTime option is invalid; it should be a positive number'));
  },

  userAgentWrongType: function(test) {
    test.expect(1);
    runTest({
      pageUrls: [],
      userAgent: 5
    },
    testOutput(test,
      [],
      [],
      'userAgent option is invalid; it should be a string or null'));
  },

  // Basic functionality

  pageUrlsEmpty: function(test) {
    test.expect(3);
    runTest({
      pageUrls: []
    },
    testOutput(test,
      [],
      []));
  },

  pageUrlsValid: function(test) {
    test.expect(6);
    nockFiles(['validPage.html', 'externalLink.html', 'localLinks.html']);
    nock('http://example.com')
      .get('/redirect')
      .reply(301, '', { 'Location': 'http://example.com/redirect2' })
      .get('/redirect2')
      .reply(301, '', { 'Location': 'http://example.com/localLinks.html' });
    runTest({
      pageUrls: ['http://example.com/validPage.html',
                 'http://example.com/externalLink.html',
                 'http://example.com/redirect']
    },
    testOutput(test,
      ['Page: http://example.com/validPage.html (00ms)',
       'Page: http://example.com/externalLink.html (00ms)',
       'Page: http://example.com/redirect -> http://example.com/localLinks.html (00ms)'],
      []));
  },

  pageUrlsNotFound: function(test) {
    test.expect(5);
    nock('http://example.com').get('/notFound').reply(404);
    runTest({
      pageUrls: ['http://example.com/notFound']
    },
    testOutput(test,
      [],
      ['Bad page (404): http://example.com/notFound (00ms)'],
       '1 issue. (Set options.summary for a summary.)'));
  },

  pageUrlsMultiple: function(test) {
    test.expect(9);
    nockFiles(['validPage.html', 'externalLink.html', 'validPage.html']);
    nock('http://example.com').get('/notFound').reply(404);
    nock('http://example.com').get('/serverError').reply(500);
    runTest({
      pageUrls: ['http://example.com/validPage.html',
                 'http://example.com/notFound',
                 'http://example.com/externalLink.html',
                 'http://example.com/serverError',
                 'http://example.com/validPage.html']
    },
    testOutput(test,
      ['Page: http://example.com/validPage.html (00ms)',
       'Page: http://example.com/externalLink.html (00ms)',
       'Page: http://example.com/validPage.html (00ms)'],
      ['Bad page (404): http://example.com/notFound (00ms)',
       'Bad page (500): http://example.com/serverError (00ms)'],
       '2 issues. (Set options.summary for a summary.)'));
  },

  // checkLinks functionality

  checkLinksValid: function(test) {
    test.expect(20);
    nockFiles(['validPage.html']);
    nockLinks([
      'link0', 'link1', 'link3', 'link4', 'link5',
      'link6', 'link7', 'link8', 'link9', 'link10',
      'link11', 'link12', 'link13']);
    nockRedirect('movedPermanently', 301);
    nockRedirect('movedTemporarily', 302);
    nockLinks(['link2'], 'http://example.org');
    runTest({
      pageUrls: ['http://example.com/validPage.html'],
      checkLinks: true
    },
    testOutput(test,
      ['Page: http://example.com/validPage.html (00ms)',
       'Link: http://example.com/link1 (00ms)',
       'Link: http://example.org/link2 (00ms)',
       'Link: http://example.com/movedPermanently (00ms)',
       'Link: http://example.com/movedTemporarily (00ms)',
       'Link: http://example.com/link3 (00ms)',
       'Link: http://example.com/link4 (00ms)',
       'Link: http://example.com/link5 (00ms)',
       'Link: http://example.com/link6 (00ms)',
       'Link: http://example.com/link7 (00ms)',
       'Link: http://example.com/link8 (00ms)',
       'Link: http://example.com/link0 (00ms)',
       'Link: http://example.com/link9 (00ms)',
       'Link: http://example.com/link10 (00ms)',
       'Link: http://example.com/link11 (00ms)',
       'Link: http://example.com/link12 (00ms)',
       'Link: http://example.com/link13 (00ms)'],
      []));
  },

  checkRelativeLinksValid: function(test) {
    test.expect(10);
    nockFiles(['dir/relativePage.html']);
    nockLinks([
      'dir/link0', 'dir/link1', 'link2',
      'dir/sub/link3', 'dir/sub/link4', 'link5']);
    runTest({
      pageUrls: ['http://example.com/dir/relativePage.html'],
      checkLinks: true
    },
    testOutput(test,
      ['Page: http://example.com/dir/relativePage.html (00ms)',
       'Link: http://example.com/dir/link0 (00ms)',
       'Link: http://example.com/dir/link1 (00ms)',
       'Link: http://example.com/link2 (00ms)',
       'Link: http://example.com/dir/sub/link3 (00ms)',
       'Link: http://example.com/dir/sub/link4 (00ms)',
       'Link: http://example.com/link5 (00ms)'],
      []));
  },

  checkRelativeLinksValidAfterRedirectToFile: function(test) {
    test.expect(10);
    nock('http://example.com')
      .get('/dir')
      .reply(301, '', { 'Location': 'http://example.com/dir/relativePage.html' });
    nockFiles(['dir/relativePage.html']);
    nockLinks([
      'dir/link0', 'dir/link1', 'link2',
      'dir/sub/link3', 'dir/sub/link4', 'link5']);
    runTest({
      pageUrls: ['http://example.com/dir'],
      checkLinks: true
    },
    testOutput(test,
      ['Page: http://example.com/dir -> http://example.com/dir/relativePage.html (00ms)',
       'Link: http://example.com/dir/link0 (00ms)',
       'Link: http://example.com/dir/link1 (00ms)',
       'Link: http://example.com/link2 (00ms)',
       'Link: http://example.com/dir/sub/link3 (00ms)',
       'Link: http://example.com/dir/sub/link4 (00ms)',
       'Link: http://example.com/link5 (00ms)'],
      []));
  },

  checkRelativeLinksValidAfterRedirectToDirectory: function(test) {
    test.expect(10);
    nock('http://example.com')
      .get('/dir')
      .reply(301, '', { 'Location': 'http://example.com/dir/' })
      .get('/dir/')
      .replyWithFile(200, path.join(__dirname, 'dir/relativePage.html'));
    nockLinks([
      'dir/link0', 'dir/link1', 'link2',
      'dir/sub/link3', 'dir/sub/link4', 'link5']);
    runTest({
      pageUrls: ['http://example.com/dir'],
      checkLinks: true
    },
    testOutput(test,
      ['Page: http://example.com/dir -> http://example.com/dir/ (00ms)',
       'Link: http://example.com/dir/link0 (00ms)',
       'Link: http://example.com/dir/link1 (00ms)',
       'Link: http://example.com/link2 (00ms)',
       'Link: http://example.com/dir/sub/link3 (00ms)',
       'Link: http://example.com/dir/sub/link4 (00ms)',
       'Link: http://example.com/link5 (00ms)'],
      []));
  },

  checkLinksInvalid: function(test) {
    test.expect(10);
    nockFiles(['brokenLinks.html']);
    nockLinks(['link0', 'link1', 'link2']);
    nock('http://example.com')
      .head('/broken0').reply(404)
      .get('/broken0').reply(404)
      .head('/broken1').reply(500)
      .get('/broken1').reply(500);
    runTest({
      pageUrls: ['http://example.com/brokenLinks.html'],
      checkLinks: true
    },
    testOutput(test,
      ['Page: http://example.com/brokenLinks.html (00ms)',
       'Link: http://example.com/link0 (00ms)',
       'Link: http://example.com/link1 (00ms)',
       'Link: http://example.com/link2 (00ms)'],
      ['Bad link (404): http://example.com/broken0 (00ms)',
       'Bad link (500): http://example.com/broken1 (00ms)'],
       '2 issues. (Set options.summary for a summary.)'));
  },

  checkLinksInvalidNoRedirects: function(test) {
    test.expect(10);
    nockFiles(['brokenLinks.html']);
    nockLinks(['link0', 'link1', 'link2']);
    nock('http://example.com')
      .head('/broken0').reply(404)
      .get('/broken0').reply(404)
      .head('/broken1').reply(500)
      .get('/broken1').reply(500);
    runTest({
      pageUrls: ['http://example.com/brokenLinks.html'],
      checkLinks: true,
      noRedirects: true
    },
    testOutput(test,
      ['Page: http://example.com/brokenLinks.html (00ms)',
       'Link: http://example.com/link0 (00ms)',
       'Link: http://example.com/link1 (00ms)',
       'Link: http://example.com/link2 (00ms)'],
      ['Bad link (404): http://example.com/broken0 (00ms)',
       'Bad link (500): http://example.com/broken1 (00ms)'],
       '2 issues. (Set options.summary for a summary.)'));
  },

  checkLinksRetryWhenHeadFails: function(test) {
    test.expect(5);
    nockFiles(['retryWhenHeadFails.html']);
    nock('http://example.com')
      .head('/link').reply(500)
      .get('/link').reply(200);
    runTest({
      pageUrls: ['http://example.com/retryWhenHeadFails.html'],
      checkLinks: true
    },
    testOutput(test,
      ['Page: http://example.com/retryWhenHeadFails.html (00ms)',
       'Link: http://example.com/link (00ms)'],
      []));
  },

  checkLinksonlySameDomain: function(test) {
    test.expect(5);
    nockFiles(['externalLink.html']);
    nockLinks(['link']);
    runTest({
      pageUrls: ['http://example.com/externalLink.html'],
      checkLinks: true,
      onlySameDomain: true
    },
    testOutput(test,
      ['Page: http://example.com/externalLink.html (00ms)',
       'Link: http://example.com/link (00ms)'],
      []));
  },

  checkLinksNoRedirects: function(test) {
    test.expect(7);
    nockFiles(['redirectLink.html']);
    nockRedirect('movedPermanently', 301, true);
    nockRedirect('movedTemporarily', 302, true, true);
    runTest({
      pageUrls: ['http://example.com/redirectLink.html'],
      checkLinks: true,
      noRedirects: true
    },
    testOutput(test,
      ['Page: http://example.com/redirectLink.html (00ms)'],
      ['Redirected link (301): http://example.com/movedPermanently -> /movedPermanently_redirected (00ms)',
       'Redirected link (302): http://example.com/movedTemporarily -> [Missing Location header] (00ms)'],
       '2 issues. (Set options.summary for a summary.)'));
  },

  checkLinksLinksToIgnore: function(test) {
    test.expect(7);
    nockFiles(['ignoreLinks.html']);
    nockLinks(['link0', 'link1', 'link2']);
    runTest({
      pageUrls: ['http://example.com/ignoreLinks.html'],
      checkLinks: true,
      linksToIgnore: ['http://example.com/ignore0', 'http://example.com/ignore1']
    },
    testOutput(test,
      ['Page: http://example.com/ignoreLinks.html (00ms)',
       'Link: http://example.com/link0 (00ms)',
       'Link: http://example.com/link1 (00ms)',
       'Link: http://example.com/link2 (00ms)'],
      []));
  },

  checkLinksNoLocalLinks: function(test) {
    test.expect(16);
    nockFiles(['localLinks.html']);
    nock('http://localhost').head('/').reply(200);
    nock('http://example.com').head('/').reply(200);
    nock('http://127.0.0.1').head('/').reply(200);
    nock('http://169.254.1.1').head('/').reply(200);
    nock('http://localhost').head('/').reply(200); // [::1]
    // nock('http://[ff02::1]').head('/').reply(200); // IPV6 unsupported by nock?
    // nock('http://[0000:0000:0000:0000:0000:0000:0000:0001]').head('/').reply(200);
    runTest({
      pageUrls: ['http://example.com/localLinks.html'],
      checkLinks: true,
      noLocalLinks: true
    },
    testOutput(test,
      ['Page: http://example.com/localLinks.html (00ms)',
       'Link: http://localhost/ (00ms)',
       'Link: http://example.com/ (00ms)',
       'Link: http://127.0.0.1/ (00ms)',
       'Link: http://169.254.1.1/ (00ms)',
       'Link: http://[::1]/ (00ms)'],
       // 'Link: http://[ff02::1]/ (00ms)',
       // 'Link: http://[0000:0000:0000:0000:0000:0000:0000:0001]/ (00ms)',
      [
       'Local link: http://localhost/',
       'Local link: http://127.0.0.1/',
       'Local link: http://[::1]/',
       'Link error (Nock: Not allow net connect for "ff02:80"): http://[ff02::1]/ (00ms)',
       'Local link: http://[0000:0000:0000:0000:0000:0000:0000:0001]/',
       'Link error (Nock: Not allow net connect for "0000:80"): http://[0000:0000:0000:0000:0000:0000:0000:0001]/ (00ms)'],
       '6 issues. (Set options.summary for a summary.)'));
  },

  checkLinksQueryHashes: function(test) {
    test.expect(36);
    zlib.gzip('Compressed content', function(err, buf) {
      if (!err) {
        nock('http://example.com')
          .get('/compressed?crc32=3477f8a8')
          .reply(200, [buf], {
            'Content-Encoding': 'gzip'
          });
        nockFiles([
          'queryHashes.html',
          'brokenLinks.html?md5=abcd',
          'externalLink.html?md5=9357B8FD6A13B3D1A6DBC00E6445E4FF',
          'ignoreLinks.html?md5=4f47458e34bc855a46349c1335f58cc3',
          'invalidEntity.html?field1=value&md5=fa3e4d3dc439fdb42d86855e516a92aa&field2=value',
          'localLinks.html?crc32=abcd',
          'multipleErrors.html?crc32=F88F0D21',
          'redirectLink.html?crc32=4363890c',
          'retryWhenHeadFails.html?sha1=abcd',
          'unclosedElement.html?sha1=1D9E557D3B99507E8582E67F235D3DE6DFA3717A',
          'unclosedImg.html?sha1=9511fa1a787d021bdf3aa9538029a44209fb5c4c',
          'validPage.html?field1=value&sha1=8ac1573c31b4f6132834523ac08de21c54138236&md5=abcd&crc32=abcd&field2=value']);
        nock('http://example.com').get('/noBytes.txt?crc32=00000000').reply(200, '', { 'Content-Type': 'application/octet-stream' });
        nockFiles(['allBytes.txt?sha1=88d103ba1b5db29a2d83b92d09a725cb6d2673f9'], null, { 'Content-Type': 'application/octet-stream' });
        nockFiles(['image.png?md5=e3ece6e91045f18ce18ac25455524cd0'], null, { 'Content-Type': 'image/png' });
        nockFiles(['image.png?key=value']);
        runTest({
          pageUrls: ['http://example.com/queryHashes.html'],
          checkLinks: true,
          queryHashes: true
        },
        testOutput(test,
          ['Page: http://example.com/queryHashes.html (00ms)',
           'Link: http://example.com/brokenLinks.html?md5=abcd (00ms)',
           'Link: http://example.com/externalLink.html?md5=9357B8FD6A13B3D1A6DBC00E6445E4FF (00ms)',
           'Hash: http://example.com/externalLink.html?md5=9357B8FD6A13B3D1A6DBC00E6445E4FF',
           'Link: http://example.com/ignoreLinks.html?md5=4f47458e34bc855a46349c1335f58cc3 (00ms)',
           'Hash: http://example.com/ignoreLinks.html?md5=4f47458e34bc855a46349c1335f58cc3',
           'Link: http://example.com/invalidEntity.html?field1=value&md5=fa3e4d3dc439fdb42d86855e516a92aa&field2=value (00ms)',
           'Hash: http://example.com/invalidEntity.html?field1=value&md5=fa3e4d3dc439fdb42d86855e516a92aa&field2=value',
           'Link: http://example.com/localLinks.html?crc32=abcd (00ms)',
           'Link: http://example.com/multipleErrors.html?crc32=F88F0D21 (00ms)',
           'Hash: http://example.com/multipleErrors.html?crc32=F88F0D21',
           'Link: http://example.com/redirectLink.html?crc32=4363890c (00ms)',
           'Hash: http://example.com/redirectLink.html?crc32=4363890c',
           'Link: http://example.com/retryWhenHeadFails.html?sha1=abcd (00ms)',
           'Link: http://example.com/unclosedElement.html?sha1=1D9E557D3B99507E8582E67F235D3DE6DFA3717A (00ms)',
           'Hash: http://example.com/unclosedElement.html?sha1=1D9E557D3B99507E8582E67F235D3DE6DFA3717A',
           'Link: http://example.com/unclosedImg.html?sha1=9511fa1a787d021bdf3aa9538029a44209fb5c4c (00ms)',
           'Hash: http://example.com/unclosedImg.html?sha1=9511fa1a787d021bdf3aa9538029a44209fb5c4c',
           'Link: http://example.com/validPage.html?field1=value&sha1=8ac1573c31b4f6132834523ac08de21c54138236&md5=abcd&crc32=abcd&field2=value (00ms)',
           'Hash: http://example.com/validPage.html?field1=value&sha1=8ac1573c31b4f6132834523ac08de21c54138236&md5=abcd&crc32=abcd&field2=value',
           'Link: http://example.com/noBytes.txt?crc32=00000000 (00ms)',
           'Hash: http://example.com/noBytes.txt?crc32=00000000',
           'Link: http://example.com/allBytes.txt?sha1=88d103ba1b5db29a2d83b92d09a725cb6d2673f9 (00ms)',
           'Hash: http://example.com/allBytes.txt?sha1=88d103ba1b5db29a2d83b92d09a725cb6d2673f9',
           'Link: http://example.com/image.png?md5=e3ece6e91045f18ce18ac25455524cd0 (00ms)',
           'Hash: http://example.com/image.png?md5=e3ece6e91045f18ce18ac25455524cd0',
           'Link: http://example.com/image.png?key=value (00ms)',
           'Link: http://example.com/compressed?crc32=3477f8a8 (00ms)',
           'Hash: http://example.com/compressed?crc32=3477f8a8'],
          ['Hash error (7f5a1ac1e6dc59679f36482973efc871): http://example.com/brokenLinks.html?md5=abcd',
           'Hash error (73fb7b7a): http://example.com/localLinks.html?crc32=abcd',
           'Hash error (1353361bfade29f3684fe17c8b388dadbc49cb6d): http://example.com/retryWhenHeadFails.html?sha1=abcd'],
           '3 issues. (Set options.summary for a summary.)'));
      }
    });
  },

  checkLinksInvalidProtocol: function(test) {
    test.expect(4);
    nockFiles(['invalidProtocol.html']);
    runTest({
      pageUrls: ['http://example.com/invalidProtocol.html'],
      checkLinks: true
    },
    testOutput(test,
      ['Page: http://example.com/invalidProtocol.html (00ms)'],
      []));
  },

  checkLinksMultiplePages: function(test) {
    test.expect(12);
    nockFiles(['externalLink.html', 'redirectLink.html', 'ignoreLinks.html']);
    nockLinks(['link', 'link0', 'link1', 'link2']);
    nockRedirect('movedPermanently', 301);
    nockRedirect('movedTemporarily', 302);
    runTest({
      pageUrls: ['http://example.com/externalLink.html',
                 'http://example.com/redirectLink.html',
                 'http://example.com/ignoreLinks.html'],
      checkLinks: true,
      onlySameDomain: true,
      linksToIgnore: ['http://example.com/ignore0', 'http://example.com/ignore1']
    },
    testOutput(test,
      ['Page: http://example.com/externalLink.html (00ms)',
       'Link: http://example.com/link (00ms)',
       'Page: http://example.com/redirectLink.html (00ms)',
       'Link: http://example.com/movedPermanently (00ms)',
       'Link: http://example.com/movedTemporarily (00ms)',
       'Page: http://example.com/ignoreLinks.html (00ms)',
       'Link: http://example.com/link0 (00ms)',
       'Link: http://example.com/link1 (00ms)',
       'Link: http://example.com/link2 (00ms)'],
      []));
  },

  // checkXhtml functionality

  checkXhtmlValid: function(test) {
    test.expect(4);
    nockFiles(['validPage.html']);
    runTest({
      pageUrls: ['http://example.com/validPage.html'],
      checkXhtml: true
    },
    testOutput(test,
      ['Page: http://example.com/validPage.html (00ms)'],
      []));
  },

  checkXhtmlUnclosedElement: function(test) {
    test.expect(6);
    nockFiles(['unclosedElement.html']);
    runTest({
      pageUrls: ['http://example.com/unclosedElement.html'],
      checkXhtml: true
    },
    testOutput(test,
      ['Page: http://example.com/unclosedElement.html (00ms)'],
      ['Unexpected close tag, Line: 5, Column: 7, Char: >'],
       '1 issue. (Set options.summary for a summary.)'));
  },

  checkXhtmlUnclosedImg: function(test) {
    test.expect(6);
    nockFiles(['unclosedImg.html']);
    runTest({
      pageUrls: ['http://example.com/unclosedImg.html'],
      checkXhtml: true
    },
    testOutput(test,
      ['Page: http://example.com/unclosedImg.html (00ms)'],
      ['Unexpected close tag, Line: 4, Column: 7, Char: >'],
       '1 issue. (Set options.summary for a summary.)'));
  },

  checkXhtmlInvalidEntity: function(test) {
    test.expect(6);
    nockFiles(['invalidEntity.html']);
    runTest({
      pageUrls: ['http://example.com/invalidEntity.html'],
      checkXhtml: true
    },
    testOutput(test,
      ['Page: http://example.com/invalidEntity.html (00ms)'],
      ['Invalid character entity, Line: 3, Column: 21, Char: ;'],
       '1 issue. (Set options.summary for a summary.)'));
  },

  checkXhtmlMultipleErrors: function(test) {
    test.expect(7);
    nockFiles(['multipleErrors.html']);
    runTest({
      pageUrls: ['http://example.com/multipleErrors.html'],
      checkXhtml: true
    },
    testOutput(test,
      ['Page: http://example.com/multipleErrors.html (00ms)'],
      ['Invalid character entity, Line: 4, Column: 23, Char: ;',
       'Unexpected close tag, Line: 5, Column: 6, Char: >'],
       '2 issues. (Set options.summary for a summary.)'));
  },

  // checkCaching functionality

  checkCachingValid: function(test) {
    test.expect(4);
    nockFiles(['validPage.html'], null, {
      'Cache-Control': 'public, max-age=1000',
      'ETag': '"123abc"'
    });
    runTest({
      pageUrls: ['http://example.com/validPage.html'],
      checkCaching: true
    },
    testOutput(test,
      ['Page: http://example.com/validPage.html (00ms)'],
      []));
  },

  checkCachingNoCache: function(test) {
    test.expect(4);
    nockFiles(['validPage.html'], null, {
      'Cache-Control': 'no-cache'
    });
    runTest({
      pageUrls: ['http://example.com/validPage.html'],
      checkCaching: true
    },
    testOutput(test,
      ['Page: http://example.com/validPage.html (00ms)'],
      []));
  },

  checkCachingWeakEtag: function(test) {
    test.expect(4);
    nockFiles(['validPage.html'], null, {
      'Cache-Control': 'public, max-age=1000',
      'ETag': 'W/"123abc"'
    });
    runTest({
      pageUrls: ['http://example.com/validPage.html'],
      checkCaching: true
    },
    testOutput(test,
      ['Page: http://example.com/validPage.html (00ms)'],
      []));
  },

  checkCachingEmptyEtag: function(test) {
    test.expect(4);
    nockFiles(['validPage.html'], null, {
      'Cache-Control': 'public, max-age=1000',
      'ETag': '""'
    });
    runTest({
      pageUrls: ['http://example.com/validPage.html'],
      checkCaching: true
    },
    testOutput(test,
      ['Page: http://example.com/validPage.html (00ms)'],
      []));
  },

  checkCachingMissingCacheControl: function(test) {
    test.expect(6);
    nockFiles(['validPage.html'], null, {
      'ETag': '"123abc"'
    });
    runTest({
      pageUrls: ['http://example.com/validPage.html'],
      checkCaching: true
    },
    testOutput(test,
      ['Page: http://example.com/validPage.html (00ms)'],
      ['Missing Cache-Control header in response'],
       '1 issue. (Set options.summary for a summary.)'));
  },

  checkCachingInvalidCacheControl: function(test) {
    test.expect(6);
    nockFiles(['validPage.html'], null, {
      'Cache-Control': 'invalid',
      'ETag': '"123abc"'
    });
    runTest({
      pageUrls: ['http://example.com/validPage.html'],
      checkCaching: true
    },
    testOutput(test,
      ['Page: http://example.com/validPage.html (00ms)'],
      ['Invalid Cache-Control header in response: invalid'],
       '1 issue. (Set options.summary for a summary.)'));
  },

  checkCachingMissingEtag: function(test) {
    test.expect(6);
    nockFiles(['validPage.html'], null, {
      'Cache-Control': 'public, max-age=1000'
    });
    runTest({
      pageUrls: ['http://example.com/validPage.html'],
      checkCaching: true
    },
    testOutput(test,
      ['Page: http://example.com/validPage.html (00ms)'],
      ['Missing ETag header in response'],
       '1 issue. (Set options.summary for a summary.)'));
  },

  checkCachingInvalidEtag: function(test) {
    test.expect(6);
    nockFiles(['validPage.html'], null, {
      'Cache-Control': 'public, max-age=1000',
      'ETag': 'invalid'
    });
    runTest({
      pageUrls: ['http://example.com/validPage.html'],
      checkCaching: true
    },
    testOutput(test,
      ['Page: http://example.com/validPage.html (00ms)'],
      ['Invalid ETag header in response: invalid'],
       '1 issue. (Set options.summary for a summary.)'));
  },

  // checkCompression functionality

  checkCompressionValid: function(test) {
    test.expect(5);
    zlib.gzip('<html><body><a href="link">link</a></body></html>', function(err, buf) {
      if (!err) {
        nock('http://example.com')
          .get('/compressed')
          .reply(200, [buf], {
            'Content-Encoding': 'gzip'
          });
        nockLinks(['link']);
        runTest({
          pageUrls: ['http://example.com/compressed'],
          checkCompression: true,
          checkLinks: true
        },
        testOutput(test,
          ['Page: http://example.com/compressed (00ms)',
           'Link: http://example.com/link (00ms)'],
          []));
      }
    });
  },

  checkCompressionMissingContentEncoding: function(test) {
    test.expect(6);
    nockFiles(['validPage.html']);
    runTest({
      pageUrls: ['http://example.com/validPage.html'],
      checkCompression: true
    },
    testOutput(test,
      ['Page: http://example.com/validPage.html (00ms)'],
      ['Missing Content-Encoding header in response'],
       '1 issue. (Set options.summary for a summary.)'));
  },

  checkCompressionInvalidContentEncoding: function(test) {
    test.expect(6);
    nockFiles(['validPage.html'], null, {
      'Content-Encoding': 'invalid'
    });
    runTest({
      pageUrls: ['http://example.com/validPage.html'],
      checkCompression: true
    },
    testOutput(test,
      ['Page: http://example.com/validPage.html (00ms)'],
      ['Invalid Content-Encoding header in response: invalid'],
       '1 issue. (Set options.summary for a summary.)'));
  },

  // maxResponseTime functionality

  maxResponseTimeValid: function(test) {
    test.expect(4);
    nock('http://example.com')
      .get('/page')
      .reply(200, '<html></html>');
    runTest({
      pageUrls: ['http://example.com/page'],
      maxResponseTime: 100
    },
    testOutput(test,
      ['Page: http://example.com/page (00ms)'],
      []));
  },

  maxResponseTimeSlow: function(test) {
    test.expect(6);
    nock('http://example.com')
      .get('/page')
      .delay(200)
      .reply(200, '<html></html>');
    runTest({
      pageUrls: ['http://example.com/page'],
      maxResponseTime: 100
    },
    testOutput(test,
      ['Page: http://example.com/page (00ms)'],
      ['Page response took more than 100ms to complete'],
       '1 issue. (Set options.summary for a summary.)'));
  },

  // userAgent functionality

  userAgentValid: function(test) {
    test.expect(5);
    nock('http://example.com')
      .matchHeader('User-Agent', 'custom-user-agent/1.2.3')
      .get('/page')
      .reply(200, '<html><body><a href="link">link</a></body></html>');
    nock('http://example.com')
      .matchHeader('User-Agent', 'custom-user-agent/1.2.3')
      .head('/link')
      .reply(200);
    runTest({
      pageUrls: ['http://example.com/page'],
      checkLinks: true,
      userAgent: 'custom-user-agent/1.2.3'
    },
    testOutput(test,
      ['Page: http://example.com/page (00ms)',
       'Link: http://example.com/link (00ms)'],
      []));
  },

  userAgentNull: function(test) {
    test.expect(5);
    nock('http://example.com')
      .matchHeader('User-Agent', function(val) {
        test.ok(undefined === val);
        return true;
      })
      .get('/page')
      .reply(200);
    runTest({
      pageUrls: ['http://example.com/page'],
      userAgent: null
    },
    testOutput(test,
      ['Page: http://example.com/page (00ms)'],
      []));
  },

  userAgentEmpty: function(test) {
    test.expect(5);
    nock('http://example.com')
      .matchHeader('User-Agent', function(val) {
        test.ok(undefined === val);
        return true;
      })
      .get('/page')
      .reply(200);
    runTest({
      pageUrls: ['http://example.com/page'],
      userAgent: ''
    },
    testOutput(test,
      ['Page: http://example.com/page (00ms)'],
      []));
  },

  // summary functionality

  summary: function(test) {
    test.expect(16);
    nockFiles(['multipleErrors.html', 'brokenLinks.html']);
    nock('http://example.com')
      .get('/ok').reply(200)
      .get('/notFound').reply(404)
      .head('/broken0').reply(404)
      .get('/broken0').reply(404)
      .head('/broken1').reply(500)
      .get('/broken1').reply(500);
    nockLinks(['link0', 'link1', 'link2']);
    runTest({
      pageUrls: ['http://example.com/notFound',
                 'http://example.com/ok',
                 'http://example.com/multipleErrors.html',
                 'http://example.com/brokenLinks.html'],
      checkLinks: true,
      checkXhtml: true,
      summary: true
    },
    testOutput(test,
      ['Page: http://example.com/ok (00ms)',
       'Page: http://example.com/multipleErrors.html (00ms)',
       'Page: http://example.com/brokenLinks.html (00ms)',
       'Link: http://example.com/link0 (00ms)',
       'Link: http://example.com/link1 (00ms)',
       'Link: http://example.com/link2 (00ms)'],
      ['Bad page (404): http://example.com/notFound (00ms)',
       'Invalid character entity, Line: 4, Column: 23, Char: ;',
       'Unexpected close tag, Line: 5, Column: 6, Char: >',
       'Bad link (404): http://example.com/broken0 (00ms)',
       'Bad link (500): http://example.com/broken1 (00ms)',
       'Summary of issues:\n' +
         ' http://example.com/notFound\n' +
         '  Bad page (404): http://example.com/notFound (00ms)\n' +
         ' http://example.com/multipleErrors.html\n' +
         '  Invalid character entity, Line: 4, Column: 23, Char: ;\n' +
         '  Unexpected close tag, Line: 5, Column: 6, Char: >\n' +
         ' http://example.com/brokenLinks.html\n' +
         '  Bad link (404): http://example.com/broken0 (00ms)\n' +
         '  Bad link (500): http://example.com/broken1 (00ms)\n'],
       '5 issues.'));
  },

  // Nock configuration

  requestHeaders: function(test) {
    test.expect(5);
    nock('http://example.com')
      .matchHeader('User-Agent', 'check-pages/0.7.1')
      .matchHeader('Cache-Control', 'no-cache')
      .matchHeader('Pragma', 'no-cache')
      .get('/page')
      .reply(200, '<html><body><a href="link">link</a></body></html>');
    nock('http://example.com')
      .matchHeader('User-Agent', 'check-pages/0.7.1')
      .matchHeader('Cache-Control', 'no-cache')
      .matchHeader('Pragma', 'no-cache')
      .head('/link')
      .reply(200);
    runTest({
      pageUrls: ['http://example.com/page'],
      checkLinks: true
    },
    testOutput(test,
      ['Page: http://example.com/page (00ms)',
       'Link: http://example.com/link (00ms)'],
      []));
  },

  // Connection errors

  enableDeliberateConnectionErrors: function(test) {
    test.expect(0);
    nock.enableNetConnect('localhost');
    test.done();
  },

  pageConnectionError: function(test) {
    test.expect(5);
    runTest({
      pageUrls: ['http://localhost:9999/notListening']
    },
    testOutput(test,
      [],
      ['Page error (connect ECONNREFUSED): http://localhost:9999/notListening (00ms)'],
       '1 issue. (Set options.summary for a summary.)'));
  },

  linkConnectionError: function(test) {
    test.expect(6);
    nock('http://example.com')
      .get('/page')
      .reply(200, '<html><body><a href="http://localhost:9999/notListening">notListening</a></body></html>');
    runTest({
      pageUrls: ['http://example.com/page'],
      checkLinks: true
    },
    testOutput(test,
      ['Page: http://example.com/page (00ms)'],
      ['Link error (connect ECONNREFUSED): http://localhost:9999/notListening (00ms)'],
       '1 issue. (Set options.summary for a summary.)'));
  }
};
