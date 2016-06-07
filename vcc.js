#!/usr/bin/env node

var os = require("os");
var network = require("network");
var yaml = require("yamljs");
var winston = require("winston");
var promise = require("deferred");

var kvstore = require("./kvstore.js");

var loglevel = 'debug';

var logger = new (winston.Logger)({
    transports: [
        new winston.transports.Console({ 'timestamp': true, 'colorize': true, 'level': loglevel })
    ],
    exceptionHandlers: [
        new winston.transports.Console({ 'timestamp': true, 'colorize': true, 'level': loglevel })
    ]
});


function ClusterWatcher (config) {
    // load the config file
    this.config = config;
    logger.info("ClusterWatcher initialised with config", config);
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

ClusterWatcher.prototype.register = function () {

}


var config = yaml.load("config.yml");

var clusterwatcher = new ClusterWatcher(config);
clusterwatcher.getAddress();