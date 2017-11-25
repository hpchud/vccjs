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
    // key cache
    this.lastkeys = {};
    // the timer id for cluster changed
    this.changed_timeout = null;
    // poll frequency
    this.poll_ms = 5000;
    // time to detect settle
    this.settle_ms = 10000;
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
    return deferred.promise;
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
    
    return deferred.promise;
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
    var comment = this.current_user+'@'+this.config.myhostname;
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

    return deferred.promise;
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
        
        // register on the kv store
        me.kv.register("/cluster/"+me.config.cluster+"/keys/"+me.config.myhostname, public_key.trim(), 60).then(function () {
            deferred.resolve();
        }, function (err) {
            logger.error('Unable to publish key to discovery:', err);
            deferred.reject();
        });

    });

    return deferred.promise;
}

/**
 * The main loop to watch the discovery KV store for changes
 */
ClusterKeys.prototype.watchCluster = function (callback) {
    var me = this;
    
    this.enumeratePublicKeys().then(function (currentkeys) {
        logger.debug(Object.keys(currentkeys).length, "keys in cluster");
        // compare with lastkeys
        if (JSON.stringify(currentkeys) === JSON.stringify(me.lastkeys)) {
            logger.debug("cluster has not changed");
            // cluster not changed, schedule next loop
            me.lastkeys = currentkeys;
            setTimeout(me.watchCluster.bind(me), me.poll_ms);
        } else {
            // cluster has changed
            // see if it changed before we managed to run the hooks from the last change
            // and if so, do not run the hooks from the last change
            if (me.changed_timeout) {
                logger.warn("cluster is not settled, changed before we ran handlers");
                logger.debug("clearing existing timeout for cluster changed event");
                clearTimeout(me.changed_timeout);
            }
            // dispatch the changed timeout event
            logger.debug("cluster changed, dispatch timeout for cluster changed event");
            (function (currentkeys) {
                changed_timeout = setTimeout(function () {
                    // cluster changed handler
                    logger.debug("run cluster changed event");
                    logger.debug("writing authorized_keys");
                    me.writeAuthorizedKeys().then(function () {
                        logger.debug("written authorized_keys, schedule next loop");
                        me.lastkeys = currentkeys;
                        if (!callback) {
                            setTimeout(me.watchCluster.bind(me), me.poll_ms);
                        } else {
                            callback();
                        }
                    }, function (err) {
                        logger.error("could not write authorized_keys", err);
                    });
                }, me.settle_ms);
            })(currentkeys);
        }
    }, function (err) {
        logger.error("could not enumerate keys in the cluster", err);
    }).done();
    
}

if (require.main === module) {
    var clusterkeys = new ClusterKeys(vccutil.getConfig());
    clusterkeys.generateKeys().then(clusterkeys.publishKeys());
    clusterkeys.watchCluster();
} else {
    module.exports = ClusterKeys;
}
