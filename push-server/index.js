var program = require('commander');

program
    .version('0.0.3')
    .usage('[options] <server>')
    .option('-d', 'debug output')
    .option('-f', 'foreground')
    .option('-v', 'verbose')
    .option('-c, --count <n>', 'process count to start', parseInt)
    .parse(process.argv);

var config = require(process.cwd() + "/config");
config.instance = program.instance;

if (!program.count) {
    program.count = 1;
}
var cluster = require('cluster');

if (cluster.isMaster) {
    for (var i = 0; i<program.count; i++){
        cluster.fork();
    }
    cluster.on('exit', function(worker, code, signal) {
        cluster.fork();
    });
} else {
    var Logger = require('./lib/log/index.js')('log' );
    console.log("starting " + cluster.worker.id);
    config.instance = cluster.worker.id;
    require('./lib/log/index.js')('Index', cluster.worker.id, 'log');
    require('./lib/push-server.js')(config);
}

