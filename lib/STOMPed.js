'use strict';

var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , URL = require('url')

  , _ = require('lodash')
  , uuid = require('node-uuid')
  , color = require('colors')

  , Parser = require('./parser')
  , subscription = require('./subscription')
  , transaction = require('./transaction')

  , m = require('./misc')
  , bConcat = m.bConcat
  , makeCounter = m.makeCounter
  , getAdapter = m.getAdapter
  , nop = m.nop
  , setify = m.setify
  ;

var mandatoryHeaders = {
    CONNECT: {'accept-version': "1.1"}
}

var defaultOptions = {
    'status': 'master'
}

function STOMPed (url, options, cb) {
    var self=this
      , headers
      , adapter, socket, parser
      ;

    if (arguments.length === 2 && typeof options === 'function') {
        cb = options;
        options = {};
    }

    if (arguments.length === 1) {
        cb = nop;
        options = {};
    }

    options = _.defaults({}, options, defaultOptions);

    if (options.debug === true) {
        self.enableDebug();
    }

    self.id = uuid.v4();
    self.headers = _.merge ({}, options.headers || {}, mandatoryHeaders);

    self.transactions = {};

    self.Transaction = transaction(self);
    self.Subscription = subscription(self);
    self.receipts = {};

    url = typeof url === 'string' 
      ? URL.parse(url)
      : url
      ;

    url.host = url.hostname 
      ? url.hostname
      : url.host
      ;

    var socket = self.socket = getAdapter(url.protocol).connect(url)
      , parser = self.parser = new Parser(self)
      ;

    socket.on('connect', function()    { 
        self.emit('open');
        self.transmit('CONNECT', headers);
    });
    socket.on('data',    function(data){ parser.parse(data); });
    socket.on('end',     function()    { socket.end(); /*send back a FIN packet.*/ });
    socket.on('error',   function(e)    { 
        self.debug(e)
        self.emit('error',e); 
    });
    socket.on('close',   function(err) { if (!err) self.emit('end'); });

    function connectedCb (frame) {
        self.removeListener('CONNECTED', connectedCb);
        if (cb) cb.call(self, frame);
    } 
    self.on('frame', function (frame) {
        var s, t;
        self.debug('FRAME\n'.red + self.compileFrame(frame.command, frame.headers, frame.body).toString());
        self.emit(frame.command,frame);
        if (s = frame.headers.subscription) {
            if (s = self.transactions[s]) {
                s.handleFrame(frame);
            }
        }
    })
    self.on('CONNECTED',connectedCb);           
}

module.exports = STOMPed;

inherits(STOMPed, EventEmitter);

var s = STOMPed.prototype;

// helpers
function buf (str) { 
    if (Buffer.isBuffer(str)) return str;
    return new Buffer (str);
}

var escapeHeader = (function (){
    var replacements = {
        '\n': '\\n',
        ':': '\\:',
        '\\': '\\\\'
    };

    function replacer (c) { 
        return replacements[c];
    }

    return function (str) {
        return str.replace(/[\n:\\]/g, replacer);
    }
}());

var nullB   = buf([0]);
var lfB     = buf('\n');
var columnB = buf(':');

s.compileFrame = function (command, headers, body) {
    var self = this
      , acc = []
      , name
      , value
      //, self = this
      ;
    acc.push(buf(command), lfB);
    for (name in headers) {
        if (headers[name] !== undefined) {
            name = escapeHeader(name);
            value = escapeHeader(headers[name]);
            acc.push(buf(name), columnB, buf(value), lfB);            
        }
    }
    acc.push(lfB);
    acc.push(buf(body  || ''));
    acc.push(nullB);
    return bConcat(acc);
};

// transmit(command [, headers[, body]] [, callback])
// When calllback is present, a receipt header is added (if not already present)
// and the callback is called when the receipt is received.
// all STOMPed frame commands inherit this behaviour.

s.transmit = function(command, headers, body, cb) {
    var self = this
      , frm
      , receipt
      ;

    if (typeof headers === 'function') {
        cb = headers; 
        headers = {};
        body = '';
    } else if (typeof body === 'function') {
        cb = body;
        body = '';
    }

    if (cb) {
        headers.receipt = headers.receipt || uuid.v4();
        self.receipts[headers.receipt] = cb;
    }

    frm = self.compileFrame(command, headers, body);
    self.debug("Sending:\n".cyan + frm.toString().replace("\u0000",'^@'));
    self.socket.write(frm);
};

s.handleMessage = function (frame) {
    var self = this
      , subscription
      ;
    if (subscription = self.subscriptions[frame.headers.subscription]) {
        subscription.emit('MESSAGE', frame);
        return;
    }
}


s.disconnect = function (cb) {
    var self = this
      , id = 'Disconnect-' + uuid()
      ;
    self.transmit('DISCONNECT', function(f) {
            self.debug(f);
            self.socket.destroy();
            cb(f);
    });
    self.socket.end();
};

var sendCounter = makeCounter();

s.send = function (destination, headers, body,cb) {
    var self = this;
    headers = headers || {};
    headers.destination = destination;
    headers.id = self.id + '-' + (self.id || 'send-' + sendCounter());
    self.transmit("SEND", headers, body,cb);
};


s.setLimits = function (limits) {
    var self = this;
    _.extend(this.parser.limits, limits);
    return self;
};



s.debug = nop;

s.enableDebug = function() {
    var slice = [].slice;
    s.debug = function() {
        var args = slice.call(arguments,0);
        args[0] = "STOMPed:\n".grey + (args[0] || '');
        console.log.apply(console, args);
    }
};

STOMPed.Parser = Parser;



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
