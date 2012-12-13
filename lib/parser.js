/*jshint laxcomma:true, noarg:true, eqeqeq:true, laxbreak:true, bitwise:true, strict:true, undef:true, unused:true, devel:true, node:true, indent:4, maxerr:50, globalstrict:true, newcap:true */
'use strict';

var m = require('./misc')
  , aIndexOf = m.aIndexOf
  , bConcat = m.bConcat
  , setify = m.setify
  , totalLen = m.totalLen
  ;

function validCommand (side) {
    return ({
        client: setify([
            'SEND',
            'SUBSCRIBE',
            'UNSUBSCRIBE',
            'BEGIN',
            'COMMIT',
            'ABORT',
            'ACK',
            'NACK',
            'CONNECT',
            'DISCONNECT'
        ]),
        server: setify([
            'CONNECTED',
            'MESSAGE',
            'RECEIPT',
            'ERROR'
        ])
    })[side];
}

function hasBody (cmd) {
    return ({
        MESSAGE:true
      , ERROR:true
    })[cmd];
}


function Parser (STOMPed) {
    var self = this;
    self.STOMPed = STOMPed;
    self.debug = STOMPed.debug;
    self.socket = STOMPed.socket;
    self.rope = []; // A fat string ...
    self.limits = {}
    self.validCommand = validCommand('server');
    self.hasBody = hasBody;
    self.state = 'default';
    self.buffer = new Buffer(1024);
}

module.exports = Parser;

(function (p) {
    p.parse = function (buffer) {
        var self = this
          , start = 0     
          ;
        while (buffer[start] !== undefined) {
            start = this[self.state](buffer, start);
        } 
    };

    var subst = {
        "\\\\": "\\",
        "\\c": ":",
        "\\n": "\n"
    };
    function replacer (c) { 
        // Returns a closure, in case multiple clients are defined.
        // Otherwise, since it is bound to `this`in processHeaders, 
        // there would be clashes.
        return function (c) {
            if (subst[c]) {
                return subst[c];
            }
            self.errorMsg = "Invalid escape sequence in header: '" + c + "'.\n";
            return c;
        }
    }

    var unescapeHeader = function  (txt) {
        return txt.replace(/\\./g, replacer);
    };

    p.processHeaders = function (preHeaders) {
        var self = this;
        replacer = replacer().bind(this);
        self.processHeaders = p._processHeaders;

        return  self.processHeaders (preHeaders);
    };

    p._processHeaders = function (preHeaders) {
        var self = this
          , headers = {}
          , i, N, V
          ;
        for (i = preHeaders.length - 1; i > 0; i = i - 2) {
            N = preHeaders[i - 1];
            V = preHeaders[i];
            if (N.indexOf("\n") !== -1 || V.indexOf(":") !== -1) {
                self.errorMsg = 'Invalid character in header.'
                    + '\n --- Name: ---\n' + N 
                    + '\n--- Value: ---\n' + V
                    ;
            }
            N = unescapeHeader(N);
            V = unescapeHeader(V);
            headers[N] = V;
        }
        return headers;
    }
    
    p.default = function (buffer, start) {
        var self = this;

        while (buffer[start]===10) { // '\n'
            start++;
        }
        self.STOMPed.emit('ping');
        if (start < buffer.length) self.state = 'command'; // non line feed chars follow.
        return start;
    }

    p.command = function (buffer, start) {
        var self = this
          , len = totalLen(self.rope)
          , maxLen = self.limits.command || 11
          , lf = aIndexOf(buffer, 10, start)
          ;
        self.frame = {_headers: []};
        if (lf === -1) { // we got to the end of the end of buffer.
            if (len + buffer.length - start > maxLen) {
                self.error('Command length limit exceeded.\n' 
                    + bConcat(self.rope) 
                    + buffer.utf8Slice(start,lf));
            } 
            this.rope.push(self.buffer.slice(start));
            return start;
        }

        self.rope.push(buffer.slice(start, lf));
        var command = bConcat(self.rope).toString();

        if (!self.validCommand[command]) {
            self.error('Invalid command: ' + command + '.');
        }

        self.frame.command = command;
        start = lf + 1;
        self.rope.length = 0;
        self.state = 'header-name';

        return start;
    }

    p['header-name'] = function (buffer, start) {
        var self = this
          , maxlen = self.limits.headerLength || 1024
          , maxCount = this.limits.headerCount || 20
          , len, column, lf
          ;
        while (true) {
            len = totalLen(self.rope);
            if (self.state === 'header-name') {

                if (start === buffer.length) { // end of the buffer.
                    return start;
                }
                if (buffer[start] === 10) { // end of headers.
                    start = start + 1;
                    self.frame.headers = self.processHeaders(self.frame._headers);
                    if (self.errorMsg) {
                        self.error(self.errorMsg);
                        return start;
                    }
                    self.frame._headers = null;

                    self.state = 'body'
                    return start;
                }

                if (this.frame._headers.length === maxCount) { 
                    self.error("Headers exceed the count limit.");
                }

                column = aIndexOf(buffer, 58, start);

                if (column === -1) { // end of the buffer.
                    self.rope.push(buffer.slice(start));
                    start = 0;
                    return start;
                }
                if (self.len === 0 && column === start) {
                    self.error('Empty header name.');
                }

                // End of the header name:
                self.rope.push(buffer.slice(start,column));
                self.frame._headers.push(bConcat(self.rope).toString());
                self.rope.length = 0;
                start = column + 1;
                self.state = 'header-value';
            }

            if (self.state === 'header-value') {

                if (start === buffer.length) { // end of the buffer.
                    start = 0;
                    return start;
                }

                lf = aIndexOf(buffer, 10, start); // '\n'

                if (lf === -1) {
                    self.rope.push(buffer.slice(start));
                    start = 0;
                    return start;
                } 

                self.rope.push(buffer.slice(start, lf));
                self.frame._headers.push(bConcat(self.rope).toString());
                self.rope.length = 0;
                start = lf + 1;
                self.state = 'header-name';
            }
            //
            // We'll get to length limits later on.
            //
            // if (len+i-start > maxlen) {
            //     self.state = 'error';
            //     self.errorMsg = 'Header length exceeds limit (' + maxlen + '):\n'
            //                     + bConcat(self.rope, buffer, i, len);
            //     return start;
            // }
        }
    }

    p['header-value'] = p['header-name'];


     p.body = function (buffer, start) {
        var self = this
          , cutoff
          ;
        if (!self.hasBody(self.frame.command)) {
            self.state = 'trail';
            return start;
        }
        if (self.frame.headers['content-length']) {
            var bodyLen = parseInt(self.frame.headers['content-length'], 10);
            if (isNaN(bodyLen)) {
                self.error('Invalid "content-lenght" header: ' + self.frame.headers['content-length']);
            }
            var ropeLen = totalLen(self.rope);
            var remaining = bodyLen - ropeLen;

            if (remaining > buffer.length - start) {
                self.rope.push(buffer.slice(start));
                return start;
            }

            cutoff = bodyLen - ropeLen + start;

        } else { // No length specified, look for the first null byte.
            cutoff = aIndexOf(buffer, 0, start)
            if (cutoff === -1) {
                this.rope.push(buffer.slice(start));
                return start;
            }
        }
        self.rope.push(buffer.slice(start, cutoff));
        self.frame.body = Buffer.concat(self.rope); // By default a buffer.
        if ((self.frame['content-type'] || '').match(/(;charset=utf-8|text\/plain)$/)) {
            self.frame.body = self.frame.body.toString();
        }
        self.rope.length = 0;
        start = cutoff;
        self.state = 'trail';
        return start;
    }
    p.trail = function (buffer, start) {
        var self = this;

        if (buffer[start] !== 0) {
            self.error("A frame must end with a null byte.");
        }
        self.STOMPed.emit('frame', self.frame);
        start++; // eat the null byte.
        while (buffer[start] === 10) {
            start++;
        }
        self.state = 'default';
        return start;
    }

    p.parseError = function (buffer, start) {
        var self = this
          , NULL
          ;
        NULL = aIndexOf(buffer, 0, start);
        if (NULL === -1) {
            return start;
        }
        self.rope.length = 0;
        start = NULL + 1;
        self.state = 'default';
        return start;
    }

    p.error = function (message) {
        var self = this
          , frame = this.frame
          ;
        self.errorMsg = self.frame = null;
        message = message + '\n' 
                + self.STOMPed.compileFrame(
                                frame.command, 
                                frame.headers, 
                                frame.body
                            ).toString()
                             .replace('\u0000', '^@');

        self.STOMPed.debug(message);
        self.STOMPed.emit('parseError', message);
        self.state = 'parseError';
    }
}(Parser.prototype));



// Copyright 2012 Virtual Cognition
// 
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
// 
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
