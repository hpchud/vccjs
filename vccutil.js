var logger = require("./log.js");
var fs = require('fs');
var yaml = require('yamljs');
var promise = require("deferred");

exports.getConfig = function () {
	var config = yaml.load('/etc/vcc/cluster.yml');
	return config;
}

exports.writeConfig = function (newconfig) {
	var deferred = promise();
	fs.writeFile('/etc/vcc/cluster.yml', yaml.stringify(newconfig), function (err) {
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