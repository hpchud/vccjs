#!/usr/bin/env node

var os = require("os");
var promise = require("deferred");

var vccutil = require("./vccutil.js");
var logger = require("./log.js");

/**
 * Public key discovery for the VCC
 * @constructor
 * @param {Object} config - A configuration object (usually loaded from vccutil.GetConfig)
 */
var ClusterKeys = function (config) {
    this.config = config;
};

/**
 * Enumerate all public keys in the discovery
 */
ClusterKeys.prototype.enumeratePublicKeys = function () {
    var me = this;
}

/**
 * Write an authorized_keys file for the current user
 */
ClusterKeys.prototype.writeAuthorizedKeys = function () {
    var me = this;
}

/**
 * Generate keys if they don't exist for the current user
 */
ClusterKeys.prototype.generateKeys = function () {
    var me = this;
}

/**
 * Publish my key to the discovery service
 */
ClusterKeys.prototype.publishKeys = function () {
    var me = this;
}

/**
 * The loop to watch the discovery KV store for changes
 */
ClusterKeys.prototype.watchCluster = function () {
    var me = this;
}

/**
 * The main function to call if we are loaded as a daemon
 */
ClusterKeys.prototype.main = function () {
    var me = this;
}

if (require.main === module) {
    var clusterkeys = new ClusterKeys(vccutil.getConfig());
    clusterkeys.main();
} else {
    module.exports = ClusterKeys;
}
