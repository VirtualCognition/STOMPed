var _ = require('lodash')
  , m = require('./misc')
  , Counter = m.counter
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

    self.STOMPed.send(command, headers, body, cb);
};


module.exports = function(STOMPed){
    var txCounter = new Counter();
    function Transaction (headers, cb) {
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
            transaction: self.id;
        });

        self.sendCounter = new Counter;
        
        STOMPed.send('BEGIN', headers, '', function (frm) {
            cb.call(self,frm);
        });
    }
    var tr = Transaction.prototype = tr;
};

