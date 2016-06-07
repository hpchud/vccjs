var promise = require("deferred");
var Etcd = require("node-etcd");

function VccStore (config) {
	this.config = config;
	this.etcd = new Etcd(config.kvstore.host, config.kvstore.port);
}

VccStore.prototype.set = function (key, value, ttl) {
	if (ttl) {
		this.etcd.setSync(key, value, {ttl: ttl});
	} else {
		this.etcd.setSync(key, value);
	}
}

VccStore.prototype.get = function (key) {
	return this.etcd.getSync(key).body.node;
}

VccStore.prototype.watch = function (key) {
	// returns an event emitter on change
	return this.etcd.watcher(key);
}

VccStore.prototype.list = function (key) {
	return this.etcd.getSync(key, {recursive: true}).body.node.nodes;
}



module.exports = VccStore;