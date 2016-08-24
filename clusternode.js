#!/usr/bin/env node

var os = require("os");
var fs = require("fs");
var network = require("network");
var yaml = require("yamljs");
var promise = require("deferred");
var watcher = require("watchjs");
var child_process = require('child_process');

var logger = require("./log.js");
var kvstore = require("./kvstore.js");


var ClusterNode = function (config) {
    // load the config file
    this.config = config;
    logger.info("ClusterNode initialised with config", config);
    // open kvstore
    this.store = new kvstore(config);
    // our service dependencies
    this.depends = {};
    this.depends_hooks = {};
}

ClusterNode.prototype.updateTargets = function(targets) {
    // write state of each target from our init to kvstore
    for (var target in targets) {
        var key = "/cluster/"+this.config.cluster+"/hoststate/"+this.config.myhostname+"/"+target;
        if (this.store.get(key) != targets[target].toString()) {
            this.store.set(key, targets[target]);
        }
    }
}

ClusterNode.prototype.getAddress = function () {
    var deferred = promise();
    network.get_interfaces_list(function (err, list) {
        list.forEach(function (interface) {
            logger.debug("found interface", interface.name);
            if (interface.name == "ethwe") {
                logger.info("selecting interface", interface);
                deferred.resolve(interface.ip_address);
            }
        });
        network.get_active_interface(function (err, interface) {
            logger.info("selecting interface", interface);
            deferred.resolve(interface.ip_address);
        })
    });
    return deferred.promise();
}

ClusterNode.prototype.waitForDependencies = function () {
    var me = this;
    var deferred = promise();
    logger.info("ClusterNode is waiting for cluster service dependencies");
    var poll_ms = 2000;
    // create a status object for our depends
    this.depends = {};
    for (var i = this.config.depends.length - 1; i >= 0; i--) {
        this.depends[this.config.depends[i]] = false;
        this.depends_hooks[this.config.depends[i]] = false;
    };
    // define function to check the depends object
    var check_depends = function () {
        logger.debug(me.depends);
        var ready = true;
        for (var depend in me.depends) {
            if (me.depends[depend] == false) {
                var value = me.store.get("/cluster/"+me.config.cluster+"/services/"+depend);
                if (value) {
                    logger.debug("found service", depend, "on", value);
                    // save the host providing this service
                    me.depends[depend] = value;
                } else {
                    ready = false;
                }
            }
        }
        if (ready) {
            deferred.resolve();
        } else {
            setTimeout(check_depends, poll_ms);
        }
    };
    // poll for status changes
    setTimeout(check_depends, poll_ms);
    return deferred.promise();
}

ClusterNode.prototype.waitForProviders = function (targets) {
    var me = this;
    var deferred = promise();
    logger.info("ClusterNode is waiting for provider services to start");
    watcher.watch(targets, this.config.providers, function () {
        logger.debug("cluster provider targets dependency state changed");
        var ready = true;
        for (var target in me.config.providers) {
            if (targets[target] == false) {
                ready = false;
            }
        }
        if (ready) {
            logger.info("ClusterNode provider targets dependencies satisfied");
            // register our service state
            me.store.register("/cluster/"+me.config.cluster+"/services/"+me.config.service, me.config.myhostname, 60);
            deferred.resolve();
        } else {
            logger.debug("cluster provider targets dependencies are not satisfied");
        }
    });
    return deferred.promise();
}

ClusterNode.prototype.runServiceHooks = function () {
    var me = this;
    var deferred = promise();
    var hook_dir = "/etc/vcc/service-hooks.d/";
    // define a function to execute each hook
    var run_hook = function (service, host) {
        // check if we have hook for this service
        var script = hook_dir+service+".sh";
        logger.debug("looking for service hook for", service);
        fs.stat(script, function(err, stat) {
            if(err == null) {
                // run the hook
                logger.debug('running service hook for', service, 'with target', host);
                var proc = child_process.spawn("/bin/sh", [script, host]);
                proc.on('exit', function (code, signal) {
                    if (code > 0) {
                        logger.warn("hook", script, "exited with code", code);
                    } else {
                        logger.debug("hook", script, "exited with code", code);
                    }
                    // when the hook is complete, set to true and the watcher will wait for all
                    me.depends_hooks[service] = true;
                });
            } else if(err.code == 'ENOENT') {
                // no hook installed but thats okay
                me.depends_hooks[service] = true;
                logger.warn('no service hook installed for', service);
            } else {
                // something went wrong, should we continue?
                me.depends_hooks[service] = true;
                logger.error('unhandled error hook stat', service);
            }
        });
    }
    // define a function to wait for all hooks to finish execution
    var check_hooks = function () {
        var ready = true;
        for (var service in me.depends_hooks) {
            if (me.depends_hooks[service] == false) {
                ready = false
            }
        }
        if (ready) {
            logger.debug("service hooks are finished");
            deferred.resolve();
        } else {
            logger.debug("service hooks are not finished");
        }
    }
    // register watch for hooks finished
    watcher.watch(this.depends_hooks, check_hooks);
    // for each depends, run the hook
    for (var service in this.depends) {
        run_hook(service, this.depends[service]);
    }
    return deferred.promise();
}

module.exports = {
    ClusterNode: function (service, config, targets) {
        var deferred = promise();
        var clusternode = new ClusterNode(config.cluster);
        var store = new kvstore(config.cluster);
        // register our targets and watch for changes
        //clusternode.updateTargets(targets);
        //watcher.watch(targets, function () {
        //    clusternode.updateTargets(targets);
        //});
        // wait for dependencies
        // when dependencies are satisfied, trigger service manager to continue
        if(config.cluster.depends) {
            clusternode.waitForDependencies().then(function () {
                logger.info("ClusterNode cluster service dependencies satisfied");
                logger.info("Running cluster service hooks (first-run)");
                clusternode.runServiceHooks().then(function () {
                    deferred.resolve();
                });
            });
        } else {
            logger.debug("there are no cluster service dependencies");
            deferred.resolve();
        }
        // wait for provider targets to fulfil the cluster service we provide to trigger
        if (config.cluster.providers) {
            clusternode.waitForProviders(targets).then(function () {
                logger.debug("service providers complete, registered service:", config.cluster.service);
            });
        }
        // return promise
        return deferred.promise();
    }
};