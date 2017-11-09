#!/usr/bin/env node

var os = require("os");
var promise = require("deferred");
var keygen = require('ssh-keygen');
var fs = require('fs');
var path = require('path');

var vccutil = require("./vccutil.js");
var logger = require("./log.js");
var kvstore = require("./kvstore.js");

/**
 * Public key discovery for the VCC
 * @constructor
 * @param {Object} config - A configuration object (usually loaded from vccutil.GetConfig)
 */
var ClusterKeys = function (config) {
    this.config = config;
    this.current_user = os.userInfo().username;
    this.current_home = os.userInfo().homedir;
    // the discovery kv store
    this.kv = new kvstore();
    this.kv.connect(config.kvstore.host, config.kvstore.port);
};

/**
 * Enumerate all public keys in the discovery
 */
ClusterKeys.prototype.enumeratePublicKeys = function () {
    var deferred = promise();
    var me = this;
    this.kv.list("/cluster/"+this.config.cluster+"/keys", true).then(function (keys) {
        deferred.resolve(keys);
    }, function (err) {
        deferred.reject(err);
    });
    return deferred.promise();
}

/**
 * Write an authorized_keys file for the current user
 */
ClusterKeys.prototype.writeAuthorizedKeys = function (basepath) {
    var deferred = promise();
    var me = this;
    
    if (!basepath) {
        var basepath = path.join(me.current_home, ".ssh");
    }
    var location = path.join(basepath, "authorized_keys");
    
    this.enumeratePublicKeys().then(function (keys) {
        var file = fs.createWriteStream(location);
        file.on('error', function (err) {
            logger.error('Could not open', location, 'for writing', err);
            deferred.reject(err);
        });
        for (var key in keys) {
            logger.debug('Adding key from', key);
            file.write(keys[key]+'\n');
        }
        file.end();
        deferred.resolve();
    });
    
    return deferred.promise();
}

/**
 * Generate keys if they don't exist for the current user
 */
ClusterKeys.prototype.generateKeys = function (basepath) {
    var deferred = promise();
    var me = this;

    if (!basepath) {
        var basepath = path.join(me.current_home, ".ssh");
    }
    var location = path.join(basepath, "id_rsa");
    var comment = this.current_user+'@vcc';
    var password = false;

    // does key exist?
    fs.stat(location, function(err, stat) {
        if(err == null) {
            logger.info("Private key already exists for", me.current_user);
            deferred.resolve(false);
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
                deferred.resolve(true);
            });
        } else {
            logger.error('Error testing for private key for', me.current_user, err.code);
            deferred.reject();
        }
    });

    return deferred.promise();
}

/**
 * Publish my public key to the discovery service
 */
ClusterKeys.prototype.publishKeys = function (basepath) {
    var deferred = promise();
    var me = this;

    if (!basepath) {
        var basepath = path.join(me.current_home, ".ssh");
    }
    var location = path.join(basepath, "id_rsa.pub");

    // read public key
    fs.readFile(location, 'utf8', function (err, public_key) {
        if (err) {
            logger.error('Could not open public key file', location, err);
            deferred.reject();
        }
        
        // set on the kv store
        me.kv.set("/cluster/"+me.config.cluster+"/keys/"+me.config.myhostname, public_key.trim()).then(function () {
            logger.debug('Public key published to discovery for', me.config.myhostname);
            deferred.resolve();
        }, function (err) {
            logger.error('Unable to publish key to discovery:', err);
            deferred.reject();
        });

    });

    return deferred.promise();
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
