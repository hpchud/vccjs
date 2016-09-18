#!/usr/bin/env node

var os = require("os");
var fs = require("fs");
var network = require("network");
var promise = require("deferred");
var yaml = require("yamljs");

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

readDependencies().then(function () {
	config.kv = new kvstore();
	config.kv.connect(config.kvstore.host, config.kvstore.port);
	waitForDependencies().then(function () {
		logger.info("Dependencies satisfied.");
	});
});