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

function getAdapter (protocol) {
    return require('tcp+tls:' === protocol ? 'tls' : 'net');
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