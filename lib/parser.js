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

function processHeaders (preHeaders) {
    var headers = {}
      , i, N, V
      ;
    for (i = preHeaders.length - 1; i > 0; i = i - 2) {
        N = preHeaders[i - 1];
        V = preHeaders[i];
        if (N.indexOf("\n") !== -1 || V.indexOf(":") !== -1) {
            throw 'Invalid character in header.'
                + '\n --- Name: ---\n' + N 
                + '\n--- Value: ---\n' + V;
        }
        N = unescapeHeader(N);
        V = unescapeHeader(V);
        headers[N] = V;
    }
    return headers;
}

var unescapeHeader = (function(){
    var subst = {
        "\\\\": "\\",
        "\\c": ":",
        "\\n": "\n"
    };
    function replacer (c) {
        if (subst[c]) {
            return subst[c];
        }
        throw "Invalid escape sequencein header: '" + c + "'.";
    }
    return function  (txt) {
        return txt.replace(/\\./g, replacer);
    };
}());

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

(function(p){
    p.parse = function (data) {
        var self = this
          ;
        try {
            self._parse(data); // The V8 JIT bails out on try/catch blocks.
        } catch (e) {
            console.log(e);
            // this.socket.disconnect();
            this.STOMPed.emit('error',e);
        }
    };
    p._parse = function (buffer, start) {
        start = start || 0;

        var self = this;
        do {
            if (self.state === 'default') {
                while (buffer[start]===10) { // '\n'
                    start++;
                }
                self.STOMPed.emit('ping');
                if (start < buffer.length) self.state = 'command'; // non line feed chars follow.
            }

            while (self.state === 'command') { // really an if block. break is used to jump out.
                self.frame = {_headers: []};
                var len = totalLen(self.rope)
                  , maxLen = self.limits.command || 11
                  , lf = aIndexOf(buffer, 10);

                if (lf === -1) { // we got to the end of the end of buffer.
                    if (len + buffer.length - start > maxLen) {
                        throw 'Command length limit exceeded.\n' 
                            + bConcat(self.rope) 
                            + buffer.utf8Slice(start,lf);
                    } 

                    this.rope.push(self.buffer.slice(start));
                    start = 0;
                    break;
                }

                if (len + lf - 1 > maxLen) {
                    throw 'Command length limit exceeded.\n' 
                        + bConcat(self.rope) 
                        + buffer.utf8Slice(start,lf);
                }

                self.rope.push(buffer.slice(start, lf));
                var command = bConcat(self.rope).toString();

                if (!self.validCommand[command]) {
                    throw 'Invalid command: ' + command + '.';
                }

                start = lf + 1;
                self.rope.length = 0;
                self.state = 'header-name';
                self.frame.command = command;

                break;
            }

            if (self.state === 'header-name' || self.state === 'header-value') {
                var nameStart = start
                  , valueStart = start
                  , maxlen = self.limits.headerLength || 1024
                  , maxCount = this.limits.headerCount || 20
                  ;
                while (true) {
                    var len = totalLen(self.rope)
                      , column
                      , lf
                      ;
                    if (self.state === 'header-name') {

                        if (nameStart === buffer.length) { // end of the buffer.
                            break;
                        }
                        if (buffer[nameStart] === 10) { // end of headers.
                            start = nameStart + 1;
                            self.frame.headers = processHeaders(self.frame._headers);
                            delete self.frame._headers;
                            self.state = 'body'
                            break;
                        }

                        if (this.frame._headers.length === maxCount) { 
                            throw "Headers exceed the count limit.";
                        }

                        column = aIndexOf(buffer, 58, nameStart);

                        if (column === -1) { // end of the buffer.
                            self.rope.push(buffer.slice(nameStart));
                            start = 0;
                            break;
                        }
                        if (self.len === 0 && column === nameStart) {
                            throw 'Empty header name.';
                        }

                        // End of the header name:
                        self.rope.push(buffer.slice(nameStart,column));
                        self.frame._headers.push(bConcat(self.rope).toString());
                        self.rope.length = 0;
                        valueStart = column + 1;
                        self.state = 'header-value';
                    }

                    if (self.state === 'header-value') {

                        if (valueStart === buffer.length) { // end of the buffer.
                            start = 0;
                            break;
                        }

                        lf = aIndexOf(buffer, 10, nameStart); // '\n'

                        if (lf === -1) {
                            self.rope.push(buffer.slice(valueStart));
                            start = 0;
                            break;
                        } 

                        self.rope.push(buffer.slice(valueStart, lf));
                        self.frame._headers.push(bConcat(self.rope).toString());
                        self.rope.length = 0;
                        nameStart = lf + 1;
                        self.state = 'header-name';
                    }
                    //
                    // We'll get to length limits later on.
                    //
                    // if (len+i-nameStart > maxlen) {
                    //     self.state = 'error';
                    //     self.errorMsg = 'Header length exceeds limit (' + maxlen + '):\n'
                    //                     + bConcat(self.rope, buffer, i, len);
                    //     break;
                    // }
                }
            }

            while (self.state === 'body') { // Really an if block.
                var bodyStart = start
                  , cutoff
                  ;
                if (bodyStart === self.buffer.length) {
                    break;
                }

                if (bodyStart > self.buffer.length) {
                    throw "bodyStart should never exceed buffer.length.";
                    break;
                }

                if (!self.hasBody(self.frame.command)) {
                    self.state = 'trail';
                    break;
                }
                if (self.frame.headers['content-length']) {
                    var bodyLen = parseInt(self.frame.headers['content-length'], 10);
                    if (isNaN(bodyLen)) {
                        throw 'Invalid "content-lenght" header: ' + self.frame.headers['content-length'];
                    }
                    var ropeLen = totalLen(self.rope);
                    var remaining = bodyLen - ropeLen;

                    if (remaining > buffer.length - start) {
                        self.rope.push(buffer.slice(bodyStart));
                        break;
                    }

                    cutoff = bodyLen - ropeLen + bodyStart;

                } else { // No length specified, look for the first null byte.
                    cutoff = buffer.indexOf(0);
                    if (cutoff === -1) {
                        this.rope.push(buffer.slice(bodyStart));
                        break;
                    }
                }
                self.rope.push(buffer.slice(bodyStart, cutoff));
                self.frame.body = Buffer.concat(self.rope); // By default a buffer.
                if ((self.frame['content-type'] || '').match(/(;charset=utf-8|text\/plain)$/)) {
                    self.frame.body = self.frame.body.toString();
                }
                self.rope.length = 0;
                start = cutoff;
                self.state = 'trail';
                break;
            }

            if (this.state === 'trail') {
                if (buffer[start] !== 0) {
                    throw "A frame must end with a null byte.";
                }
                self.STOMPed.emit('frame', self.frame);
                start++; // eat the null byte.
                while (buffer[start] === 10) {
                    start++;
                }
                self.state = 'default';
            }
        } while (buffer[start] !== undefined);
    };

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
