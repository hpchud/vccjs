var promise = require("deferred");
var Etcd = require("node-etcd");
var logger = require("winston");

function VccStore () {
	this.connected = false;
}

VccStore.prototype.connect = function (host, port) {
	var conn = "http://"+host+":"+port;
	logger.debug("kvstore is connecting to", conn);
	this.etcd = new Etcd(conn, {timeout: 5000});
	this.connected = true;
}

VccStore.prototype.checkResponse = function (res) {
	if (res.err) {
		// key not found is acceptable
		if(res.err.errorCode == 100) {
			logger.debug("etcd error code was 100, key not found");
			return undefined;
		} else {
			// otherwise, shout about the error
			logger.error("got an error from etcd", res.err);
			logger.error("error code was", res.err.errorCode);
			logger.error("check connectivity and settings for kvstore server");
			if (res.err.errors) {
				for (var i = res.err.errors.length - 1; i >= 0; i--) {
					console.log(res.err.errors[i]);
				};
			}
			throw "got an error from etcd, throwing";
		}
	} else {
		if (res.body) {
			if (res.body.node) {
				// res.body.node is what we want
				return res.body.node;
			} else {
				logger.error("etcd response had body but no node");
				console.log(res);
				throw "etcd response had body but no node";
			}
		} else {
			logger.error("etcd response had no body");
			console.log(res);
			throw "etcd response had no body";
		}
	}
}

VccStore.prototype.set = function (key, value, ttl) {
	if (!this.connected) {
		throw "kvstore is not connected";
	}
	logger.debug("key set:", key, value, ttl);
	if (ttl) {
		logger.debug("before set with ttl");
		var res = this.etcd.setSync(key, value, {ttl: ttl, maxRetries: 3});
		logger.debug("after set with ttl");
	} else {
		logger.debug("before set");
		var res = this.etcd.setSync(key, value);
		logger.debug("after set");
	}
	logger.debug("set return", res);
}

VccStore.prototype.get = function (key) {
	if (!this.connected) {
		throw "kvstore is not connected";
	}
	logger.debug("key get:", key)
	var keynode = this.checkResponse(this.etcd.getSync(key));
	if (keynode) {
		return keynode.value;
	}
	return keynode;
}

VccStore.prototype.watch = function (key) {
	if (!this.connected) {
		throw "kvstore is not connected";
	}
	// returns an event emitter on change
	logger.debug("key watch:", key);
	return this.etcd.watcher(key);
}

VccStore.prototype.list = function (key) {
	if (!this.connected) {
		throw "kvstore is not connected";
	}
	logger.debug("key list:", key);
	var keynode = this.checkResponse(this.etcd.getSync(key, {recursive: true}));
	if (keynode) {
		return keynode.nodes;
	}
	return keynode;
}

VccStore.prototype.register = function (key, value, ttl) {
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