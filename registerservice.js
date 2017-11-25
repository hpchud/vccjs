#!/usr/bin/env node

var os = require("os");
var promise = require("deferred");

var vccutil = require("./vccutil.js");
var logger = require("./log.js");
var kvstore = require("./kvstore.js");

/**
 * Register service module
 * @module registerservice
 */

/**
 * Register the cluster service, if local service providers are configured
 * @param {Object} config - A configuration object (usually loaded from vccutil.GetConfig)
 */
exports.registerService = function (config) {
    var deferred = promise();
    // register our service state if we are providing one
    if(config.providers) {
        // open kvstore
        var kv = new kvstore();
        kv.connect(config.kvstore.host, config.kvstore.port);
        // register the service key
        logger.debug("Registering service:", config.service);
        kv.register("/cluster/"+config.cluster+"/services/"+config.service, config.myhostname, 60).then(function () {
            logger.debug("service registered:", config.service);
            deferred.resolve(true);
        }, function (err) {
            deferred.reject(err);
        });
    } else {
        logger.info("There is no service to register.")
        deferred.resolve(false);
    }
    return deferred.promise;
}

if (require.main === module) {
    exports.registerService(vccutil.getConfig());
}