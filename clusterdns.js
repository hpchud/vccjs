#!/usr/bin/env node

var os = require("os");
var prependFile = require('prepend-file');
var path = require("path");
var network = require("network");
var promise = require("deferred");

var vccutil = require("./vccutil.js");
var logger = require("./log.js");
var kvstore = require("./kvstore.js");

var dgram = require('dgram');
var ndns = require('./ndns.js');


/**
 * The ClusterDNS server
 * @constructor
 * @param {Object} config - A configuration object (usually loaded from vccutil.GetConfig)
 */
var ClusterDNS = function (config) {
    logger.info("ClusterDNS initialised with config", config);
    this.config = config;
    this.kv = new kvstore();
    this.kv.connect(config.kvstore.host, config.kvstore.port);
    // local cache
    this.cache = {};
    this.cache_ttl = 60;
    // path to resolvconf
    this.resolv_path = '/etc/resolv.conf';
}

/**
 * Dispatch a timeout to register our hostname in the discovery KV store every 60s
 * @returns {Promise}
 */
ClusterDNS.prototype.registerName = function () {
    var key = "/cluster/"+this.config.cluster+"/hosts/"+this.config.myhostname;
    return this.kv.register(key, this.config.myaddress, 60);
}

 /**
 * Prepend nameserver 127.0.0.1 to the /etc/resolv.conf file
 * @returns {Promise}
 */
ClusterDNS.prototype.prependResolv = function () {
    var deferred = promise();
    // this function adds ourself to the top of /etc/resolv.conf
    prependFile(this.resolv_path, 'nameserver 127.0.0.1\n', function(err) {
        if (err) {
            deferred.reject(err);
        }
        deferred.resolve();
    });
    return deferred.promise;
}

/**
 * Complete a DNS query
 * @param {String} raddress - The address we looked up
 * @param {String} qname - The name from the question
 * @param {Object} res - The response object
 */
ClusterDNS.prototype.completeQuery = function (raddress, qname, res) {
    // prepare response
    logger.info("ClusterDNS looked up to", raddress);
    res.header.qr = 1;
    res.header.ra = 1;
    res.header.rd = 0;
    res.header.ancount = 1;
    res.header.nscount = 0;
    res.header.arcount = 0;
    res.addRR(qname, 1, "IN", "A", raddress);
    res.send();
}

/**
 * Lookup a record from the local cache - Not implemented
 * @param {String} qname - The name from the question
 * @returns {Promise}
 */
ClusterDNS.prototype.getFromCache = function (qname) {
    var deferred = promise();
    // no cache for now
    deferred.resolve(false);
    return deferred.promise;
}

/**
 * Lookup a record from the discovery KV store
 * @param {String} type - Either "host" or "service" indicating if the name to lookup is a hostname or service name
 * @param {String} qname - The name from the question
 * @returns {Promise}
 */
ClusterDNS.prototype.getFromKV = function (type, qname) {
    var me = this;
    // the purpose of this promise is to handle a rejection from the kv store promise
    // because any error occured will reject the 'some' lookup promise
    // it should also resolve the service name to host if applicable
    var deferred = promise();
    if (type == "host") {
        var key = "/cluster/"+this.config.cluster+"/hosts/"+qname;
    } else if (type == "service") {
        var key = "/cluster/"+this.config.cluster+"/services/"+qname;
    }
    // do the get from kv store
    this.kv.get(key).then(function (value) {
        // if this lookup was for type host, we are done
        if (type == "host") {
            // update the cache here too
            deferred.resolve(value);
        } else if (type == "service") {
            // we need to do another getFromKV of type host
            // because value is the name of the host providing this service!
            me.getFromKV("host", value).then(function (hostanswer) {
                // we are done
                // update the cache here too
                deferred.resolve(hostanswer);
            }, function (err) {
                logger.warn("got an error with nested getFromKV for service", qname);
                logger.warn(err);
                deferred.resolve(false);
            });
        }
    }, function (err) {
        deferred.resolve(false);
    });
    return deferred.promise;
}

/**
 * Handle a query from the server
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
ClusterDNS.prototype.handleQuery = function (req, res) {
    var me = this;
    var resolved = false;
    res.setHeader(req.header);
    // check we only got 1 question in this query
    if(req.q.length > 1) {
        logger.warn("ClusterDNS got query with more than 1 question, rejecting");
        res.send();
        return;
    }
    // find the query name
    res.addQuestion(req.q[0]);
    var qname = req.q[0].name;
    logger.debug("ClusterDNS got a query for", qname);

    // execute promises in parallel for each possible lookup option
    // if the kvstore responds faster than our cache, so be it
    promise.some([
        this.getFromCache(qname.replace("vnode_", "")),
        this.getFromKV("host", qname.replace("vnode_", "")),
        this.getFromKV("service", qname)
    ], function (raddress) {
        if (raddress) {
            logger.debug("a promise resolved this address to", raddress);
            me.completeQuery(raddress, qname, res);
            resolved = true;
            // stop further processing
            return true;
        }
    }).then(function () {
        if (!resolved) {
            logger.debug("could not look up this query");
            res.send();
        }
    });
};

/**
 * Handle an error binding the server
 * @param {Object} err - The error object
 */
ClusterDNS.prototype.handleError = function (err) {
    logger.error("ClusterDNS could not bind to port 53")
    logger.error(err);
}

/**
 * Start the server listening
 * @param {Number} port - The port to listen on
 */
ClusterDNS.prototype.listen = function (port) {
    // start the dns server
    var server = ndns.createServer('udp4');
    server.on("request", this.handleQuery.bind(this));
    server.on("error", this.handleError);
    logger.info("ClusterDNS is binding to port", port);
    server.bind(port, "127.0.0.1");
}

if (require.main === module) {
    var config = vccutil.getConfig();
    var clusterdns = new ClusterDNS(config);
    if (!config.nodns) {
        // work out what port we should use
        if (process.getuid && process.getuid() === 0) {
            var port = 53;
            // prepend ourself to /etc/resolv.conf
            clusterdns.prependResolv().then(function () {
                logger.info("appended 127.0.0.1 to /etc/resolv.conf");
            }, function (err) {
                logger.error("could not prepend /etc/resolv.conf", err);
            });
        } else {
            var port = 32353;
        }
        clusterdns.listen(port);
    } else {
        logger.warn("Not using ClusterDNS service, make sure an alternative for name resolution is available.");
    }
    // register our name
    clusterdns.registerName();
} else {
    module.exports = ClusterDNS;
}