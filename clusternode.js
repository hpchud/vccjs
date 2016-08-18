#!/usr/bin/env node

var os = require("os");
var network = require("network");
var yaml = require("yamljs");
var promise = require("deferred");
var watcher = require("watchjs");

var logger = require("./log.js");
var kvstore = require("./kvstore.js");


var ClusterNode = function (config) {
    // load the config file
    this.config = config;
    logger.info("ClusterNode initialised with config", config);
    // open kvstore
    this.store = new kvstore(config);
}

ClusterNode.prototype.updateTargets = function(targets) {
    // write state of each target from our init to kvstore
    for (var target in targets) {
        var key = "/cluster/"+this.config.cluster+"/hoststate/"+this.config.myhostname+"/"+target;
        if (this.store.get(key) != targets[target].toString()) {
            this.store.set(key, targets[target]);
        }
    }
}

ClusterNode.prototype.getAddress = function () {
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

ClusterNode.prototype.waitForDependencies = function () {
    var me = this;
    var deferred = promise();
    logger.info("ClusterNode is waiting for cluster service dependencies");
    // define function to check the depends object
    var check_depends = function () {
        logger.debug("cluster service dependency state changed");
        logger.debug(me.config.depends);
        // see if all dependencies are met
        var ready = true;
        for (var key in me.config.depends) {
            if (me.config.depends[key] == false) {
                ready = false;
            }
        }
        if(ready) {
            logger.info("ClusterNode service dependencies satisfied");
            deferred.resolve();
        } else {
            logger.debug("cluster service dependencies are not satisfied");
        }
    };
    // run it once and then watch for changes
    check_depends();
    watcher.watch(this.config.depends, check_depends);
    return deferred.promise();
}

ClusterNode.prototype.waitForProviders = function (targets) {
    var me = this;
    var deferred = promise();
    logger.info("ClusterNode is waiting for provider services to start");
    watcher.watch(targets, this.config.providers, function () {
        logger.debug("cluster provider targets dependency state changed");
        var ready = true;
        for (var target in me.config.providers) {
            if (targets[target] == false) {
                ready = false;
            }
        }
        if (ready) {
            logger.info("ClusterNode provider targets dependencies satisfied");
            // register our service state
            me.store.register("/cluster/"+me.config.cluster+"/services/"+me.config.service, me.config.myhostname, 60);
            deferred.resolve();
        } else {
            logger.debug("cluster provider targets dependencies are not satisfied");
        }
    });
    return deferred.promise();
}

module.exports = {
    ClusterNode: function (service, config, targets) {
        var deferred = promise();
        var clusternode = new ClusterNode(config.cluster);
        var store = new kvstore(config.cluster);
        // register our targets and watch for changes
        //clusternode.updateTargets(targets);
        //watcher.watch(targets, function () {
        //    clusternode.updateTargets(targets);
        //});
        // wait for dependencies
        // when dependencies are satisfied, trigger service manager to continue
        if(config.cluster.depends) {
            clusternode.waitForDependencies().then(function () {
                deferred.resolve();
            });
        } else {
            logger.debug("there are no cluster service dependencies");
            deferred.resolve();
        }
        // wait for provider targets to fulfil the cluster service we provide to trigger
        if (config.cluster.service) {
            clusternode.waitForProviders(targets).then(function () {
                logger.debug("service is registered:", config.cluster.service);
            });
        }
        // return promise
        return deferred.promise();
    }
};