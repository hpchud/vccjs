#!/usr/bin/env node

var os = require("os");
var promise = require("deferred");

var vccutil = require("./vccutil.js");
var logger = require("./log.js");

/**
 * Represents a VCC container's network configuration
 * @constructor
 * @param {Object} config - A configuration object (usually loaded from vccutil.GetConfig)
 */
var ClusterKeys = function (config) {
    this.config = config;
};

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
