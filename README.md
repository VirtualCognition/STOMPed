# STOMPed

**STOMPed** is a STOMP 1.1 client for Node.js.

It is still pretty much in flux, and somewhat buggy. 

Here are the desing goals:

* Full support of the STOMP 1.1 specification, including binary frames, and the ability to limit the length and number of headers.
* A minimal memory footprint.
* An idiomatic JavaSctipt API. Most id business (transactions, receipts, acks...) happens under the hood, but can be overridden at will.

To improve: cleanup/bug fixes, better error handling (currently, the parser throws on anything illegal).

##Example:

```JavaScript

var stomp = new STOMPed("stomp://example.org:6782", {/*options*/}, function (headers) {

    // each frame takes an optional onReceipt callback. When present, 
    // a receipt header is sent with the frame, and the callback is invoked
    // on reception.
    stomp.send('/queue/foo', {}, '', function onReceipt(frame){
        console.log(frame);
    })

    // Subscriptions are encapsulated in objects
    var sub = new stomp.Subscription('/queue/foo');

    // This catches the sbscription messages selectively.
    sub.on('MESSAGE',function (headers,ack) {
        if (valid(headers)){
            ack(); // sends an ACK frame;
        } else {
            ack(false); // NACK.
        }
    })
    sub.cancel();

    var tr = new stomp.Transaction( function(receiptHeaders){
        // the callback is invoked in the transaction context.
        // for example, this.id is the transaction id.
        tr.send("/queue/foo",{},"Hey ya!")
        tr.send("/queue/foo",{},"How ya doin?")
        tr.commit(); // or .abort()
    })

});
```

You can also plug lower level event handlers:

```JavaScript
// This will catch all MESSAGE frames.
stomp.on('MESSAGE', function(m){
    console.log('Message: ', m)
})

// This will catch all frames.
stomp.on('frame', function(frame){ ... })

// This does what you think it does :-).
stomp.transmit(COMMAND, headers, body, receiptCB);

```

## The MIT License (MIT)

```
Copyright 2012 Virtual Cognition

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```