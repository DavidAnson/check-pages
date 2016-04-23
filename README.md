# check-pages

> Checks various aspects of a web page for correctness.

[![npm version][npm-image]][npm-url]
[![GitHub tag][github-tag-image]][github-tag-url]
[![Build status][travis-image]][travis-url]
[![Coverage][coveralls-image]][coveralls-url]
[![License][license-image]][license-url]

## Install

```shell
npm install check-pages --save-dev
```

If you're using [Grunt](http://gruntjs.com/), the [`grunt-check-pages` package](https://www.npmjs.com/package/grunt-check-pages) wraps this functionality in a Grunt task.

If you're using [Gulp](http://gulpjs.com/) or another framework, the example below shows how to integrate `check-pages` into your workflow.

For direct use, the [`check-pages-cli` package](https://github.com/DavidAnson/check-pages-cli) wraps `check-pages` with a command-line interface.

## Overview

An important aspect of creating a web site is validating the structure, content, and configuration of the site's pages. The `checkPages` task provides an easy way to integrate this testing into your workflow.

By providing a list of pages to scan, the task can:

* Validate each page is accessible
* Validate all links point to accessible content (similar to the [W3C Link Checker](http://validator.w3.org/checklink))
* Validate links with query string [file hashes](https://en.wikipedia.org/wiki/List_of_hash_functions) have the expected content
* Validate all links use the secure [HTTPS protocol](https://en.wikipedia.org/wiki/HTTPS) where possible
* Validate page structure for XHTML compliance (akin to the [W3C Markup Validation Service](http://validator.w3.org/))
* Validate a page's response time is below some threshold
* Validate a page takes advantage of [caching for better performance](https://developers.google.com/speed/docs/insights/LeverageBrowserCaching)
* Validate a page takes advantage of [compression for better performance](https://developers.google.com/speed/docs/insights/EnableCompression)

## Usage

To use `check-pages` with Gulp, create a task and invoke `checkPages`, passing the task's callback function.
The following example includes all supported options:

```js
var gulp = require("gulp");
var checkPages = require("check-pages");

gulp.task("checkDev", [ "start-development-server" ], function(callback) {
  var options = {
    pageUrls: [
      'http://localhost:8080/',
      'http://localhost:8080/blog',
      'http://localhost:8080/about.html'
    ],
    checkLinks: true,
    linksToIgnore: [
      'http://localhost:8080/broken.html'
    ],
    noEmptyFragments: true,
    noLocalLinks: true,
    noRedirects: true,
    onlySameDomain: true,
    preferSecure: true,
    queryHashes: true,
    checkCaching: true,
    checkCompression: true,
    checkXhtml: true,
    summary: true,
    terse: true,
    maxResponseTime: 200,
    userAgent: 'custom-user-agent/1.2.3'
  };
  checkPages(console, options, callback);
});

gulp.task("checkProd", function(callback) {
  var options = {
    pageUrls: [
      'http://example.com/',
      'http://example.com/blog',
      'http://example.com/about.html'
    ],
    checkLinks: true,
    maxResponseTime: 500
  };
  checkPages(console, options, callback);
});
```

## API

```js
/**
 * Checks various aspects of a web page for correctness.
 *
 * @param {object} host Specifies the environment.
 * @param {object} options Configures the task.
 * @param {function} done Callback function.
 * @returns {void}
 */
module.exports = function(host, options, done) { ... }
```

### Host

Type: `Object`  
*Required*

Specifies the task environment.

For convenience, `console` can be passed directly (as in the example above).

#### log

Type: `Function` (parameters: `String`)  
*Required*

Function used to log informational messages.

#### error

Type: `Function` (parameters: `String`)  
*Required*

Function used to log error messages.

### Options

Type: `Object`  
*Required*

Specifies the task configuration.

#### pageUrls

Type: `Array` of `String`  
Default value: `undefined`  
*Required*

`pageUrls` specifies a list of URLs for web pages the task will check. The list can be empty, but must be present. Wildcards are not supported.

URLs can point to local or remote content via the `http`, `https`, and `file` protocols. `http` and `https` URLs must be absolute; `file` URLs can be relative. Some features (for example, HTTP header checks) are not available with the `file` protocol.

#### checkLinks

Type: `Boolean`  
Default value: `false`

Enabling `checkLinks` causes each link in a page to be checked for validity (i.e., an [HTTP HEAD or GET request](https://en.wikipedia.org/wiki/Hypertext_Transfer_Protocol#Request_methods) returns success).

For efficiency, a `HEAD` request is made first and a successful result validates the link. Because some web servers misbehave, a failed `HEAD` request is followed by a `GET` request to definitively validate the link.

The following element/attribute pairs are used to identify links:

* `a`/`href`
* `area`/`href`
* `audio`/`src`
* `embed`/`src`
* `iframe`/`src`
* `img`/`src`
* `img`/`srcset`
* `input`/`src`
* `link`/`href`
* `object`/`data`
* `script`/`src`
* `source`/`src`
* `source`/`srcset`
* `track`/`src`
* `video`/`src`
* `video`/`poster`

#### linksToIgnore

Type: `Array` of `String`  
Default value: `undefined`  
Used by: `checkLinks`

`linksToIgnore` specifies a list of URLs that should be ignored by the link checker.

This is useful for links that are not accessible during development or known to be unreliable.

#### noEmptyFragments

Type: `Boolean`  
Default value: `false`  
Used by: `checkLinks`

Set this option to `true` to fail the task if any links contain an empty [fragment identifier (hash)](https://en.wikipedia.org/wiki/Fragment_identifier) such as `<a href="#">`.

This is useful to identify placeholder links that haven't been updated.

#### noLocalLinks

Type: `Boolean`  
Default value: `false`  
Used by: `checkLinks`

Set this option to `true` to fail the task if any links to [`localhost`](https://en.wikipedia.org/wiki/Localhost) are encountered.

This is useful to detect temporary links that may work during development but would fail when deployed.

The list of host names recognized as `localhost` are:

* localhost
* 127.0.0.1 (and the rest of the `127.0.0.0/8` address block)
* ::1 (and its expanded forms)

#### noRedirects

Type: `Boolean`  
Default value: `false`  
Used by: `checkLinks`

Set this option to `true` to fail the task if any [HTTP redirects](https://en.wikipedia.org/wiki/URL_redirection) are encountered.

This is useful to ensure outgoing links are to the content's canonical location.

#### onlySameDomain

Type: `Boolean`  
Default value: `false`  
Used by: `checkLinks`

Set this option to `true` to block the checking of links on different domains than the referring page.

This is useful during development when external sites aren't changing and don't need to be checked.

#### preferSecure

Type: `Boolean`  
Default value: `false`  
Used by: `checkLinks`

Set this option to `true` to fail the task if any HTTP links are present where the corresponding HTTPS link is also valid.

This is useful to ensure outgoing links use a secure protocol wherever possible.

#### queryHashes

Type: `Boolean`  
Default value: `false`  
Used by: `checkLinks`

Set this option to `true` to verify links with [file hashes](https://en.wikipedia.org/wiki/List_of_hash_functions) in the query string point to content that hashes to the expected value.

Query hashes can be used to [invalidate cached responses](https://developers.google.com/web/fundamentals/performance/optimizing-content-efficiency/http-caching#invalidating-and-updating-cached-responses) when [leveraging browser caching](https://developers.google.com/speed/docs/insights/LeverageBrowserCaching) via long cache lifetimes.

Supported hash functions are:

* image.png?[crc32](https://en.wikipedia.org/wiki/Cyclic_redundancy_check)=e4f013b5
* styles.css?[md5](https://en.wikipedia.org/wiki/MD5)=4f47458e34bc855a46349c1335f58cc3
* archive.zip?[sha1](https://en.wikipedia.org/wiki/SHA-1)=9511fa1a787d021bdf3aa9538029a44209fb5c4c

#### checkCaching

Type: `Boolean`  
Default value: `false`

Enabling `checkCaching` verifies the HTTP [`Cache-Control`](https://tools.ietf.org/html/rfc2616#section-14.9) and [`ETag`](https://tools.ietf.org/html/rfc2616#section-14.19) response headers are present and valid.

This is useful to ensure a page makes use of browser caching for better performance.

#### checkCompression

Type: `Boolean`  
Default value: `false`

Enabling `checkCompression` verifies the HTTP [`Content-Encoding`](https://tools.ietf.org/html/rfc2616#section-14.11) response header is present and valid.

This is useful to ensure a page makes use of compression for better performance.

#### checkXhtml

Type: `Boolean`  
Default value: `false`

Enabling `checkXhtml` attempts to parse each URL's content as [XHTML](https://en.wikipedia.org/wiki/XHTML) and fails if there are any structural errors.

This is useful to ensure a page's structure is well-formed and unambiguous for browsers.

#### summary

Type: `Boolean`  
Default value: `false`

Enabling the `summary` option logs a summary of each issue found after all checks have completed.

This makes it easy to pick out failures when running tests against many pages. May be combined with the `terse` option.

#### terse

Type: `Boolean`  
Default value: `false`

Enabling the `terse` option suppresses the logging of each check as it runs, instead displaying a brief overview at the end.

This is useful for scripting or to reduce output. May be combined with the `summary` option.

#### maxResponseTime

Type: `Number`  
Default value: `undefined`

`maxResponseTime` specifies the maximum amount of time (in milliseconds) a page request can take to finish downloading.

Requests that take more time will trigger a failure (but are still checked for other issues).

#### userAgent

Type: `String`  
Default value: `check-pages/x.y.z`

`userAgent` specifies the value of the HTTP [`User-Agent`](https://tools.ietf.org/html/rfc2616#section-14.43) header sent with all page/link requests.

This is useful for pages that alter their behavior based on the user agent. Setting the value `null` omits the `User-Agent` header entirely.

## Release History

* 0.7.0 - Initial release, extract functionality from `grunt-check-pages` for use with Gulp.
* 0.7.1 - Fix misreporting of "Bad link" for redirected links when noRedirects enabled.
* 0.8.0 - Suppress redundant link checks, support `noEmptyFragments` option, update dependencies.
* 0.9.0 - Add support for checking local content via the 'file:' protocol, update dependencies.

[npm-image]: https://img.shields.io/npm/v/check-pages.svg
[npm-url]: https://www.npmjs.com/package/check-pages
[github-tag-image]: https://img.shields.io/github/tag/DavidAnson/check-pages.svg
[github-tag-url]: https://github.com/DavidAnson/check-pages
[travis-image]: https://img.shields.io/travis/DavidAnson/check-pages/master.svg
[travis-url]: https://travis-ci.org/DavidAnson/check-pages
[coveralls-image]: https://img.shields.io/coveralls/DavidAnson/check-pages/master.svg
[coveralls-url]: https://coveralls.io/r/DavidAnson/check-pages
[license-image]: https://img.shields.io/npm/l/check-pages.svg
[license-url]: http://opensource.org/licenses/MIT
