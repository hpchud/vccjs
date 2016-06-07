var promise = require("deferred");
var Etcd = require("node-etcd");

function VccStore (config) {
	this.config = config;
	this.etcd = new Etcd(config.kvstore.host, config.kvstore.port);
}

VccStore.prototype.set = function (key, value, ttl) {
	var deferred = promise();
	var opts = {};
	if (ttl) {
		opts.ttl = ttl;
	}
	this.etcd.set(key, value, opts, function (result) {
		deferred.resolve(result);
	});
	return deferred.promise();
}

VccStore.prototype.get = function (key) {
	var deferred = promise();
	this.etcd.get(key, function (result) {
		deferred.resolve(result);
	});
	return deferred.promise();
}

VccStore.prototype.watch = function (key) {
	// returns an event emitter on change
	return this.etcd.watcher(key);
}

VccStore.prototype.list = function (path) {
	var deferred = promise();
	this.etcd.get(key, {recursive: true}, function (result) {
		deferred.resolve(result);
	});
	return deferred.promise();
}