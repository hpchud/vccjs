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

// convert async network functions to promises
var fileStat = promise.promisify(fs.stat);


var config = vccutil.getConfig();
var depends = {};
var depends_hooks = {};


// open the kvstore
kv = new kvstore();
kv.connect(config.kvstore.host, config.kvstore.port);


var readDependencies = function () {
    var deferred = promise();
    var depfile = "/etc/vcc/dependencies.yml";
    logger.debug('reading dependency file', depfile);
    fs.stat(depfile, function(err, stat) {
        if(err == null) {
            // parse the yaml file and put into expected places
            var deps = yaml.load(depfile);
            if (deps[config.service]) {
                // copy dependencies if specified
                if (deps[config.service].depends) {
                    config.depends = JSON.parse(JSON.stringify(deps[config.service].depends));
                } else {
                    logger.warn('No service dependencies specified');
                }
                // copy providers if specified
                if (deps[config.service].providers) {
                    config.providers = JSON.parse(JSON.stringify(deps[config.service].providers));
                } else {
                    logger.warn('No service provider targets specified');
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

var getServiceFromKV = function (service) {
    var deferred = promise();
    // the key we want
    var key = "/cluster/"+config.cluster+"/services/"+service;
    kv.get(key).then(function (value) {
        deferred.resolve([service, value]);
    }, function (err) {
        logger.debug(err);
        deferred.resolve([service, false]);
    });
    return deferred.promise();
}

var waitForDependencies = function () {
    var deferred = promise();
    var poll_ms = 2000;
    // populate depends and depends_hooks
    for (var i = config.depends.length - 1; i >= 0; i--) {
        //depends[config.depends[i]] = false;
        depends_hooks[config.depends[i]] = false;
    };
    logger.debug("waiting for cluster service dependencies", config.depends);
    // define function to check the depends object
    var check_depends = function () {
        promise.map(config.depends, function (depend) {
            return getServiceFromKV(depend);
        })(function (result) {
            // the result is a list like:
            // [ [ 'dep1', 'false' ], [ 'dep2', 'headnode' ] ]
            // convert into something more useable
            var depends_status = result.reduce(function (r, i) {
                r[i[0]] = i[1];
                return r;
            }, {});
            // now check to see if all services are ready
            var ready = true;
            for (var depend in depends_status) {
                if (depends_status[depend] == false) {
                    logger.debug("cluster service dependency", depend, "is not ready")
                    ready = false;
                } else {
                    logger.debug("cluster service dependency", depend, "is running on", depends_status[depend]);
                }
            }
            if (ready) {
                deferred.resolve()
            } else {
                setTimeout(check_depends, poll_ms);
            }
        });
    };
    // poll for status changes
    setTimeout(check_depends, poll_ms);
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
