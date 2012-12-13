var STOMPed = require ('../index');

var log = console.log.bind(console);

var S = new STOMPed("stomp://ec2-54-234-15-174.compute-1.amazonaws.com:6782", {STOMPedDebug:true}, function(headers){
    console.log('Connected!');
    var sub = new S.Subscription('/queue/foo',log);
    sub.on('MESSAGE',log)
    S.send('/queue/foo', {}, 'GERTERTERTER')
    S.send('/queue/foo', {}, 'GERTERTERTER')
    process.nextTick(function(){
        tr = new S.Transaction(function(frame){
            log('Transaction',this,frame)
            this.send('/queue/foo', {}, "brabar")
            this.send('/queue/foo', {}, "bribirOOOO")
            this.commit()
        })    
    })

});
S.on('MESSAGE', function(m){
    console.log('Message: ', m)
})

S.enableDebug();

