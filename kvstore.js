var promise = require("deferred");
var Etcd = require("node-etcd");
var logger = require("winston");
var path = require("path");


function VccStore () {
	this.connected = false;
}

VccStore.prototype.connect = function (host, port) {
	var conn = "http://"+host+":"+port;
	logger.debug("kvstore is connecting to", conn);
	this.etcd = new Etcd(conn, {timeout: 5000});
	this.connected = true;
}

VccStore.prototype.set = function (key, value, ttl) {
	var deferred = promise();
	if (!this.connected) {
		deferred.reject("not connected");
	}
	// set the key optionally with ttl
	logger.debug("key set:", key, value, ttl);
	var options = {};
	if (ttl) {
		options.ttl = ttl;
	}
	// call the etcd function
	this.etcd.set(key, value, options, function (err, res) {
		if (err) {
			deferred.reject(err);
		} else {
			deferred.resolve();
		}
	});
	// return promise
	return deferred.promise();
}

VccStore.prototype.get = function (key, recursive) {
	var deferred = promise();
	var me = this;
	if (!this.connected) {
		deferred.reject("not connected");
	}
	logger.debug("key get:", key, recursive);
	var options = {};
	if (recursive) {
		options.recursive = true;
	}
	// call the etcd function
	this.etcd.get(key, function (err, res) {
		if (err) {
			deferred.reject(err);
		} else {
			// check the response
			if (res.node) {
				if (recursive) {
					if (res.node.nodes) {
						// convert a list of objects into a list
						// only show the base name of the full path
						var listresult = res.node.nodes.reduce(function (r, i) {
							r.push(path.basename(i.key));
							return r;
						}, []);
						deferred.resolve(listresult);
					} else {
						deferred.reject("recursive, expecting nodes but didn't get any");
					}
				} else {
					if (res.node.dir) {
						deferred.reject(res.node.key + " is a directory");
					} else if (res.node.value) {
						deferred.resolve(res.node.value);
					} else {
						deferred.reject("no value in response");
					}
				}
			} else {
				deferred.reject("no node in response");
			}
		}
	});
	// return promise
	return deferred.promise();
}

VccStore.prototype.watch = function (key) {
	var deferred = promise();
	if (!this.connected) {
		deferred.reject("not connected");
	}
	// returns an event emitter on change
	logger.debug("key watch:", key);
	deferred.resolve(this.etcd.watcher(key));
	// return promise
	return deferred.promise();
}

VccStore.prototype.list = function (key) {
	// call the get function with recursive option
	return this.get(key, true);
}

VccStore.prototype.register = function (key, value, ttl) {
	// this is the only function that does not return a promise
	// because there is no obvious resolution
	if (!this.connected) {
		throw "kvstore is not connected";
	}
	logger.debug("key register:", key, value, ttl, "refresh in", (ttl*1000)-10000, "ms");
	var me = this;
	this.set(key, value, ttl);
	setTimeout(function() {
		me.register(key, value, ttl);
	}, (ttl*1000)-10000);
}

module.exports = VccStore;