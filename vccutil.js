var logger = require("./log.js");
var fs = require('fs');
var path = require('path');
var yaml = require('yamljs');
var promise = require("deferred");

exports.getRunDir = function () {
	// the run dir where we can find init.yml is in env INIT_RUN_DIR
	var run_dir = process.env['INIT_RUN_DIR'];
	if (!run_dir) {
		logger.warn('No environment variable INIT_RUN_DIR.... assuming /run');
		run_dir = '/run';
	}
	return run_dir;
}

exports.getConfig = function (full) {
	var run_dir = exports.getRunDir();
	var config = yaml.load(run_dir, 'init.yml'));
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
	var run_dir = exports.getRunDir();
	var fullconfig = exports.getConfig(true);
	fullconfig.cluster = newconfig;
	fs.writeFile(path.join(run_dir, 'init.yml'), yaml.stringify(fullconfig), function (err) {
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