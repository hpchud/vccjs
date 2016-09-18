#!/usr/bin/env node

var os = require("os");
var fs = require("fs");
var network = require("network");
var yaml = require("yamljs");
var promise = require("deferred");
var watcher = require("watchjs");
var child_process = require('child_process');

var logger = require("./log.js");
var this.config.kv = require("./this.config.kv.js");


var ClusterNode = function (config) {
    // load the config file
    this.config = config;
    logger.info("ClusterNode initialised with config", config);
    // our service dependencies
    this.depends = {};
    this.depends_hooks = {};
}

ClusterNode.prototype.readDependencies = function () {
    var deferred = promise();
    var me = this;
    var depfile = "/etc/vcc/dependencies.yml";
    logger.debug('reading dependency file', depfile);
    fs.stat(depfile, function(err, stat) {
        if(err == null) {
            // parse the yaml file and put into expected places
            var deps = yaml.load(depfile);
            if (deps[me.config.service]) {
                // copy dependencies
                me.config.depends = JSON.parse(JSON.stringify(deps[me.config.service].depends));
                // copy providers if specified
                if (deps[me.config.service].providers) {
                    me.config.providers = JSON.parse(JSON.stringify(deps[me.config.service].providers));
                }
                // return
                deferred.resolve();
            } else {
                logger.error('Dependency file does not define our service', me.config.service);
            }
        } else if(err.code == 'ENOENT') {
            // no service file
            logger.error('There is no service dependency file');
            logger.error('Please create '+depfile);
        } else {
            // something went wrong
            logger.error('unhandled error hook stat', depfile);
        }
    });
    return deferred.promise();
}

ClusterNode.prototype.getServiceTargets = function () {
    var deferred = promise();
    var me = this;
    var servicefile = "/etc/vcc/services-"+this.config.service+".yml";
    fs.stat(servicefile, function(err, stat) {
        if(err == null) {
            // parse the yaml file and return json
            logger.debug("Registering service provider targets for "+me.config.service);
            deferred.resolve(yaml.load(servicefile));
        } else if(err.code == 'ENOENT') {
            // no service file
            logger.error('There is no service definition for '+me.config.service);
            logger.error('Please create '+servicefile);
        } else {
            // something went wrong
            logger.error('unhandled error hook stat', servicefile);
        }
    });
    return deferred.promise();
}

ClusterNode.prototype.updateTargets = function(targets) {
    // write state of each target from our init to this.config.kv
    for (var target in targets) {
        var key = "/cluster/"+this.config.cluster+"/hoststate/"+this.config.myhostname+"/"+target;
        if (this.config.kv.get(key) != targets[target].toString()) {
            this.config.kv.set(key, targets[target]);
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
                var value = this.config.kv.get("/cluster/"+me.config.cluster+"/services/"+depend);
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
    logger.debug("watching object", targets, "for changes on attributes", this.config.providers);
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
    ClusterNode: function (service, config, targets, f_register_services) {
        var deferred = promise();
        var clusternode = new ClusterNode(config.cluster);
        // read in dependencies first
        clusternode.readDependencies().then(function () {
            // register our targets and watch for changes
            clusternode.getServiceTargets().then(function (stargets) {
                if (stargets) {
                    // register service provider targets in the init system
                    f_register_services(stargets);
                    // wait for provider targets to fulfil the cluster service we provide to trigger
                    if (config.cluster.providers) {
                        // here we must pass the targets state from the service manager "targets"
                        // not the service targets we loaded from disk "stargets"
                        clusternode.waitForProviders(targets).then(function () {
                            // register our service state
                            logger.debug("service providers complete, registering service:", config.cluster.service);
                            this.config.kv.register("/cluster/"+config.cluster.cluster+"/services/"+config.cluster.service, config.cluster.myhostname, 60);
                            logger.debug("service registered:", config.cluster.service)
                        });
                    }
                } else {
                    logger.error("There were no service provider targets to fulfil our service");
                }
            });
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
        });
        // return promise
        return deferred.promise();
    }
};