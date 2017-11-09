#!/usr/bin/env node

var os = require("os");
var promise = require("deferred");
var keygen = require('ssh-keygen');
var fs = require('fs');
var path = require('path');

var vccutil = require("./vccutil.js");
var logger = require("./log.js");

/**
 * Public key discovery for the VCC
 * @constructor
 * @param {Object} config - A configuration object (usually loaded from vccutil.GetConfig)
 */
var ClusterKeys = function (config) {
    this.config = config;
    this.current_user = os.userInfo().username;
    this.current_home = os.userInfo().homedir;
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
    var deferred = promise();
    var me = this;
    var location = path.join(me.current_home, ".ssh", "id_rsa");
    var comment = '@vcc';
    var password = false;

    // does key exist?
    fs.stat(location, function(err, stat) {
        if(err == null) {
            logger.info("Private key already exists for", me.current_user);
            deferred.resolve();
        } else if(err.code == 'ENOENT') {
            // file does not exist
            logger.debug('Private key does not exist for', me.current_user, "ENOENT");
            logger.info("Start generating keys for", me.current_user);
            logger.info("This could take a while...");
            keygen({
                location: location,
                comment: comment,
                password: password,
                read: false
            }, function(err){
                if (err) {
                    logger.error("Something went wrong generating keys:", err);
                    deferred.reject();
                }
                logger.info("Finished generating keys for", me.current_user);
            });
        } else {
            logger.error('Error testing for private key for', me.current_user, err.code);
            deferred.reject();
        }
    });

    return deferred.promise();
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
