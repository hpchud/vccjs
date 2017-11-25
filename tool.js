#!/usr/bin/env node

var yaml = require("yamljs");
var glob = require('glob');
var touch = require('touch');
var path = require('path');

var vccutil = require("./vccutil.js");

// define the required arguments
opt = require('node-getopt').create([
  ['', 'cluster=NAME', 'name of cluster to join'],
  ['', 'storage-type=TYPE', 'storage service type, supports: etcd'],
  ['', 'storage-host=IP', 'ip address of storage host'],
  ['', 'storage-port=PORT', 'port of storage service'],
  ['', 'service=SERVICE', 'for a multi service image, specify the service to start'],
  ['', 'force-address=IP', 'manually set the advertised IP of this instance'],
  ['', 'no-dns', 'don\'t use the ClusterDNS service'],
  ['', 'just-yml', 'just dump the generated cluster init.yml and nothing else'],
  ['i', 'info', 'display information about this vcc image'],
  ['h', 'help', 'display this help'],
  ['v', 'version', 'show version']
]); // parse command line


var options = opt.parseSystem().options;

// help command
if (options.help) {
    opt.showHelp();
    process.exit(1);
}

// version command
if (options.version) {
    console.log("vccjs tool 0.2");
    process.exit(1);
}
// info command
if (options.info) {
    // get some basic details about this image
    var clusteryml = yaml.load("/etc/cluster.yml");
    var info = {};
    if(!clusteryml.image_info) {
        console.error("This image does not define any author info in the init.yml");
    } else {
        info['Name'] = clusteryml.image_info.name;
        info['Version'] = clusteryml.image_info.version;
        info['Author'] = clusteryml.image_info.author;
    }
    // check for service providers and dependencies
    try {
        var deps = yaml.load("/etc/vcc/dependencies.yml");
    } catch (err) {
        var deps = {};
    }
    info.Services['Dependencies'] = deps;
    // print out in yaml
    console.log(yaml.stringify(info, 8));
    process.exit(1);
}

// otherwise, start the VCC!
// check cluster name is specified
if (!options.cluster) {
    console.error("You must specify a cluster name using --cluster=NAME");
    process.exit(1);
}
// check we have either --start-storage or --storage-host and --storage-port
if (!(options['storage-host'] && options['storage-port'])) {
    console.error("You must specify --storage-host and --storage-port");
    process.exit(1);
}
// generate yml config with cluster name and storage details in
// since the tool is executed within the image itself, we can just look at /etc/init.yml
var clusteryml = yaml.load("/etc/cluster.yml");
// storage settings
if(!options['storage-type']) {
    clusteryml.kvstore.type = "etcd";
} else {
    clusteryml.kvstore.type = options['storage-type'];
}
clusteryml.kvstore.host = options['storage-host'];
clusteryml.kvstore.port = options['storage-port'];
// address override
if(options['force-address']) {
    clusteryml.myaddress = options['force-address'];
}
// cluster dns
if(options['no-dns'] || options.usermode) {
    clusteryml.nodns = true;
}
// set cluster name and service
clusteryml.cluster = options.cluster;
if (options.service) {
    clusteryml.service = options.service;
}

// touch the service context file
touch.sync(path.join(vccutil.getRunDir(), "/vccservice-"+clusteryml.service));

// write the new cluster.yml file
vccutil.writeConfig(clusteryml).then(function () {
    console.log("written cluster.yml");
    process.exit(0);
},
function (err) {
    console.error("failed to write cluster.yml");
    console.error(err);
    process.exit(1);
});
