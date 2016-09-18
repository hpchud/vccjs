#!/usr/bin/env node

var os = require("os");
var network = require("network");
var promise = require("deferred");

var vccutil = require("./vccutil.js");
var logger = require("./log.js");


var getAddress = function () {
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


getAddress().then(function (address) {
    logger.info("address discovered as", address);
    logger.info("our hostname is", os.hostname());
    // update the config file with our address and hostname
    var config = vccutil.getConfig();
    logger.debug("current config is", config);
    config.myhostname = os.hostname();
    config.myaddress = address;
    logger.debug("going to write config");
    vccutil.writeConfig(config).then(function () {
        logger.info("updated config");
    },
    function (err) {
        logger.error("failed to write config");
        logger.error(err);
    });
});