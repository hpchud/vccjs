#!/usr/bin/env node

var os = require("os");
var network = require("network");
var yaml = require("yamljs");
var promise = require("deferred");
var watcher = require("watchjs");

var logger = require("./log.js");
var kvstore = require("./kvstore.js");

function ClusterWatcher (config) {
    // load the config file
    this.config = config;
    logger.info("ClusterWatcher initialised with config", config);
    // assign watcher to wait for dependencies
    this.depends_ready = false;
    this.waitForDependencies();
}

ClusterWatcher.prototype.getAddress = function () {
    var deferred = promise();
    network.get_interfaces_list(function (err, list) {
        list.forEach(function (interface) {
            logger.debug("found interface", interface.name);
            if (interface.name == "ethwe") {
                logger.info("selecting interface", interface);
                deferred.resolve(interface.ip_address);
            }
        });
        network.get_active_interface(function (err, interface) {
            logger.info("selecting interface", interface);
            deferred.resolve(interface.ip_address);
        })
    });
    return deferred.promise();
}

ClusterWatcher.prototype.waitForDependencies = function () {
    var me = this;
    watcher.watch(this.config.depends, function() {
        logger.debug("dependency state changed");
        logger.debug(me.config.depends);
        // see if all dependencies are met
        var ready = true;
        for (var key in me.config.depends) {
            if (me.config.depends[key] == false) {
                ready = false;
            }
        }
        if(ready) {
            logger.info("cluster service dependencies satisfied");
            me.depends_ready = true;
        } else {
            logger.debug("cluster service dependencies are not satisfied");
        }
    });
}


var config = yaml.load("config.yml");

var clusterwatcher = new ClusterWatcher(config);

setTimeout(function() {
    clusterwatcher.config.depends['config'] = true;
}, 1000);