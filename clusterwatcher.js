#!/usr/bin/env node

var os = require("os");
var network = require("network");
var promise = require("deferred");

var logger = require("./log.js");
var kvstore = require("./kvstore.js");


var ClusterWatcher = function (config) {
    // load the config file
    this.config = config;
    logger.info("ClusterWatcher initialised with config", config);
    // open kvstore
    this.store = new kvstore(config);
}

ClusterWatcher.prototype.writeHosts = function () {
    // write host file in /etc/hosts format
}

ClusterWatcher.prototype.runClusterHooks = function () {

}

ClusterWatcher.prototype.watchCluster = function () {
    
}

module.exports = {
    ClusterWatcher: function (service, config, targets) {
        var deferred = promise();
        var clusterwatcher = new ClusterWatcher(config.cluster);
        deferred.resolve();
        return deferred.promise();
    }
};