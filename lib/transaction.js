var _ = require('lodash')
  , m = require('./misc')
  , makeCounter = m.makeCounter
  ;


var tr = {}

tr.commit = function(cb){
    var self = this;
    self.STOMPed.send('COMMIT',this.headers);
};

tr.abort = function(cb){
    var self = this;
    self.STOMPed.send('ABORT',this.headers);
};

tr.send = function(destination, headers, body, cb){
    var self = this;
    var self = this;
    
    if (typeof headers === 'function') {
        cb = headers;
        headers = {};
        body = '';
    } else if (typeof body === 'function') {
        cb = body;
        body = '';
    }

    headers = headers || {};
    _.defaults(headers, this.headers);
    headers.id = self.txId + '-' + (headers.id || 'send-' + self.sendCounter());

    self.STOMPed.send(destination, headers, body, cb);
};


module.exports = function(STOMPed){
    var txCounter = makeCounter();
    return function Transaction (headers, cb) {
        var self = this;
        self.STOMPed = STOMPed;

        if (typeof headers === 'function') {
            cb = headers;
            headers = {}
        }

        headers = this.headers = headers || {};
        
        self.txId = "tx-" + txCounter();
        self.id = STOMPed.id + '-' + this.txId;

        _.defaults(headers, {
            transaction: self.id
        });

        self.sendCounter = makeCounter();
        
        STOMPed.send('BEGIN', headers, '', function (frm) {
            cb.call(self,frm);
        });
    }
    var tr = Transaction.prototype = tr;
};



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
