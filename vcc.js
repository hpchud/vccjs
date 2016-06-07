#!/usr/bin/env node

var os = require("os");
var network = require("network");
var yaml = require("yamljs");


function ClusterWatcher (config) {
    // load the config file
    this.config = config;
}

ClusterWatcher.prototype.getAddress = function () {
    var deferred = promise();
    network.get_interfaces_list(function (err, list) {
        list.forEach(function (interface) {
            if (interface.name == "ethwe") {
                deferred.resolve(interface.ip_address);
            }
        });
        network.get_active_interface(function (err, interface) {
            deferred.resolve(interface.ip_address);
        })
    });
    return deferred.promise();
}

ClusterWatcher.prototype.register = function () {
    // get our ip address
    this.getAddress().then(function (address) {
        this.kvstore.set("/cluster/"+this.config.cluster+"/hosts/"+os.hostname(), address);
    });
    
}


var config = yaml.load("config.yml");

var node = new ClusterWatcher(config);

node.register();