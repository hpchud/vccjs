#!/usr/bin/env node

var os = require("os");
var network = require("network");
var yaml = require("yamljs");

var kvstore = require("./kvstore.js");

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


var config = yaml.load("config.yml");

var VccStore = new kvstore(config);

VccStore.set("/test", "josh");

console.log(VccStore.get("/test"));

console.log(VccStore.list("/"));