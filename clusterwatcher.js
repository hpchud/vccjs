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


var config = vccutil.getConfig();
logger.info("ClusterDNS initialised with config", config);


// connect kv store
var kv = new kvstore();
kv.connect(config.kvstore.host, config.kvstore.port);


// host cache
var lasthosts = {};
// on change handlers
var on_change = [runClusterHooks];
// the timer id for cluster changed
var changed_timeout = null;
// poll frequency
var poll_ms = 5000;
// time to detect settle
var settle_ms = 10000;


var writeHosts = function (hosts) {
    var deferred = promise();
    // write host file in /etc/hosts format
    var hostpath = "/etc/hosts.vcc";
    var file = fs.createWriteStream(hostpath);
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

var runHook = function (script) {
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

var runClusterHooks = function (hosts) {
    var deferred = promise();
    var hook_dir = "/etc/vcc/cluster-hooks.d/*.sh";
    // use glob to find all sh scripts in the hook_dir
    glob(hook_dir).then(function (files) {
        promise.map(files, function (file) {
            return runHook(file);
        })(function (result) {
            // reduce the codes
            var sum = result.reduce(function (r, i) {
                return r+i;
            }, 0);
            if (sum > 0) {
                logger.error("some hooks did not run successfully");
            } else {
                logger.debug("all hooks finished", result);
            }
        });
    }, function (err) {
        logger.error("could not enumerate cluster hooks", err);
    });
    return deferred.promise();
}

var watchCluster = function () {
    kv.list("/cluster/"+config.cluster+"/hosts", true).then(function (currenthosts) {
        logger.debug(Object.keys(currenthosts).length, "hosts in cluster");
        if (JSON.stringify(currenthosts) === JSON.stringify(lasthosts)) {
            logger.debug("cluster has not changed");
        } else {
            if (changed_timeout) {
                logger.warn("cluster is not settled, changed before we ran handlers");
                logger.debug("clearing existing timeout for cluster changed event");
                clearTimeout(changed_timeout);
            }
            // dispatch the changed timeout event
            logger.debug("cluster changed, dispatch timeout for cluster changed event");
            (function (currenthosts) {
                changed_timeout = setTimeout(function () {
                    // cluster changed handler
                    logger.debug("run cluster changed event");
                    logger.debug("writing hosts");
                    writeHosts(currenthosts).then(function () {
                        logger.debug("calling cluster change handlers now");
                        for (var i = on_change.length - 1; i >= 0; i--) {
                            on_change[i](currenthosts);
                        };
                    }, function (err) {
                        logger.error("could not write /etc/hosts.vcc", err);
                    });
                }, settle_ms);
            })(currenthosts);
        }
        // save these hosts as the last hosts for next loop
        lasthosts = currenthosts;
        // schedule the next loop
        setTimeout(watchCluster, poll_ms);
    }, function (err) {
        logger.error("could not enumerate hosts in the cluster", err);
    }).done();
}


watchCluster();