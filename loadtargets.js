/**
 * Load targets init8js module.
 * @module loadtargets
 */

var os = require("os");
var fs = require("fs");
var promise = require("deferred");
var yaml = require('yamljs');
var path = require('path');

var vccutil = require("./vccutil.js");
var logger = require("./log.js");


// This is an init8js module, it runs in-process with the init in order to
// register our cluster targets, so it must follow the service module pattern


module.exports = {
    /**
     * The path to search for the services-*.yml file
     * @type {String}
     */
    servicePath: '/etc/vcc',

    /**
     * Load the targets from the services-*.yml file into the service manager
     * @param {Object} service - The service object (provided by service manager)
     * @param {Object} config - The configuration object (provided by service manager)
     * @param {Object} targets - The targets object (provided by service manager)
     * @param {Function} f_register_services - The function exposed by the service manager to register targets
     * @returns {Promise}
     */
    LoadTargets: function (service, config, targets, f_register_services) {
        var deferred = promise();
        var servicefile = path.join(module.exports.servicePath, "services-"+config.cluster.service+".yml");
        // make sure service targets definition file exists
        fs.stat(servicefile, function(err, stat) {
            if(err) {
                if(err.code == 'ENOENT') {
                    // no service file
                    logger.error('There is no service definition for '+config.cluster.service);
                    logger.error('Please create '+servicefile);
                } else {
                    // something went wrong
                    logger.error('unhandled error hook stat', servicefile);
                }
                deferred.reject(err);
            } else {
                // parse the yaml file and register the targets
                logger.debug("Registering service provider targets for "+config.cluster.service);
                f_register_services(yaml.load(servicefile));
                deferred.resolve();
            }
        });
        return deferred.promise();
    }
}