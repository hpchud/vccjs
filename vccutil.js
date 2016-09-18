var logger = require("./log.js");
var fs = require('fs');
var yaml = require('yamljs');
var promise = require("deferred");

exports.getConfig = function (full) {
	var config = yaml.load('/etc/init.yml');
	if (full) {
		return config;
	} else {
		if (config.cluster) {
			return config.cluster;
		} else {
			logger.error("/etc/init.yml does not define cluster configuration!");
			throw "/etc/init.yml has no cluster configuration";
		}
	}
}

exports.writeConfig = function (newconfig) {
	var deferred = promise();
	var fullconfig = exports.getConfig(true);
	fullconfig.cluster = newconfig;
	fs.writeFile('/etc/init.yml', yaml.stringify(fullconfig), function (err) {
		if (err) {
			deferred.reject(err);
		}
		deferred.resolve();
	});
	return deferred.promise();
}

exports.waitForNetwork = function () {
	// wait for ClusterNet to register the network
	var deferred = promise();
	return deferred.promise();
}