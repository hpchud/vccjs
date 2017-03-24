#!/usr/bin/env node

var os = require("os");
var fs = require("fs");
var path = require("path");
var network = require("network");
var promise = require("deferred");
var child_process = require('child_process');
var glob = promise.promisify(require('glob'));

var vccutil = require("./vccutil.js");
var logger = require("./log.js");
var kvstore = require("./kvstore.js");


/**
 * The ClusterWatcher
 * @constructor
 * @param {Object} config - A configuration object (usually loaded from vccutil.GetConfig)
 */
var ClusterWatcher = function (config) {
    logger.info("ClusterWatcher initialised with config", config);
    this.config = config;
    this.kv = new kvstore();
    this.kv.connect(config.kvstore.host, config.kvstore.port);
    // host cache
    this.lasthosts = {};
    // on change handlers
    this.on_change = [this.runClusterHooks];
    // the timer id for cluster changed
    this.changed_timeout = null;
    // poll frequency
    this.poll_ms = 5000;
    // time to detect settle
    this.settle_ms = 10000;
    // path to hosts.vcc file
    this.host_path = path.join(vccutil.getRunDir(), "hosts.vcc");
    // the glob to find the cluster hooks
    this.hook_dir = "/etc/vcc/cluster-hooks.d/*.sh";
}

/**
 * Write the list of hosts to /etc/hosts.vcc in the same format as /etc/hosts
 * @param {Object} hosts - An object consisting of host/IP key/value pairs
 * @returns {Promise}
 */
ClusterWatcher.prototype.writeHosts = function (hosts) {
    var deferred = promise();
    // write host file in /etc/hosts format
    var file = fs.createWriteStream(this.host_path);
    // on error we should log it
    file.on('error', function(err) {
        deferred.reject(err);
    });
    // once open we should write file
    file.once('open', function(fd) {
        for (var host in hosts) {
            file.write(hosts[host]+" "+host+"\n");
        }
        file.end();
    });
    // on close we should resolve the promise
    file.on('close', function() {
        deferred.resolve()
    })
    return deferred.promise();
}

/**
 * Utility function to run a cluster hook with error handling and output logging
 * @param {String} script - The path to the shell script to run
 * @returns {Promise}
 */
ClusterWatcher.prototype.runHook = function (script) {
    var deferred = promise();
    var proc = child_process.spawn("/bin/sh", [script]);
    // start script and resolve once it exits
    proc.on('exit', function (code, signal) {
        if (code > 0) {
            logger.warn("hook", script, "exited with code", code);
        } else {
            logger.debug("hook", script, "exited with code", code);
        }
        deferred.resolve(code);
    });
    return deferred.promise();
}

/**
 * Dispatch calls to runHook() in parallel, resolve once all hooks are finished
 * @returns {Promise}
 */
ClusterWatcher.prototype.runClusterHooks = function () {
    var me = this;
    var deferred = promise();
    console.log(this.hook_dir);
    // use glob to find all sh scripts in the hook_dir
    glob(this.hook_dir).then(function (files) {
        promise.map(files, function (file) {
            return me.runHook(file);
        })(function (result) {
            // reduce the codes
            var sum = result.reduce(function (r, i) {
                return r+i;
            }, 0);
            if (sum > 0) {
                logger.warn("some hooks did not run successfully");
            } else {
                logger.debug("all hooks finished", result);
            }
            deferred.resolve(sum);
        });
    }, function (err) {
        logger.error("could not enumerate cluster hooks");
        deferred.reject(err);
    });
    return deferred.promise();
}

/**
 * The main loop to watch the discovery KV store for changes
 */
ClusterWatcher.prototype.watchCluster = function () {
    var me = this;
    this.kv.list("/cluster/"+this.config.cluster+"/hosts", true).then(function (hosts) {
        // sort the host list
        var currenthosts = Object.keys(hosts).sort().reduce(function (result, key) {
            result[key] = hosts[key];
            return result;
        }, {});
        logger.debug(Object.keys(currenthosts).length, "hosts in cluster");
        // compare with lasthosts
        if (JSON.stringify(currenthosts) === JSON.stringify(me.lasthosts)) {
            logger.debug("cluster has not changed");
            // cluster not changed, schedule next loop
            me.lasthosts = currenthosts;
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
            (function (currenthosts) {
                changed_timeout = setTimeout(function () {
                    // cluster changed handler
                    logger.debug("run cluster changed event");
                    logger.debug("writing hosts");
                    me.writeHosts(currenthosts).then(function () {
                        logger.debug("written "+me.host_path);
                        logger.debug("running cluster hooks now");
                        promise.map(me.on_change, function (handler) {
                            return handler.bind(me)();
                        })(function () {
                            // cluster hooks done, schedule next loop
                            me.lasthosts = currenthosts;
                            setTimeout(me.watchCluster.bind(me), me.poll_ms);
                        });
                    }, function (err) {
                        logger.error("could not write hosts.vcc", err);
                    });
                }, me.settle_ms);
            })(currenthosts);
        }
    }, function (err) {
        logger.error("could not enumerate hosts in the cluster", err);
    }).done();
}

if (require.main === module) {
    var clusterwatcher = new ClusterWatcher(vccutil.getConfig());
    clusterwatcher.watchCluster();
} else {
    module.exports = ClusterWatcher;
}