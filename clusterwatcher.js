#!/usr/bin/env node

var os = require("os");
var fs = require("fs");
var path = require("path");
var network = require("network");
var promise = require("deferred");
var child_process = require('child_process');
var glob = require('glob');

var vccutil = require("./vccutil.js");
var logger = require("./log.js");
var kvstore = require("./kvstore.js");


var ClusterWatcher = function (config) {
    // load the config file
    this.config = config;
    logger.info("ClusterWatcher initialised with config", config);
    // connect kvstore
    this.kvstore = new kvstore();
    this.kvstore.connect(config.kvstore.host, config.kvstore.port);
    // host cache
    this.lasthosts = {};
    // on change handlers
    this.on_change = [this.runClusterHooks];
    // the timer id for cluster changed
    this.changed_timeout = null;
}

ClusterWatcher.prototype.onChange = function (f) {
    this.on_change.push(f);
}

ClusterWatcher.prototype.writeHosts = function (hosts) {
    var deferred = promise();
    // write host file in /etc/hosts format
    var hostpath = "/etc/hosts.vcc";
    var file = fs.createWriteStream(hostpath);
    // on error we should log it
    file.on('error', function(err) {
        logger.error(err);
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

ClusterWatcher.prototype.runClusterHooks = function (hosts) {
    var hook_dir = "/etc/vcc/cluster-hooks.d/*.sh";
    glob(hook_dir, function (err, files) {
        if (err) {
            logger.error("could not enumerate cluster hooks", err);
        }
        for (var i = files.length - 1; i >= 0; i--) {
            var script = files[i];
            logger.debug("running hook", script);
            var proc = child_process.spawn("/bin/sh", [script]);
            // preserve script variable in callback because we are
            // generating callbacks in a loop
            (function (script) {
                proc.on('exit', function (code, signal) {
                    if (code > 0) {
                        logger.warn("hook", script, "exited with code", code);
                    } else {
                        logger.debug("hook", script, "exited with code", code);
                    }
                });
            })(script);
        };
    })
}

ClusterWatcher.prototype.clusterChanged = function (currenthosts) {
    
}

ClusterWatcher.prototype.watchCluster = function () {
    var me = this;
    var poll_ms = 5000;
    // define a function that reformats the list response to pairs
    var format_list = function (list) {
        var newlist = {};
        for (var i = list.length - 1; i >= 0; i--) {
            newlist[path.basename(list[i].key)] = list[i].value;
        };
        return Object.keys(newlist).sort().reduce(function (result, key) {
            result[key] = newlist[key];
            return result;
        }, {});
    }
    // define a function to compare the lists
    var compare_list = function (lista, listb) {
        return JSON.stringify(lista) === JSON.stringify(listb);
    }
    // define a function that is called on the poll interval
    // use the polling strategy instead of watching because it's more stable
    // once we detect a change, dispatch a timeout to update the cluster in 10 seconds
    // if another change is detected in the 10 seconds, we cancel that timeout and make
    // another
    var poll_hosts = function () {
        var hosts = me.kvstore.list("/cluster/"+me.config.cluster+"/hosts");
        if (hosts) {
            var currenthosts = format_list(hosts);
            logger.debug(hosts.length, "hosts in cluster");
            // see if new host list matches our last cached one
            if (compare_list(currenthosts, me.lasthosts)) {
                logger.debug("cluster has not changed");
            } else {
                // is there already a changed timeout?
                if (me.changed_timeout) {
                    logger.warn("cluster is not settled, waiting another 10 seconds");
                    logger.debug("clearing existing timeout for cluster changed event");
                    clearTimeout(me.changed_timeout);
                }
                // dispatch the changed timeout event
                logger.debug("setting timeout for cluster changed event");
                (function (currenthosts) {
                    me.changed_timeout = setTimeout(function () {
                        // cluster changed handler
                        logger.debug("cluster changed, writing hosts");
                        me.writeHosts(currenthosts).then(function () {
                            logger.debug("calling cluster change handlers now");
                            for (var i = me.on_change.length - 1; i >= 0; i--) {
                                me.on_change[i](currenthosts);
                            };
                        });
                    }, 10000);
                })(currenthosts);
            }
            // update host cache
            me.lasthosts = currenthosts;
            // schedule the next poll
            setTimeout(poll_hosts, poll_ms);
        } else {
            logger.error("No hosts in cluster? Stop polling.");
        }
    }
    setTimeout(poll_hosts, poll_ms);
}


var clusterwatcher = new ClusterWatcher(vccutil.getConfig());
clusterwatcher.watchCluster();