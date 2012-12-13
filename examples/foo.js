var STOMPed = require ('../index');

var log = console.log.bind(console);

// replace the address with the one of your server.
var S = new STOMPed("stomp://ec2-54-234-15-174.compute-1.amazonaws.com:6782", {}, function(headers){
    console.log('Connected!');
    var sub = new S.Subscription('/queue/foo',log);
    sub.on('MESSAGE',log)
    S.send('/queue/foo', {}, 'Elephant')
    S.send('/queue/foo', {}, 'Lemon')

    tr = new S.Transaction(function(frame){
        log('Transaction',this,frame)
        this.send('/queue/foo', {}, "Message...")
        this.send('/queue/foo', {}, "... in a bottle.")
        this.commit()
    })    

});

S.on('MESSAGE', function(m){
    console.log('Message: '.yellow, m.body)
})

S.enableDebug();

