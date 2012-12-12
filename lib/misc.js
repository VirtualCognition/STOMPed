var bind = Function.prototype.bind;
var uncurryThis = bind.bind(bind.call);

var aIndexOf = uncurryThis(Array.prototype.indexOf);

function bConcat (rope) {
    if (rope.length === 1) return rope[0];
    return Buffer.concat(rope);
}

var counter = (function(){
    var count = 0;
    return function(){
        return count++;
    };
}());

function getAdapter (protocol, secure) {
    if (secure || protocol.match(/(tls|ssl):$/)) {
        return require('tls');
    }
    return require('net');
}

var nop = function(){};

function setify (ary) {
    ary.forEach(function(o){
        ary[o] = true;
    });
    return ary;
}

function totalLen (ary) {
    return ary.reduce(function(acc,v){
        return  acc + v.length;
    }, 0);
}




module.exports = {
    aIndexOf: aIndexOf
  , bConcat: bConcat
  , counter: counter
  ,getAdapter: getAdapter
  , nop: nop
  , setify: setify
  , totalLen: totalLen
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
