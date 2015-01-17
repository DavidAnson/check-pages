/*
 * grunt-check-pages
 * https://github.com/DavidAnson/grunt-check-pages
 *
 * Copyright (c) 2014 David Anson
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {
  // Imports
  var crypto = require('crypto');
  var url = require('url');
  var request = require('superagent');
  var cheerio = require('cheerio');
  var sax = require('sax');
  var crchash = require('crc-hash');

  // Global variables
  var userAgent = 'grunt-check-pages/' + require('../package.json').version;
  var pendingCallbacks = [];
  var issues = [];

  // Logs an error for a page
  function logPageError(page, message) {
    grunt.log.error(message);
    issues.push([page, message]);
  }

  // Set common request headers
  function setCommonHeaders(req) {
    // Set (or clear) user agent
    if (userAgent) {
      req.set('User-Agent', userAgent);
    } else {
      req.unset('User-Agent');
    }
    // Prevent caching so response time will be accurate
    req
      .set('Cache-Control', 'no-cache')
      .set('Pragma', 'no-cache');
  }

  // Returns true if and only if the specified link is on the list to ignore
  function isLinkIgnored(link, options) {
    return options.linksToIgnore.some(function(linkToIgnore) {
      return (linkToIgnore === link);
    });
  }

  // Returns a callback to test the specified link
  function testLink(page, link, options, retryWithGet) {
    return function (callback) {
      var logError = logPageError.bind(null, page);
      var start = Date.now();
      var hash = null;
      var linkHash = null;
      if (options.queryHashes) {
        var query = url.parse(link, true).query;
        if (query.sha1) {
          linkHash = query.sha1;
          hash = crypto.createHash('sha1');
        } else if (query.md5) {
          linkHash = query.md5;
          hash = crypto.createHash('md5');
        } else if (query.crc32) {
          linkHash = query.crc32;
          hash = crchash.createHash('crc32');
        }
      }
      var useGetRequest = retryWithGet || options.queryHashes;
      var req = request
        [useGetRequest ? 'get' : 'head'](link)
        .use(setCommonHeaders)
        .buffer(false)
        .parse(function(res, cb) {
          // Custom parser prevents superagent from using one of its own
          res.on('end', cb);
        })
        .end(function(err, res) {
          if (err) {
            logError('Link error (' + err.message + '): ' + link + ' (' + (Date.now() - start) + 'ms)');
            req.abort();
            callback();
          } else {
            if (hash) {
              hash.setEncoding('hex');
              res.on('data', function(chunk) {
                hash.write(chunk);
              });
            }
            res.on('end', function() {
              var elapsed = Date.now() - start;
              if (res.ok) {
                grunt.log.ok('Link: ' + link + ' (' + elapsed + 'ms)');
                if (hash) {
                  hash.end();
                  var contentHash = hash.read();
                  if (linkHash.toUpperCase() === contentHash.toUpperCase()) {
                    grunt.log.ok('Hash: ' + link);
                  } else {
                    logError('Hash error (' + contentHash.toLowerCase() + '): ' + link);
                  }
                }
              } else if (useGetRequest) {
                if (res.redirect && options.noRedirects) {
                  logError('Redirected link (' + res.status + '): ' + link + ' -> ' + (res.headers.location || '[Missing Location header]') + ' (' + elapsed + 'ms)');
                } else {
                  logError('Bad link (' + res.status + '): ' + link + ' (' + elapsed + 'ms)');
                }
              } else {
                // Retry HEAD request as GET to be sure
                testLink(page, link, options, true)(callback);
                return;
              }
              callback();
            });
          }
        });
      if (options.noRedirects) {
        req.redirects(0);
      }
      if (options.noLocalLinks) {
        var localhost = /^(localhost)|(127\.\d\d?\d?\.\d\d?\d?\.\d\d?\d?)|(\[[0\:]*\:[0\:]*\:0?0?0?1\])$/i;
        if (localhost.test(req.host)) {
          logError('Local link: ' + link);
        }
      }
    };
  }

  // Adds pending callbacks for all links matching <element attribute='*'/>
  function addLinks($, element, attribute, page, options, index) {
    var pageHostname = url.parse(page).hostname;
    $(element).each(function() {
      var link = $(this).attr(attribute);
      if (link) {
        var resolvedLink = url.resolve(page, link);
        if ((!options.onlySameDomain || (url.parse(resolvedLink).hostname === pageHostname)) &&
           !isLinkIgnored(resolvedLink, options)) {
          // Add to beginning of queue (in order) so links gets processed before the next page
          pendingCallbacks.splice(index, 0, testLink(page, resolvedLink, options));
          index++;
        }
      }
    });
    return index;
  }

  // Returns a callback to test the specified page
  function testPage(page, options) {
    return function (callback) {
      var logError = logPageError.bind(null, page);
      var start = Date.now();
      var req = request
        .get(page)
        .use(setCommonHeaders)
        .buffer(true)
        .end(function(err, res) {
          var elapsed = Date.now() - start;
          if (err) {
            logError('Page error (' + err.message + '): ' + page + ' (' + elapsed + 'ms)');
            req.abort();
          } else if (!res.ok) {
            logError('Bad page (' + res.status + '): ' + page + ' (' + elapsed + 'ms)');
          } else {
            if (page === req.url) {
              grunt.log.ok('Page: ' + page + ' (' + elapsed + 'ms)');
            } else {
              grunt.log.ok('Page: ' + page + ' -> ' + req.url + ' (' + elapsed + 'ms)');
              // Update page to account for redirects
              page = req.url;
            }
            if (options.checkLinks) {
              // Check the page's links for validity (i.e., HTTP HEAD returns OK)
              var $ = cheerio.load(res.text);
              var index = 0;
              index = addLinks($, 'a', 'href', page, options, index);
              index = addLinks($, 'area', 'href', page, options, index);
              index = addLinks($, 'audio', 'src', page, options, index);
              index = addLinks($, 'embed', 'src', page, options, index);
              index = addLinks($, 'iframe', 'src', page, options, index);
              index = addLinks($, 'img', 'src', page, options, index);
              index = addLinks($, 'input', 'src', page, options, index);
              index = addLinks($, 'link', 'href', page, options, index);
              index = addLinks($, 'object', 'data', page, options, index);
              index = addLinks($, 'script', 'src', page, options, index);
              index = addLinks($, 'source', 'src', page, options, index);
              index = addLinks($, 'track', 'src', page, options, index);
              index = addLinks($, 'video', 'src', page, options, index);
            }
            if (options.checkXhtml) {
              // Check the page's structure for XHTML compliance
              var parser = sax.parser(true);
              parser.onerror = function(error) {
                logError(error.message.replace(/\n/g, ', '));
              };
              parser.write(res.text);
            }
            if (options.maxResponseTime) {
              // Check the page's response time
              if (options.maxResponseTime < elapsed) {
                logError('Page response took more than ' + options.maxResponseTime + 'ms to complete');
              }
            }
            if (options.checkCaching) {
              // Check the page's cache headers
              var cacheControl = res.headers['cache-control'];
              if (cacheControl) {
                if (!/max-age|max-stale|min-fresh|must-revalidate|no-cache|no-store|no-transform|only-if-cached|private|proxy-revalidate|public|s-maxage/.test(cacheControl)) {
                  logError('Invalid Cache-Control header in response: ' + cacheControl);
                }
              } else {
                logError('Missing Cache-Control header in response');
              }
              var etag = res.headers.etag;
              if (etag) {
                if (!/^(W\/)?\"[^\"]*\"$/.test(etag)) {
                  logError('Invalid ETag header in response: ' + etag);
                }
              } else if (!cacheControl || !/no-cache|max-age=0/.test(cacheControl)) { // Don't require ETag for responses that won't be cached
                logError('Missing ETag header in response');
              }
            }
            if (options.checkCompression) {
              // Check that the page was compressed (superagent always sets Accept-Encoding to gzip/deflate)
              var contentEncoding = res.headers['content-encoding'];
              if (contentEncoding) {
                if (!/^(deflate|gzip)$/.test(contentEncoding)) {
                  logError('Invalid Content-Encoding header in response: ' + contentEncoding);
                }
              } else {
                logError('Missing Content-Encoding header in response');
              }
            }
          }
          callback();
        });
    };
  }

  // Register the task with Grunt
  grunt.registerMultiTask('checkPages', 'Checks various aspects of a web page for correctness.', function() {
    // Check for unsupported use
    if (this.files.length) {
      grunt.fail.warn('checkPages task does not use files; remove the files parameter');
    }

    // Check for required options
    var options = this.options();
    if (!options.pageUrls) {
      grunt.fail.warn('pageUrls option is not present; it should be an array of URLs');
    } else if (!Array.isArray(options.pageUrls)) {
      grunt.fail.warn('pageUrls option is invalid; it should be an array of URLs');
    }

    // Check for and normalize optional options
    options.checkLinks = !!options.checkLinks;
    options.onlySameDomain = !!options.onlySameDomain;
    options.noRedirects = !!options.noRedirects;
    options.noLocalLinks = !!options.noLocalLinks;
    options.queryHashes = !!options.queryHashes;
    options.linksToIgnore = options.linksToIgnore || [];
    if (!Array.isArray(options.linksToIgnore)) {
      grunt.fail.warn('linksToIgnore option is invalid; it should be an array');
    }
    options.checkXhtml = !!options.checkXhtml;
    options.checkCaching = !!options.checkCaching;
    options.checkCompression = !!options.checkCompression;
    if (options.maxResponseTime && (typeof (options.maxResponseTime) !== 'number' || (options.maxResponseTime <= 0))) {
      grunt.fail.warn('maxResponseTime option is invalid; it should be a positive number');
    }
    if (options.userAgent !== undefined) {
      if (options.userAgent) {
        if (typeof (options.userAgent) === 'string') {
          userAgent = options.userAgent;
        } else {
          grunt.fail.warn('userAgent option is invalid; it should be a string or null');
        }
      } else {
        userAgent = null;
      }
    }
    options.summary = !!options.summary;

    // Queue callbacks for each page
    options.pageUrls.forEach(function(page) {
      pendingCallbacks.push(testPage(page, options));
    });

    // Queue 'done' callback
    var done = this.async();
    pendingCallbacks.push(function() {
      var issueCount = issues.length;
      if (issueCount) {
        if (options.summary) {
          var summary = 'Summary of issues:\n';
          var currentPage;
          issues.forEach(function(issue) {
            var page = issue[0];
            var message = issue[1];
            if (currentPage !== page) {
              summary += ' ' + page + '\n';
              currentPage = page;
            }
            summary += '  ' + message + '\n';
          });
          grunt.log.error(summary);
        }
        var warning = issueCount + ' issue' + (issueCount > 1 ? 's' : '') + ', see above.';
        if (!options.summary) {
          warning += ' (Set options.summary for a summary.)';
        }
        grunt.fail.warn(warning);
      }
      done();
    });

    // Process the queue
    function next() {
      var callback = pendingCallbacks.shift();
      callback(next);
    }
    next();
  });
};
