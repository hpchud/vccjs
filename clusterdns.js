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


var config = vccutil.getConfig();
logger.info("ClusterDNS initialised with config", config);


var cache = {};
var cache_ttl = 60;

// connect kv store
var kv = new kvstore();
kv.connect(config.kvstore.host, config.kvstore.port);


var registerName = function () {
    var key = "/cluster/"+config.cluster+"/hosts/"+config.myhostname;
    kv.register(key, config.myaddress, 60);
}

var prependResolv = function () {
    var deferred = promise();
    // this function adds ourself to the top of /etc/resolv.conf
    prependFile('/etc/resolv.conf', 'nameserver 127.0.0.1\n', function(err) {
        if (err) {
            deferred.reject(err);
        }
        deferred.resolve();
    });
    return deferred.promise();
}

var completeQuery = function (raddress, qname, res) {
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

var getFromCache = function (qname) {
    var deferred = promise();
    // no cache for now
    deferred.resolve(false);
    return deferred.promise();
}

var getFromKV = function (key) {
    // the purpose of this promise is to handle a rejection from the kv store promise
    // because any error occured will reject the 'some' lookup promise
    var deferred = promise();
    kv.get(key).then(function (value) {
        // update the cache here too
        deferred.resolve(value);
    }, function (err) {
        deferred.resolve(false);
    });
    return deferred.promise();
}

var handleQuery = function (req, res) {
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
        getFromCache(qname),
        getFromCache(qname.replace("vnode_", "")),
        getFromKV("/cluster/"+config.cluster+"/hosts/"+qname),
        getFromKV("/cluster/"+config.cluster+"/hosts/"+qname.replace("vnode_", "")),
        getFromKV("/cluster/"+config.cluster+"/services/"+qname)
    ], function (raddress) {
        if (raddress) {
            logger.debug("a promise resolved this address to", raddress);
            completeQuery(raddress, qname, res);
            // stop further processing
            return true;
        }
    }).then(function () {
        logger.debug("could not look up this query");
        res.send();
    });
};

// start the dns server
var server = ndns.createServer('udp4');
server.on("request", handleQuery);
server.bind(53, "127.0.0.1");
logger.info("ClusterDNS is listening on port 53");

// register our name
//registerName();

// prepend ourself to /etc/resolv.conf
//prependResolv();