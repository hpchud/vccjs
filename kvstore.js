var promise = require("deferred");
var Etcd = require("node-etcd");
var logger = require("winston");

function VccStore (config) {
	this.config = config;
	this.etcd = new Etcd(config.kvstore.host, config.kvstore.port);
}

VccStore.prototype.set = function (key, value, ttl) {
	logger.debug("key set:", key, value, ttl);
	if (ttl) {
		this.etcd.setSync(key, value, {ttl: ttl});
	} else {
		this.etcd.setSync(key, value);
	}
}

VccStore.prototype.get = function (key) {
	logger.debug("key get:", key)
	var keynode = this.etcd.getSync(key).body.node;
	if (keynode) {
		return keynode.value;
	}
	return keynode;
}

VccStore.prototype.watch = function (key) {
	// returns an event emitter on change
	logger.debug("key watch:", key);
	return this.etcd.watcher(key);
}

VccStore.prototype.list = function (key) {
	logger.debug("key list:", key);
	var keynode = this.etcd.getSync(key, {recursive: true}).body.node;
	if (keynode) {
		return keynode.nodes;
	}
	return keynode;
}

VccStore.prototype.register = function (key, value, ttl) {
	logger.debug("key register:", key, value, ttl, "refresh in", (ttl*1000)-10000, "ms");
	var me = this;
	this.set(key, value, ttl);
	setTimeout(function() {
		me.register(key, value, ttl);
	}, (ttl*1000)-10000);
}

module.exports = VccStore;