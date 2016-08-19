#!/usr/bin/env node

var os = require("os");
var path = require("path");
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
    // host cache
    this.lasthosts = {};
    // on change handlers
    this.on_change = [this.writeHosts];
}

ClusterWatcher.prototype.onChange = function (f) {
    this.on_change.push(f);
}

ClusterWatcher.prototype.writeHosts = function () {
    // write host file in /etc/hosts format
}

ClusterWatcher.prototype.runClusterHooks = function () {

}

ClusterWatcher.prototype.watchCluster = function () {
    var me = this;
    var poll_ms = 1000;
    // define a function that reformats the list response to pairs
    var format_list = function (list) {
        var newlist = {};
        for (var i = list.length - 1; i >= 0; i--) {
            newlist[path.basename(list[i].key)] = list[i].value;
        };
        return newlist;
    }
    // define a function to compare the lists
    var compare_list = function (lista, listb) {
        return JSON.stringify(lista) === JSON.stringify(listb);
    }
    // define a function that is called on the poll interval
    // use the polling strategy instead of watching because it's more stable
    var poll_hosts = function () {
        var hosts = me.store.list("/cluster/"+me.config.cluster+"/hosts");
        if (hosts) {
            var currenthosts = format_list(hosts);
            logger.debug(hosts.length, "hosts in cluster");
            // see if new host list matches our last cached one
            if (compare_list(currenthosts, me.lasthosts)) {
                logger.debug("cluster has not changed");
            } else {
                logger.debug("cluster has changed");
            }
            // update host cache
            me.lasthosts = currenthosts;
            // schedule the next poll
            setTimeout(poll_hosts, poll_ms);
        } else {
            logger.error("No hosts in cluster? Stop polling.");
        }
    }
    setTimeout(poll_hosts, poll_ms);
}

module.exports = {
    ClusterWatcher: function (service, config, targets) {
        var deferred = promise();
        var clusterwatcher = new ClusterWatcher(config.cluster);
        clusterwatcher.watchCluster();
        deferred.resolve();
        return deferred.promise();
    }
};