#!/usr/bin/env node

var os = require("os");
var network = require("network");
var promise = require("deferred");

var vccutil = require("./vccutil.js");
var logger = require("./log.js");

// convert async network functions to promises
var getInterfacesList = promise.promisify(network.get_interfaces_list);
var getActiveInterface = promise.promisify(network.get_active_interface);

var getAddress = function () {
    var deferred = promise();
    // run both get interfaces and get active interface in a promise group
    // this means we avoid nesting promises which is ugly
    promise(getInterfacesList(), getActiveInterface())(function (result) {
        // check for weave
        result[0].forEach(function (interface) {
            logger.debug("found interface", interface.name);
            if (interface.name == "ethwe") {
                logger.debug("selecting interface", interface);
                deferred.resolve(interface.ip_address);
            }
        });
        // otherwise use active interface
        logger.debug("selecting interface", result[1]);
        deferred.resolve(result[1].ip_address);
    });
    return deferred.promise();
}

var config = vccutil.getConfig();

getAddress().then(function (address) {
    logger.debug("current config is", config);
    logger.info("address discovered as", address);
    logger.info("our hostname is", os.hostname());
    if(config.myaddress) {
        logger.warn("address is already set to", config.myaddress);
    } else {
        config.myaddress = address;
    }
    // update the config file with our address and hostname
    config.myhostname = os.hostname();
    logger.debug("going to write config");
    vccutil.writeConfig(config).then(function () {
        logger.info("updated config");
    },
    function (err) {
        logger.error("failed to write config");
        logger.error(err);
    });
});