#!/usr/bin/env node

var os = require("os");
var network = require("network");
var promise = require("deferred");

var vccutil = require("./vccutil.js");
var logger = require("./log.js");

// convert async network functions to promises
var getInterfacesList = promise.promisify(network.get_interfaces_list);
var getActiveInterface = promise.promisify(network.get_active_interface);


/**
 * Represents a VCC container's network configuration
 * @constructor
 * @param {Object} config - A configuration object (usually loaded from vccutil.GetConfig)
 */
var ClusterNet = function (config) {
    this.config = config;
    this.interfaces_list = null;
    this.active_interface = null;
    this.name_to_ip = null;
    this.ip_to_name = null;
};

/**
 * Get a list of network interfaces, and the active interface if available.
 */
ClusterNet.prototype.getInterfaces = function () {
    var deferred = promise();
    var me = this;
    getInterfacesList().then(function (interfaces_list) {
        me.interfaces_list = interfaces_list;
        getActiveInterface().then(function (active_interface) {
            me.active_interface = active_interface;
            deferred.resolve();
        }, function (err) {
            me.active_interface = {};
            deferred.resolve();
        });
    }, function (err) {
        me.interfaces_list = [];
        deferred.resolve();
    });
    return deferred.promise();
}

/**
 * See if we should filter an interface or not
 * @param {Object} interface - An interface object
 * @returns {Boolean}
 */
ClusterNet.prototype.filterInterface = function (i) {
    if (i.name.startsWith("docker")) {
        return true;
    } else if (i.name.startsWith("dummy")) {
        return true;
    } else {
        return false;
    }
}

/**
 * Parse the list of interfaces
 * @returns {Array} [names to ips, ips to names]
 */
ClusterNet.prototype.parseInterfacesList = function () {
    var me = this;
    // convert interfaces list into something we can work with
    var name_to_ip = this.interfaces_list.reduce(function (r, i) {
        if (!me.filterInterface(i)) {
            if (i.ip_address) {
                r[i.name] = i.ip_address;
            }
        }
        return r;
    }, {});
    var ip_to_name = this.interfaces_list.reduce(function (r, i) {
        if (!me.filterInterface(i)) {
            if (i.ip_address) {
                r[i.ip_address] = i.name;
            }
        }
        return r;
    }, {});
    this.name_to_ip = name_to_ip;
    this.ip_to_name = ip_to_name;
    return [name_to_ip, ip_to_name];
}

/**
 * See if we have a saved IP address
 * @returns {String|Boolean} the IP address, or false if not
 */
ClusterNet.prototype.hasSavedAddress = function () {
    // if an address is already set, we see if an interface is available with that address
    // if not, we override the manually set address with our discovered one
    if(this.config.myaddress) {
        logger.debug("there is a saved address", this.config.myaddress);
        if(this.config.myaddress in this.ip_to_name) {
            logger.debug("found interface for saved address", this.ip_to_name[this.config.myaddress]);
            return this.config.myaddress;
        } else {
            logger.warn("there is no interface for saved address, ignoring it...");
            return false;
        }
    } else {
        logger.debug("there is no saved address");
        return false;
    }
}

/**
 * See if we have a dynamic ethwe* interface with an IP address
 * @returns {String|Boolean} the IP address, or false if not
 */
ClusterNet.prototype.hasEthweInterface = function () {
    // see if there is a ethwe
    for(var iface in this.name_to_ip) {
        if(iface.includes('ethwe')) {
            logger.debug("found ethwe* interface");
            return this.name_to_ip[iface];
        } else {
            logger.debug("there is no ethwe* interface");
            return false;
        }
    }
}

/**
 * See if we have an exposed IP address on the Weave interface
 * (not a dynamic ethwe* interface)
 * @returns {String|Boolean} the IP address, or false if not
 */
ClusterNet.prototype.hasWeaveInterface = function () {
    // see if there is a weave interface
    if('weave' in this.name_to_ip) {
        logger.debug("found weave interface");
        return this.name_to_ip['weave'];
    } else {
        logger.debug("there is no weave interface");
        return false;
    }
}

/**
 * See if there is an active network interface on the system
 * @returns {String|Boolean} the IP address, or false if not
 */
ClusterNet.prototype.hasActiveInterface = function () {
    // detect the active interface
    if (this.active_interface) {
        logger.debug("active interface is", this.active_interface.name);
        return this.active_interface.ip_address;
    } else {
        logger.warn("could not determine active interface");
        return false;
    }
}

/**
 * See if there is any network interface on the system
 * @returns {String|Boolean} the IP address, or false if not
 */
ClusterNet.prototype.hasAvailableInterface = function () {
    // return first available interface
    if (Object.keys(this.name_to_ip).length > 0) {
        var firstint = Object.keys(this.name_to_ip).sort()[0];
        logger.warn("using first available interface", firstint);
        return this.name_to_ip[firstint];
    } else {
        logger.error("there are no interfaces available");
        return false;
    }
}

/**
 * Call each has* function in the best order to determine IP address
 * @returns {String|Boolean} the IP address, or false if not
 */
ClusterNet.prototype.getAddress = function () {
    // try our options
    var ip = this.hasSavedAddress();
    if(ip) {
        return ip;
    }
    ip = this.hasEthweInterface();
    if(ip) {
        return ip;
    }
    ip = this.hasWeaveInterface();
    if(ip) {
        return ip;
    }
    ip = this.hasActiveInterface();
    if(ip) {
        return ip;
    }
    ip = this.hasAvailableInterface();
    if(ip) {
        return ip;
    }
    logger.error("could not get an address");
    return false;
}

/**
 * Write a new version of the system config file (loaded by subsequent modules)
 * @param {String} address - The determined IP address
 * @returns {Promise}
 */
ClusterNet.prototype.writeConfig = function (address) {
    var deferred = promise();
    logger.info("our IP address is", address);
    logger.info("our hostname is", os.hostname());
    // update the config file with our address and hostname
    this.config.myaddress = address;
    this.config.myhostname = os.hostname();
    logger.debug("going to write config");
    vccutil.writeConfig(this.config).then(function () {
        logger.info("updated config");
        deferred.resolve();
    },
    function (err) {
        logger.error("failed to write config");
        logger.error(err);
        deferred.reject(err);
    });
    return deferred.promise();
};

/**
 * The main function to call if we are loaded as a daemon
 */
ClusterNet.prototype.main = function () {
    var me = this;
    // get the interfaces
    this.getInterfaces().then(function () {
        // parse the interface list
        me.parseInterfacesList();
        // write the discovered address
        me.writeConfig(me.getAddress());
    });
}

if (require.main === module) {
    var clusternet = new ClusterNet(vccutil.getConfig());
    clusternet.main();
} else {
    module.exports = ClusterNet;
}
