#!/usr/bin/env node

var os = require("os");
var fs = require("fs");
var network = require("network");
var promise = require("deferred");
var yaml = require("yamljs");
var watcher = require("watchjs");
var child_process = require('child_process');
var path = require('path');

var vccutil = require("./vccutil.js");
var logger = require("./log.js");
var kvstore = require("./kvstore.js");

// convert async network functions to promises
var fileStat = promise.promisify(fs.stat);


/**
 * Wait for cluster service dependencies
 * @constructor
 * @param {Object} config - A configuration object (usually loaded from vccutil.GetConfig)
 */
var Wait4Deps = function (config) {
    this.config = config;
    this.config.depends = null;
    this.config.providers = null;
    this.kv = new kvstore();
    this.kv.connect(config.kvstore.host, config.kvstore.port);
    this.depends = null;
    this.hook_dir = "/etc/vcc/service-hooks.d/";
    this.depfile = "/etc/vcc/dependencies.yml";
}

/**
 * Read the dependencies.yml file and process cluster service dependencies and local service providers
 * @returns {Promise}
 */
Wait4Deps.prototype.readDependencies = function () {
    var deferred = promise();
    var me = this;
    logger.debug('reading dependency file', this.depfile);
    fs.stat(this.depfile, function(err, stat) {
        if(err == null) {
            // parse the yaml file and put into expected places
            var deps = yaml.load(me.depfile);
            if (deps[me.config.service]) {
                // copy dependencies if specified
                if (deps[me.config.service].depends) {
                    me.config.depends = JSON.parse(JSON.stringify(deps[me.config.service].depends));
                } else {
                    logger.warn('No service dependencies specified');
                }
                // copy providers if specified
                if (deps[me.config.service].providers) {
                    me.config.providers = JSON.parse(JSON.stringify(deps[me.config.service].providers));
                } else {
                    logger.warn('No service provider targets specified');
                }
                // return
                deferred.resolve();
            } else {
                logger.error('Dependency file does not define our service', me.config.service);
                deferred.reject('Dependency file does not define our service');
            }
        } else if(err.code == 'ENOENT') {
            // no service file
            logger.error('There is no service dependency file');
            logger.error('Please create '+me.depfile);
            deferred.reject(err);
        } else {
            // something went wrong
            logger.error('unhandled error hook stat', me.depfile);
            deferred.reject(err);
        }
    });
    return deferred.promise;
}

/**
 * Get a cluster service provider from the discovery KV store
 * @param {String} service - cluster service name
 * @returns {Promise}
 */
Wait4Deps.prototype.getServiceFromKV = function (service) {
    var deferred = promise();
    // the key we want
    var key = "/cluster/"+this.config.cluster+"/services/"+service;
    this.kv.get(key).then(function (value) {
        deferred.resolve([service, value]);
    }, function (err) {
        logger.debug(err);
        deferred.resolve([service, false]);
    });
    return deferred.promise;
}

/**
 * Wait for the providers of dependent cluster services to become ready
 * @returns {Promise}
 */
Wait4Deps.prototype.waitForDependencies = function () {
    var me = this;
    var deferred = promise();
    var poll_ms = 2000;
    logger.debug("waiting for cluster service dependencies", this.config.depends);
    // define function to check the depends object
    var check_depends = function () {
        promise.map(me.config.depends, function (depend) {
            return me.getServiceFromKV(depend);
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
                me.depends = result;
                deferred.resolve();
            } else {
                setTimeout(check_depends, poll_ms);
            }
        });
    };
    // poll for status changes
    setTimeout(check_depends, poll_ms);
    return deferred.promise;
}

/**
 * Utility function to run a service hook with error handling and output logging
 * @param {String} service - cluster service name
 * @param {String} host - hostname of the provider for this cluster service
 * @returns {Promise}
 */
Wait4Deps.prototype.runHook = function (service, host) {
    var deferred = promise();
    var script = path.join(this.hook_dir, service + ".sh");
    logger.debug('running service hook', script, 'with target', host);
    // check hook exists, warn if not
    fileStat(script).then(function (stat) {
        var proc = child_process.spawn("/bin/sh", [script, host]);
        // start script and resolve once it exits
        proc.on('exit', function (code, signal) {
            if (code > 0) {
                logger.warn("hook", script, "exited with code", code);
            } else {
                logger.debug("hook", script, "exited with code", code);
            }
            deferred.resolve(code);
        });
    }, function (err) {
        logger.warn("could not run service hook for", service, err);
        deferred.resolve(100);
    });
    return deferred.promise;
}

/**
 * Dispatch calls to runHook() in parallel, resolve once all hooks are finished
 * @returns {Promise}
 */
Wait4Deps.prototype.runServiceHooks = function () {
    var me = this;
    var deferred = promise();
    logger.debug("running service hooks", this.depends);
    if(this.depends) {
        promise.map(this.depends, function (depend) {
            return me.runHook(depend[0], depend[1]);
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
    } else {
        deferred.reject("no depends");
    }
    return deferred.promise;
}

/**
 * Write a new version of the system config file (loaded by subsequent modules)
 * @param {String} address - The determined IP address
 * @returns {Promise}
 */
Wait4Deps.prototype.writeConfig = function () {
    var deferred = promise();
    logger.debug("going to write config");
    vccutil.writeConfig(this.config).then(function () {
        logger.info("updated config");
        deferred.resolve();
    },
    function (err) {
        logger.error("failed to write config");
        logger.error(err);
        deferred.reject(err);
    });
    return deferred.promise;
};

/**
 * The main function to call if we are loaded as a daemon
 */
Wait4Deps.prototype.main = function () {
    var me = this;
    this.readDependencies().then(function () {
        // save the new config
        me.writeConfig().then(function () {
            logger.info("Updated configuration");
            // if we have dependencies, wait for them
            if(me.config.depends) {
                me.waitForDependencies().then(function () {
                    logger.info("ClusterNode cluster service dependencies satisfied");
                    logger.info("Running cluster service hooks (first-run)");
                    me.runServiceHooks().then(function () {
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
    })
}

if (require.main === module) {
    var wait4deps = new Wait4Deps(vccutil.getConfig());
    wait4deps.main();
} else {
    module.exports = Wait4Deps;
}