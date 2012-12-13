var inherits     = require('util').inherits
  , EventEmitter = require('events').EventEmitter
  , _            = require('lodash')

  , m = require('./misc')
  , makeCounter = m.makeCounter
  , nop = m.nop
  ;

var su = {};

su.cancel = function(cb){
    var self = this;
    self.STOMPed.transmit('UNSUBSCRIBE', {id: self.id},'', function(frm){
        delete self.STOMPed.transactions[self.id];
        cb(frm);
    });
};

su.unsubscribe = su.cancel;

// Upon MESSAGE or ERROR reception, emits a corresponding event. The event 
// handler takes two parameters: the frame and an ack callback.
// The ack callback itself is to be called to confirm the reception of the message.
// 
// function ack ([bool:accept [, object:headers]] [, cb])
// `accept` defaults to true. if false a NACK package is sent instead.
// 
// If the subscription doesn't have an adequate handler, the event is emitted 
// on the STOMPed object.


su.handleMessage = function (frame) {
    var self = this
      , acked = false
      , emitter
      ;
    // if no error handler is set for this subscripiton, call the global one.
    emitter = (self.listeners(frame.command).length !== 0) 
      ? self
      : self.STOMPed 
      ;
    emitter.emit(frame.command, _.clone(frame), function (accept, headers, cb) {
        if (acked) return;
        acked = true;

        if (arguments.length === 1) {
            if (typeof accept === 'function') {
                cb = accept;
                headers = {};
            }
        }

        if (arguments.length === 2) {
            if (typeof headers === 'function') {
                cb = headers;
                headers = {};
            }
        }

        var command = accept === false ? 'NACK' : 'ACK';
        headers = _.extend(headers || {}, {
            "message-id": frame.id,
            subscription: frame.subscription,
            transaction: frame.transaction
        });
        if (frame.transaction) headers.transaction = frame.transaction;
        self.STOMPed.transmit(command,headers,'',cb);
    });
};


// Usage:
//
// STOMP = new STOMPed(params);
// sub = STOMP.subscribe(destination);
// sub.on('MESSAGE', function(frame){
//     //...
// })
// sub.cancel()

module.exports = function(STOMPed) {
    var subCounter = makeCounter();
    function Subscription (destination, headers, cb) {
        var self = this;
        self.STOMPed = STOMPed;

        if (arguments.length === 2){
            if (typeof headers === 'function') {
                cb = headers;
                headers = {}
            }
        }
        headers = headers || {}

        headers.destination = destination;

        _.defaults(headers, {
            id: 'subscription-' + headers.destination + '-' + STOMPed.id + '-' + subCounter(),
            ack: 'auto'
        });

        _.extend(self, headers);

        STOMPed.transmit('SUBSCRIBE', headers, '', function(receipt){
            STOMPed.transactions[headers.id] = self;
            (cb || nop)(receipt);
        });
    }

    inherits(Subscription, EventEmitter);

    _.extend(Subscription.prototype, su)

    return Subscription;
}



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
