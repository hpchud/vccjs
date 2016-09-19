#!/usr/bin/env node

var yaml = require("yamljs");

// define the required arguments
opt = require('node-getopt').create([
  ['', 'start', 'start the image'],
  ['', 'cluster=NAME', 'name of cluster to join'],
  ['', 'start-storage', 'start a storage service for this vcc, otherwise, use --storage-[host,port] option'],
  ['', 'storage-host=IP', 'ip address of storage host'],
  ['', 'storage-port=PORT', 'port of storage service'],
  ['', 'service=SERVICE', 'for a multi service image, specify the service to start'],
  ['', 'force-address=IP', 'manually set the advertised IP of this instance'],
  //['', 'eval', 'format output suitable to eval in the host shell'],
  ['', 'just-yml', 'just dump the generated cluster init.yml and nothing else'],
  ['i', 'info', 'display information about this vcc image'],
  ['h', 'help', 'display this help'],
  ['v', 'version', 'show version']
])              // create Getopt instance
.bindHelp()     // bind option 'help' to default action
.parseSystem(); // parse command line


var options = opt.options;

//console.log(options);

if ((options.version || options.info || options.start)) {
    // version command
    if (options.version) {
        console.log("vcc version 0.1");
        /*console.log("                                _");
        console.log("                               | \\");
        console.log("  meow                         | |");
        console.log("                               | |");
        console.log("           |\\                  | |");
        console.log("          /, ~\                / /");
        console.log("         X     `-.....-------./ /");
        console.log("          ~-. ~  ~              |");
        console.log("             \\             /    |");
        console.log("              \\  /_     ___\\   /");
        console.log("              | /\\ ~~~~~   \\  |");
        console.log("              | | \\        || |");
        console.log("              | |\\ \\       || )");
        console.log("             (_/ (_/      ((_/");*/
        console.log("▒▒▒▒▒▒▒▓");
        console.log("▒▒▒▒▒▒▒▓▓▓");
        console.log("▒▓▓▓▓▓▓░░░▓");
        console.log("▒▓░░░░▓░░░░▓");
        console.log("▓░░░░░░▓░▓░▓");
        console.log("▓░░░░░░▓░░░▓");
        console.log("▓░░▓░░░▓▓▓▓");
        console.log("▒▓░░░░▓▒▒▒▒▓");
        console.log("▒▒▓▓▓▓▒▒▒▒▒▓");
        console.log("▒▒▒▒▒▒▒▒▓▓▓▓");
        console.log("▒▒▒▒▒▓▓▓▒▒▒▒▓");
        console.log("▒▒▒▒▓▒▒▒▒▒▒▒▒▓");
        console.log("▒▒▒▓▒▒▒▒▒▒▒▒▒▓");
        console.log("▒▒▓▒▒▒▒▒▒▒▒▒▒▒▓");
        console.log("▒▓▒▓▒▒▒▒▒▒▒▒▒▓");
        console.log("▒▓▒▓▓▓▓▓▓▓▓▓▓");
        console.log("▒▓▒▒▒▒▒▒▒▓");
        console.log("▒▒▓▒▒▒▒▒▓ ");
        process.exit(0);
    }
    // info command
    if (options.info) {

    }
    // start command, the good stuff happens here
    if (options.start) {
        // check cluster name is specified
        if (!options.cluster) {
            console.error("You must specify a cluster name");
            process.exit(1);
        }
        // check we have either --start-storage or --storage-host and --storage-port
        if (!options['start-storage']) {
            if (!(options['storage-host'] && options['storage-port'])) {
                console.error("You must specify either --start-storage OR --storage-host and --storage-port");
            }
        }
        // generate command for starting the storage if we need to
        if (options['start-storage']) {
            var storagecommand = "docker run -d --name=vccstore"+options.cluster+" --net=host quay.io/coreos/etcd --listen-client-urls 'http://0.0.0.0:2379,http://0.0.0.0:4001' --advertise-client-urls 'http://0.0.0.0:2379,http://0.0.0.0:4001'";
        }
        // generate yml config with cluster name and storage details in
        // since the tool is executed within the image itself, we can just look at /etc/init.yml
        var inityml = yaml.load("/etc/init.yml");
        inityml.cluster.kvstore.type = "etcd";
        if (!options['start-storage']) {
            inityml.cluster.kvstore.host = options['storage-host'];
            inityml.cluster.kvstore.port = options['storage-port'];
        } else {
            inityml.cluster.kvstore.host = "localhost";
            inityml.cluster.kvstore.port = "4001";
        }
        inityml.cluster.cluster = options.cluster;
        if (options.service) {
            inityml.cluster.service = options.service;
        }
        var b64inityml = new Buffer(yaml.stringify(inityml)).toString('base64');
        // generate command for starting this image
        var runcommand = "docker run -d --net=host --name=vcc"+options.cluster+" $VCCIMAGE b64inityml="+b64inityml;
        // output the commands in the desired format
        if (options['just-yml']) {
            console.log(yaml.stringify(inityml));
        } else {
            if(options['start-storage']) {
                console.log(storagecommand);
            }
            console.log(runcommand);
        }
    }
} else {
    console.error("You must either start the image or use one of the [info|help|version] options");
    process.exit(1);
}