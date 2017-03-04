#!/usr/bin/env node

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
	servicePath: '/etc/vcc',
    LoadTargets: function (service, config, targets, f_register_services) {
	    var deferred = promise();
	    var servicefile = path.join(module.exports.servicePath, "services-"+config.service+".yml");
	    // make sure service targets definition file exists
	    fs.stat(servicefile, function(err, stat) {
	        if(err == null) {
	            // parse the yaml file and register the targets
	            logger.debug("Registering service provider targets for "+config.service);
	            f_register_services(yaml.load(servicefile));
	            deferred.resolve();
	        } else if(err.code == 'ENOENT') {
	            // no service file
	            logger.error('There is no service definition for '+config.service);
	            logger.error('Please create '+servicefile);
	        } else {
	            // something went wrong
	            logger.error('unhandled error hook stat', servicefile);
	        }
	    });
	    return deferred.promise();
	}
}