#!/usr/bin/env node

var os = require("os");
var fs = require("fs");
var network = require("network");
var promise = require("deferred");
var yaml = require("yamljs");
var watcher = require("watchjs");
var child_process = require('child_process');

var vccutil = require("./vccutil.js");
var logger = require("./log.js");
var kvstore = require("./kvstore.js");

var config = vccutil.getConfig();
var depends = {};
var depends_hooks = {};


var readDependencies = function () {
    var deferred = promise();
    var me = this;
    var depfile = "/etc/vcc/dependencies.yml";
    logger.debug('reading dependency file', depfile);
    fs.stat(depfile, function(err, stat) {
        if(err == null) {
            // parse the yaml file and put into expected places
            var deps = yaml.load(depfile);
            if (deps[config.service]) {
                // copy dependencies
                config.depends = JSON.parse(JSON.stringify(deps[config.service].depends));
                // copy providers if specified
                if (deps[config.service].providers) {
                    config.providers = JSON.parse(JSON.stringify(deps[config.service].providers));
                }
                // return
                deferred.resolve();
            } else {
                logger.error('Dependency file does not define our service', config.service);
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

var waitForDependencies = function () {
    var me = this;
    var deferred = promise();
    var poll_ms = 2000;
    // populate depends and depends_hooks
    for (var i = config.depends.length - 1; i >= 0; i--) {
        depends[config.depends[i]] = false;
        depends_hooks[config.depends[i]] = false;
    };
    logger.debug("waiting for cluster service dependencies", depends);
    // define function to check the depends object
    var check_depends = function () {
        logger.debug(depends);
        var ready = true;
        for (var depend in depends) {
            if (depends[depend] == false) {
                var value = config.kv.get("/cluster/"+config.cluster+"/services/"+depend);
                if (value) {
                    logger.debug("found service", depend, "on", value);
                    // save the host providing this service
                    depends[depend] = value;
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

var runServiceHooks = function () {
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
                    depends_hooks[service] = true;
                });
            } else if(err.code == 'ENOENT') {
                // no hook installed but thats okay
                depends_hooks[service] = true;
                logger.warn('no service hook installed for', service);
            } else {
                // something went wrong, should we continue?
                depends_hooks[service] = true;
                logger.error('unhandled error hook stat', service);
            }
        });
    }
    // define a function to wait for all hooks to finish execution
    var check_hooks = function () {
        var ready = true;
        for (var service in depends_hooks) {
            if (depends_hooks[service] == false) {
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
    watcher.watch(depends_hooks, check_hooks);
    // for each depends, run the hook
    for (var service in depends) {
        run_hook(service, depends[service]);
    }
    return deferred.promise();
}

readDependencies().then(function () {
    // save the new config
    vccutil.writeConfig(config).then(function () {
        logger.info("Updated configuration");
        // open the kvstore
        config.kv = new kvstore();
        config.kv.connect(config.kvstore.host, config.kvstore.port);
        // if we have dependencies, wait for them
        if(config.depends) {
            waitForDependencies().then(function () {
                logger.info("ClusterNode cluster service dependencies satisfied");
                logger.info("Running cluster service hooks (first-run)");
                runServiceHooks().then(function () {
                    logger.info("Service hooks complete");
                });
            });
        } else {
            logger.debug("there are no cluster service dependencies");
        }
    }, function (err) {
        logger.error("could not write config");
        logger.error(err);
    });
    
});