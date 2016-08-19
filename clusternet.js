#!/usr/bin/env node

var os = require("os");
var network = require("network");
var promise = require("deferred");

var logger = require("./log.js");
var kvstore = require("./kvstore.js");


var ClusterNet = function (config) {
    // load the config file
    this.config = config;
    logger.info("ClusterNet initialised with config", config);
    // open kvstore
    this.store = new kvstore(config);
}

ClusterNet.prototype.getAddress = function () {
    var deferred = promise();
    network.get_interfaces_list(function (err, list) {
        if(err) {
            logger.error(err);
            deferred.reject();
            return;
        }
        list.forEach(function (interface) {
            logger.debug("found interface", interface.name);
            if (interface.name == "ethwe") {
                logger.debug("selecting interface", interface);
                deferred.resolve(interface.ip_address);
            }
        });
        network.get_active_interface(function (err, interface) {
            if (err) {
                logger.warn(err);
                if (list.length > 0) {
                    logger.warn("This could be because we are in Docker");
                    logger.warn("ClusterNet will use the first available interface");
                    logger.debug("selecting interface", list[0]);
                    deferred.resolve(list[0].ip_address);
                    return;
                } else {
                    logger.error("There are no network interfaces");
                    deferred.reject();
                    return;
                }
            }
            logger.debug("selecting interface", interface);
            deferred.resolve(interface.ip_address);
        })
    });
    return deferred.promise();
}

ClusterNet.prototype.registerName = function () {
    var key = "/cluster/"+this.config.cluster+"/hosts/"+this.config.myhostname;
    this.store.register(key, this.config.myaddress, 60);
}

module.exports = {
    ClusterNet: function (service, config, targets) {
        var deferred = promise();
        var clusternet = new ClusterNet(config.cluster);
        clusternet.getAddress().then(function (address) {
            logger.info("address discovered as", address);
            logger.info("our hostname is", os.hostname());
            config.cluster.myhostname = os.hostname();
            config.cluster.myaddress = address;
            // register in cluster dns
            clusternet.registerName();
            deferred.resolve();
        });
        return deferred.promise();
    }
};