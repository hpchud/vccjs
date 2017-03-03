#!/usr/bin/env node

var os = require("os");
var network = require("network");
var promise = require("deferred");

var vccutil = require("./vccutil.js");
var logger = require("./log.js");

// convert async network functions to promises
var getInterfacesList = promise.promisify(network.get_interfaces_list);
var getActiveInterface = promise.promisify(network.get_active_interface);

var config = null;

// if an address is already set, we see if an interface is available with that address
// if not, we override the manually set address with our discovered one

var filterInterface = function (i) {
    if (i.name.startsWith("docker")) {
        return true;
    } else if (i.name.startsWith("dummy")) {
        return true;
    } else {
        return false;
    }
}

var getAddress = function () {
    var deferred = promise();

    getInterfacesList().then(function (interfaces_list) {
        // convert interfaces list into something we can work with
        var name_to_ip = interfaces_list.reduce(function (r, i) {
            if (!filterInterface(i)) {
                if (i.ip_address) {
                    r[i.name] = i.ip_address;
                }
            }
            return r;
        }, {});
        var ip_to_name = interfaces_list.reduce(function (r, i) {
            if (!filterInterface(i)) {
                if (i.ip_address) {
                    r[i.name] = i.ip_address;
                }
            }
            return r;
        }, {});
        // see if there is an address already set, and if so, is there an interface for it
        if(config.myaddress) {
            logger.debug("there is a saved address", config.myaddress);
            if(config.myaddress in ip_to_name) {
                logger.debug("found interface for saved address", ip_to_name[config.myaddress]);
                deferred.resolve(config.myaddress);
            } else {
                logger.warn("there is no interface for saved address, ignoring it...");
            }
        }
        // see if there is a weave interface
        if('ethwe' in name_to_ip) {
            logger.debug("found weave interface");
            deferred.resolve(name_to_ip['ethwe']);
        } else {
            logger.debug("there is no weave interface");
        }
        // detect the active interface
        getActiveInterface().then(function (active_interface) {
            logger.debug("active interface is", active_interface.name);
            deferred.resolve(active_interface.ip_address);
        }, function (err) {
            logger.warn("could not determine active interface");
            // make sure we pick only from interfaces with ips, sorted alphabetically
            // since en* will come before any l* or v* interfaces
            var firstint = Object.keys(name_to_ip).sort()[0];
            logger.warn("using first available interface", firstint);
            deferred.resolve(name_to_ip[firstint]);
        });
    });

    return deferred.promise();
}

if (require.main === module) {

    config = vccutil.getConfig();
    logger.debug("current config is", config);

    getAddress().then(function (address) {
        logger.info("our IP address is", address);
        logger.info("our hostname is", os.hostname());
        // update the config file with our address and hostname
        config.myaddress = address;
        config.myhostname = os.hostname();
        logger.debug("going to write config");
        vccutil.writeConfig(config).then(function () {
            logger.info("updated config");
        },
        function (err) {
            logger.error("failed to write config");
            logger.error(err);
        });
    }).done();
} else {
    exports.config = config;
    exports.filterInterface = filterInterface;
    exports.getAddress = getAddress;
}
