#!/usr/bin/env node

var os = require("os");
var network = require("network");
var promise = require("deferred");

var vccutil = require("./vccutil.js");
var logger = require("./log.js");
var kvstore = require("./kvstore.js");


// register our service state if we are providing one
var config = vccutil.getConfig();
logger.debug(config);
if(config.providers) {
	// open kvstore
	var kv = new kvstore();
	kv.connect(config.kvstore.host, config.kvstore.port);
	// register the service key
	logger.debug("Registering service:", config.service);
	kv.register("/cluster/"+config.cluster+"/services/"+config.service, config.myhostname, 60);
	logger.debug("service registered:", config.service)
} else {
	logger.info("There is no service to register.")
}
